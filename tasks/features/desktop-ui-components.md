# Feature: UI Components & Design System

## 概述
实现桌面应用的 UI 组件库，基于 shadcn/ui 设计系统，适配 Tauri 桌面环境。

## 关联代码
- `vYtDL-desktop/src/components/ui/*.tsx`
- `vYtDL-desktop/src/index.css`
- `vYtDL-desktop/tailwind.config.js`

## 子任务

### 2.1 基础 UI 组件
**优先级**: P0
**状态**: ✅ 已完成

| 组件 | 状态 | 文件 | 说明 |
|------|------|------|------|
| Button | ✅ | `ui/button.tsx` | 多变体按钮 |
| Input | ✅ | `ui/input.tsx` | 文本输入框 |
| Label | ✅ | `ui/label.tsx` | 表单标签 |
| Card | ✅ | `ui/card.tsx` | 卡片容器 |
| Progress | ✅ | `ui/progress.tsx` | 进度条 |
| Badge | ✅ | `ui/badge.tsx` | 状态标签 |
| Alert | ✅ | `ui/alert.tsx` | 警告提示 |
| Tabs | ✅ | `ui/tabs.tsx` | 标签页 |

**技术细节**:
```typescript
// Button 组件示例
export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
  size?: "default" | "sm" | "lg" | "icon";
}
```

### 2.2 主题系统
**优先级**: P0
**状态**: ✅ 已完成

- [x] CSS 变量主题系统
- [x] Light/Dark 模式支持
- [x] Tailwind 配置
- [x] 自定义滚动条样式

**主题变量**:
```css
:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --card: 0 0% 100%;
  --card-foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  /* ... */
}
```

### 2.3 布局系统
**优先级**: P0
**状态**: ✅ 已完成

- [x] 侧边栏导航
- [x] 主内容区域
- [x] 响应式网格 (媒体库卡片)
- [x] 页面标题区域

**布局组件**: `Layout.tsx`

### 2.4 图标系统
**优先级**: P0
**状态**: ✅ 已完成

- [x] Lucide React 集成
- [x] 常用图标映射

**图标列表**:
- Download, Play, Pause, Stop
- FolderOpen, FileText, Trash2
- Settings, Home, Library
- AlertCircle, CheckCircle, Loader2

### 2.5 表单组件增强
**优先级**: P1
**状态**: ⏳ 部分完成

- [x] 基础输入框
- [x] 下拉选择
- [ ] 多选标签组件
- [ ] 时间选择器 (时间段裁剪)
- [ ] 文件夹选择器 (集成 Tauri dialog)
- [ ] 开关/滑块组件

### 2.6 数据展示组件
**优先级**: P1
**状态**: ⏳ 待实现

- [ ] 数据表格 (下载历史)
- [ ] 虚拟滚动列表
- [ ] 空状态占位符
- [ ] 骨架屏加载

### 2.7 反馈组件
**优先级**: P1
**状态**: ⏳ 待实现

- [x] Alert 警告
- [ ] Toast 通知
- [ ] Modal 对话框
- [ ] 确认弹窗
- [ ] 拖拽上传区域

## 设计规范

### 颜色使用

| 场景 | 颜色类名 | 示例 |
|------|----------|------|
| 主要操作 | `bg-primary` | 下载按钮 |
| 危险操作 | `bg-destructive` | 删除按钮 |
| 成功状态 | `text-green-500` | 完成状态 |
| 警告状态 | `text-yellow-500` | 警告提示 |
| 禁用状态 | `opacity-50` | 禁用按钮 |

### 间距规范

- 页面内边距: `p-6`
- 卡片内边距: `p-4` 或 `p-6`
- 组件间距: `gap-4`
- 元素间距: `space-y-4`

### 字体规范

- 标题: `text-2xl font-bold`
- 副标题: `text-lg font-medium`
- 正文: `text-sm`
- 辅助文字: `text-xs text-muted-foreground`

## 组件使用示例

```tsx
// Card + Form 组合
<Card>
  <CardHeader>
    <CardTitle>Download</CardTitle>
    <CardDescription>Enter URL to download</CardDescription>
  </CardHeader>
  <CardContent>
    <div className="space-y-4">
      <Label>URL</Label>
      <Input placeholder="https://..." />
      <Button>Download</Button>
    </div>
  </CardContent>
</Card>

// Progress + Status
<div className="space-y-2">
  <Progress value={75} />
  <div className="flex justify-between text-sm text-muted-foreground">
    <span>75%</span>
    <span>2.5 MB/s</span>
    <span>ETA 00:30</span>
  </div>
</div>
```

## 可访问性

- 所有交互元素支持键盘导航
- 颜色对比度符合 WCAG 2.1 AA 标准
- 表单元素关联 Label
- 加载状态有视觉反馈

## 性能优化

1. **组件懒加载**: 大组件使用 React.lazy
2. **虚拟列表**: 长列表使用虚拟滚动
3. **CSS 优化**: Tailwind purge 移除未使用样式
