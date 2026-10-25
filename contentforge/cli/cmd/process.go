package cmd

import (
	"encoding/json"
	"fmt"
	"os"

	"github.com/patrick/contentforge/internal"
	"github.com/spf13/cobra"
)

var processCmd = &cobra.Command{
	Use:   "process <content-file>",
	Short: "对已有内容执行 AI 处理",
	Long:  `对 ContentUnit 执行 AI 处理：摘要、翻译、改写、分析。`,
	Args:  cobra.ExactArgs(1),
	RunE:  runProcess,
}

var (
	processSummarize   bool
	processTranslate   string
	processRewrite     string
	processXiaohongshu bool
	processAnalyze     bool
	processFull        bool
	processOutput      string
	processAIProvider  string
)

func init() {
	rootCmd.AddCommand(processCmd)
	processCmd.Flags().BoolVar(&processSummarize, "summarize", false, "生成结构化摘要")
	processCmd.Flags().StringVar(&processTranslate, "translate", "", "翻译为目标语言")
	processCmd.Flags().StringVar(&processRewrite, "rewrite", "", "改写风格")
	processCmd.Flags().BoolVar(&processXiaohongshu, "xiaohongshu", false, "转换为小红书风格")
	processCmd.Flags().BoolVar(&processAnalyze, "analyze", false, "内容分析")
	processCmd.Flags().BoolVar(&processFull, "full-analysis", false, "完整分析流程")
	processCmd.Flags().StringVarP(&processOutput, "output", "o", "", "输出文件路径")
	processCmd.Flags().StringVar(&processAIProvider, "ai-provider", "openai", "AI Provider")
}

func runProcess(cmd *cobra.Command, args []string) error {
	inputPath := args[0]
	var unitData map[string]interface{}
	if inputPath == "-" {
		json.NewDecoder(os.Stdin).Decode(&unitData)
	} else {
		data, _ := os.ReadFile(inputPath)
		json.Unmarshal(data, &unitData)
	}

	pb, err := internal.NewPythonBridge()
	if err != nil {
		return fmt.Errorf("初始化 Python 桥接失败: %w", err)
	}
	pb.SetEnv("CF_AI_PROVIDER", processAIProvider)

	if !processSummarize && processTranslate == "" && processRewrite == "" && !processXiaohongshu && !processAnalyze && !processFull {
		processSummarize = true
	}

	results := map[string]interface{}{}

	if processSummarize || processFull {
		fmt.Fprintln(os.Stderr, "→ 生成摘要...")
		var summary map[string]interface{}
		if err := pb.CallWithOutput("contentforge.processing.summarizer", "Summarizer",
			map[string]interface{}{"_method": "summarize_text", "text": unitData["extracted_text"]},
			&summary); err != nil {
			results["summary_error"] = err.Error()
		} else {
			results["summary"] = summary
			fmt.Fprintln(os.Stderr, "  ✓ 摘要完成")
		}
	}
	if processTranslate != "" || processFull {
		lang := processTranslate
		if lang == "" { lang = "zh" }
		fmt.Fprintf(os.Stderr, "→ 翻译为 %s...\n", lang)
		var translated map[string]interface{}
		if err := pb.CallWithOutput("contentforge.processing.translator", "Translator",
			map[string]interface{}{"_method": "translate_text", "text": unitData["extracted_text"], "target_language": lang},
			&translated); err != nil {
			results["translate_error"] = err.Error()
		} else {
			results["translated"] = translated
			fmt.Fprintln(os.Stderr, "  ✓ 翻译完成")
		}
	}
	if processRewrite != "" {
		fmt.Fprintf(os.Stderr, "→ 改写...\n")
		var rewritten map[string]interface{}
		if err := pb.CallWithOutput("contentforge.processing.ai_engine", "AIEngine",
			map[string]interface{}{"_method": "rewrite", "text": unitData["extracted_text"], "style": processRewrite},
			&rewritten); err != nil {
			results["rewrite_error"] = err.Error()
		} else {
			results["rewritten"] = rewritten
			fmt.Fprintln(os.Stderr, "  ✓ 改写完成")
		}
	}
	if processXiaohongshu {
		fmt.Fprintln(os.Stderr, "→ 转换为小红书风格...")
		var xhs map[string]interface{}
		if err := pb.CallWithOutput("contentforge.processing.xiaohongshu_converter", "XiaohongshuConverter",
			map[string]interface{}{"_method": "convert_text_to_dict", "text": unitData["extracted_text"]},
			&xhs); err != nil {
			results["xiaohongshu_error"] = err.Error()
		} else {
			results["xiaohongshu"] = xhs
			fmt.Fprintln(os.Stderr, "  ✓ 转换完成")
		}
	}
	if processAnalyze || processFull {
		fmt.Fprintln(os.Stderr, "→ 内容分析...")
		var analysis map[string]interface{}
		if err := pb.CallWithOutput("contentforge.processing.analyzer", "Analyzer",
			map[string]interface{}{"_method": "analyze_text", "text": unitData["extracted_text"]},
			&analysis); err != nil {
			results["analysis_error"] = err.Error()
		} else {
			results["analysis"] = analysis
			fmt.Fprintln(os.Stderr, "  ✓ 分析完成")
		}
	}

	out := map[string]interface{}{"input": unitData["id"], "results": results}
	outJSON, _ := json.MarshalIndent(out, "", "  ")
	if processOutput != "" {
		os.WriteFile(processOutput, outJSON, 0644)
		fmt.Fprintf(os.Stderr, "已保存: %s\n", processOutput)
	} else {
		fmt.Println(string(outJSON))
	}
	return nil
}
