# vYtDL 合并分析与执行计划

## 一、vYtDL vs vYtDL-standalone 对比结论

**结论：standalone 可以完全替代原始 vYtDL 目录。**

排除二进制产物（`vYtDL`、`vYtDL-embedded` 各 ~10MB）和运行时状态文件（`download_record.json`、`urls.txt`、`subtitle_mapping.json`、`downloads_case/`、`config.json`）后，`diff -rq` 显示源码**完全一致**：
- `cmd/`、`internal/`、`scripts/`、`main.go`、`go.mod`、`go.sum`、`batch_download.py`、`help.md`、`USAGE.md`、`config.example.json` 全部相同
- `internal/ytdlpbin/`（yt-dlp provisioning）两处一致

差异仅在文档层面（standalone 是更完整的规范版本）：
- standalone 多出 `AGENTS.md`
- `README.md`：standalone 含 build/embed/skill 文档（更完整）
- `MOVED.md`：路径引用不同

**关键事实：**
- `vYtDL-standalone` 是独立 git 仓库，remote = `https://github.com/qdriven/innate-vytdl.git`，工作树干净，是**已发布的规范仓库**。
- 它在主仓库 `innate-keepthem` 中**未被跟踪**（`?? vYtDL-standalone/`，不在 .gitignore，也无 .gitmodules），只是工作树里的嵌套独立仓库。
- 原始 `vYtDL/` 目录在 main 分支被跟踪（45 个文件），含编译产物和本地运行状态。
- `MOVED.md` 指向的旧规范路径 `/Users/patrick/innate/projects/vYtDL` 已不存在（仓库已迁移到 `innate-works/projects/`）。

→ 原始 `vYtDL/` 目录可视为本地工作副本，规范源码以 standalone 仓库为准。

## 二、Monorepo 合并可行性结论

**结论：可行，但需手动解决 54 个冲突（绝大多数为机械性的目录重命名冲突）。**

### 分支关系
- 共同祖先：`3b5c527`
- `refactor/monorepo`：**领先 1 个提交**（`9cdc324` monorepo 重构：vYtDL→tools/vytdl-cli，contentforge→apps/contentforge-desktop 等，457 文件变更）
- `main`：**领先 4 个提交**（vYtDL yt-dlp provisioning、contentforge desktop Tauri 重建、文档更新）

### `../innate-keepthem-monorepo` 目录状态
- 是一个**失效的 git worktree**：其 `.git` 文件指向旧路径 `/Users/patrick/innate/projects/innate-keepthem/.git/worktrees/...`（仓库已迁移，gitdir 失效）。
- `git worktree list` 中标记为 `prunable`，挂在不同分支 `port/contentforge-266552a`。
- **真正的 monorepo 重构在当前仓库的 `refactor/monorepo` 分支**，不依赖那个失效目录。

### 冲突分类（54 个）
| 类型 | 数量 | 性质 | 解决策略 |
|---|---|---|---|
| file location | 45 | main 在被 monorepo 重命名的目录下新增文件 | 机械性：接受 monorepo 新路径，把 main 的新文件移到 `apps/contentforge-desktop/...` 等 |
| rename/delete | 7 | monorepo 移动文件，main 删除旧路径（如 `vYtDL-desktop/scripts/*`→`scripts/`） | 保留 monorepo 移动后的版本 |
| modify/delete | 1 | `contentforge/cli/contentforge`（二进制）main 修改、monorepo 删除 | 保留 main 版本或重新构建 |
| content | 1 | `.gitignore` | 手动合并两者内容 |

### Monorepo 目标结构
```
apps/        contentforge-desktop, vytdl-desktop, vytdl-web
packages/    contentforge-core, ui, utils
services/    agent-reach
tools/       contentforge-cli, vytdl-cli
```

### 需在合并中补齐的 main 内容（4 个提交的实质变更）
1. `4bbebb9` vYtDL yt-dlp provisioning（download.go/embed.go/resolve.go 等）→ 目标 `tools/vytdl-cli/`
2. `266552a` contentforge desktop Tauri 重建（icons、gen/schemas、REBUILD_PLAN）+ python pipeline 变更 → `apps/contentforge-desktop/src-tauri/` 等
3. `fe761b4` contentforge 文档（projects/00-07）、docs/ai-edu、docs/suggestions
4. `f3e5580` vYtDL 文档指向已发布仓库

**注意：** `refactor/monorepo` 的 `tools/vytdl-cli` **缺少 yt-dlp provisioning**（分支早于 4bbebb9）。而 standalone 仓库已含且为规范版本 → 合并后 `tools/vytdl-cli` 应直接从 standalone 同步。

