"""
VideoInspector — 视频元数据提取器

职责：
1. 本地视频文件元数据提取（FFmpeg / ffprobe）
2. 在线视频 URL 元数据获取（yt-dlp）
3. 视频内容分析（时长、分辨率、编码、字幕轨道）
4. 缩略图提取与关键帧分析

与 ContentAccess 的关系：
- ContentAccess 调用 VideoInspector 获取视频资产的元数据
- VideoInspector 不直接操作数据库，只返回结构化元数据

使用场景：
- Agent 询问"这个视频多长？什么分辨率？"
- 自动提取视频信息填充 content_assets 表
- 视频转码前检查源文件属性
"""

from __future__ import annotations

import json
import logging
import re
import subprocess
import tempfile
from dataclasses import dataclass, field
from datetime import timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from contentforge.config import get_config

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------------------
# 数据模型
# ------------------------------------------------------------------------------

@dataclass
class VideoStreamInfo:
    """视频流信息。"""
    index: int
    codec: str
    codec_long: str = ""
    width: int = 0
    height: int = 0
    fps: float = 0.0
    bitrate: int = 0  # kbps
    pixel_format: str = ""
    color_space: str = ""


@dataclass
class AudioStreamInfo:
    """音频流信息。"""
    index: int
    codec: str
    sample_rate: int = 0  # Hz
    channels: int = 0
    bitrate: int = 0  # kbps
    language: str = ""


@dataclass
class SubtitleStreamInfo:
    """字幕流信息。"""
    index: int
    codec: str
    language: str = ""
    title: str = ""
    is_forced: bool = False
    is_default: bool = False


@dataclass
class VideoMetadata:
    """视频完整元数据。"""
    # 基础信息
    file_path: Optional[str] = None
    source_url: Optional[str] = None
    title: str = ""
    description: str = ""
    duration_sec: float = 0.0
    size_bytes: int = 0
    format_name: str = ""
    format_long_name: str = ""

    # 视频流
    video_streams: List[VideoStreamInfo] = field(default_factory=list)
    # 音频流
    audio_streams: List[AudioStreamInfo] = field(default_factory=list)
    # 字幕流
    subtitle_streams: List[SubtitleStreamInfo] = field(default_factory=list)

    # 关键属性（主视频流）
    width: int = 0
    height: int = 0
    fps: float = 0.0
    video_bitrate: int = 0
    audio_bitrate: int = 0

    # 缩略图
    thumbnail_path: Optional[str] = None
    thumbnail_timestamp: float = 0.0  # 缩略图截取时间点

    # 额外元数据
    chapters: List[Dict[str, Any]] = field(default_factory=list)
    tags: Dict[str, str] = field(default_factory=dict)
    raw_info: Dict[str, Any] = field(default_factory=dict)  # 原始 ffprobe/yt-dlp 输出

    @property
    def resolution(self) -> str:
        """分辨率字符串，如 '1920x1080'。"""
        if self.width and self.height:
            return f"{self.width}x{self.height}"
        return "unknown"

    @property
    def duration_str(self) -> str:
        """人类可读时长，如 '01:23:45'。"""
        return str(timedelta(seconds=int(self.duration_sec)))

    @property
    def has_subtitles(self) -> bool:
        """是否有字幕轨道。"""
        return len(self.subtitle_streams) > 0

    @property
    def has_multiple_audio(self) -> bool:
        """是否有多个音轨。"""
        return len(self.audio_streams) > 1

    def to_dict(self) -> Dict[str, Any]:
        """序列化为字典。"""
        return {
            "file_path": self.file_path,
            "source_url": self.source_url,
            "title": self.title,
            "description": self.description,
            "duration_sec": self.duration_sec,
            "duration_str": self.duration_str,
            "size_bytes": self.size_bytes,
            "format_name": self.format_name,
            "resolution": self.resolution,
            "width": self.width,
            "height": self.height,
            "fps": self.fps,
            "video_bitrate": self.video_bitrate,
            "audio_bitrate": self.audio_bitrate,
            "has_subtitles": self.has_subtitles,
            "has_multiple_audio": self.has_multiple_audio,
            "video_streams": [self._stream_to_dict(v) for v in self.video_streams],
            "audio_streams": [self._stream_to_dict(a) for a in self.audio_streams],
            "subtitle_streams": [self._stream_to_dict(s) for s in self.subtitle_streams],
            "thumbnail_path": self.thumbnail_path,
            "tags": self.tags,
            "chapters": self.chapters,
        }

    @staticmethod
    def _stream_to_dict(stream: Any) -> Dict[str, Any]:
        return {k: v for k, v in stream.__dict__.items()}

    def to_prompt_summary(self) -> str:
        """生成 LLM prompt 可用的摘要文本。"""
        lines = [
            f"Video: {self.title or 'Untitled'}",
            f"Duration: {self.duration_str} ({self.duration_sec:.1f}s)",
            f"Resolution: {self.resolution}",
            f"Format: {self.format_name}",
        ]
        if self.video_streams:
            v = self.video_streams[0]
            lines.append(f"Video Codec: {v.codec} @ {v.bitrate}kbps, {v.fps:.2f}fps")
        if self.audio_streams:
            a = self.audio_streams[0]
            lines.append(f"Audio: {a.codec}, {a.channels}ch, {a.sample_rate}Hz")
        if self.subtitle_streams:
            subs = ", ".join(f"{s.language} ({s.codec})" for s in self.subtitle_streams[:3])
            lines.append(f"Subtitles: {subs}")
        if self.description:
            lines.append(f"Description: {self.description[:200]}")
        return "\n".join(lines)


