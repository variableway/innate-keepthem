package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/patrick/contentforge/internal"
	"github.com/spf13/cobra"
)

var scrapeCmd = &cobra.Command{
	Use:   "scrape <url>",
	Short: "从 URL 采集内容",
	Long: `从任意 URL 采集内容，支持 Twitter/X、YouTube、RSS、普通网页。`,
	Args:  cobra.MinimumNArgs(1),
	RunE:  runScrape,
}

var (
	scrapeBackend   string
	scrapeBatch     string
	scrapeOutputDir string
	scrapeFormat    string
	scrapeProxy     string
)

func init() {
	rootCmd.AddCommand(scrapeCmd)
	scrapeCmd.Flags().StringVar(&scrapeBackend, "backend", "auto", "采集后端")
	scrapeCmd.Flags().StringVarP(&scrapeBatch, "batch", "b", "", "批量 URL 文件")
	scrapeCmd.Flags().StringVarP(&scrapeOutputDir, "output", "o", "", "输出目录")
	scrapeCmd.Flags().StringVar(&scrapeFormat, "format", "json", "输出格式")
	scrapeCmd.Flags().StringVar(&scrapeProxy, "proxy", "", "代理地址")
}

func runScrape(cmd *cobra.Command, args []string) error {
	pb, err := internal.NewPythonBridge()
	if err != nil {
		return fmt.Errorf("初始化 Python 桥接失败: %w", err)
	}
	if scrapeProxy != "" {
		pb.SetEnv("HTTP_PROXY", scrapeProxy)
		pb.SetEnv("HTTPS_PROXY", scrapeProxy)
	}

	urls := []string{}
	if scrapeBatch != "" {
		data, err := os.ReadFile(scrapeBatch)
		if err != nil {
			return fmt.Errorf("读取批量文件失败: %w", err)
		}
		for _, line := range strings.Split(string(data), "\n") {
			line = strings.TrimSpace(line)
			if line != "" && !strings.HasPrefix(line, "#") {
				urls = append(urls, line)
			}
		}
	} else {
		urls = args
	}

	results := []map[string]interface{}{}
	for _, url := range urls {
		fmt.Fprintf(os.Stderr, "→ 采集: %s\n", url)
		var result map[string]interface{}
		var err error

		switch scrapeBackend {
		case "jina":
			err = pb.CallWithOutput("contentforge.ingestion.web_scraper", "WebScraper", map[string]interface{}{
				"_method": "fetch", "url": url,
			}, &result)
		case "ytdlp":
			err = pb.CallWithOutput("contentforge.ingestion.transcriber", "Transcriber", map[string]interface{}{
				"_method": "transcribe", "url": url,
			}, &result)
		default:
			err = pb.CallWithOutput("contentforge.ingestion.agent_reach", "AgentReachIngestor", map[string]interface{}{
				"_method": "fetch", "url": url,
			}, &result)
		}
		if err != nil {
			fmt.Fprintf(os.Stderr, "  ✗ 失败: %v\n", err)
			results = append(results, map[string]interface{}{"url": url, "error": err.Error()})
			continue
		}
		results = append(results, result)
		fmt.Fprintf(os.Stderr, "  ✓ 成功\n")
	}

	out := map[string]interface{}{"count": len(results), "results": results}
	return writeScrapeOutput(out, scrapeFormat, scrapeOutputDir)
}

func writeScrapeOutput(data interface{}, format, outDir string) error {
	output, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("序列化输出失败: %w", err)
	}
	if outDir != "" {
		if err := os.MkdirAll(outDir, 0755); err != nil {
			return fmt.Errorf("创建输出目录失败: %w", err)
		}
		path := filepath.Join(outDir, fmt.Sprintf("scrape_%d.json", time.Now().Unix()))
		if err := os.WriteFile(path, output, 0644); err != nil {
			return fmt.Errorf("写入文件失败: %w", err)
		}
		fmt.Fprintf(os.Stderr, "已保存: %s\n", path)
	} else {
		fmt.Println(string(output))
	}
	return nil
}
