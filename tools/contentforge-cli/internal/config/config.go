package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"gopkg.in/yaml.v3"
)

// ContentForgeConfig 是 Go 端的完整配置结构。
type ContentForgeConfig struct {
	Version         string                `json:"version" yaml:"version"`
	AIProvider      AIProviderConfig      `json:"ai_provider" yaml:"ai_provider"`
	AIProviders     []AIProviderConfig    `json:"ai_providers" yaml:"ai_providers"`
	Platform        PlatformBackendConfig `json:"platform" yaml:"platform"`
	Proxy           ProxyConfig           `json:"proxy" yaml:"proxy"`
	PublishProfiles []PublishProfileConfig `json:"publish_profiles" yaml:"publish_profiles"`
	DefaultPipeline string                `json:"default_pipeline" yaml:"default_pipeline"`
	LogLevel        string                `json:"log_level" yaml:"log_level"`
	StateDir        string                `json:"state_dir" yaml:"state_dir"`
}

// AIProviderConfig 表示 AI Provider 配置。
type AIProviderConfig struct {
	Name          string `json:"name" yaml:"name"`
	APIKey        string `json:"api_key" yaml:"api_key"`
	BaseURL       string `json:"base_url" yaml:"base_url"`
	DefaultModel  string `json:"default_model" yaml:"default_model"`
	Timeout       int    `json:"timeout" yaml:"timeout"`
}

// PlatformBackendConfig 表示平台后端配置。
type PlatformBackendConfig struct {
	AgentReachBinary string  `json:"agent_reach_binary" yaml:"agent_reach_binary"`
	YtdlpBinary      string  `json:"ytdlp_binary" yaml:"ytdlp_binary"`
	FFmpegPath       *string `json:"ffmpeg_path,omitempty" yaml:"ffmpeg_path,omitempty"`
	JinaAPIKey       *string `json:"jina_api_key,omitempty" yaml:"jina_api_key,omitempty"`
}

// ProxyConfig 表示代理配置。
type ProxyConfig struct {
	HTTP     *string `json:"http,omitempty" yaml:"http,omitempty"`
	HTTPS    *string `json:"https,omitempty" yaml:"https,omitempty"`
	NoProxy  *string `json:"no_proxy,omitempty" yaml:"no_proxy,omitempty"`
}

// PublishProfileConfig 表示发布 Profile 配置。
type PublishProfileConfig struct {
	ID            string                 `json:"id" yaml:"id"`
	Name          string                 `json:"name" yaml:"name"`
	Platform      string                 `json:"platform" yaml:"platform"`
	DefaultFormat string                 `json:"default_format" yaml:"default_format"`
	AutoPublish   bool                   `json:"auto_publish" yaml:"auto_publish"`
	MaxLength     *int                   `json:"max_length,omitempty" yaml:"max_length,omitempty"`
	Credentials   map[string]string      `json:"credentials" yaml:"credentials"`
	ImageConfig   map[string]interface{} `json:"image_config,omitempty" yaml:"image_config,omitempty"`
}

// ConfigManager 是 Go 配置管理器。
type ConfigManager struct {
	configPath string
	config     *ContentForgeConfig
}

// NewConfigManager 创建配置管理器。
func NewConfigManager(configPath string) *ConfigManager {
	if configPath == "" {
		configPath = defaultConfigPath()
	}
	return &ConfigManager{configPath: configPath}
}

// defaultConfigPath 返回默认配置文件路径。
func defaultConfigPath() string {
	homeDir, err := os.UserHomeDir()
	if err != nil {
		homeDir = "."
	}
	return filepath.Join(homeDir, ".config", "contentforge", "config.yaml")
}

// Load 加载配置，优先从文件，然后环境变量覆盖。
func (cm *ConfigManager) Load() (*ContentForgeConfig, error) {
	data, err := os.ReadFile(cm.configPath)
	if err != nil {
		if os.IsNotExist(err) {
			// 文件不存在，返回默认配置
			cm.config = cm.defaultConfig()
			cm.applyEnvOverrides(cm.config)
			return cm.config, nil
		}
		return nil, fmt.Errorf("读取配置文件失败: %w", err)
	}

	var cfg ContentForgeConfig
	// 尝试 YAML
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		// 尝试 JSON
		if err := json.Unmarshal(data, &cfg); err != nil {
			return nil, fmt.Errorf("解析配置文件失败: %w", err)
		}
	}

	cm.config = &cfg
	cm.applyEnvOverrides(cm.config)
	return cm.config, nil
}

// Save 保存配置到文件。
func (cm *ConfigManager) Save() error {
	if cm.config == nil {
		return fmt.Errorf("没有可保存的配置")
	}

	if err := os.MkdirAll(filepath.Dir(cm.configPath), 0755); err != nil {
		return fmt.Errorf("创建配置目录失败: %w", err)
	}

	data, err := yaml.Marshal(cm.config)
	if err != nil {
		return fmt.Errorf("序列化配置失败: %w", err)
	}

	if err := os.WriteFile(cm.configPath, data, 0644); err != nil {
		return fmt.Errorf("写入配置文件失败: %w", err)
	}

	return nil
}

