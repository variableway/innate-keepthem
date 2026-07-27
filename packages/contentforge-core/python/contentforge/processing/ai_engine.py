"""AI Engine 抽象层 — 支持 OpenAI / Claude / Ollama 多 Provider 切换。"""
import json
import logging
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict, Generator, List, Optional

import requests

logger = logging.getLogger(__name__)


class AIEngineError(Exception):
    """AI Engine 通用错误。"""
    pass


class AIProviderNotFoundError(AIEngineError):
    """找不到指定的 AI Provider。"""
    pass


class AIAPIError(AIEngineError):
    """AI API 调用错误。"""
    pass


@dataclass
class AIConfig:
    provider: str  # "openai" | "claude" | "ollama"
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: str = "gpt-4o-mini"
    temperature: float = 0.7
    max_tokens: int = 2000
    timeout: int = 60
    proxy: Optional[str] = None


class AIProvider(ABC):
    """AI Provider 抽象基类。"""

    @abstractmethod
    def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        ...

    @abstractmethod
    def stream(self, messages: List[Dict[str, str]], **kwargs) -> Generator[str, None, None]:
        ...


class OpenAIProvider(AIProvider):
    """OpenAI 兼容 Provider（含 Azure、Gemini、Moonshot 等）。"""

    def __init__(self, config: AIConfig):
        self.config = config
        self.base_url = (config.base_url or "https://api.openai.com/v1").rstrip("/")
        self.api_key = config.api_key or os.getenv("OPENAI_API_KEY", "")
        self._session = requests.Session()
        self._session.headers.update({
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        })
        if config.proxy:
            self._session.proxies = {"http": config.proxy, "https": config.proxy}

    def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        payload = {
            "model": kwargs.get("model", self.config.model),
            "messages": messages,
            "temperature": kwargs.get("temperature", self.config.temperature),
            "max_tokens": kwargs.get("max_tokens", self.config.max_tokens),
        }
        try:
            resp = self._session.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                timeout=self.config.timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"].strip()
        except requests.RequestException as exc:
            logger.error("OpenAI API request failed: %s", exc)
            raise RuntimeError(f"OpenAI API error: {exc}") from exc
        except (KeyError, IndexError) as exc:
            logger.error("Unexpected OpenAI response format: %s", resp.text if 'resp' in dir() else "N/A")
            raise RuntimeError(f"Invalid OpenAI response: {exc}") from exc

    def stream(self, messages: List[Dict[str, str]], **kwargs) -> Generator[str, None, None]:
        payload = {
            "model": kwargs.get("model", self.config.model),
            "messages": messages,
            "temperature": kwargs.get("temperature", self.config.temperature),
            "max_tokens": kwargs.get("max_tokens", self.config.max_tokens),
            "stream": True,
        }
        try:
            resp = self._session.post(
                f"{self.base_url}/chat/completions",
                json=payload,
                timeout=self.config.timeout,
                stream=True,
            )
            resp.raise_for_status()
            for line in resp.iter_lines():
                if not line:
                    continue
                text = line.decode("utf-8")
                if text.startswith("data: "):
                    chunk = text[6:]
                    if chunk == "[DONE]":
                        break
                    try:
                        obj = json.loads(chunk)
                        delta = obj["choices"][0]["delta"].get("content", "")
                        if delta:
                            yield delta
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue
        except requests.RequestException as exc:
            logger.error("OpenAI streaming request failed: %s", exc)
            raise RuntimeError(f"OpenAI stream error: {exc}") from exc


