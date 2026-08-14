package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/spf13/cobra"
)

var publishCmd = &cobra.Command{
	Use:   "publish <content-file>",
	Short: "将处理后的内容导出/发布",
	Long:  `将处理后的 ContentUnit 导出为多种格式。`,
	Args:  cobra.ExactArgs(1),
	RunE:  runPublish,
}

var (
	publishFormat   string
	publishOutput   string
	publishBatch    bool
	publishTemplate string
	publishProfile  string
)

func init() {
	rootCmd.AddCommand(publishCmd)
	publishCmd.Flags().StringVar(&publishFormat, "format", "markdown", "输出格式")
	publishCmd.Flags().StringVarP(&publishOutput, "output", "o", "", "输出路径")
	publishCmd.Flags().BoolVar(&publishBatch, "batch", false, "批量模式")
	publishCmd.Flags().StringVar(&publishTemplate, "template", "", "模板文件路径")
	publishCmd.Flags().StringVar(&publishProfile, "profile", "", "发布 Profile")
}

func runPublish(cmd *cobra.Command, args []string) error {
	inputPath := args[0]
	if publishBatch {
		return runPublishBatch(inputPath)
	}
	data, err := os.ReadFile(inputPath)
	if err != nil {
		return fmt.Errorf("读取文件失败: %w", err)
	}
	var unit map[string]interface{}
	if err := json.Unmarshal(data, &unit); err != nil {
		return fmt.Errorf("解析 JSON 失败: %w", err)
	}
	output, err := renderContent(unit, publishFormat, publishTemplate)
	if err != nil {
		return fmt.Errorf("渲染内容失败: %w", err)
	}
	if publishOutput != "" {
		if err := os.WriteFile(publishOutput, []byte(output), 0644); err != nil {
			return fmt.Errorf("写入文件失败: %w", err)
		}
		fmt.Fprintf(os.Stderr, "已保存: %s\n", publishOutput)
	} else {
		fmt.Println(output)
	}
	return nil
}

func runPublishBatch(inputDir string) error {
	entries, err := os.ReadDir(inputDir)
	if err != nil {
		return fmt.Errorf("读取目录失败: %w", err)
	}
	if publishOutput == "" {
		return fmt.Errorf("批量模式需要指定 --output 目录")
	}
	if err := os.MkdirAll(publishOutput, 0755); err != nil {
		return fmt.Errorf("创建输出目录失败: %w", err)
	}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		inputPath := filepath.Join(inputDir, entry.Name())
		data, err := os.ReadFile(inputPath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "✗ 跳过 %s: %v\n", entry.Name(), err)
			continue
		}
		var unit map[string]interface{}
		if err := json.Unmarshal(data, &unit); err != nil {
			fmt.Fprintf(os.Stderr, "✗ 跳过 %s: %v\n", entry.Name(), err)
			continue
		}
		output, err := renderContent(unit, publishFormat, publishTemplate)
		if err != nil {
			fmt.Fprintf(os.Stderr, "✗ 渲染失败 %s: %v\n", entry.Name(), err)
			continue
		}
		baseName := strings.TrimSuffix(entry.Name(), filepath.Ext(entry.Name()))
		ext := ".md"
		if publishFormat == "json" { ext = ".json" }
		if publishFormat == "html" { ext = ".html" }
		if publishFormat == "text" { ext = ".txt" }
		outPath := filepath.Join(publishOutput, baseName+ext)
		if err := os.WriteFile(outPath, []byte(output), 0644); err != nil {
			fmt.Fprintf(os.Stderr, "✗ 写入失败 %s: %v\n", outPath, err)
			continue
		}
		fmt.Fprintf(os.Stderr, "✓ %s → %s\n", entry.Name(), outPath)
	}
	return nil
}

func renderContent(unit map[string]interface{}, format, templatePath string) (string, error) {
	switch format {
	case "markdown", "md":
		return renderMarkdown(unit, templatePath)
	case "text", "txt":
		return renderText(unit)
	case "html":
		return renderHTML(unit)
	case "json":
		out, err := json.MarshalIndent(unit, "", "  ")
		return string(out), err
	case "xiaohongshu":
		return renderXiaohongshu(unit)
	default:
		return "", fmt.Errorf("不支持的格式: %s", format)
	}
}

