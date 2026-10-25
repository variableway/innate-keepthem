package cmd

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
)

var (
	cfgFile string
	rootCmd = &cobra.Command{
		Use:   "contentforge",
		Short: "ContentForge — 内容获取→处理→发布工具链",
		Long: `ContentForge
━━━━━━━━━━━━━━━━━━━━━━
从任意社交媒体获取内容，通过 AI 处理转化为适合任意平台发布的格式。

核心场景:
  • 抓取 Twitter 内容 → 生成小红书文案
  • 下载 YouTube 视频 → 提取文本 → 生成笔记
  • 批量处理 URL → 自动摘要 → 导出 Markdown

使用: contentforge <command> --help 查看子命令详情`,
		Version: "0.1.0",
	}
)

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func init() {
	rootCmd.PersistentFlags().StringVar(&cfgFile, "config", "", "配置文件路径 (默认: ~/.config/contentforge/config.json)")
}

// RootCmd 暴露根命令，供 main.go 使用。
func RootCmd() *cobra.Command {
	return rootCmd
}
