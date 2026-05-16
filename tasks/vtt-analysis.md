# Task: VTT 字幕分析功能

## 状态

- [x] Phase 1: VTT 解析器 (completed 2026-05-16)
- [x] Phase 2: 纯文本模式 (completed 2026-05-16)
- [ ] Phase 3: LLM 集成
- [ ] Phase 4: 无 LLM 降级
- [ ] Phase 5: 增强功能

## Phase 1: VTT 解析器

### Acceptance Criteria
- [ ] `internal/vtt/vtt.go` 实现 `Parse(io.Reader) (*Transcript, error)`
- [ ] 正确解析类型 A（简单格式）：中文手动字幕
- [ ] 正确解析类型 B（YouTube 自动生成）：`<c>` 标签清洗、重复行去重
- [ ] `PlainText()` 方法输出连续纯文本
- [ ] `SegmentByDuration(d)` 按时间窗口分段
- [ ] 单元测试：`vtt_test.go` 覆盖两种格式 + 边界情况（空文件、无 header、重叠时间戳）
- [ ] `go test ./internal/vtt/` 通过

### Notes
- 标签清洗正则：`<\d{2}:\d{2}:\d{2}\.\d{3}>` 和 `<c>` / `</c>`
- 重复行检测：如果连续两个 cue 的文本完全相同（忽略空白），只保留一个

## Phase 2: 纯文本模式

### Acceptance Criteria
- [ ] `cmd/analyze.go` 注册 Cobra 子命令 `analyze`（别名 `an`, `ana`）
- [ ] `--mode text` 输出 PlainText
- [ ] 支持从文件或 stdin 读取
- [ ] 注册到 `root.go` 命令树
- [ ] `./vYtDL analyze --mode text file.vtt` 输出正确

## Phase 3: LLM 集成

### Acceptance Criteria
- [ ] `internal/llm/llm.go` 实现 OpenAI 兼容客户端
- [ ] 支持 `VYTDL_LLM_API_KEY`, `VYTDL_LLM_BASE_URL`, `VYTDL_LLM_MODEL` 环境变量
- [ ] `--mode summary` 正确调用 LLM 生成分段摘要
- [ ] `--mode keypoints` 正确调用 LLM 提取要点 + 时间戳
- [ ] `-c` flag 控制要点数量
- [ ] `-s` flag 控制分段时长

## Phase 4: 无 LLM 降级

### Acceptance Criteria
- [ ] `--no-llm` flag 禁用 LLM
- [ ] `--mode summary --no-llm` 取每段前 1-2 句
- [ ] `--mode keypoints --no-llm` 使用 TextRank 算法提取关键句
- [ ] 自动降级：无 API key 时自动使用降级方案

## Phase 5: 增强功能

### Acceptance Criteria
- [ ] `--mode compare` 多字幕对比（中英对齐）
- [ ] `--format json` 输出 JSON 格式
- [ ] `--search "关键词"` 搜索模式，返回时间戳列表
- [ ] 输出文件支持：`-o` flag

---

## 参考资料

- Spec: `tasks/vtt-analysis-spec.md`
- VTT 样例：`vYtDL/downloads_case/downloads_case/AI的正确打开方式：不学概念，学动作.zh.vtt` (类型 A)
- VTT 样例：`vYtDL/downloads_case/downloads_case/Game Theory #25：  Trump Visits China.en.vtt` (类型 B)
