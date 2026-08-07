# ContentForge — Plugin 系统设计

> 文档版本: v1.0  
> 更新日期: 2026-08-03  
> 设计目标: 统一、可扩展的社交媒体内容采集插件体系

---

## 一、设计目标

Plugin 系统解决的核心问题：**如何以统一的方式从各种社交媒体平台采集内容？**

### 1.1 挑战

- 每个平台有不同的 API/认证/反爬机制
- 内容格式各异（推文、视频、文章、播客）
- 采集方式多样（API、CLI 工具、浏览器扩展、RSS）
- 需要统一转换为 ContentUnit 格式

### 1.2 设计原则

1. **统一接口**: 所有 Plugin 实现相同的接口，调用方无感知差异
2. **职责分离**: Plugin 只做「采集和原始数据解析」，不做存储和处理
3. **渐进式支持**: 从最简单的方式开始（如 yt-dlp），逐步完善
4. **可配置化**: 每个 Plugin 支持独立配置（API Key、代理、超时等）
5. **健康检查**: 每个 Plugin 可以自检可用性

---

## 二、架构设计

### 2.1 Plugin 在系统中的位置

```
┌─────────────────────────────────────────────────────────────┐
│                      ContentForge                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────┐    ┌─────────────────────────────────────┐  │
│  │   用户输入   │    │           Plugin Manager             │  │
│  │  (URL/关键词)│───→│  ┌─────────┐ ┌─────────┐ ┌────────┐│  │
│  └─────────────┘    │  │YouTube  │ │Twitter  │ │ RSS    ││  │
│                     │  │ Plugin  │ │ Plugin  │ │ Plugin ││  │
│  ┌─────────────┐    │  └────┬────┘ └────┬────┘ └───┬────┘│  │
│  │ Chrome 扩展  │───→│       └───────────┴──────────┘      │  │
│  │  (辅助采集)  │    │                │                     │  │
│  └─────────────┘    └────────────────┼─────────────────────┘  │
│                                      │                        │
│                                      ▼                        │
│                           ┌─────────────────────┐             │
│                           │  ContentUnit (统一)  │             │
│                           │  • platform          │             │
│                           │  • url               │             │
│                           │  • author            │             │
│                           │  • extracted_text    │             │
│                           │  • engagement        │             │
│                           │  • raw_metadata      │             │
│                           └──────────┬──────────┘             │
│                                      │                        │
│                                      ▼                        │
│                           ┌─────────────────────┐             │
│                           │   SQLite Database   │             │
│                           └─────────────────────┘             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 Plugin 接口定义

```python
# contentforge/plugin/base.py

from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List
from dataclasses import dataclass
from enum import Enum


class PluginStatus(Enum):
    AVAILABLE = "available"       # 可用
    UNAVAILABLE = "unavailable"   # 不可用（依赖未安装）
    DEGRADED = "degraded"         # 降级（部分功能可用）
    DISABLED = "disabled"         # 手动禁用


@dataclass
class PluginHealth:
    status: PluginStatus
    message: str
    details: Dict[str, Any]


@dataclass
class FetchResult:
    success: bool
    content_unit: Optional[ContentUnit]
    error: Optional[str]
    raw_response: Optional[Dict] = None


class ContentPlugin(ABC):
    """ContentForge 内容采集插件基类"""
    
    # 插件元数据
    name: str                          # 唯一标识（如 "youtube", "twitter"）
    display_name: str                  # 显示名称
    version: str = "1.0.0"
    supported_types: List[str]        # 支持的内容类型
    
    # URL 匹配模式（用于自动路由）
    url_patterns: List[str] = []       # 正则表达式列表
    
    # 配置 schema
    config_schema: Dict[str, Any] = {} # JSON Schema 格式的配置定义
    
    def __init__(self, config: Dict[str, Any] = None):
        self.config = config or {}
        self._client = None
    
    @abstractmethod
    def health_check(self) -> PluginHealth:
        """检查插件健康状态"""
        pass
    
    @abstractmethod
    def can_handle(self, url: str) -> bool:
        """判断是否能处理给定 URL"""
        pass
    
    @abstractmethod
    def fetch(self, url: str, options: Dict[str, Any] = None) -> FetchResult:
        """采集内容并返回 ContentUnit"""
        pass
    
    @abstractmethod
    def fetch_batch(self, urls: List[str], options: Dict[str, Any] = None) -> List[FetchResult]:
        """批量采集"""
        pass
    
    def configure(self, **kwargs):
        """更新配置"""
        self.config.update(kwargs)
    
    def get_config(self, key: str, default=None):
        """获取配置项"""
        return self.config.get(key, default)
```

### 2.3 Plugin Manager

```python
# contentforge/plugin/manager.py

