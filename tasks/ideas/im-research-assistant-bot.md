# IM Research Assistant Bot - 对话式个人研究助手

## 核心概念

> 将当前的AI对话体验转化为IM中的Bot，实现**对话即研究，研究即存档**

```
用户: @ResearchBot 帮我分析一下vYtDL Desktop的架构

Bot: 好的，我来为你研究这个项目...
    ↓
调用本地AI Agent
    ↓
读取本地代码文件
分析项目结构
生成文档
    ↓
Bot: [返回分析结果 + 自动存档]

用户: 存档到 vYtDL/ideas/
Bot: ✅ 已保存到 ideas/architecture-analysis.md
```

## 为什么IM是最佳载体？

### 现有AI对话的问题

| 问题 | 影响 |
|------|------|
| 对话丢失 | 关闭窗口后历史难找回 |
| 上下文遗忘 | 长篇对话后AI忘记前面内容 |
| 无法协作 | 单人使用，难以分享讨论 |
| 内容散落 | 分析结果、代码、文档各处存放 |

### IM Bot的优势

| 优势 | 说明 |
|------|------|
| **持久化** | 聊天记录永久保存 |
| **结构化** | 消息、文件、链接都有序组织 |
| **可搜索** | 全文搜索历史对话 |
| **可协作** | 多人参与讨论 |
| **多平台** | 手机、电脑随时访问 |
| **通知** | 研究完成后推送提醒 |

## 产品架构

```
┌─────────────────────────────────────────────────────────┐
│                    IM Platform                          │
│              (Discord / Slack / Telegram / 飞书)         │
└─────────────────────┬───────────────────────────────────┘
                      │ Webhook / Bot API
                      ▼
┌─────────────────────────────────────────────────────────┐
│                  Bot Server                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Message     │  │  Context     │  │  Archive     │  │
│  │  Handler     │  │  Manager     │  │  Service     │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
└─────────────────────┬───────────────────────────────────┘
                      │ Local API / MCP
                      ▼
┌─────────────────────────────────────────────────────────┐
│                 Local AI Agent                          │
│              (Kimi CLI / Ollama / Local LLM)            │
│                      ↓                                  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐        │
│  │ File Read  │  │ Web Search │  │ Code Exec  │        │
│  │ Tool       │  │ Tool       │  │ Tool       │        │
│  └────────────┘  └────────────┘  └────────────┘        │
└─────────────────────────────────────────────────────────┘
```

## 核心功能

### 1. 对话式研究 (Auto Research)

**命令示例：**

```
/research vYtDL Desktop architecture

Bot开始工作:
🔍 读取本地代码文件...
📊 分析项目结构...
📝 生成架构文档...
✅ 完成！

[返回详细分析]
```

**多轮对话研究：**

```
User: 研究一下rust的异步编程
Bot: [返回基础概念]

User: 对比一下tokio和async-std
Bot: [返回对比分析]

User: 给我写一个示例代码
Bot: [生成代码]

User: 保存到今天的学习笔记
Bot: ✅ 已保存到 notes/2024-01-15/rust-async.md
```

### 2. 智能存档 (Auto Archive)

**自动识别内容类型：**

```rust
enum ContentType {
    CodeSnippet,      // 代码片段
    ArchitectureDoc,  // 架构文档
    ResearchReport,   // 研究报告
    TodoList,         // 任务列表
    DecisionRecord,   // 决策记录
    MeetingNotes,     // 会议纪要
}

// Bot自动分类
User: "总结一下刚才的讨论"
Bot分析内容 → 识别为DecisionRecord → 保存到 decisions/2024-01-15-feature-x.md
```

**存档方式：**

```
自动存档: 默认保存所有对话
手动存档: @Bot save to docs/architecture/
标签存档: @Bot tag #backend #rust
搜索存档: @Bot search "async" in notes/
```

### 3. 上下文管理

**长期记忆：**

```
User: 上周我研究的那个项目叫什么名字？
Bot: 你上周研究了3个项目：
  1. vYtDL Desktop (1月10日)
  2. Page Agent MCP (1月12日)
  3. Tauri Plugin System (1月14日)
  
要查看哪个的详情？
```

**上下文继承：**

```
User: 继续昨天关于数据库设计的讨论
Bot: [自动加载昨天的上下文]
上次我们讨论了：
- SQLite vs PostgreSQL 的选择
- 表结构设计
- 索引优化

今天想深入哪个部分？
```

### 4. 团队协作

**多人研究：**

```
@Alice @Bob 一起来研究这个新功能

Alice: 我觉得可以用WebSocket
Bob: 但考虑下长轮询的方案？
Bot: [分析两种方案]
    WebSocket优点：...
    长轮询优点：...
    建议：...

Alice: 记录决策：使用WebSocket
Bot: ✅ 已保存到 decisions/2024-01-15-websocket.md
```

## 技术实现

### Bot核心代码

