# 共享前端包（`packages/ui` · `packages/utils`）

## `@vytdl/ui`（`packages/ui/`）

共享 React UI（shadcn 风格）与部分 block 组合。

- **技术**：React 19 peer、Radix/Base UI、CVA、RHF、zod、recharts、cmdk、sonner 等
- **入口**：`src/index.ts`、`src/components/ui/*`、`src/block/{landing,auth,mail,chat}`、`globals.css`
- **消费者**：`apps/vytdl-desktop`（`transpilePackages`）
- **不使用**：`apps/contentforge-desktop`

## `@vytdl/utils`（`packages/utils/`）

小型 TS 工具库（tsup 构建）。

- **入口**：`src/index.ts`
- **导出**：`cn()`、`formatBytes()`、`formatDuration()`、`formatDate()`
- **消费者**：`apps/vytdl-desktop`（如下载表单时长格式化）
