"""Agent Registry — Agent 注册、发现与生命周期管理。"""
import json
import logging
import os
import sqlite3
import uuid
from abc import ABC, abstractmethod
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Dict, Generator, List, Optional, Set, Type

from contentforge.processing.ai_engine import AIEngine, AIConfig
from contentforge.config import get_config

logger = logging.getLogger(__name__)


# ------------------------------------------------------------------------------
# 枚举与常量
# ------------------------------------------------------------------------------

class AgentStatus(Enum):
    """Agent 生命周期状态。"""
    IDLE = "idle"           # 空闲，可接收任务
    BUSY = "busy"           # 正在处理任务
    PAUSED = "paused"       # 暂停，保留上下文
    ERROR = "error"         # 出错状态
    TERMINATED = "terminated"  # 已终止


class AgentRole(Enum):
    """预定义 Agent 角色类型。"""
    ORCHESTRATOR = "orchestrator"   # 编排器 — 负责多 Agent 协作调度
    ASSISTANT = "assistant"         # 通用助手
    WRITER = "writer"               # 内容写作
    ANALYST = "analyst"           # 数据分析
    RESEARCHER = "researcher"     # 研究调研
    PUBLISHER = "publisher"       # 发布分发
    CUSTOM = "custom"             # 自定义角色


# ------------------------------------------------------------------------------
# 数据模型
# ------------------------------------------------------------------------------

@dataclass
class SkillManifest:
    """Skill 元数据（Markdown + YAML Frontmatter 解析后）。"""
    name: str
    description: str
    version: str = "1.0.0"
    author: str = ""
    tags: List[str] = field(default_factory=list)
    parameters: Dict[str, Any] = field(default_factory=dict)  # {param: {type, required, default, description}}
    entrypoint: str = ""          # Skill 执行入口函数名
    module_path: str = ""         # Python 模块路径
    system_prompt: str = ""       # Skill 专属 system prompt
    examples: List[str] = field(default_factory=list)
    enabled: bool = True

    def to_dict(self) -> Dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SkillManifest":
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class AgentDefinition:
    """Agent 定义 — 静态配置，不包含运行时状态。"""
    id: str
    name: str
    role: AgentRole
    description: str = ""
    system_prompt: str = ""
    model: str = "gpt-4o-mini"    # 默认模型
    provider: str = "openai"      # 默认 Provider
    temperature: float = 0.7
    max_tokens: int = 2000
    skills: List[str] = field(default_factory=list)  # Skill name 列表
    tools: List[str] = field(default_factory=list)   # 工具名列表
    memory_enabled: bool = True
    max_history: int = 20          # 最大上下文轮数
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        d["role"] = self.role.value
        d["created_at"] = self.created_at.isoformat()
        return d

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AgentDefinition":
        role = AgentRole(data.get("role", "custom"))
        created_at = datetime.fromisoformat(data["created_at"]) if "created_at" in data else datetime.utcnow()
        kwargs = {k: v for k, v in data.items() if k in cls.__dataclass_fields__}
        kwargs["role"] = role
        kwargs["created_at"] = created_at
        return cls(**kwargs)


