package internal

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// PythonBridge 封装调用 Python 虚拟环境子进程的桥接层。
// 通过 JSON 序列化实现 Go-Python 数据交换，支持调用类构造器和实例方法。
type PythonBridge struct {
	venvPath     string
	pythonBinary string
	timeout      time.Duration
	env          []string
}

// NewPythonBridge 创建 Python 桥接器（自动探测虚拟环境）。
func NewPythonBridge() (*PythonBridge, error) {
	venvPath := DefaultVenvPath()
	pythonBin := filepath.Join(venvPath, "bin", "python3")
	if _, err := os.Stat(pythonBin); err != nil {
		pythonBin = filepath.Join(venvPath, "bin", "python")
		if _, err := os.Stat(pythonBin); err != nil {
			pythonBin = "python3"
			if _, err := os.Stat(pythonBin); err != nil {
				pythonBin = "python"
			}
		}
	}
	return &PythonBridge{
		venvPath:     venvPath,
		pythonBinary: pythonBin,
		timeout:      120 * time.Second,
	}, nil
}

// SetTimeout 设置子进程超时时间。
func (b *PythonBridge) SetTimeout(d time.Duration) {
	b.timeout = d
}

// SetEnv 设置额外环境变量。
func (b *PythonBridge) SetEnv(key, value string) {
	b.env = append(b.env, fmt.Sprintf("%s=%s", key, value))
}

// Call 通用调用 Python 模块/类/方法。
// moduleName: 模块路径（如 contentforge.ingestion.agent_reach）
// classOrFuncName: 类名或函数名（如 AgentReachCollector）
// args: 参数字典。特殊字段：
//   - _method: 若指定，则实例化后调用该方法
//   - _init_args: 构造器参数（默认空）
func (b *PythonBridge) Call(moduleName, classOrFuncName string, args map[string]interface{}) ([]byte, error) {
	inputJSON, err := json.Marshal(args)
	if err != nil {
		return nil, fmt.Errorf("marshal input: %w", err)
	}

	script := fmt.Sprintf(`
import sys, json, os
sys.path.insert(0, %q)

from %s import %s

args = json.load(sys.stdin)

method_name = args.pop('_method', None)
init_args = args.pop('_init_args', {})

instance = %s(**init_args)

if method_name:
    method = getattr(instance, method_name)
    result = method(**args)
else:
    result = instance

# 处理返回结果
if hasattr(result, 'to_dict'):
    output = result.to_dict()
elif isinstance(result, list) and result and hasattr(result[0], 'to_dict'):
    output = [r.to_dict() for r in result]
else:
    output = result

print(json.dumps(output, ensure_ascii=False, default=str))
`, findPythonPath(), moduleName, classOrFuncName, classOrFuncName)

	cmdArgs := []string{"-c", script}
	return b.execute(cmdArgs, inputJSON)
}

// CallWithOutput 调用 Python 并自动解析 JSON 到目标结构。
func (b *PythonBridge) CallWithOutput(moduleName, classOrFuncName string, args map[string]interface{}, out interface{}) error {
	data, err := b.Call(moduleName, classOrFuncName, args)
	if err != nil {
		return err
	}
	return json.Unmarshal(data, out)
}

// HealthCheck 检测 Python 环境和关键模块可用性。
func (b *PythonBridge) HealthCheck() error {
	script := fmt.Sprintf(`
import sys
sys.path.insert(0, %q)

modules = [
    "contentforge.models",
    "contentforge.ingestion.agent_reach",
    "contentforge.ingestion.web_scraper",
    "contentforge.processing.ai_engine",
    "contentforge.pipeline.engine",
]

errors = []
for mod in modules:
    try:
        __import__(mod)
    except Exception as e:
        errors.append(f"{mod}: {e}")

if errors:
    print("ERRORS:")
    for e in errors:
        print(e)
    sys.exit(1)
else:
    print("OK")
`, findPythonPath())

	output, err := b.execute([]string{"-c", script}, nil)
	if err != nil {
		return fmt.Errorf("python health check failed: %w", err)
	}
	if !strings.Contains(string(output), "OK") {
		return fmt.Errorf("python health check unexpected output: %s", string(output))
	}
	return nil
}

// GetPythonVersion 获取 Python 版本信息。
func (b *PythonBridge) GetPythonVersion() (string, error) {
	output, err := b.execute([]string{"--version"}, nil)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(output)), nil
}

// execute 执行底层命令。
func (b *PythonBridge) execute(args []string, stdin []byte) ([]byte, error) {
	cmd := exec.Command(b.pythonBinary, args...)

	// 设置环境变量
	env := append(os.Environ(), b.env...)
	env = append(env, "VIRTUAL_ENV="+b.venvPath)
	env = append(env, "PATH="+filepath.Join(b.venvPath, "bin")+string(os.PathListSeparator)+os.Getenv("PATH"))
	if pyPath := contentforgePythonPath(); pyPath != "" {
		env = append(env, "PYTHONPATH="+pyPath)
	}
	cmd.Env = env

	if stdin != nil {
		cmd.Stdin = bytes.NewReader(stdin)
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	done := make(chan error, 1)
	go func() {
		done <- cmd.Run()
	}()

	select {
	case err := <-done:
		if err != nil {
			return nil, fmt.Errorf("python exec: %w\nstderr: %s", err, stderr.String())
		}
		return stdout.Bytes(), nil
	case <-time.After(b.timeout):
		cmd.Process.Kill()
		return nil, fmt.Errorf("python exec timeout after %v", b.timeout)
	}
}

// CallSummarize 调用摘要模块。
func (b *PythonBridge) CallSummarize(text string) (map[string]interface{}, error) {
	data, err := b.Call("contentforge.processing.summarizer", "Summarizer", map[string]interface{}{
		"text": text,
	})
	if err != nil {
		return nil, err
	}
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parse summarize result: %w", err)
	}
	return result, nil
}

