"use client";

// WIP: 下载工作台（Download workspace）
// 该页面处于重建中（见 src-tauri/REBUILD_PLAN.md 与 docs/STATUS.md）。
// 原型页面依赖 vytdl-desktop 的组件/命令集，尚未迁移到 contentforge 后端，
// 在 monorepo 统一构建中先用占位页保证可编译。

import { Construction } from "lucide-react";

export default function DownloadPage() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-8 text-center">
      <Construction className="h-12 w-12 text-muted-foreground" />
      <div>
        <h1 className="text-xl font-semibold">下载工作台 · Download Workspace</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          此模块重建中 / This module is being rebuilt
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          规划见 src-tauri/REBUILD_PLAN.md，进度见 docs/STATUS.md
        </p>
      </div>
    </div>
  );
}
