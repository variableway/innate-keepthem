"""Config — Python 配置管理

读取 ~/.config/contentforge/config.yaml，支持环境变量覆盖。
配置结构：ai provider 设置、平台后端选择、API keys、代理设置、发布 profile。
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

try:
    import yaml
except ImportError:
    yaml = None  # type: ignore

logger = logging.getLogger(__name__)

# ------------------------------------------------------------------------------
# Configuration Models
# ------------------------------------------------------------------------------

@dataclass
class AIProviderConfig:
    """AI Provider 配置。"""

    name: str = "openai"
    api_key: str = ""
    base_url: str = ""
    default_model: str = ""
    timeout: int = 120

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AIProviderConfig":
        return cls(
            name=data.get("name", "openai"),
            api_key=data.get("api_key", ""),
            base_url=data.get("base_url", ""),
            default_model=data.get("default_model", ""),
            timeout=data.get("timeout", 120),
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "api_key": self._mask_key(),
            "base_url": self.base_url,
            "default_model": self.default_model,
            "timeout": self.timeout,
        }

    def _mask_key(self) -> str:
        if len(self.api_key) <= 8:
            return "***" if self.api_key else ""
        return self.api_key[:4] + "****" + self.api_key[-4:]


@dataclass
class PlatformBackendConfig:
    """平台后端配置。"""

    agent_reach_binary: str = "agent-reach"
    ytdlp_binary: str = "yt-dlp"
    ffmpeg_path: Optional[str] = None
    jina_api_key: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PlatformBackendConfig":
        return cls(
            agent_reach_binary=data.get("agent_reach_binary", "agent-reach"),
            ytdlp_binary=data.get("ytdlp_binary", "yt-dlp"),
            ffmpeg_path=data.get("ffmpeg_path"),
            jina_api_key=data.get("jina_api_key"),
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "agent_reach_binary": self.agent_reach_binary,
            "ytdlp_binary": self.ytdlp_binary,
            "ffmpeg_path": self.ffmpeg_path,
            "jina_api_key": "***" if self.jina_api_key else None,
        }


@dataclass
class ProxyConfig:
    """代理配置。"""

    http: Optional[str] = None
    https: Optional[str] = None
    no_proxy: Optional[str] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ProxyConfig":
        return cls(
            http=data.get("http"),
            https=data.get("https"),
            no_proxy=data.get("no_proxy"),
        )

    def to_dict(self) -> Dict[str, Any]:
        return {"http": self.http, "https": self.https, "no_proxy": self.no_proxy}


@dataclass
class PublishProfileConfig:
    """发布 Profile 配置。"""

    id: str = ""
    name: str = ""
    platform: str = ""
    default_format: str = "markdown"
    auto_publish: bool = False
    max_length: Optional[int] = None
    credentials: Dict[str, str] = field(default_factory=dict)
    image_config: Optional[Dict[str, Any]] = None

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "PublishProfileConfig":
        return cls(
            id=data.get("id", ""),
            name=data.get("name", ""),
            platform=data.get("platform", ""),
            default_format=data.get("default_format", "markdown"),
            auto_publish=data.get("auto_publish", False),
            max_length=data.get("max_length"),
            credentials=data.get("credentials", {}),
            image_config=data.get("image_config"),
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "platform": self.platform,
            "default_format": self.default_format,
            "auto_publish": self.auto_publish,
            "max_length": self.max_length,
            "credentials": {k: "***" for k in self.credentials},
            "image_config": self.image_config,
        }


@dataclass
class ContentForgeConfig:
    """ContentForge 完整配置。"""

    version: str = "1"
    ai_provider: AIProviderConfig = field(default_factory=AIProviderConfig)
    ai_providers: List[AIProviderConfig] = field(default_factory=list)
    platform: PlatformBackendConfig = field(default_factory=PlatformBackendConfig)
    proxy: ProxyConfig = field(default_factory=ProxyConfig)
    publish_profiles: List[PublishProfileConfig] = field(default_factory=list)
    default_pipeline: str = ""
    log_level: str = "INFO"
    state_dir: str = ""

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ContentForgeConfig":
        return cls(
            version=data.get("version", "1"),
            ai_provider=AIProviderConfig.from_dict(data.get("ai_provider", {})),
            ai_providers=[
                AIProviderConfig.from_dict(p) for p in data.get("ai_providers", [])
            ],
            platform=PlatformBackendConfig.from_dict(data.get("platform", {})),
            proxy=ProxyConfig.from_dict(data.get("proxy", {})),
            publish_profiles=[
                PublishProfileConfig.from_dict(p)
                for p in data.get("publish_profiles", [])
            ],
            default_pipeline=data.get("default_pipeline", ""),
            log_level=data.get("log_level", "INFO"),
            state_dir=data.get("state_dir", ""),
        )

    def to_dict(self) -> Dict[str, Any]:
        return {
            "version": self.version,
            "ai_provider": self.ai_provider.to_dict(),
            "ai_providers": [p.to_dict() for p in self.ai_providers],
            "platform": self.platform.to_dict(),
            "proxy": self.proxy.to_dict(),
            "publish_profiles": [p.to_dict() for p in self.publish_profiles],
            "default_pipeline": self.default_pipeline,
            "log_level": self.log_level,
            "state_dir": self.state_dir,
        }

    def get_ai_provider(self, name: Optional[str] = None) -> AIProviderConfig:
        """获取指定名称的 AI Provider 配置，或默认配置。"""
        if name:
            for p in self.ai_providers:
                if p.name == name:
                    return p
        return self.ai_provider

    def get_publish_profile(self, profile_id: str) -> Optional[PublishProfileConfig]:
        """获取指定发布 Profile。"""
        for p in self.publish_profiles:
            if p.id == profile_id:
                return p
        return None


# ------------------------------------------------------------------------------
# Config Loader
# ------------------------------------------------------------------------------

DEFAULT_CONFIG_PATH = Path.home() / ".config" / "contentforge" / "config.yaml"


class ConfigManager:
    """配置管理器 — 加载 YAML 配置并支持环境变量覆盖。"""

    ENV_PREFIX = "CF_"

    def __init__(self, config_path: Optional[str] = None) -> None:
        self._config_path = Path(config_path) if config_path else DEFAULT_CONFIG_PATH
        self._config: Optional[ContentForgeConfig] = None

    # ------------------------------------------------------------------
    # loading
    # ------------------------------------------------------------------

    def load(self) -> ContentForgeConfig:
        """加载配置，优先从文件，然后用环境变量覆盖。"""
        if self._config_path.exists():
            raw = self._load_yaml(self._config_path)
        else:
            logger.info("[config] config file not found, using defaults: %s", self._config_path)
            raw = {}

        config = ContentForgeConfig.from_dict(raw)
        self._apply_env_overrides(config)
        self._config = config
        return config

    def reload(self) -> ContentForgeConfig:
        """重新加载配置。"""
        self._config = None
        return self.load()

    def get(self) -> ContentForgeConfig:
        """获取当前配置（缓存）。"""
        if self._config is None:
            return self.load()
        return self._config

    # ------------------------------------------------------------------
    # saving
    # ------------------------------------------------------------------

    def save(self, config: Optional[ContentForgeConfig] = None) -> None:
        """保存配置到文件。"""
        cfg = config or self._config
        if cfg is None:
            raise ValueError("没有可保存的配置")

        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        data = cfg.to_dict()
        # 移除 mask 后的敏感信息，保存原始值
        if yaml is None:
            raise ImportError("PyYAML 未安装，无法保存配置")
        self._config_path.write_text(yaml.dump(data, allow_unicode=True, sort_keys=False), encoding="utf-8")
        logger.info("[config] saved to %s", self._config_path)

    def init_default(self) -> ContentForgeConfig:
        """创建默认配置并保存。"""
        config = ContentForgeConfig(
            ai_provider=AIProviderConfig(
                name="openai",
                api_key=os.getenv("OPENAI_API_KEY", ""),
                default_model="gpt-4o-mini",
            ),
            ai_providers=[
                AIProviderConfig(
                    name="claude",
                    api_key=os.getenv("ANTHROPIC_API_KEY", ""),
                    default_model="claude-3-5-sonnet-20241022",
                ),
                AIProviderConfig(
                    name="ollama",
                    base_url="http://localhost:11434",
                    default_model="llama3.1",
                ),
            ],
            platform=PlatformBackendConfig(
                agent_reach_binary="agent-reach",
                ytdlp_binary="yt-dlp",
            ),
            proxy=ProxyConfig(
                http=os.getenv("HTTP_PROXY"),
                https=os.getenv("HTTPS_PROXY"),
            ),
            log_level="INFO",
            state_dir=str(Path.home() / ".contentforge"),
        )
        self.save(config)
        return config

    # ------------------------------------------------------------------
    # internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _load_yaml(path: Path) -> Dict[str, Any]:
        if yaml is None:
            raise ImportError("PyYAML 未安装，无法读取 YAML 配置")
        text = path.read_text(encoding="utf-8")
        return yaml.safe_load(text) or {}

    def _apply_env_overrides(self, config: ContentForgeConfig) -> None:
        """用环境变量覆盖配置。"""
        # AI Provider
        if key := os.getenv("CF_AI_API_KEY"):
            config.ai_provider.api_key = key
        if name := os.getenv("CF_AI_PROVIDER"):
            config.ai_provider.name = name
        if model := os.getenv("CF_AI_MODEL"):
            config.ai_provider.default_model = model
        if url := os.getenv("CF_AI_BASE_URL"):
            config.ai_provider.base_url = url

        # 平台后端
        if bin_path := os.getenv("CF_AGENT_REACH_BINARY"):
            config.platform.agent_reach_binary = bin_path
        if bin_path := os.getenv("CF_YTDLP_BINARY"):
            config.platform.ytdlp_binary = bin_path
        if path := os.getenv("CF_FFMPEG_PATH"):
            config.platform.ffmpeg_path = path
        if key := os.getenv("CF_JINA_API_KEY"):
            config.platform.jina_api_key = key

        # 代理
        if proxy := os.getenv("CF_HTTP_PROXY"):
            config.proxy.http = proxy
        if proxy := os.getenv("CF_HTTPS_PROXY"):
            config.proxy.https = proxy

        # 日志
        if level := os.getenv("CF_LOG_LEVEL"):
            config.log_level = level

        # 状态目录
        if dir_path := os.getenv("CF_STATE_DIR"):
            config.state_dir = dir_path

    # ------------------------------------------------------------------
    # convenience
    # ------------------------------------------------------------------

    def ensure_config_dir(self) -> Path:
        """确保配置目录存在。"""
        self._config_path.parent.mkdir(parents=True, exist_ok=True)
        return self._config_path.parent


# 全局单例
_default_manager: Optional[ConfigManager] = None


def get_config(config_path: Optional[str] = None) -> ContentForgeConfig:
    """获取全局配置（懒加载）。"""
    global _default_manager
    if _default_manager is None or config_path is not None:
        _default_manager = ConfigManager(config_path)
    return _default_manager.load()


def reload_config() -> ContentForgeConfig:
    """重新加载全局配置。"""
    global _default_manager
    if _default_manager is None:
        _default_manager = ConfigManager()
    return _default_manager.reload()