// CallXiaohongshu 调用小红书转换模块。
func (b *PythonBridge) CallXiaohongshu(text string) (map[string]interface{}, error) {
	data, err := b.Call("contentforge.processing.xiaohongshu_converter", "XiaohongshuConverter", map[string]interface{}{
		"text": text,
	})
	if err != nil {
		return nil, err
	}
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parse xiaohongshu result: %w", err)
	}
	return result, nil
}

// ExecuteMethod 调用 Python 模块中的指定方法。
// 支持 moduleName + methodName 推断：
//   - ai_engine -> AIEngine.rewrite
//   - analyzer  -> Analyzer.analyze
//   - translator -> Translator.translate
func (b *PythonBridge) ExecuteMethod(moduleName, methodName string, args map[string]interface{}) (map[string]interface{}, error) {
	// 推断类名和方法名
	className := methodName
	switch moduleName {
	case "contentforge.processing.ai_engine":
		className = "AIEngine"
		args["_method"] = methodName
	case "contentforge.processing.analyzer":
		className = "Analyzer"
		args["_method"] = methodName
	case "contentforge.processing.translator":
		className = "Translator"
		args["_method"] = methodName
	case "contentforge.processing.summarizer":
		className = "Summarizer"
		args["_method"] = methodName
	case "contentforge.processing.xiaohongshu_converter":
		className = "XiaohongshuConverter"
		args["_method"] = methodName
	}
	data, err := b.Call(moduleName, className, args)
	if err != nil {
		return nil, err
	}
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parse result: %w", err)
	}
	return result, nil
}

// CallIngestion 调用采集模块。
func (b *PythonBridge) CallIngestion(platform, url string) (map[string]interface{}, error) {
	data, err := b.Call("contentforge.ingestion.agent_reach", "AgentReachIngestor", map[string]interface{}{
		"platform": platform,
		"url":      url,
	})
	if err != nil {
		return nil, err
	}
	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		return nil, fmt.Errorf("parse ingestion result: %w", err)
	}
	return result, nil
}

// contentforgePythonPath 返回 packages/contentforge-core/python 绝对路径
//（monorepo 重构后 Python 源码所在处；旧 contentforge/core/python 已清空）。
func contentforgePythonPath() string {
	root := findProjectRoot()
	if root == "" {
		return ""
	}
	return filepath.Join(root, "packages", "contentforge-core", "python")
}

// findPythonPath 返回 Python 模块根目录，供内联脚本使用。
func findPythonPath() string {
	return contentforgePythonPath()
}

func findProjectRoot() string {
	wd, err := os.Getwd()
	if err != nil {
		return ""
	}

	for dir := wd; dir != "/" && dir != "."; dir = filepath.Dir(dir) {
		if _, err := os.Stat(filepath.Join(dir, "contentforge")); err == nil {
			return dir
		}
	}
	return wd
}

// DefaultVenvPath 返回默认虚拟环境路径。
func DefaultVenvPath() string {
	if venv := os.Getenv("CONTENTFORGE_VENV"); venv != "" {
		return venv
	}
	if venv := os.Getenv("VIRTUAL_ENV"); venv != "" {
		return venv
	}
	root := findProjectRoot()
	if root != "" {
		venv := filepath.Join(root, ".venv-cf")
		if _, err := os.Stat(venv); err == nil {
			return venv
		}
	}
	return ""
}

// CallPythonBridge 全局快捷函数，兼容 pipeline.go 等调用方式。
func CallPythonBridge(operation string, args []string) (string, error) {
	b, err := NewPythonBridge()
	if err != nil {
		return "", err
	}

	cmdArgs := append([]string{"-m", "contentforge.cli.bridge", operation}, args...)
	cmd := exec.Command(b.pythonBinary, cmdArgs...)
	cmd.Env = append(os.Environ(), b.env...)
	cmd.Env = append(cmd.Env,
		"VIRTUAL_ENV="+b.venvPath,
		"PATH="+filepath.Join(b.venvPath, "bin")+string(os.PathListSeparator)+os.Getenv("PATH"),
	)
	if pyPath := contentforgePythonPath(); pyPath != "" {
		cmd.Env = append(cmd.Env, "PYTHONPATH="+pyPath)
	}
	cmd.Stderr = os.Stderr

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	done := make(chan error, 1)
	go func() { done <- cmd.Run() }()

	select {
	case err := <-done:
		if err != nil {
			return "", fmt.Errorf("python bridge failed: %w\nstderr: %s", err, stderr.String())
		}
		return strings.TrimSpace(stdout.String()), nil
	case <-time.After(b.timeout):
		cmd.Process.Kill()
		return "", fmt.Errorf("python bridge timeout after %v", b.timeout)
	}
}
