# 共享包（packages/ui、packages/utils）

pnpm workspace 共享前端库，目前唯一消费者是 apps/vytdl-desktop（`workspace:*`）；vytdl-web 不依赖它们。

## packages/ui（@vytdl/ui）

shadcn/ui 风格 React 19 组件库，TS 源码直出（无构建步骤），导出：

- `.` -> `src/index.ts`：50+ 基础组件（`components/ui/`，accordion~tooltip，含 button-group/empty/field/kbd/menu/spinner 扩展）+ `lib/utils.ts` 的 `cn()`
- `./globals.css` -> Tailwind v4 主题

依赖：@base-ui/react、@radix-ui/react-toast、react-hook-form + zod、cva、clsx、tailwind-merge、lucide-react、recharts、embla-carousel、cmdk、sonner、vaul、next-themes、date-fns 等。

**完成度**：`components/ui` 全部为成品实现。`src/block/{landing,auth,mail,chat}` 四个业务区块代码完整但属模板/演示性质，monorepo 内**零消费者**（mail/chat 使用静态演示数据）。已知 peer 依赖告警：`@hookform/resolvers` 要求 ajv@^8.12.0，实际 6.15.0（见 STATUS.md）。

## packages/utils（@vytdl/utils）

极小工具包（刻意设计）：`cn()`、`formatBytes()`、`formatDuration()`、`formatDate()` 四个纯函数。

- 构建链路已定义（tsup，cjs+esm+dts）但 `main/types` 指向 `src/index.ts` 源码直出，事实未启用构建。
- `cn()` 与 packages/ui 的实现重复（两处定义同一函数）。

## 构建与运行

无独立构建必要；经 workspace 被 desktop 聚合安装。`pnpm --filter @vytdl/utils build` 可产出 dist（当前无人消费产物）。