### 子模块问题（遗留）
- main 与 monorepo 都有 gitlink（WorkBuddyGuide、agent-reach、yt-dlp-gui、yt-dlp-gui-v2）但**均无 `.gitmodules`**（孤立引用）。monorepo 将 agent-reach 移入 `services/`、删除 WorkBuddyGuide。合并时按 monorepo 结构处理，子模块配置留作后续清理任务。

---

## 三、合并执行计划（立即执行，第一优先级）

采用 PR 流程，不直接动 main：

### 步骤
1. **建分支**：从 `main` 创建 `merge/monorepo` 并切换。
2. **发起合并**：`git merge refactor/monorepo --no-commit`，产生 54 个冲突。
3. **分类解决冲突**：
   - 45 file-location：统一接受 monorepo 的新目录结构（`git checkout --theirs` 对应路径后 `git add`，或按 git 提示路径移动 main 新增文件）。
   - 7 rename/delete：保留 monorepo 移动后的文件（`scripts/` 下），删除旧路径残留。
   - 1 modify/delete（二进制）：保留 main 的 `contentforge/cli/contentforge`（后续可重新构建覆盖）。
   - 1 content（`.gitignore`）：手动合并，保留两者规则。
4. **补齐 main 实质变更到新路径**：
   - 把 vYtDL yt-dlp provisioning 落到 `tools/vytdl-cli/`（直接用 standalone 仓库内容覆盖，因其为规范且已含 provisioning）。
   - contentforge desktop Tauri 重建产物落到 `apps/contentforge-desktop/src-tauri/`。
   - contentforge/docs 文档落到对应位置。
5. **同步 tools/vytdl-cli**：用 `vYtDL-standalone` 内容校准 `tools/vytdl-cli`（确保 provisioning、scripts 齐全）。
6. **构建验证**：
   - `tools/vytdl-cli`：`go build ./...` 与 `go test ./...`
   - `apps/contentforge-desktop`：Tauri/前端构建检查（至少 `cargo check`）
   - 顶层 `go.work` / `pnpm` workspace 完整性
7. **提交合并**：`git commit` 完成 merge commit。
8. **推送并开 PR**：`git push -u origin merge/monorepo`，`gh pr create` 目标 main，PR 描述附本分析与验证结果。

### 风险与回退
- 全程在 `merge/monorepo` 分支，main 不受影响；失败可 `git merge --abort` 或删分支重来。
- 推送前所有变更本地可回退。
- 二进制/生成产物（Tauri schemas、icons、CLI binary）体积大但可重新生成，合并以结构正确为准。

---

## 四、合并后的项目推进计划与任务分解

合并完成后，项目进入 monorepo 统一结构阶段。按优先级分解：

### P0 — 合并落地收尾
- [ ] PR 评审通过并合并进 main
- [ ] 清理失效 worktree：`git worktree prune`，移除 `../innate-keepthem-monorepo` 残留目录
- [ ] 删除/归档 main 中已被 standalone 取代的原始 `vYtDL/` 目录（确认无引用后）
- [ ] 修正 `MOVED.md` 中失效的旧路径 `/Users/patrick/innate/projects/vYtDL`

### P1 — 子模块与依赖治理
- [ ] 补全 `.gitmodules` 或改用其他方式管理 WorkBuddyGuide / yt-dlp-gui(-v2) / agent-reach
- [ ] 决定 `tools/vytdl-cli` 与 standalone 仓库（qdriven/innate-vytdl）的关系：git submodule / 定期同步 / 单一源
- [ ] 校准 `go.work`、`pnpm-workspace.yaml`、`turbo.json` 覆盖所有 apps/packages/services/tools

### P2 — 构建与 CI 统一
- [ ] 顶层 `Taskfile.yml` 统一各子项目构建入口
- [ ] CI：go build/test、cargo check、pnpm build、Tauri 构建矩阵
- [ ] 生成产物（Tauri schemas、CLI binary）纳入 .gitignore，改为构建时生成

### P3 — 文档与规范
- [ ] 更新根 README/AGENTS.md 反映 monorepo 结构
- [ ] 统一 docs/ 目录（合并 contentforge/docs 与顶层 docs）
- [ ] 记录 standalone 仓库与 monorepo 的同步约定

---

## 执行顺序
**先完成第三部分（合并）→ 验证 → 推 PR。** 第四部分作为合并后的路线图，待 PR 合并后逐项推进。