# ------------------------------------------------------------------------------
# 异常定义
# ------------------------------------------------------------------------------

class VideoInspectorError(Exception):
    """视频检查器通用错误。"""
    pass


class FFmpegNotFoundError(VideoInspectorError):
    """FFmpeg 未安装。"""
    pass


class YTDLPNotFoundError(VideoInspectorError):
    """yt-dlp 未安装。"""
    pass


class VideoProbeError(VideoInspectorError):
    """视频探测失败。"""
    pass


# ------------------------------------------------------------------------------
# 核心实现
# ------------------------------------------------------------------------------

class VideoInspector:
    """
    视频元数据提取器。

    支持两种模式：
    1. 本地文件 — 通过 ffprobe 提取容器/流信息
    2. 在线 URL — 通过 yt-dlp 获取视频信息

    使用示例：
        >>> inspector = VideoInspector()
        >>> meta = inspector.inspect_file("/path/to/video.mp4")
        >>> print(meta.resolution, meta.duration_str)
        >>>
        >>> meta = inspector.inspect_url("https://youtube.com/watch?v=...")
        >>> print(meta.title, meta.duration_sec)
    """

    def __init__(self):
        config = get_config()
        self.ffmpeg_path = config.platform.ffmpeg_path or "ffmpeg"
        self.ffprobe_path = self._derive_ffprobe(self.ffmpeg_path)
        self.yt_dlp_path = config.platform.ytdlp_binary or "yt-dlp"
        self._check_binaries()

    def _derive_ffprobe(self, ffmpeg_path: str) -> str:
        """从 ffmpeg 路径推导 ffprobe 路径。"""
        if ffmpeg_path == "ffmpeg":
            return "ffprobe"
        return ffmpeg_path.replace("ffmpeg", "ffprobe")

    def _check_binaries(self) -> None:
        """检查必要二进制是否可用。"""
        for binary in [self.ffprobe_path, self.yt_dlp_path]:
            try:
                subprocess.run([binary, "-version"], capture_output=True, check=True, timeout=5)
                logger.info("[VideoInspector] Binary ready: %s", binary)
            except (subprocess.CalledProcessError, FileNotFoundError):
                logger.warning("[VideoInspector] Binary not available: %s", binary)

    # ------------------------------------------------------------------
    # 1. 本地文件元数据提取
    # ------------------------------------------------------------------

    def inspect_file(self, file_path: str) -> VideoMetadata:
        """
        提取本地视频文件的完整元数据。

        流程：
        1. ffprobe -show_format -show_streams -print_format json
        2. 解析 JSON 输出
        3. 构建 VideoMetadata
        """
        path = Path(file_path).resolve()
        if not path.exists():
            raise VideoProbeError(f"File not found: {file_path}")

        cmd = [
            self.ffprobe_path,
            "-v", "error",
            "-show_format",
            "-show_streams",
            "-show_chapters",
            "-print_format", "json",
            str(path),
        ]

        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=False)
            if proc.returncode != 0:
                raise VideoProbeError(f"ffprobe failed: {proc.stderr}")

            info = json.loads(proc.stdout)
            return self._parse_ffprobe_output(info, str(path))

        except json.JSONDecodeError as exc:
            raise VideoProbeError(f"Invalid ffprobe JSON output: {exc}") from exc
        except subprocess.TimeoutExpired:
            raise VideoProbeError("ffprobe timed out after 60s")

    def inspect_file_quick(self, file_path: str) -> VideoMetadata:
        """快速检查 — 仅基础信息（时长、分辨率）。"""
        path = Path(file_path).resolve()
        cmd = [
            self.ffprobe_path,
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=width,height,duration,avg_frame_rate",
            "-show_entries", "format=duration,size,bit_rate,format_name",
            "-print_format", "json",
            str(path),
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=30, check=False)
        if proc.returncode != 0:
            raise VideoProbeError(f"ffprobe quick failed: {proc.stderr}")

        info = json.loads(proc.stdout)
        meta = VideoMetadata(file_path=str(path))

        # 解析 format
        fmt = info.get("format", {})
        meta.duration_sec = self._parse_duration(fmt.get("duration"))
        meta.size_bytes = int(fmt.get("size", 0))
        meta.format_name = fmt.get("format_name", "")

        # 解析视频流
        for stream in info.get("streams", []):
            if stream.get("codec_type") == "video":
                meta.width = stream.get("width", 0)
                meta.height = stream.get("height", 0)
                meta.fps = self._parse_fps(stream.get("avg_frame_rate", "0/1"))
                break

        return meta

    # ------------------------------------------------------------------
    # 2. 在线 URL 元数据获取
    # ------------------------------------------------------------------

    def inspect_url(self, url: str) -> VideoMetadata:
        """
        获取在线视频的元数据（不下载视频）。

        使用 yt-dlp --dump-json 获取信息。
        """
        cmd = [
            self.yt_dlp_path,
            "--dump-json",
            "--skip-download",
            "--no-warnings",
            url,
        ]

        try:
            proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=False)
            if proc.returncode != 0 and not proc.stdout.strip():
                raise VideoProbeError(f"yt-dlp failed: {proc.stderr}")

            # 取最后一行有效 JSON
            lines = [l for l in proc.stdout.strip().splitlines() if l.strip()]
            info = None
            for line in reversed(lines):
                try:
                    info = json.loads(line)
                    break
                except json.JSONDecodeError:
                    continue

            if info is None:
                raise VideoProbeError("No valid JSON from yt-dlp")

            return self._parse_ytdlp_output(info, url)

        except subprocess.TimeoutExpired:
            raise VideoProbeError("yt-dlp timed out after 60s")

    def inspect_url_quick(self, url: str) -> VideoMetadata:
        """快速获取在线视频信息（仅标题、时长、分辨率）。"""
        return self.inspect_url(url)  # yt-dlp 本身就不下载，直接复用

    # ------------------------------------------------------------------
    # 3. 缩略图提取
    # ------------------------------------------------------------------

    def extract_thumbnail(self, file_path: str, timestamp: float = 0.0,
                          output_path: Optional[str] = None,
                          width: int = 480) -> str:
        """
        从视频中提取缩略图。

        Args:
            file_path: 视频文件路径
            timestamp: 截取时间点（秒），默认 0（第一帧）
            output_path: 输出路径，默认临时文件
            width: 输出图片宽度

        Returns:
            缩略图文件路径
        """
        path = Path(file_path).resolve()
        if not output_path:
            output_path = str(tempfile.gettempdir() / f"thumb_{path.stem}_{timestamp:.1f}.jpg")

        cmd = [
            self.ffmpeg_path,
            "-ss", str(timestamp),
            "-i", str(path),
            "-vframes", "1",
            "-q:v", "2",
            "-vf", f"scale={width}:-1",
            "-y",
            output_path,
        ]

        proc = subprocess.run(cmd, capture_output=True, timeout=30, check=False)
        if proc.returncode != 0:
            raise VideoProbeError(f"Thumbnail extraction failed: {proc.stderr}")

        return output_path

    def extract_keyframes(self, file_path: str, count: int = 5) -> List[str]:
        """
        提取视频关键帧缩略图。

        均匀分布在整个视频时长中。
        """
        meta = self.inspect_file_quick(file_path)
        if meta.duration_sec <= 0:
            raise VideoProbeError("Cannot determine video duration")

        interval = meta.duration_sec / (count + 1)
        paths = []
        for i in range(1, count + 1):
            ts = interval * i
            thumb_path = self.extract_thumbnail(file_path, timestamp=ts, width=320)
            paths.append(thumb_path)
        return paths

    # ------------------------------------------------------------------
    # 4. 字幕轨道提取
    # ------------------------------------------------------------------

    def extract_subtitle_streams(self, file_path: str) -> List[SubtitleStreamInfo]:
        """提取视频文件中的所有字幕轨道信息。"""
        meta = self.inspect_file(file_path)
        return meta.subtitle_streams

    def extract_subtitle_text(self, file_path: str, stream_index: Optional[int] = None,
                              language: Optional[str] = None) -> str:
        """
        提取字幕文本。

        Args:
            stream_index: 指定字幕流索引，None 则取第一个
            language: 优先匹配的语言代码
        """
        meta = self.inspect_file(file_path)
        if not meta.subtitle_streams:
            return ""

        # 选择字幕流
        target_stream = None
        if stream_index is not None:
            target_stream = next((s for s in meta.subtitle_streams if s.index == stream_index), None)
        elif language:
            target_stream = next((s for s in meta.subtitle_streams if s.language == language), None)
        if not target_stream:
            target_stream = meta.subtitle_streams[0]

        # 使用 ffmpeg 提取字幕
        output_path = str(tempfile.gettempdir() / f"sub_{Path(file_path).stem}_{target_stream.index}.srt")
        cmd = [
            self.ffmpeg_path,
            "-i", file_path,
            "-map", f"0:s:{target_stream.index}",
            "-y",
            output_path,
        ]

        proc = subprocess.run(cmd, capture_output=True, timeout=30, check=False)
        if proc.returncode != 0:
            logger.warning("Subtitle extraction failed: %s", proc.stderr)
            return ""

        try:
            return Path(output_path).read_text(encoding="utf-8")
        except Exception as exc:
            logger.warning("Failed to read subtitle file: %s", exc)
            return ""

    # ------------------------------------------------------------------
    # 5. 解析器
    # ------------------------------------------------------------------

    def _parse_ffprobe_output(self, info: Dict[str, Any], file_path: str) -> VideoMetadata:
        """解析 ffprobe JSON 输出为 VideoMetadata。"""
        meta = VideoMetadata(file_path=file_path, raw_info=info)

        # format 段
        fmt = info.get("format", {})
        meta.format_name = fmt.get("format_name", "")
        meta.format_long_name = fmt.get("format_long_name", "")
        meta.duration_sec = self._parse_duration(fmt.get("duration"))
        meta.size_bytes = int(fmt.get("size", 0))
        meta.tags = fmt.get("tags", {})
        if meta.tags:
            meta.title = meta.tags.get("title", "")
            meta.description = meta.tags.get("description", "")

        # chapters
        meta.chapters = info.get("chapters", [])

        # streams
        for stream in info.get("streams", []):
            codec_type = stream.get("codec_type")
            if codec_type == "video":
                v = VideoStreamInfo(
                    index=stream.get("index", 0),
                    codec=stream.get("codec_name", ""),
                    codec_long=stream.get("codec_long_name", ""),
                    width=stream.get("width", 0),
                    height=stream.get("height", 0),
                    fps=self._parse_fps(stream.get("avg_frame_rate", "0/1")),
                    bitrate=int(stream.get("bit_rate", 0)) // 1000,
                    pixel_format=stream.get("pix_fmt", ""),
                    color_space=stream.get("color_space", ""),
                )
                meta.video_streams.append(v)
            elif codec_type == "audio":
                a = AudioStreamInfo(
                    index=stream.get("index", 0),
                    codec=stream.get("codec_name", ""),
                    sample_rate=int(stream.get("sample_rate", 0)),
                    channels=stream.get("channels", 0),
                    bitrate=int(stream.get("bit_rate", 0)) // 1000,
                    language=stream.get("tags", {}).get("language", ""),
                )
                meta.audio_streams.append(a)
            elif codec_type == "subtitle":
                s = SubtitleStreamInfo(
                    index=stream.get("index", 0),
                    codec=stream.get("codec_name", ""),
                    language=stream.get("tags", {}).get("language", ""),
                    title=stream.get("tags", {}).get("title", ""),
                    is_forced=stream.get("disposition", {}).get("forced", 0) == 1,
                    is_default=stream.get("disposition", {}).get("default", 0) == 1,
                )
                meta.subtitle_streams.append(s)

        # 主属性
        if meta.video_streams:
            main = meta.video_streams[0]
            meta.width = main.width
            meta.height = main.height
            meta.fps = main.fps
            meta.video_bitrate = main.bitrate

        if meta.audio_streams:
            meta.audio_bitrate = sum(a.bitrate for a in meta.audio_streams) // max(1, len(meta.audio_streams))

        return meta

    def _parse_ytdlp_output(self, info: Dict[str, Any], url: str) -> VideoMetadata:
        """解析 yt-dlp JSON 输出为 VideoMetadata。"""
        meta = VideoMetadata(source_url=url, raw_info=info)

        meta.title = info.get("title", "")
        meta.description = info.get("description", "")
        meta.duration_sec = info.get("duration", 0)
        meta.format_name = info.get("ext", "")

        # 分辨率（从最高质量格式取）
        formats = info.get("formats", [])
        best_video = None
        for f in formats:
            if f.get("vcodec") != "none" and f.get("acodec") == "none":
                if not best_video or f.get("height", 0) > best_video.get("height", 0):
                    best_video = f

        if best_video:
            meta.width = best_video.get("width", 0)
            meta.height = best_video.get("height", 0)
            meta.fps = best_video.get("fps", 0)
            meta.video_bitrate = (best_video.get("vbr", 0) or best_video.get("tbr", 0))

        # 缩略图
        thumbnails = info.get("thumbnails", [])
        if thumbnails:
            # 取最高质量缩略图
            best_thumb = max(thumbnails, key=lambda t: t.get("height", 0))
            meta.thumbnail_path = best_thumb.get("url")

        # 字幕
        subtitles = info.get("subtitles", {})
        for lang, subs in subtitles.items():
            for sub in subs:
                meta.subtitle_streams.append(SubtitleStreamInfo(
                    index=len(meta.subtitle_streams),
                    codec=sub.get("ext", "unknown"),
                    language=lang,
                    title=sub.get("name", ""),
                ))

        # 自动字幕
        auto_subs = info.get("automatic_captions", {})
        for lang, subs in auto_subs.items():
            for sub in subs:
                meta.subtitle_streams.append(SubtitleStreamInfo(
                    index=len(meta.subtitle_streams),
                    codec=sub.get("ext", "unknown"),
                    language=f"{lang} (auto)",
                    title=sub.get("name", ""),
                ))

        # 标签
        meta.tags = {
            "uploader": info.get("uploader", ""),
            "channel": info.get("channel", ""),
            "upload_date": info.get("upload_date", ""),
            "view_count": str(info.get("view_count", "")),
            "like_count": str(info.get("like_count", "")),
        }

        return meta

    # ------------------------------------------------------------------
    # 6. 工具方法
    # ------------------------------------------------------------------

    @staticmethod
    def _parse_duration(value: Any) -> float:
        """解析时长字符串为秒。"""
        if value is None:
            return 0.0
        try:
            return float(value)
        except (ValueError, TypeError):
            return 0.0

    @staticmethod
    def _parse_fps(fps_str: str) -> float:
        """解析帧率字符串（如 '30000/1001'）。"""
        if not fps_str:
            return 0.0
        if "/" in fps_str:
            try:
                num, den = fps_str.split("/")
                return float(num) / float(den)
            except (ValueError, ZeroDivisionError):
                return 0.0
        try:
            return float(fps_str)
        except (ValueError, TypeError):
            return 0.0

    def get_available_formats(self, url: str) -> List[Dict[str, Any]]:
        """获取在线视频的所有可用格式列表。"""
        cmd = [
            self.yt_dlp_path,
            "--list-formats",
            "--no-warnings",
            url,
        ]
        proc = subprocess.run(cmd, capture_output=True, text=True, timeout=60, check=False)
        # 解析文本输出为结构化数据
        formats = []
        for line in proc.stdout.splitlines():
            # 简单解析 yt-dlp 格式列表
            match = re.match(r"(\d+)\s+(\w+)\s+(\d+x\d+|audio only)\s+(.+)", line)
            if match:
                formats.append({
                    "format_id": match.group(1),
                    "ext": match.group(2),
                    "resolution": match.group(3),
                    "note": match.group(4).strip(),
                })
        return formats

    def check_health(self) -> Dict[str, Any]:
        """检查 VideoInspector 依赖健康状态。"""
        results = {}
        for name, binary in [("ffprobe", self.ffprobe_path), ("yt-dlp", self.yt_dlp_path)]:
            try:
                proc = subprocess.run([binary, "-version"], capture_output=True, timeout=5, check=False)
                results[name] = {
                    "available": proc.returncode == 0,
                    "version": proc.stdout.splitlines()[0] if proc.stdout else "unknown",
                }
            except Exception as exc:
                results[name] = {"available": False, "error": str(exc)}
        return results

    def to_prompt_context(self, metadata: VideoMetadata) -> str:
        """将视频元数据转换为 LLM prompt 上下文。"""
        return metadata.to_prompt_summary()


# ------------------------------------------------------------------------------
# 便捷函数
# ------------------------------------------------------------------------------

def get_video_inspector() -> VideoInspector:
    """获取 VideoInspector 实例。"""
    return VideoInspector()


def quick_inspect(file_path: Optional[str] = None, url: Optional[str] = None) -> VideoMetadata:
    """快速检查视频（文件或 URL）。"""
    inspector = VideoInspector()
    if file_path:
        return inspector.inspect_file_quick(file_path)
    if url:
        return inspector.inspect_url_quick(url)
    raise ValueError("Either file_path or url must be provided")
