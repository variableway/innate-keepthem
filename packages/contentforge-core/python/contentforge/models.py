"""ContentForge 核心数据模型"""
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional
import json


class ContentType(Enum):
    VIDEO = "video"
    ARTICLE = "article"
    TWEET = "tweet"
    THREAD = "thread"
    AUDIO = "audio"
    IMAGE = "image"
    NOTE = "note"


class ContentStatus(Enum):
    INGESTED = "ingested"
    PROCESSING = "processing"
    PROCESSED = "processed"
    EDITING = "editing"
    READY = "ready"
    PUBLISHED = "published"
    FAILED = "failed"


class PipelineStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PARTIAL = "partial"


@dataclass
class SourceInfo:
    platform: str
    url: str
    author: Optional[str] = None
    published_at: Optional[datetime] = None
    engagement: Dict[str, int] = field(default_factory=dict)

    @property
    def likes(self) -> int:
        return self.engagement.get("likes", 0)

    @property
    def replies(self) -> int:
        return self.engagement.get("replies", 0)

    @property
    def reposts(self) -> int:
        return self.engagement.get("reposts", 0)

    @property
    def views(self) -> int:
        return self.engagement.get("views", 0)

    def to_dict(self) -> Dict:
        return {
            "platform": self.platform,
            "url": self.url,
            "author": self.author,
            "published_at": self.published_at.isoformat() if self.published_at else None,
            "engagement": self.engagement,
        }


@dataclass
class ContentUnit:
    """核心内容单元 — 贯穿采集→处理→编辑→发布全生命周期"""
    id: str
    source: SourceInfo
    type: ContentType
    title: str = ""
    description: str = ""
    extracted_text: str = ""
    summary: Optional[str] = None
    key_points: List[str] = field(default_factory=list)
    sentiment: Optional[str] = None
    topics: List[str] = field(default_factory=list)
    translated_text: Optional[str] = None
    rewritten_text: Optional[str] = None
    status: ContentStatus = ContentStatus.INGESTED
    pipeline_id: Optional[str] = None
    tags: List[str] = field(default_factory=list)
    file_path: Optional[str] = None
    raw_metadata: Dict[str, Any] = field(default_factory=dict)
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)

    @property
    def word_count(self) -> int:
        return len(self.extracted_text.split())

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "source": self.source.to_dict(),
            "type": self.type.value,
            "title": self.title,
            "description": self.description,
            "extracted_text": self.extracted_text,
            "summary": self.summary,
            "key_points": self.key_points,
            "sentiment": self.sentiment,
            "topics": self.topics,
            "translated_text": self.translated_text,
            "rewritten_text": self.rewritten_text,
            "status": self.status.value,
            "pipeline_id": self.pipeline_id,
            "tags": self.tags,
            "file_path": self.file_path,
            "raw_metadata": self.raw_metadata,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }

    def to_json(self) -> str:
        return json.dumps(self.to_dict(), ensure_ascii=False, indent=2)

    @classmethod
    def from_dict(cls, data: Dict) -> "ContentUnit":
        source = SourceInfo(**data["source"])
        return cls(
            id=data["id"],
            source=source,
            type=ContentType(data["type"]),
            title=data.get("title", ""),
            description=data.get("description", ""),
            extracted_text=data.get("extracted_text", ""),
            summary=data.get("summary"),
            key_points=data.get("key_points", []),
            sentiment=data.get("sentiment"),
            topics=data.get("topics", []),
            translated_text=data.get("translated_text"),
            rewritten_text=data.get("rewritten_text"),
            status=ContentStatus(data.get("status", "ingested")),
            pipeline_id=data.get("pipeline_id"),
            tags=data.get("tags", []),
            file_path=data.get("file_path"),
            raw_metadata=data.get("raw_metadata", {}),
            error=data.get("error"),
            created_at=datetime.fromisoformat(data["created_at"]) if "created_at" in data else datetime.utcnow(),
            updated_at=datetime.fromisoformat(data["updated_at"]) if "updated_at" in data else datetime.utcnow(),
        )


@dataclass
class PipelineStep:
    id: str
    type: str
    config: Dict[str, Any] = field(default_factory=dict)
    input_mapping: Dict[str, str] = field(default_factory=dict)
    output_mapping: Dict[str, str] = field(default_factory=dict)
    max_retries: int = 3
    backoff: str = "exponential"
    delay_ms: int = 1000
    condition: Optional[str] = None
    timeout_ms: int = 30000

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "type": self.type,
            "config": self.config,
            "input_mapping": self.input_mapping,
            "output_mapping": self.output_mapping,
            "max_retries": self.max_retries,
            "backoff": self.backoff,
            "delay_ms": self.delay_ms,
            "condition": self.condition,
            "timeout_ms": self.timeout_ms,
        }


@dataclass
class Pipeline:
    id: str
    name: str
    description: str = ""
    steps: List[PipelineStep] = field(default_factory=list)
    trigger: str = "manual"
    schedule: Optional[str] = None
    input_config: Dict[str, Any] = field(default_factory=dict)
    output_config: Dict[str, Any] = field(default_factory=dict)
    enabled: bool = True
    last_run_at: Optional[datetime] = None
    run_count: int = 0
    fail_count: int = 0
    created_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "steps": [s.to_dict() for s in self.steps],
            "trigger": self.trigger,
            "schedule": self.schedule,
            "input_config": self.input_config,
            "output_config": self.output_config,
            "enabled": self.enabled,
            "last_run_at": self.last_run_at.isoformat() if self.last_run_at else None,
            "run_count": self.run_count,
            "fail_count": self.fail_count,
            "created_at": self.created_at.isoformat(),
        }


@dataclass
class PipelineRun:
    id: str
    pipeline_id: str
    status: PipelineStatus = PipelineStatus.PENDING
    started_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    steps: List[Dict] = field(default_factory=list)
    input_unit_ids: List[str] = field(default_factory=list)
    output_unit_ids: List[str] = field(default_factory=list)
    logs: List[str] = field(default_factory=list)
    error: Optional[str] = None

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "pipeline_id": self.pipeline_id,
            "status": self.status.value,
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "steps": self.steps,
            "input_unit_ids": self.input_unit_ids,
            "output_unit_ids": self.output_unit_ids,
            "logs": self.logs,
            "error": self.error,
        }


@dataclass
class PublishProfile:
    id: str
    name: str
    platform: str
    credentials: Dict[str, str] = field(default_factory=dict)
    default_format: str = "markdown"
    default_template: str = ""
    auto_publish: bool = False
    max_length: Optional[int] = None
    image_config: Optional[Dict] = None
    created_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "name": self.name,
            "platform": self.platform,
            "credentials": self.credentials,
            "default_format": self.default_format,
            "default_template": self.default_template,
            "auto_publish": self.auto_publish,
            "max_length": self.max_length,
            "image_config": self.image_config,
            "created_at": self.created_at.isoformat(),
        }