func renderMarkdown(unit map[string]interface{}, templatePath string) (string, error) {
	var sb strings.Builder
	title := getStr(unit, "title")
	if title == "" { title = "Untitled" }
	sb.WriteString(fmt.Sprintf("# %s\n\n", title))
	if desc := getStr(unit, "description"); desc != "" {
		sb.WriteString(fmt.Sprintf("> %s\n\n", desc))
	}
	if summary := getStr(unit, "summary"); summary != "" {
		sb.WriteString(fmt.Sprintf("## 摘要\n\n%s\n\n", summary))
	}
	if keyPoints, ok := unit["key_points"].([]interface{}); ok && len(keyPoints) > 0 {
		sb.WriteString("## 要点\n\n")
		for _, kp := range keyPoints {
			sb.WriteString(fmt.Sprintf("- %v\n", kp))
		}
		sb.WriteString("\n")
	}
	if topics, ok := unit["topics"].([]interface{}); ok && len(topics) > 0 {
		sb.WriteString("## 主题\n\n")
		for _, t := range topics {
			sb.WriteString(fmt.Sprintf("- %v\n", t))
		}
		sb.WriteString("\n")
	}
	if text := getStr(unit, "extracted_text"); text != "" {
		sb.WriteString(fmt.Sprintf("## 正文\n\n%s\n\n", text))
	}
	if text := getStr(unit, "translated_text"); text != "" {
		sb.WriteString(fmt.Sprintf("## 翻译\n\n%s\n\n", text))
	}
	if text := getStr(unit, "rewritten_text"); text != "" {
		sb.WriteString(fmt.Sprintf("## 改写\n\n%s\n\n", text))
	}
	if source, ok := unit["source"].(map[string]interface{}); ok {
		platform := getStr(source, "platform")
		url := getStr(source, "url")
		author := getStr(source, "author")
		if url != "" {
			sb.WriteString(fmt.Sprintf("---\n\n*来源: [%s](%s)", platform, url))
			if author != "" { sb.WriteString(fmt.Sprintf(" | 作者: %s", author)) }
			sb.WriteString("*\n")
		}
	}
	return sb.String(), nil
}

func renderText(unit map[string]interface{}) (string, error) {
	var sb strings.Builder
	if title := getStr(unit, "title"); title != "" {
		sb.WriteString(fmt.Sprintf("标题: %s\n\n", title))
	}
	if summary := getStr(unit, "summary"); summary != "" {
		sb.WriteString(fmt.Sprintf("摘要: %s\n\n", summary))
	}
	if text := getStr(unit, "extracted_text"); text != "" {
		sb.WriteString(text)
		sb.WriteString("\n")
	}
	if source, ok := unit["source"].(map[string]interface{}); ok {
		if url := getStr(source, "url"); url != "" {
			sb.WriteString(fmt.Sprintf("\n来源: %s\n", url))
		}
	}
	return sb.String(), nil
}

func renderHTML(unit map[string]interface{}) (string, error) {
	md, err := renderMarkdown(unit, "")
	if err != nil { return "", err }
	return fmt.Sprintf("<!DOCTYPE html>\n<html>\n<body>\n<pre>%s</pre>\n</body>\n</html>\n", md), nil
}

func renderXiaohongshu(unit map[string]interface{}) (string, error) {
	text := getStr(unit, "rewritten_text")
	if text == "" { text = getStr(unit, "translated_text") }
	if text == "" { text = getStr(unit, "extracted_text") }
	var sb strings.Builder
	if title := getStr(unit, "title"); title != "" {
		sb.WriteString(fmt.Sprintf("✨ %s ✨\n\n", title))
	}
	sb.WriteString(text)
	sb.WriteString("\n\n")
	tags := []string{}
	if t, ok := unit["topics"].([]interface{}); ok {
		for _, tag := range t { tags = append(tags, fmt.Sprintf("#%v", tag)) }
	}
	if len(tags) == 0 { tags = []string{"#分享", "#干货", "#学习笔记"} }
	sb.WriteString(strings.Join(tags, " "))
	sb.WriteString("\n\n💬 姐妹们有什么看法？评论区聊聊！")
	return sb.String(), nil
}