// Get 获取当前配置（缓存）。
func (cm *ConfigManager) Get() (*ContentForgeConfig, error) {
	if cm.config == nil {
		return cm.Load()
	}
	return cm.config, nil
}

// Reload 重新加载配置。
func (cm *ConfigManager) Reload() (*ContentForgeConfig, error) {
	cm.config = nil
	return cm.Load()
}

// defaultConfig 返回默认配置。
func (cm *ConfigManager) defaultConfig() *ContentForgeConfig {
	homeDir, _ := os.UserHomeDir()
	return &ContentForgeConfig{
		Version: "1",
		AIProvider: AIProviderConfig{
			Name:         "openai",
			APIKey:       os.Getenv("OPENAI_API_KEY"),
			DefaultModel: "gpt-4o-mini",
			Timeout:      120,
		},
		AIProviders: []AIProviderConfig{
			{
				Name:         "claude",
				APIKey:       os.Getenv("ANTHROPIC_API_KEY"),
				DefaultModel: "claude-3-5-sonnet-20241022",
				Timeout:      120,
			},
			{
				Name:         "ollama",
				BaseURL:      "http://localhost:11434",
				DefaultModel: "llama3.1",
				Timeout:      300,
			},
		},
		Platform: PlatformBackendConfig{
			AgentReachBinary: "agent-reach",
			YtdlpBinary:      "yt-dlp",
		},
		Proxy: ProxyConfig{
			HTTP:  strPtr(os.Getenv("HTTP_PROXY")),
			HTTPS: strPtr(os.Getenv("HTTPS_PROXY")),
		},
		LogLevel: "INFO",
		StateDir: filepath.Join(homeDir, ".contentforge"),
	}
}

// applyEnvOverrides 用环境变量覆盖配置。
func (cm *ConfigManager) applyEnvOverrides(cfg *ContentForgeConfig) {
	if key := os.Getenv("CF_AI_API_KEY"); key != "" {
		cfg.AIProvider.APIKey = key
	}
	if name := os.Getenv("CF_AI_PROVIDER"); name != "" {
		cfg.AIProvider.Name = name
	}
	if model := os.Getenv("CF_AI_MODEL"); model != "" {
		cfg.AIProvider.DefaultModel = model
	}
	if url := os.Getenv("CF_AI_BASE_URL"); url != "" {
		cfg.AIProvider.BaseURL = url
	}
	if bin := os.Getenv("CF_AGENT_REACH_BINARY"); bin != "" {
		cfg.Platform.AgentReachBinary = bin
	}
	if bin := os.Getenv("CF_YTDLP_BINARY"); bin != "" {
		cfg.Platform.YtdlpBinary = bin
	}
	if path := os.Getenv("CF_FFMPEG_PATH"); path != "" {
		cfg.Platform.FFmpegPath = &path
	}
	if key := os.Getenv("CF_JINA_API_KEY"); key != "" {
		cfg.Platform.JinaAPIKey = &key
	}
	if proxy := os.Getenv("CF_HTTP_PROXY"); proxy != "" {
		cfg.Proxy.HTTP = &proxy
	}
	if proxy := os.Getenv("CF_HTTPS_PROXY"); proxy != "" {
		cfg.Proxy.HTTPS = &proxy
	}
	if level := os.Getenv("CF_LOG_LEVEL"); level != "" {
		cfg.LogLevel = level
	}
	if dir := os.Getenv("CF_STATE_DIR"); dir != "" {
		cfg.StateDir = dir
	}
}

// strPtr 返回字符串指针。
func strPtr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// GetAIProvider 获取指定名称的 AI Provider 配置。
func (cfg *ContentForgeConfig) GetAIProvider(name string) *AIProviderConfig {
	if name == "" {
		return &cfg.AIProvider
	}
	for i := range cfg.AIProviders {
		if cfg.AIProviders[i].Name == name {
			return &cfg.AIProviders[i]
		}
	}
	return &cfg.AIProvider
}

// GetPublishProfile 获取指定发布 Profile。
func (cfg *ContentForgeConfig) GetPublishProfile(id string) *PublishProfileConfig {
	for i := range cfg.PublishProfiles {
		if cfg.PublishProfiles[i].ID == id {
			return &cfg.PublishProfiles[i]
		}
	}
	return nil
}

// MaskedString 返回脱敏后的字符串。
func MaskedString(s string) string {
	if len(s) <= 8 {
		if s == "" {
			return ""
		}
		return "***"
	}
	return s[:4] + "****" + s[len(s)-4:]
}

// 全局单例
var defaultManager *ConfigManager

// GetConfig 获取全局配置（懒加载）。
func GetConfig() (*ContentForgeConfig, error) {
	if defaultManager == nil {
		defaultManager = NewConfigManager("")
	}
	return defaultManager.Get()
}

// ReloadConfig 重新加载全局配置。
func ReloadConfig() (*ContentForgeConfig, error) {
	if defaultManager == nil {
		defaultManager = NewConfigManager("")
	}
	return defaultManager.Reload()
}