class ClaudeProvider(AIProvider):
    """Anthropic Claude Provider。"""

    def __init__(self, config: AIConfig):
        self.config = config
        self.base_url = (config.base_url or "https://api.anthropic.com/v1").rstrip("/")
        self.api_key = config.api_key or os.getenv("ANTHROPIC_API_KEY", "")
        self._session = requests.Session()
        self._session.headers.update({
            "x-api-key": self.api_key,
            "Content-Type": "application/json",
            "anthropic-version": "2023-06-01",
        })
        if config.proxy:
            self._session.proxies = {"http": config.proxy, "https": config.proxy}

    def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        system_msg = ""
        user_assistant_msgs = []
        for m in messages:
            if m["role"] == "system":
                system_msg = m["content"]
            else:
                user_assistant_msgs.append(m)
        payload: Dict[str, Any] = {
            "model": kwargs.get("model", self.config.model),
            "messages": user_assistant_msgs,
            "max_tokens": kwargs.get("max_tokens", self.config.max_tokens),
            "temperature": kwargs.get("temperature", self.config.temperature),
        }
        if system_msg:
            payload["system"] = system_msg
        try:
            resp = self._session.post(
                f"{self.base_url}/messages",
                json=payload,
                timeout=self.config.timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["content"][0]["text"].strip()
        except requests.RequestException as exc:
            logger.error("Claude API request failed: %s", exc)
            raise RuntimeError(f"Claude API error: {exc}") from exc

    def stream(self, messages: List[Dict[str, str]], **kwargs) -> Generator[str, None, None]:
        # Claude streaming 简化实现
        yield self.chat(messages, **kwargs)


class OllamaProvider(AIProvider):
    """Ollama 本地 Provider。"""

    def __init__(self, config: AIConfig):
        self.config = config
        self.base_url = (config.base_url or "http://localhost:11434").rstrip("/")
        self._session = requests.Session()
        if config.proxy:
            self._session.proxies = {"http": config.proxy, "https": config.proxy}

    def chat(self, messages: List[Dict[str, str]], **kwargs) -> str:
        payload = {
            "model": kwargs.get("model", self.config.model),
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": kwargs.get("temperature", self.config.temperature),
                "num_predict": kwargs.get("max_tokens", self.config.max_tokens),
            },
        }
        try:
            resp = self._session.post(
                f"{self.base_url}/api/chat",
                json=payload,
                timeout=self.config.timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["message"]["content"].strip()
        except requests.RequestException as exc:
            logger.error("Ollama request failed: %s", exc)
            raise RuntimeError(f"Ollama error: {exc}") from exc

    def stream(self, messages: List[Dict[str, str]], **kwargs) -> Generator[str, None, None]:
        yield self.chat(messages, **kwargs)


class AIEngine:
    """AI Engine 统一入口，支持多 Provider 切换。"""

    PROVIDERS = {
        "openai": OpenAIProvider,
        "claude": ClaudeProvider,
        "ollama": OllamaProvider,
    }

    def __init__(self, config: Optional[AIConfig] = None):
        if config is None:
            config = AIConfig()
        if config.provider not in self.PROVIDERS:
            raise ValueError(f"Unknown provider: {config.provider}. Choose from {list(self.PROVIDERS.keys())}")
        self.config = config
        self.provider = self.PROVIDERS[config.provider](config)
        logger.info("AIEngine initialized with provider: %s, model: %s", config.provider, config.model)

    @classmethod
    def from_config(cls, config_dict: Optional[Dict[str, Any]] = None) -> "AIEngine":
        """从字典配置创建 AIEngine。"""
        if config_dict is None:
            config_dict = {}
        return cls(AIConfig(**config_dict))

    def generate(self, prompt: str, system: Optional[str] = None, **kwargs) -> str:
        """通用生成方法。"""
        messages = []
        if system:
            messages.append({"role": "system", "content": system})
        messages.append({"role": "user", "content": prompt})
        return self.provider.chat(messages, **kwargs)

    def generate_structured(self, prompt: str, system: Optional[str] = None, **kwargs) -> Dict:
        """生成结构化 JSON 输出。"""
        system_prompt = (system or "") + "\n\nYou must respond with valid JSON only."
        raw = self.generate(prompt, system=system_prompt, **kwargs)
        try:
            return json.loads(raw)
        except json.JSONDecodeError as exc:
            logger.warning("JSON parse failed, attempting extraction: %s", exc)
            # 尝试从 markdown 代码块中提取 JSON
            if "```json" in raw:
                raw = raw.split("```json")[1].split("```")[0].strip()
                return json.loads(raw)
            if "```" in raw:
                raw = raw.split("```")[1].split("```")[0].strip()
                return json.loads(raw)
            raise RuntimeError(f"Failed to parse JSON from AI response: {exc}") from exc

    def summarize(self, text: str, max_length: int = 300, **kwargs) -> str:
        """生成摘要。"""
        prompt = f"""Summarize the following text in {max_length} words or less. 
Capture the main points and key insights:

{text}
"""
        return self.generate(prompt, system="You are a concise summarizer.", **kwargs)

    def rewrite(self, text: str, style: str = "professional", **kwargs) -> str:
        """改写文本风格。"""
        prompt = f"""Rewrite the following text in a {style} style. 
Maintain the original meaning but adapt the tone and vocabulary:

{text}
"""
        return self.generate(prompt, system="You are a skilled editor and rewriter.", **kwargs)