class PluginManager:
    """插件管理器 — 统一管理所有内容采集插件"""
    
    def __init__(self):
        self._plugins: Dict[str, ContentPlugin] = {}
        self._registry: Dict[str, Type[ContentPlugin]] = {}
    
    def register(self, plugin_class: Type[ContentPlugin]):
        """注册插件类"""
        instance = plugin_class()
        self._plugins[instance.name] = instance
        self._registry[instance.name] = plugin_class
    
    def get(self, name: str) -> Optional[ContentPlugin]:
        """获取插件实例"""
        return self._plugins.get(name)
    
    def find_for_url(self, url: str) -> Optional[ContentPlugin]:
        """根据 URL 自动查找合适的插件"""
        for plugin in self._plugins.values():
            if plugin.can_handle(url):
                return plugin
        return None
    
    def health_check_all(self) -> Dict[str, PluginHealth]:
        """检查所有插件健康状态"""
        return {name: plugin.health_check() 
                for name, plugin in self._plugins.items()}
    
    def list_plugins(self) -> List[Dict[str, Any]]:
        """列出所有插件信息"""
        return [{
            "name": p.name,
            "display_name": p.display_name,
            "version": p.version,
            "supported_types": p.supported_types,
            "health": p.health_check().status.value,
        } for p in self._plugins.values()]
    
    def fetch(self, url: str, plugin_name: str = None, 
              options: Dict[str, Any] = None) -> FetchResult:
        """
        统一采集入口
        
        1. 如果指定 plugin_name，使用指定插件
        2. 否则自动匹配 URL 模式
        3. 无匹配时返回错误
        """
        if plugin_name:
            plugin = self._plugins.get(plugin_name)
            if not plugin:
                return FetchResult(success=False, error=f"Plugin '{plugin_name}' not found")
        else:
            plugin = self.find_for_url(url)
            if not plugin:
                return FetchResult(success=False, error=f"No plugin can handle URL: {url}")
        
        # 健康检查
        health = plugin.health_check()
        if health.status == PluginStatus.DISABLED:
            return FetchResult(success=False, error=f"Plugin '{plugin.name}' is disabled")
        
        return plugin.fetch(url, options)
```

---

## 三、已有 Plugin 实现

### 3.1 YouTube Plugin（已实现）

**实现方式**: yt-dlp CLI 封装

```python
class YouTubePlugin(ContentPlugin):
    name = "youtube"
    display_name = "YouTube"
    supported_types = ["video"]
    url_patterns = [
        r"youtube\.com/watch\?v=",
        r"youtu\.be/",
        r"youtube\.com/playlist",
    ]
    
    config_schema = {
        "type": "object",
        "properties": {
            "ytdlp_path": {"type": "string", "default": "yt-dlp"},
            "ffmpeg_path": {"type": "string"},
            "proxy": {"type": "string"},
            "cookie_file": {"type": "string"},
        }
    }
    
    def health_check(self) -> PluginHealth:
        try:
            subprocess.run([self.get_config("ytdlp_path", "yt-dlp"), "--version"],
                         capture_output=True, check=True)
            return PluginHealth(
                status=PluginStatus.AVAILABLE,
                message="yt-dlp is available",
                details={"version": "..."}
            )
        except (subprocess.CalledProcessError, FileNotFoundError):
            return PluginHealth(
                status=PluginStatus.UNAVAILABLE,
                message="yt-dlp not found",
                details={"install": "pip install yt-dlp"}
            )
    
    def can_handle(self, url: str) -> bool:
        return any(re.search(pattern, url) for pattern in self.url_patterns)
    
    def fetch(self, url: str, options: Dict[str, Any] = None) -> FetchResult:
        # 1. 使用 yt-dlp 获取视频信息
        # 2. 提取字幕（如有）
        # 3. 构建 ContentUnit
        # 4. 返回结果
        ...
```

**当前状态**: ✅ 已实现（通过 Rust 后端 `downloader.rs` 和 Python `transcriber.py`）

---

## 四、规划中 Plugin

### 4.1 Twitter/X Plugin

**实现方式**: agent-reach CLI 封装 / Twitter API v2 / 浏览器扩展辅助

```python
class TwitterPlugin(ContentPlugin):
    name = "twitter"
    display_name = "Twitter / X"
    supported_types = ["tweet", "thread"]
    url_patterns = [
        r"twitter\.com/\w+/status/\d+",
        r"x\.com/\w+/status/\d+",
        r"twitter\.com/\w+/status/\d+/\w+",  # 线程
    ]
    
    config_schema = {
        "type": "object",
        "properties": {
            "agent_reach_path": {"type": "string", "default": "agent-reach"},
            "api_bearer_token": {"type": "string"},
            "proxy": {"type": "string"},
        }
    }
