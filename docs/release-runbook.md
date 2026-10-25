# vYtDL Release Runbook

> 参照 DSH `docs/release-runbook.md` 的结构。适用于桌面壳（Electron）+ Go daemon + Web 前端的统一发布。

## 0. 前置

- 权限：`variableway/innate-keepthem` 的 release 权限；GitHub token（electron-updater publish 用 `GH_TOKEN`）
- 本地工具：Go 1.26+、pnpm 9、Node 22、python3
- 签名/公证（macOS）：未配置（`electron-builder.yml` `identity: null`）。启用前安装包会被 Gatekeeper 提示；配置见 §5

## 1. 版本与变更记录

1. 确定版本号（semver）。桌面版本号以 `apps/shell/package.json` 为准；daemon 版本号在 `services/vytdl/internal/server/server.go` 的 `Version` 常量，两者保持一致（CI 不强校验，人工对齐）。
2. 更新 `apps/shell/package.json` version。
3. 更新 daemon `Version` 常量（`/api/health` 会回报，桌面壳与前端显示依赖它）。

## 2. 构建矩阵

| 目标 | 宿主 | 产物 |
|------|------|------|
| macOS arm64 | macOS (Apple Silicon) | `release/<ver>/vYtDL-<ver>-arm64.dmg` |
| macOS x64 | macOS (Intel 或 Rosetta) | `…-x64.dmg` |
| Windows x64 | Windows（或 CI） | `…-x64.exe`（NSIS） |

```bash
# 一次性准备：web 静态导出 + 三平台 daemon 二进制 → apps/shell/resources/
python3 scripts/build-shell-resources.py --all

# 类型检查 + 单测（terminal launcher / 迁移）
pnpm --filter @vytdl/shell build && pnpm --filter @vytdl/shell test

# 打包（GitHub publish 配置在 electron-builder.yml；不打真实 release 时加 --publish never）
cd apps/shell && pnpm exec electron-builder --config electron-builder.yml --publish never
```

> daemon 交叉编译是纯 Go（CGO_ENABLED=0，modernc.org/sqlite），任意宿主可出全平台二进制；electron-builder 则必须在对应 OS 上打（dmg 要 macOS）。

## 3. 发布

1. 合并 main，打 tag：`git tag v<ver> && git push origin v<ver>`。
2. 在 macOS 上以 `--publish always` 打包（会自动创建 GitHub Release 并上传 dmg + latest-mac.yml）；Windows 上同理出 exe + latest.yml。
   ```bash
   GH_TOKEN=<token> pnpm exec electron-builder --config electron-builder.yml --publish always
   ```
3. 或手动：创建 GitHub Release（tag 名 = `v<ver>`），上传 §2 产物 + `latest*.yml`。**electron-updater 依赖 latest.yml / latest-mac.yml 与安装包同处一个 Release。**
4. Release notes：从上一个 tag 的 git log 整理（`git log --oneline v<prev>..v<ver>`）。

## 4. 验证

- [ ] 全新安装：下载 dmg/exe，首启出现 daemon 健康等待 → 主界面加载
- [ ] 旧版数据迁移：预置 `com.vytdl.desktop/vytdl.db`（mac: `~/Library/Application Support/`），首启出现导入提示，导入后下载历史可见
- [ ] 自动更新：安装上一版本，启动后收到 update-downloaded → Restart → 版本号变为最新
- [ ] 浏览器路径：Docker `task web:up` → `http://localhost:3000` 全流程（下载→进度→完成）
- [ ] 插件管理：`vytdl plugin install <pkg>` 后设置页出现第三方插件并可禁用

## 5. 签名与公证（TODO）

- macOS：Apple Developer ID Application 证书 + notarytool；`electron-builder.yml` 移除 `identity: null`，配置 `afterSign` 钩子或 `notarize` 选项
- Windows：代码签名证书（EV/OV），`win.certificateFile` / Azure Trusted Signing
- 公证未配置期间，分发包需在 README 注明「右键打开 / 系统设置放行」

## 6. 回滚

GitHub Release 删除资产或重发上一版本 tag 的构建产物；客户端 `latest.yml` 指回旧版本号即可。daemon 数据（`vytdl.db`）向后兼容（schema 迁移只增列）。