```python
# bot.py
import discord
from openai import OpenAI
import os

class ResearchBot(discord.Client):
    def __init__(self):
        super().__init__()
        self.local_agent = LocalAIAgent()  # 调用本地Kimi CLI
        self.context_manager = ContextManager()
        self.archive_service = ArchiveService()
    
    async def on_message(self, message):
        if message.author == self.user:
            return
        
        # 检查是否是@Bot的消息
        if self.user.mentioned_in(message):
            await self.handle_research_request(message)
    
    async def handle_research_request(self, message):
        # 1. 提取用户需求
        query = self.extract_query(message.content)
        
        # 2. 加载上下文
        context = self.context_manager.load(
            user_id=message.author.id,
            channel_id=message.channel.id
        )
        
        # 3. 调用本地Agent
        async with message.channel.typing():
            result = await self.local_agent.research(
                query=query,
                context=context,
                working_dir=f"./workspace/{message.author.id}"
            )
        
        # 4. 返回结果
        response = await message.reply(result.content)
        
        # 5. 自动存档（可选）
        if result.should_archive:
            archive_path = self.archive_service.save(
                content=result.content,
                metadata={
                    "user": message.author.name,
                    "query": query,
                    "timestamp": message.created_at,
                    "type": result.content_type
                }
            )
            await message.channel.send(f"💾 已自动存档到: {archive_path}")

# 本地AI Agent封装
class LocalAIAgent:
    async def research(self, query, context, working_dir):
        # 调用Kimi CLI或其他本地工具
        # 实际执行文件读取、代码分析等操作
        pass
```

### 本地工具调用

```rust
// 本地工具服务器
#[tauri::command]
pub async fn execute_tool(tool: String, params: Value) -> Result<Value, String> {
    match tool.as_str() {
        "read_file" => read_file(params["path"].as_str().unwrap()).await,
        "search_web" => search_web(params["query"].as_str().unwrap()).await,
        "run_code" => run_code(params["code"].as_str().unwrap()).await,
        "generate_doc" => generate_doc(params).await,
        _ => Err(format!("Unknown tool: {}", tool)),
    }
}
```

### 存档系统

```typescript
// 存档服务
interface ArchiveService {
  // 保存对话
  saveConversation(
    messages: Message[],
    metadata: ArchiveMetadata
  ): Promise<string>; // 返回文件路径
  
  // 搜索历史
  search(query: string, filters: SearchFilter): Promise<SearchResult[]>;
  
  // 生成报告
  generateReport(
    topic: string,
    dateRange: DateRange
  ): Promise<Report>;
}

// 存档结构
workspace/
├── user-123/
│   ├── conversations/
│   │   ├── 2024-01-15-code-review.md
│   │   └── 2024-01-16-architecture-discussion.md
│   ├── research/
│   │   ├── vYtDL-analysis.md
│   │   └── rust-async-guide.md
│   ├── decisions/
│   │   └── 2024-01-15-use-websocket.md
│   └── daily-notes/
│       └── 2024-01-15.md
```

## 产品形态

### 版本1: Discord Bot (个人版)

```
安装:
1. 邀请Bot到自己的Discord服务器
2. 配置本地Agent连接
3. 开始对话研究

使用:
/research <topic>     # 开始研究
/save <path>          # 手动存档
/search <query>       # 搜索历史
/daily                # 生成日报
```

### 版本2: 独立IM App

**"ResearchChat" - 专为研究设计的聊天工具**

```
功能特色:
- 左侧: 对话列表
- 中间: 聊天窗口
- 右侧: 知识面板（自动提取的关键信息）
- 底部: 文件浏览器（本地工作目录）

特色功能:
- 消息即文件: 每条消息自动对应本地文件
- 实时预览: 代码、Markdown实时渲染
- 思维导图: 自动生成对话的知识图谱
```

## 商业模式

### 免费版
- 基础对话研究
- 本地存档
- 单人使用

### 专业版 ($10/月)
- 团队协作
- 云同步
- 高级分析
- 无限历史

### 企业版
- 私有化部署
- 定制工具
- 企业知识库集成

## 差异化优势

| 产品 | 特点 | 本方案优势 |
|------|------|-----------|
| ChatGPT | 云端AI | 本地文件操作、隐私保护 |
| Notion AI | 文档为主 | 对话式交互更自然 |
| Obsidian | 本地笔记 | 自动化研究、AI驱动 |
| 本方案 | 对话+研究+存档 | 三位一体的研究体验 |

## 实现路线

### Phase 1: Discord Bot (2周)
- 基础Bot框架
- 本地Agent连接
- 简单存档

### Phase 2: 上下文管理 (1周)
- 长期记忆
- 多轮对话
- 智能搜索

### Phase 3: 团队协作 (2周)
- 多人对话
- 权限管理
- 协作编辑

### Phase 4: 独立App (1个月)
- 专用IM客户端
- 知识图谱
- 高级可视化

## 总结

**这个idea的核心价值：**

1. **降低使用门槛** - IM是最自然的交互方式
2. **内容自动组织** - 对话即存档
3. **持久化记忆** - 永不丢失的研究过程
4. **团队协作** - 研究不再是孤独的过程

**技术可行性：** ✅ 完全可行，所有技术栈都已成熟

**市场潜力：** ✅ 知识工作者、开发者、研究人员都需要

**下一步：** 想不想一起做个MVP？从Discord Bot开始？🚀