```

**采集策略**:

| 优先级 | 方式 | 说明 |
|--------|------|------|
| 1 | agent-reach CLI | 命令行工具抓取 |
| 2 | Twitter API v2 | 官方 API（需要 Bearer Token） |
| 3 | 浏览器扩展 | Chrome 扩展辅助抓取 |
| 4 | Nitter 镜像 | 备用方案 |

**状态**: 📋 规划中（🔴 P0）

### 4.2 RSS Plugin

**实现方式**: feedparser / requests

```python
class RSSPlugin(ContentPlugin):
    name = "rss"
    display_name = "RSS Feed"
    supported_types = ["article"]
    url_patterns = [
        r"\.rss$",
        r"\.xml$",
        r"feed",
        r"rss",
    ]
    
    def fetch(self, url: str, options: Dict[str, Any] = None) -> FetchResult:
        # 1. 解析 RSS feed
        # 2. 获取文章全文（可选：使用 Jina Reader）
        # 3. 构建 ContentUnit 列表
        ...
```

**状态**: 📋 规划中（🟡 P1）

### 4.3 Web Page Plugin

**实现方式**: Jina Reader / crawl4ai / requests + BeautifulSoup

```python
class WebPagePlugin(ContentPlugin):
    name = "web"
    display_name = "Web Page"
    supported_types = ["article"]
    url_patterns = [
        r"http[s]?://",  # 通用 URL 模式（兜底）
    ]
    
    config_schema = {
        "type": "object",
        "properties": {
            "jina_api_key": {"type": "string"},
            "use_jina": {"type": "boolean", "default": True},
            "timeout": {"type": "integer", "default": 30},
        }
    }
```

**采集策略**:

| 优先级 | 方式 | 说明 |
|--------|------|------|
| 1 | Jina Reader | 最佳解析质量，需要 API Key |
| 2 | crawl4ai | 本地爬虫，无需 API Key |
| 3 | requests + BeautifulSoup | 简单回退方案 |

**状态**: 📋 规划中（🟡 P1）

### 4.4 Podcast Plugin

**实现方式**: RSS + 音频下载 + Whisper 转录

```python
class PodcastPlugin(ContentPlugin):
    name = "podcast"
    display_name = "Podcast"
    supported_types = ["audio"]
    url_patterns = [
        r"podcast",
        r"\.mp3$",
        r"\.m4a$",
    ]
```

**状态**: 📋 规划中（🟢 P2）

---

## 五、Plugin 配置体系

### 5.1 全局配置

```yaml
# ~/.config/contentforge/config.yaml
plugins:
  youtube:
    enabled: true
    ytdlp_path: yt-dlp
    ffmpeg_path: /usr/local/bin/ffmpeg
    
  twitter:
    enabled: true
    agent_reach_path: agent-reach
    api_bearer_token: ""  # 可选
    
  rss:
    enabled: true
    
  web:
    enabled: true
    use_jina: true
    jina_api_key: ""  # 可选
```

### 5.2 运行时配置

```python
# 动态启用/禁用插件
plugin_manager.get("twitter").configure(enabled=False)

# 更新插件配置
plugin_manager.get("youtube").configure(
    proxy="http://localhost:7890",
    quality="1080"
)
```

---

## 六、与 Chrome 扩展的协作

```
Chrome Extension                    Desktop App
     │                                   │
     │ 1. 用户在浏览器中浏览社交媒体      │
     │ 2. 点击扩展图标采集当前页面        │
     │                                   │
     │ 3. 扩展通过 Native Messaging      │
     │    发送 URL 到 Desktop            │
     │ ──────────────────────────────→   │
     │                                   │
     │ 4. Desktop 通过 Plugin Manager    │
     │    路由到对应 Plugin               │
     │ 5. Plugin 采集内容                │
     │ 6. 保存为 ContentUnit              │
     │                                   │
     │ 7. 通知扩展采集完成               │
     │ ←──────────────────────────────   │
```

---

## 七、相关文档

| 文档 | 路径 | 内容 |
|------|------|------|
| 项目愿景 | [00-PROJECT-VISION.md](00-PROJECT-VISION.md) | 愿景、核心概念 |
| 架构总览 | [01-ARCHITECTURE-OVERVIEW.md](01-ARCHITECTURE-OVERVIEW.md) | 系统架构 |
| 模块状态 | [02-MODULE-STATUS.md](02-MODULE-STATUS.md) | 各模块功能状态 |
| Skill 系统 | [04-SKILL-SYSTEM.md](04-SKILL-SYSTEM.md) | Skill 定义与执行 |
| 内容生命周期 | [05-CONTENT-LIFECYCLE.md](05-CONTENT-LIFECYCLE.md) | ContentUnit 生命周期 |