@dataclass
class AgentState:
    """Agent 运行时状态 — 可序列化用于持久化。"""
    agent_id: str
    status: AgentStatus
    current_task: Optional[str] = None
    memory_snapshot: List[Dict[str, str]] = field(default_factory=list)  # 对话历史
    context_variables: Dict[str, Any] = field(default_factory=dict)       # 上下文变量
    last_active: datetime = field(default_factory=datetime.utcnow)
    error_message: Optional[str] = None
    metrics: Dict[str, Any] = field(default_factory=dict)  # 调用次数、token 消耗等

    def to_dict(self) -> Dict[str, Any]:
        return {
            "agent_id": self.agent_id,
            "status": self.status.value,
            "current_task": self.current_task,
            "memory_snapshot": self.memory_snapshot,
            "context_variables": self.context_variables,
            "last_active": self.last_active.isoformat(),
            "error_message": self.error_message,
            "metrics": self.metrics,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AgentState":
        return cls(
            agent_id=data["agent_id"],
            status=AgentStatus(data.get("status", "idle")),
            current_task=data.get("current_task"),
            memory_snapshot=data.get("memory_snapshot", []),
            context_variables=data.get("context_variables", {}),
            last_active=datetime.fromisoformat(data["last_active"]) if "last_active" in data else datetime.utcnow(),
            error_message=data.get("error_message"),
            metrics=data.get("metrics", {}),
        )


# ------------------------------------------------------------------------------
# Skill Registry
# ------------------------------------------------------------------------------

class SkillRegistry:
    """Skill 注册中心 — 加载、解析、管理 Markdown+YAML Frontmatter 格式的 Skill。"""

    SKILL_DIR_ENV = "CONTENTFORGE_SKILL_DIR"
    DEFAULT_SKILL_DIRS = [
        Path.home() / ".contentforge" / "skills",
        Path(__file__).parent.parent / "skills",
    ]

    def __init__(self):
        self._skills: Dict[str, SkillManifest] = {}
        self._handlers: Dict[str, Callable] = {}  # Skill 执行函数映射
        self._skill_dirs: List[Path] = []
        self._discover_skill_dirs()

    def _discover_skill_dirs(self) -> None:
        """发现 Skill 目录。"""
        if env_dir := os.getenv(self.SKILL_DIR_ENV):
            self._skill_dirs.append(Path(env_dir))
        self._skill_dirs.extend(self.DEFAULT_SKILL_DIRS)

    def load_all(self) -> None:
        """扫描所有 Skill 目录并加载 Skill。"""
        for skill_dir in self._skill_dirs:
            if not skill_dir.exists():
                continue
            for skill_file in skill_dir.rglob("SKILL.md"):
                try:
                    self._load_skill_file(skill_file)
                except Exception as exc:
                    logger.warning("Failed to load skill from %s: %s", skill_file, exc)
        logger.info("SkillRegistry loaded %d skills", len(self._skills))

    def _load_skill_file(self, path: Path) -> None:
        """解析单个 SKILL.md 文件（YAML Frontmatter + Markdown Body）。"""
        text = path.read_text(encoding="utf-8")
        if not text.startswith("---"):
            logger.warning("Skill file %s missing YAML frontmatter", path)
            return

        # 分割 YAML Frontmatter 和 Markdown Body
        parts = text.split("---", 2)
        if len(parts) < 3:
            logger.warning("Skill file %s has invalid frontmatter", path)
            return

        try:
            import yaml
        except ImportError:
            logger.error("PyYAML required for skill parsing")
            return

        frontmatter = yaml.safe_load(parts[1]) or {}
        body = parts[2].strip()

        name = frontmatter.get("name", path.parent.name)
        manifest = SkillManifest(
            name=name,
            description=frontmatter.get("description", ""),
            version=frontmatter.get("version", "1.0.0"),
            author=frontmatter.get("author", ""),
            tags=frontmatter.get("tags", []),
            parameters=frontmatter.get("parameters", {}),
            entrypoint=frontmatter.get("entrypoint", ""),
            module_path=frontmatter.get("module_path", ""),
            system_prompt=frontmatter.get("system_prompt", body[:2000]),  # 取 body 前 2000 字符作为 system prompt
            examples=frontmatter.get("examples", []),
            enabled=frontmatter.get("enabled", True),
        )
        self._skills[name] = manifest
        logger.debug("Loaded skill: %s from %s", name, path)

    def register(self, manifest: SkillManifest, handler: Optional[Callable] = None) -> None:
        """手动注册 Skill（代码内注册）。"""
        self._skills[manifest.name] = manifest
        if handler:
            self._handlers[manifest.name] = handler
        logger.info("Registered skill: %s", manifest.name)

    def get(self, name: str) -> Optional[SkillManifest]:
        return self._skills.get(name)

    def list_skills(self, tag: Optional[str] = None) -> List[SkillManifest]:
        """列出所有 Skill，可按 tag 过滤。"""
        skills = [s for s in self._skills.values() if s.enabled]
        if tag:
            skills = [s for s in skills if tag in s.tags]
        return skills

    def search(self, query: str) -> List[SkillManifest]:
        """按名称或描述模糊搜索 Skill。"""
        query = query.lower()
        return [
            s for s in self._skills.values()
            if query in s.name.lower() or query in s.description.lower()
        ]

    def has_handler(self, name: str) -> bool:
        return name in self._handlers

    def get_handler(self, name: str) -> Optional[Callable]:
        return self._handlers.get(name)

    def bind_handler(self, name: str, handler: Callable) -> None:
        """绑定 Skill 执行函数。"""
        self._handlers[name] = handler

    def to_prompt_context(self, skill_names: List[str]) -> str:
        """将指定 Skill 列表转换为 LLM 可用的 prompt 上下文。"""
        lines = ["## Available Skills", ""]
        for name in skill_names:
            skill = self._skills.get(name)
            if skill:
                lines.append(f"### {skill.name} (v{skill.version})")
                lines.append(f"{skill.description}")
                if skill.parameters:
                    lines.append("Parameters:")
                    for param, spec in skill.parameters.items():
                        req = "required" if spec.get("required") else "optional"
                        default = f", default={spec.get('default')}" if "default" in spec else ""
                        lines.append(f"  - {param} ({spec.get('type', 'string')}, {req}{default}): {spec.get('description', '')}")
                if skill.examples:
                    lines.append("Examples:")
                    for ex in skill.examples:
                        lines.append(f"  - {ex}")
                lines.append("")
        return "\n".join(lines)


# ------------------------------------------------------------------------------
# Agent Registry
# ------------------------------------------------------------------------------

class AgentRegistry:
    """Agent 注册中心 — 管理 AgentDefinition 的注册、发现、生命周期。

    职责：
    1. AgentDefinition 的 CRUD（静态定义）
    2. AgentState 的持久化与恢复（SQLite）
    3. SkillRegistry 的集成（Agent 与 Skill 的绑定）
    4. 预定义 Agent 模板的提供
    """

    _instance: Optional["AgentRegistry"] = None

    def __new__(cls, *args, **kwargs):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self, db_path: Optional[str] = None):
        if self._initialized:
            return
        self._initialized = True

        self._agents: Dict[str, AgentDefinition] = {}      # agent_id -> definition
        self._states: Dict[str, AgentState] = {}           # agent_id -> runtime state
        self._skill_registry = SkillRegistry()
        self._skill_registry.load_all()

        # 持久化
        config = get_config()
        state_dir = Path(config.state_dir or Path.home() / ".contentforge")
        state_dir.mkdir(parents=True, exist_ok=True)
        self._db_path = db_path or str(state_dir / "agent_registry.db")
        self._init_db()

        # 加载预定义 Agent
        self._load_builtin_agents()
        # 从数据库恢复 Agent 定义和状态
        self._load_from_db()

    # ------------------------------------------------------------------
    # 数据库初始化
    # ------------------------------------------------------------------

    def _init_db(self) -> None:
        """初始化 SQLite 表结构。"""
        with sqlite3.connect(self._db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS agent_definitions (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    role TEXT NOT NULL,
                    description TEXT,
                    system_prompt TEXT,
                    model TEXT,
                    provider TEXT,
                    temperature REAL,
                    max_tokens INTEGER,
                    skills TEXT,          -- JSON array
                    tools TEXT,           -- JSON array
                    memory_enabled INTEGER,
                    max_history INTEGER,
                    metadata TEXT,        -- JSON
                    created_at TEXT
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS agent_states (
                    agent_id TEXT PRIMARY KEY,
                    status TEXT NOT NULL,
                    current_task TEXT,
                    memory_snapshot TEXT, -- JSON array of messages
                    context_variables TEXT, -- JSON
                    last_active TEXT,
                    error_message TEXT,
                    metrics TEXT,         -- JSON
                    FOREIGN KEY (agent_id) REFERENCES agent_definitions(id)
                )
            """)
            conn.commit()

    def _load_from_db(self) -> None:
        """从数据库恢复 Agent 定义和状态。"""
        with sqlite3.connect(self._db_path) as conn:
            conn.row_factory = sqlite3.Row

            # 恢复定义
            rows = conn.execute("SELECT * FROM agent_definitions").fetchall()
            for row in rows:
                data = dict(row)
                data["skills"] = json.loads(data.get("skills", "[]"))
                data["tools"] = json.loads(data.get("tools", "[]"))
                data["metadata"] = json.loads(data.get("metadata", "{}"))
                data["memory_enabled"] = bool(data.get("memory_enabled", 1))
                agent_def = AgentDefinition.from_dict(data)
                self._agents[agent_def.id] = agent_def

            # 恢复状态
            rows = conn.execute("SELECT * FROM agent_states").fetchall()
            for row in rows:
                data = dict(row)
                data["memory_snapshot"] = json.loads(data.get("memory_snapshot", "[]"))
                data["context_variables"] = json.loads(data.get("context_variables", "{}"))
                data["metrics"] = json.loads(data.get("metrics", "{}"))
                state = AgentState.from_dict(data)
                self._states[state.agent_id] = state

        logger.info("AgentRegistry loaded %d agents from DB", len(self._agents))

    def _save_definition(self, agent_def: AgentDefinition) -> None:
        """持久化 Agent 定义到 SQLite。"""
        with sqlite3.connect(self._db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO agent_definitions
                (id, name, role, description, system_prompt, model, provider,
                 temperature, max_tokens, skills, tools, memory_enabled, max_history,
                 metadata, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                agent_def.id,
                agent_def.name,
                agent_def.role.value,
                agent_def.description,
                agent_def.system_prompt,
                agent_def.model,
                agent_def.provider,
                agent_def.temperature,
                agent_def.max_tokens,
                json.dumps(agent_def.skills),
                json.dumps(agent_def.tools),
                int(agent_def.memory_enabled),
                agent_def.max_history,
                json.dumps(agent_def.metadata),
                agent_def.created_at.isoformat(),
            ))
            conn.commit()

    def _save_state(self, state: AgentState) -> None:
        """持久化 Agent 状态到 SQLite。"""
        with sqlite3.connect(self._db_path) as conn:
            conn.execute("""
                INSERT OR REPLACE INTO agent_states
                (agent_id, status, current_task, memory_snapshot, context_variables,
                 last_active, error_message, metrics)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                state.agent_id,
                state.status.value,
                state.current_task,
                json.dumps(state.memory_snapshot, ensure_ascii=False),
                json.dumps(state.context_variables, ensure_ascii=False),
                state.last_active.isoformat(),
                state.error_message,
                json.dumps(state.metrics, ensure_ascii=False),
            ))
            conn.commit()

    # ------------------------------------------------------------------
    # 内置 Agent 模板
    # ------------------------------------------------------------------

    def _load_builtin_agents(self) -> None:
        """注册预定义 Agent 模板。"""
        builtins = [
            AgentDefinition(
                id="agent-orchestrator",
                name="Orchestrator",
                role=AgentRole.ORCHESTRATOR,
                description="编排器 — 分析用户意图，调度合适的 Agent 执行",
                system_prompt=(
                    "You are the Orchestrator Agent for ContentForge. "
                    "Your job is to analyze user requests and route them to the most appropriate specialist agent. "
                    "You understand the capabilities of all available agents and skills. "
                    "When a request involves multiple steps, break it down and delegate to multiple agents. "
                    "Always respond with structured routing decisions."
                ),
                model="gpt-4o",
                temperature=0.3,
                max_tokens=4000,
                skills=["route_request", "delegate_task"],
            ),
            AgentDefinition(
                id="agent-writer",
                name="Content Writer",
                role=AgentRole.WRITER,
                description="内容写作专家 — 撰写、改写、润色各类内容",
                system_prompt=(
                    "You are a professional content writer. "
                    "You excel at writing articles, social media posts, summaries, and marketing copy. "
                    "You can adapt tone and style to match the target platform and audience. "
                    "Always produce well-structured, engaging content."
                ),
                skills=["write_article", "rewrite_content", "summarize"],
            ),
            AgentDefinition(
                id="agent-analyst",
                name="Data Analyst",
                role=AgentRole.ANALYST,
                description="数据分析专家 — 分析内容资产、提取洞察",
                system_prompt=(
                    "You are a data analyst specializing in content performance and audience insights. "
                    "You can analyze engagement metrics, identify trends, and provide actionable recommendations. "
                    "Always back your analysis with data and clear reasoning."
                ),
                skills=["analyze_engagement", "extract_insights", "generate_report"],
            ),
            AgentDefinition(
                id="agent-researcher",
                name="Researcher",
                role=AgentRole.RESEARCHER,
                description="研究调研专家 — 信息搜集、竞品分析、趋势追踪",
                system_prompt=(
                    "You are a thorough researcher. "
                    "You excel at gathering information from multiple sources, analyzing competitors, and tracking trends. "
                    "You provide well-sourced, balanced perspectives. "
                    "Always cite your sources when possible."
                ),
                skills=["web_search", "competitor_analysis", "trend_tracking"],
            ),
            AgentDefinition(
                id="agent-publisher",
                name="Publisher",
                role=AgentRole.PUBLISHER,
                description="发布分发专家 — 内容格式化、平台适配、定时发布",
                system_prompt=(
                    "You are a publishing specialist. "
                    "You understand the formatting requirements of different platforms (Xiaohongshu, Twitter, WeChat, etc.). "
                    "You can adapt content to fit platform constraints and optimize for engagement."
                ),
                skills=["format_for_platform", "publish_content", "schedule_post"],
            ),
            AgentDefinition(
                id="agent-assistant",
                name="General Assistant",
                role=AgentRole.ASSISTANT,
                description="通用助手 — 回答日常问题、执行简单任务",
                system_prompt=(
                    "You are a helpful general assistant. "
                    "You can answer questions, help with simple tasks, and provide guidance. "
                    "If a request requires specialized knowledge, suggest routing to a specialist agent."
                ),
                skills=["answer_question", "simple_task"],
            ),
        ]
        for agent_def in builtins:
            if agent_def.id not in self._agents:
                self._agents[agent_def.id] = agent_def
                self._save_definition(agent_def)
                # 初始化状态
                if agent_def.id not in self._states:
                    self._states[agent_def.id] = AgentState(
                        agent_id=agent_def.id,
                        status=AgentStatus.IDLE,
                    )
                    self._save_state(self._states[agent_def.id])

    # ------------------------------------------------------------------
    # 公共 API
    # ------------------------------------------------------------------

    def register(self, agent_def: AgentDefinition) -> str:
        """注册新 Agent，返回 agent_id。"""
        if not agent_def.id:
            agent_def.id = f"agent-{uuid.uuid4().hex[:8]}"
        self._agents[agent_def.id] = agent_def
        self._save_definition(agent_def)

        # 初始化状态
        if agent_def.id not in self._states:
            self._states[agent_def.id] = AgentState(
                agent_id=agent_def.id,
                status=AgentStatus.IDLE,
            )
            self._save_state(self._states[agent_def.id])

        logger.info("Registered agent: %s (%s)", agent_def.name, agent_def.id)
        return agent_def.id

    def unregister(self, agent_id: str) -> bool:
        """注销 Agent（同时删除持久化数据）。"""
        if agent_id not in self._agents:
            return False
        del self._agents[agent_id]
        self._states.pop(agent_id, None)
        with sqlite3.connect(self._db_path) as conn:
            conn.execute("DELETE FROM agent_definitions WHERE id = ?", (agent_id,))
            conn.execute("DELETE FROM agent_states WHERE agent_id = ?", (agent_id,))
            conn.commit()
        logger.info("Unregistered agent: %s", agent_id)
        return True

    def get(self, agent_id: str) -> Optional[AgentDefinition]:
        """获取 Agent 定义。"""
        return self._agents.get(agent_id)

    def get_state(self, agent_id: str) -> Optional[AgentState]:
        """获取 Agent 运行时状态。"""
        return self._states.get(agent_id)

    def update_state(self, agent_id: str, **kwargs) -> Optional[AgentState]:
        """更新 Agent 状态字段。"""
        state = self._states.get(agent_id)
        if not state:
            return None
        for key, value in kwargs.items():
            if hasattr(state, key):
                setattr(state, key, value)
        state.last_active = datetime.utcnow()
        self._save_state(state)
        return state

    def list_agents(self, role: Optional[AgentRole] = None, status: Optional[AgentStatus] = None) -> List[AgentDefinition]:
        """列出 Agent，可按角色或状态过滤。"""
        agents = list(self._agents.values())
        if role:
            agents = [a for a in agents if a.role == role]
        if status:
            agents = [a for a in agents if self._states.get(a.id, AgentState(agent_id=a.id, status=AgentStatus.IDLE)).status == status]
        return agents

    def find_by_skill(self, skill_name: str) -> List[AgentDefinition]:
        """查找支持指定 Skill 的 Agent。"""
        return [a for a in self._agents.values() if skill_name in a.skills]

    def find_by_name(self, name: str) -> Optional[AgentDefinition]:
        """按名称查找 Agent（精确匹配）。"""
        for agent in self._agents.values():
            if agent.name.lower() == name.lower():
                return agent
        return None

    def search(self, query: str) -> List[AgentDefinition]:
        """按名称或描述模糊搜索 Agent。"""
        query = query.lower()
        return [
            a for a in self._agents.values()
            if query in a.name.lower() or query in a.description.lower() or any(query in s.lower() for s in a.skills)
        ]

    @property
    def skill_registry(self) -> SkillRegistry:
        return self._skill_registry

    def get_skill_manifest(self, skill_name: str) -> Optional[SkillManifest]:
        return self._skill_registry.get(skill_name)

    def create_custom_agent(
        self,
        name: str,
        description: str = "",
        system_prompt: str = "",
        model: str = "gpt-4o-mini",
        provider: str = "openai",
        skills: Optional[List[str]] = None,
        **kwargs
    ) -> str:
        """便捷方法：创建自定义 Agent。"""
        agent_def = AgentDefinition(
            id=f"agent-{uuid.uuid4().hex[:8]}",
            name=name,
            role=AgentRole.CUSTOM,
            description=description,
            system_prompt=system_prompt,
            model=model,
            provider=provider,
            skills=skills or [],
            **kwargs
        )
        return self.register(agent_def)

    def reset_state(self, agent_id: str) -> bool:
        """重置 Agent 状态（清空记忆、恢复 idle）。"""
        if agent_id not in self._states:
            return False
        self._states[agent_id] = AgentState(
            agent_id=agent_id,
            status=AgentStatus.IDLE,
            memory_snapshot=[],
            context_variables={},
        )
        self._save_state(self._states[agent_id])
        logger.info("Reset state for agent: %s", agent_id)
        return True

    def get_all_states(self) -> Dict[str, AgentState]:
        """获取所有 Agent 状态快照。"""
        return dict(self._states)

    def to_json(self) -> str:
        """导出所有 Agent 定义为 JSON。"""
        return json.dumps({
            "agents": [a.to_dict() for a in self._agents.values()],
            "states": [s.to_dict() for s in self._states.values()],
        }, ensure_ascii=False, indent=2)
