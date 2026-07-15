"""转录器 — 使用 agent-reach transcribe 或 yt-dlp 提取字幕。"""
import json
import logging
import os
import re
import subprocess
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import List, Optional

from contentforge.models import ContentType, ContentUnit, SourceInfo

logger = logging.getLogger(__name__)


class Transcriber:
    """视频/音频转录器，支持多种后端。"""

    BACKENDS = ["agent-reach", "yt-dlp", "ffmpeg-whisper"]

    def __init__(
        self,
        backend: str = "yt-dlp",
        agent_reach_path: str = "agent-reach",
        yt_dlp_path: str = "yt-dlp",
        ffmpeg_path: str = "ffmpeg",
    ):
        if backend not in self.BACKENDS:
            raise ValueError(f"Unsupported backend: {backend}. Choose from {self.BACKENDS}")
        self.backend = backend
        self.agent_reach_path = agent_reach_path
        self.yt_dlp_path = yt_dlp_path
        self.ffmpeg_path = ffmpeg_path
        self._check_backend()

    def _check_backend(self) -> None:
        """检查所选后端是否可用。"""
        paths = {
            "agent-reach": self.agent_reach_path,
            "yt-dlp": self.yt_dlp_path,
            "ffmpeg-whisper": self.ffmpeg_path,
        }
        binary = paths.get(self.backend)
        if not binary:
            return
        try:
            subprocess.run([binary, "--version"], capture_output=True, check=True, timeout=10)
            logger.info("Transcriber backend ready: %s (%s)", self.backend, binary)
        except (subprocess.CalledProcessError, FileNotFoundError) as exc:
            logger.warning("Transcriber backend not available: %s (%s)", self.backend, exc)

    def transcribe(
        self,
        url: str,
        languages: Optional[List[str]] = None,
        output_dir: Optional[str] = None,
    ) -> ContentUnit:
        """转录视频/音频并返回 ContentUnit。"""
        if self.backend == "yt-dlp":
            return self._transcribe_yt_dlp(url, languages, output_dir)
        if self.backend == "agent-reach":
            return self._transcribe_agent_reach(url, languages, output_dir)
        return self._transcribe_ffmpeg(url, languages, output_dir)

    def _transcribe_yt_dlp(
        self,
        url: str,
        languages: Optional[List[str]] = None,
        output_dir: Optional[str] = None,
    ) -> ContentUnit:
        """使用 yt-dlp 提取字幕/转录。"""
        logger.info("yt-dlp transcribing: %s", url)
        out_dir = Path(output_dir or tempfile.gettempdir())
        out_dir.mkdir(parents=True, exist_ok=True)
        out_template = str(out_dir / "%(id)s")

        cmd = [
            self.yt_dlp_path,
            "--skip-download",
            "--write-subs",
            "--write-auto-subs",
            "--sub-langs", ",".join(languages or ["en", "zh-Hans", "zh-Hant"]),
            "--sub-format", "vtt",
            "--output", out_template,
            url,
        ]
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300, check=False)
            if proc.returncode != 0:
                logger.warning("yt-dlp subtitle extraction had issues: %s", proc.stderr)
        except subprocess.TimeoutExpired:
            raise RuntimeError("yt-dlp transcribe timed out after 300s")

        # 查找生成的 VTT 文件
        vtt_files = sorted(out_dir.glob("*.vtt"), key=lambda p: p.stat().st_mtime, reverse=True)
        transcript = ""
        if vtt_files:
            transcript = self._parse_vtt(vtt_files[0])
        else:
            # 回退：尝试直接获取 info 中的 description 作为文本
            transcript = self._fallback_description(url)

        return ContentUnit(
            id=str(uuid.uuid4()),
            source=SourceInfo(platform="youtube", url=url),
            type=ContentType.VIDEO,
            title="",
            description="",
            extracted_text=transcript,
            file_path=str(vtt_files[0]) if vtt_files else None,
            raw_metadata={"backend": "yt-dlp", "vtt_files": [str(f) for f in vtt_files[:5]]},
        )

    def _transcribe_agent_reach(
        self,
        url: str,
        languages: Optional[List[str]] = None,
        output_dir: Optional[str] = None,
    ) -> ContentUnit:
        """使用 agent-reach transcribe 子命令。"""
        logger.info("agent-reach transcribing: %s", url)
        cmd = [self.agent_reach_path, "transcribe", "--json", url]
        if languages:
            cmd.extend(["--lang", ",".join(languages)])
        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=300, check=False)
            lines = [l for l in proc.stdout.strip().splitlines() if l.strip()]
            data = None
            for line in reversed(lines):
                try:
                    data = json.loads(line)
                    break
                except json.JSONDecodeError:
                    continue
            if data is None:
                raise RuntimeError(f"No JSON output from agent-reach transcribe: {proc.stdout}")
            text = data.get("text", "")
            return ContentUnit(
                id=str(uuid.uuid4()),
                source=SourceInfo(platform="youtube", url=url),
                type=ContentType.VIDEO,
                title=data.get("title", ""),
                description=data.get("description", ""),
                extracted_text=text,
                raw_metadata=data,
            )
        except subprocess.TimeoutExpired:
            raise RuntimeError("agent-reach transcribe timed out after 300s")

    def _transcribe_ffmpeg(
        self,
        url: str,
        languages: Optional[List[str]] = None,
        output_dir: Optional[str] = None,
    ) -> ContentUnit:
        """使用 ffmpeg 提取音频（placeholder，需要外部 whisper 服务）。"""
        logger.info("ffmpeg audio extraction: %s", url)
        out_dir = Path(output_dir or tempfile.gettempdir())
        out_dir.mkdir(parents=True, exist_ok=True)
        audio_path = out_dir / f"{uuid.uuid4().hex}.wav"

        cmd = [
            self.ffmpeg_path,
            "-i", url,
            "-vn", "-acodec", "pcm_s16le",
            "-ar", "16000", "-ac", "1",
            str(audio_path),
        ]
        try:
            subprocess.run(cmd, capture_output=True, timeout=300, check=True)
        except subprocess.TimeoutExpired:
            raise RuntimeError("ffmpeg extraction timed out after 300s")

        return ContentUnit(
            id=str(uuid.uuid4()),
            source=SourceInfo(platform="audio", url=url),
            type=ContentType.AUDIO,
            title="",
            description="",
            extracted_text="",
            file_path=str(audio_path),
            raw_metadata={"backend": "ffmpeg-whisper", "audio_path": str(audio_path)},
        )

    def _parse_vtt(self, path: Path) -> str:
        """解析 VTT 字幕文件为纯文本。"""
        try:
            content = path.read_text(encoding="utf-8")
        except Exception as exc:
            logger.error("Failed to read VTT %s: %s", path, exc)
            return ""
        # 移除 VTT 标记行和时间戳
        lines = content.splitlines()
        texts = []
        for line in lines:
            stripped = line.strip()
            if not stripped or stripped.startswith("WEBVTT"):
                continue
            if re.match(r"^\d{2}:\d{2}:\d{2}", stripped):
                continue
            if " --> " in stripped:
                continue
            texts.append(stripped)
        return "\n".join(texts)

    def _fallback_description(self, url: str) -> str:
        """yt-dlp 获取视频描述作为回退。"""
        try:
            proc = subprocess.run(
                [self.yt_dlp_path, "--dump-json", "--skip-download", url],
                capture_output=True,
                text=True,
                timeout=60,
                check=False,
            )
            info = json.loads(proc.stdout.splitlines()[0])
            return info.get("description", "")
        except Exception as exc:
            logger.warning("yt-dlp fallback description failed: %s", exc)
            return ""
