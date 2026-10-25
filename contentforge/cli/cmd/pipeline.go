package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/patrick/contentforge/internal"
	"github.com/spf13/cobra"
)

var pipelineCmd = &cobra.Command{
	Use:   "pipeline",
	Short: "管理工作流（Pipeline）",
	Long:  `管理 ContentForge 流水线：列出预设、创建自定义流水线、执行流水线。`,
}

var (
	pipelineRunURL    string
	pipelineRunInput  string
	pipelineOutputDir string
)

func init() {
	rootCmd.AddCommand(pipelineCmd)

	listCmd := &cobra.Command{
		Use:   "list",
		Short: "列出所有可用流水线",
		RunE:  runPipelineList,
	}
	pipelineCmd.AddCommand(listCmd)

	runCmd := &cobra.Command{
		Use:   "run <pipeline-id>",
		Short: "执行流水线",
		Args:  cobra.ExactArgs(1),
		RunE:  runPipelineRun,
	}
	runCmd.Flags().StringVar(&pipelineRunURL, "url", "", "输入 URL")
	runCmd.Flags().StringVar(&pipelineRunInput, "input", "", "输入文件（ContentUnit JSON）")
	runCmd.Flags().StringVarP(&pipelineOutputDir, "output", "o", "", "输出目录")
	pipelineCmd.AddCommand(runCmd)

	createCmd := &cobra.Command{
		Use:   "create <pipeline-json-file>",
		Short: "从 JSON 文件创建自定义流水线",
		Args:  cobra.ExactArgs(1),
		RunE:  runPipelineCreate,
	}
	pipelineCmd.AddCommand(createCmd)

	statusCmd := &cobra.Command{
		Use:   "status <run-id>",
		Short: "查看流水线运行状态",
		Args:  cobra.ExactArgs(1),
		RunE:  runPipelineStatus,
	}
	pipelineCmd.AddCommand(statusCmd)
}

func runPipelineList(cmd *cobra.Command, args []string) error {
	pb, err := internal.NewPythonBridge()
	if err != nil {
		return fmt.Errorf("初始化 Python 桥接失败: %w", err)
	}
	var presets []map[string]interface{}
	if err := pb.CallWithOutput(
		"contentforge.pipeline.presets", "PresetRegistry",
		map[string]interface{}{"_method": "list_all"},
		&presets,
	); err != nil {
		fmt.Println("可用预设流水线:")
		fmt.Println()
		fmt.Println("  preset-twitter-to-xiaohongshu   Twitter → 小红书文案")
		fmt.Println("  preset-youtube-to-notes         YouTube → 结构化笔记")
		fmt.Println("  preset-rss-to-digest            RSS → 每日摘要")
		fmt.Println("  preset-web-to-article           网页 → 文章")
		fmt.Println()
		fmt.Println("使用 'contentforge pipeline run <id>' 执行")
		return nil
	}
	fmt.Println("可用流水线:")
	fmt.Println()
	for _, p := range presets {
		id := getStr(p, "id")
		name := getStr(p, "name")
		desc := getStr(p, "description")
		fmt.Printf("  %-32s %s\n", id, name)
		if desc != "" { fmt.Printf("    %s\n", desc) }
	}
	return nil
}

func runPipelineRun(cmd *cobra.Command, args []string) error {
	pipelineID := args[0]
	pb, err := internal.NewPythonBridge()
	if err != nil {
		return fmt.Errorf("初始化 Python 桥接失败: %w", err)
	}
	inputData := map[string]interface{}{}
	if pipelineRunURL != "" {
		inputData["url"] = pipelineRunURL
	} else if pipelineRunInput != "" {
		data, err := os.ReadFile(pipelineRunInput)
		if err != nil { return fmt.Errorf("读取输入文件失败: %w", err) }
		if err := json.Unmarshal(data, &inputData); err != nil {
			return fmt.Errorf("解析输入 JSON 失败: %w", err)
		}
	} else {
		return fmt.Errorf("需要 --url 或 --input 指定输入")
	}
	fmt.Fprintf(os.Stderr, "→ 执行流水线: %s\n", pipelineID)
	var result map[string]interface{}
	if err := pb.CallWithOutput(
		"contentforge.pipeline.runner", "PipelineRunner",
		map[string]interface{}{"_method": "run", "pipeline_id": pipelineID, "input": inputData},
		&result,
	); err != nil {
		fmt.Fprintf(os.Stderr, "✗ 流水线执行失败: %v\n", err)
		return err
	}
	fmt.Fprintf(os.Stderr, "✓ 流水线执行完成\n")
	outJSON, err := json.MarshalIndent(result, "", "  ")
	if err != nil { return fmt.Errorf("序列化输出失败: %w", err) }
	if pipelineOutputDir != "" {
		if err := os.MkdirAll(pipelineOutputDir, 0755); err != nil {
			return fmt.Errorf("创建输出目录失败: %w", err)
		}
		path := filepath.Join(pipelineOutputDir, fmt.Sprintf("pipeline_%s.json", pipelineID))
		if err := os.WriteFile(path, outJSON, 0644); err != nil {
			return fmt.Errorf("写入文件失败: %w", err)
		}
		fmt.Fprintf(os.Stderr, "已保存: %s\n", path)
	} else {
		fmt.Println(string(outJSON))
	}
	return nil
}

func runPipelineCreate(cmd *cobra.Command, args []string) error {
	filePath := args[0]
	data, err := os.ReadFile(filePath)
	if err != nil { return fmt.Errorf("读取文件失败: %w", err) }
	var pipelineDef map[string]interface{}
	if err := json.Unmarshal(data, &pipelineDef); err != nil {
		return fmt.Errorf("解析 JSON 失败: %w", err)
	}
	pb, err := internal.NewPythonBridge()
	if err != nil { return fmt.Errorf("初始化 Python 桥接失败: %w", err) }
	var result map[string]interface{}
	if err := pb.CallWithOutput(
		"contentforge.pipeline.presets", "PresetRegistry",
		map[string]interface{}{"_method": "register", "pipeline": pipelineDef},
		&result,
	); err != nil {
		return fmt.Errorf("注册流水线失败: %w", err)
	}
	fmt.Fprintf(os.Stderr, "✓ 流水线已创建: %s\n", getStr(pipelineDef, "id"))
	return nil
}

func runPipelineStatus(cmd *cobra.Command, args []string) error {
	runID := args[0]
	pb, err := internal.NewPythonBridge()
	if err != nil { return fmt.Errorf("初始化 Python 桥接失败: %w", err) }
	var run map[string]interface{}
	if err := pb.CallWithOutput(
		"contentforge.pipeline.runner", "PipelineRunner",
		map[string]interface{}{"_method": "load_run", "run_id": runID},
		&run,
	); err != nil {
		return fmt.Errorf("获取运行状态失败: %w", err)
	}
	outJSON, _ := json.MarshalIndent(run, "", "  ")
	fmt.Println(string(outJSON))
	return nil
}

func getStr(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok {
		if s, ok := v.(string); ok { return s }
	}
	return ""
}
