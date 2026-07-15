# AI Skills

本项目为 AI Agent 提供项目级 Skills，位于 `.agents/skills/`。

## 目录

```
.agents/skills/
├── _index.md                  # Skill 索引与路由表
├── vytdl-dev/                 # vYtDL 开发指南
├── vtt-analyze/               # VTT 字幕分析工作流
├── contentforge/              # ContentForge 开发指南
└── contentforge-pipeline/     # Pipeline 预设与 DAG
```

## 使用方式

### Cursor

```bash
# 创建符号链接（一次性）
mkdir -p .cursor
ln -sf ../.agents/skills .cursor/skills
```

Agent 会自动发现 `.cursor/skills/` 下的 Skills。

### Kimi Code CLI

自动加载 `.agents/skills/` 目录。

## 编写新 Skill

1. 在 `.agents/skills/<skill-name>/` 创建 `SKILL.md`
2. frontmatter 包含 `name` 和 `description`（第三人称，含触发词）
3. 详细参考放 `references/`，保持 `SKILL.md` < 500 行
4. 更新 `_index.md` 和 `AGENTS.md`

详见 Cursor 官方 [create-skill](https://cursor.com/docs) 指南。
