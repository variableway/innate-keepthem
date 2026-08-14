"""
ContentForge Session 管理 — 会话持久化、历史消息、关联管理

职责：
- 会话 CRUD
- 消息历史管理
- 与 SQLite 数据库集成
- 会话关联（任务、资产）

设计原则：
- 与现有数据库 schema 兼容
- 支持会话搜索和过滤
- 消息分页加载
"""

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional

from contentforge.ai.chat_engine import ChatSession, ChatMessage

logger = logging.getLogger(__name__)


# ─────────────────────────── Session Manager ───────────────────────────

class SessionManager:
    """
    会话管理器

    管理会话生命周期和消息历史。
    实际实现中应与 SQLite 数据库集成。
    """

    def __init__(self, db_path: Optional[str] = None):
        self.db_path = db_path
        self._sessions: Dict[str, ChatSession] = {}
        self._messages: Dict[str, List[ChatMessage]] = {}
        self._init_storage()

    def _init_storage(self) -> None:
        """初始化存储（内存或数据库）"""
        # 简化实现：使用内存存储
        # 实际应连接 SQLite 数据库
        pass

    # ─────────────────── 会话 CRUD ───────────────────

    def create_session(
        self,
        session_id: Optional[str] = None,
        title: str = "新会话",
        agent_id: str = "general",
        linked_asset_ids: Optional[List[str]] = None,
    ) -> ChatSession:
        """创建会话"""
        sid = session_id or str(uuid.uuid4())
        session = ChatSession(
            id=sid,
            title=title,
            agent_id=agent_id,
            linked_asset_ids=linked_asset_ids or [],
        )
        self._sessions[sid] = session
        self._messages[sid] = []
        logger.info("[SessionManager] Created session: %s", sid)
        return session

    def get_session(self, session_id: str) -> Optional[ChatSession]:
        """获取会话"""
        return self._sessions.get(session_id)

    def list_sessions(
        self,
        status: Optional[str] = None,
        agent_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[ChatSession]:
        """列出会话"""
        sessions = list(self._sessions.values())

        if status:
            sessions = [s for s in sessions if s.status == status]
        if agent_id:
            sessions = [s for s in sessions if s.agent_id == agent_id]

        # 按更新时间倒序
        sessions.sort(key=lambda s: s.updated_at, reverse=True)
        return sessions[offset : offset + limit]

    def update_session(self, session_id: str, **kwargs) -> Optional[ChatSession]:
        """更新会话"""
        session = self._sessions.get(session_id)
        if not session:
            return None

        for key, value in kwargs.items():
            if hasattr(session, key):
                setattr(session, key, value)

        session.updated_at = datetime.utcnow()
        return session

    def archive_session(self, session_id: str) -> bool:
        """归档会话"""
        session = self._sessions.get(session_id)
        if session:
            session.status = "archived"
            session.updated_at = datetime.utcnow()
            return True
        return False

    def delete_session(self, session_id: str) -> bool:
        """删除会话"""
        if session_id in self._sessions:
            del self._sessions[session_id]
            del self._messages[session_id]
            return True
        return False

    # ─────────────────── 消息管理 ───────────────────

    def add_message(self, message: ChatMessage) -> None:
        """添加消息"""
        sid = message.session_id
        if sid not in self._messages:
            self._messages[sid] = []
        self._messages[sid].append(message)

        # 更新会话时间
        session = self._sessions.get(sid)
        if session:
            session.updated_at = datetime.utcnow()

    def get_messages(
        self,
        session_id: str,
        limit: int = 50,
        offset: int = 0,
        before_id: Optional[str] = None,
    ) -> List[ChatMessage]:
        """
        获取消息历史

        Args:
            session_id: 会话 ID
            limit: 返回数量
            offset: 偏移量
            before_id: 在此消息之前的消息（用于分页）
        """
        messages = self._messages.get(session_id, [])

        if before_id:
            # 找到 before_id 的索引
            try:
                idx = next(i for i, m in enumerate(messages) if m.id == before_id)
                messages = messages[:idx]
            except StopIteration:
                pass

        # 返回最后 limit 条
        start = max(0, len(messages) - limit - offset)
        end = len(messages) - offset
        return messages[start:end]

    def get_message(self, session_id: str, message_id: str) -> Optional[ChatMessage]:
        """获取单条消息"""
        messages = self._messages.get(session_id, [])
        return next((m for m in messages if m.id == message_id), None)

    def delete_message(self, session_id: str, message_id: str) -> bool:
        """删除消息"""
        messages = self._messages.get(session_id, [])
        original_len = len(messages)
        self._messages[session_id] = [m for m in messages if m.id != message_id]
        return len(self._messages[session_id]) < original_len

    # ─────────────────── 关联管理 ───────────────────

    def link_asset(self, session_id: str, asset_id: str) -> bool:
        """关联资产到会话"""
        session = self._sessions.get(session_id)
        if session and asset_id not in session.linked_asset_ids:
            session.linked_asset_ids.append(asset_id)
            session.updated_at = datetime.utcnow()
            return True
        return False

    def unlink_asset(self, session_id: str, asset_id: str) -> bool:
        """取消关联"""
        session = self._sessions.get(session_id)
        if session and asset_id in session.linked_asset_ids:
            session.linked_asset_ids.remove(asset_id)
            session.updated_at = datetime.utcnow()
            return True
        return False

    def link_task(self, session_id: str, task_id: str) -> bool:
        """关联任务到会话"""
        session = self._sessions.get(session_id)
        if session:
            session.linked_task_id = task_id
            session.updated_at = datetime.utcnow()
            return True
        return False

    # ─────────────────── 搜索 ───────────────────

    def search_sessions(self, query: str) -> List[ChatSession]:
        """搜索会话（按标题或内容）"""
        results = []
        query_lower = query.lower()

        for session in self._sessions.values():
            # 搜索标题
            if query_lower in session.title.lower():
                results.append(session)
                continue

            # 搜索消息内容
            messages = self._messages.get(session.id, [])
            for msg in messages:
                if query_lower in msg.content.lower():
                    results.append(session)
                    break

        return results

    # ─────────────────── 统计 ───────────────────

    def get_stats(self, session_id: str) -> Dict[str, Any]:
        """获取会话统计"""
        messages = self._messages.get(session_id, [])
        total_tokens = sum(
            m.tokens_used.get("total", 0) if m.tokens_used else 0
            for m in messages
        )

        return {
            "message_count": len(messages),
            "user_message_count": sum(1 for m in messages if m.role == "user"),
            "assistant_message_count": sum(1 for m in messages if m.role == "assistant"),
            "total_tokens": total_tokens,
            "tool_call_count": sum(
                len(m.tool_calls or []) for m in messages
            ),
        }


# ─────────────────────────── 数据库 Schema（参考） ───────────────────────────

"""
-- chat_sessions 表
CREATE TABLE chat_sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL DEFAULT '新会话',
    agent_id TEXT NOT NULL DEFAULT 'general',
    status TEXT NOT NULL DEFAULT 'active',
    linked_task_id TEXT,
    linked_asset_ids TEXT DEFAULT '[]',
    metadata TEXT DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- chat_messages 表
CREATE TABLE chat_messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    tool_calls TEXT,
    tool_results TEXT,
    selected_asset_ids TEXT DEFAULT '[]',
    tokens_used TEXT,
    model TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES chat_sessions(id)
);

-- 索引
CREATE INDEX idx_chat_messages_session ON chat_messages(session_id, created_at);
CREATE INDEX idx_chat_sessions_status ON chat_sessions(status, updated_at);
CREATE INDEX idx_chat_sessions_agent ON chat_sessions(agent_id);
"""

# ─────────────────────────── 使用示例 ───────────────────────────

if __name__ == "__main__":
    manager = SessionManager()

    # 创建会话
    session = manager.create_session(title="测试会话", agent_id="content_analyst")
    print(f"创建会话: {session.id}")

    # 添加消息
    msg1 = ChatMessage(id="msg-1", session_id=session.id, role="user", content="分析这个视频")
    msg2 = ChatMessage(id="msg-2", session_id=session.id, role="assistant", content="正在分析...")
    manager.add_message(msg1)
    manager.add_message(msg2)

    # 获取消息
    messages = manager.get_messages(session.id)
    print(f"消息数: {len(messages)}")

    # 统计
    stats = manager.get_stats(session.id)
    print(f"统计: {stats}")

    # 搜索
    results = manager.search_sessions("分析")
    print(f"搜索结果: {len(results)}")
