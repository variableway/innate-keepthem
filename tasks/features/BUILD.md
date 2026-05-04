# Build Guide - vYtDL Desktop

## 快速开始

### 环境要求

| 工具 | 版本 | 安装命令 |
|------|------|----------|
| Node.js | 18+ | [下载](https://nodejs.org/) |
| Rust | 1.70+ | `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| yt-dlp | latest | `pip install -U yt-dlp` |

### 平台特定要求

**macOS**:
```bash
# 安装 Xcode Command Line Tools
xcode-select --install

# 安装 Homebrew (可选但推荐)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install yt-dlp
```

**Windows**:
- Visual Studio 2022 (C++ 构建工具)
- Windows 10 SDK
- WebView2 Runtime

**Linux** (Ubuntu/Debian):
```bash
sudo apt update
sudo apt install libwebkit2gtk-4.0-dev libssl-dev libgtk-3-dev
```

## 开发构建

### 1. 克隆项目

```bash
git clone <repository>
cd innate-keepthem/vYtDL-desktop
```

### 2. 安装依赖

```bash
# 前端依赖
npm install

# Rust 依赖 (会自动安装)
cd src-tauri
cargo fetch
cd ..
```

### 3. 开发模式运行

```bash
# 方式1: 同时启动前端和后端
npm run tauri:dev

# 方式2: 分别启动 (用于调试)
# 终端 1 - 前端
npm run dev

# 终端 2 - Tauri
npm run tauri:dev
```

开发服务器启动后:
- 前端热重载: http://localhost:5173
- Tauri 窗口自动打开

## 生产构建

### 完整构建流程

```bash
# 清理旧构建
rm -rf src-tauri/target/release/bundle

# 执行构建
npm run tauri:build
```

### 构建产物位置

| 平台 | 格式 | 路径 |
|------|------|------|
| macOS | .app | `src-tauri/target/release/bundle/macos/vYtDL Desktop.app` |
| macOS | .dmg | `src-tauri/target/release/bundle/dmg/*.dmg` |
| Windows | .msi | `src-tauri/target/release/bundle/msi/*.msi` |
| Windows | .exe | `src-tauri/target/release/bundle/nsis/*.exe` |
| Linux | .AppImage | `src-tauri/target/release/bundle/appimage/*.AppImage` |
| Linux | .deb | `src-tauri/target/release/bundle/deb/*.deb` |

### 交叉编译

**注意**: Tauri 官方不支持完整的交叉编译，建议在不同平台上分别构建。

**GitHub Actions 多平台构建** (推荐):

```yaml
# .github/workflows/build.yml
name: Build
on: [push]
jobs:
  build:
    strategy:
      matrix:
        platform: [macos-latest, ubuntu-latest, windows-latest]
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 18
      - uses: dtolnay/rust-action@stable
      - run: npm install
      - run: npm run tauri:build
```

## 配置详解

### Tauri 配置 (`src-tauri/tauri.conf.json`)

```json
{
  "productName": "vYtDL Desktop",
  "version": "0.1.0",
  "identifier": "com.vytdl.desktop",
  "build": {
    "frontendDist": "../dist",
    "devUrl": "http://localhost:5173"
  },
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": ["icons/32x32.png", "icons/128x128.png", "icons/icon.icns"],
    "resources": ["go-downloader"],
    "macOS": {
      "minimumSystemVersion": "10.13"
    }
  }
}
```

### Cargo 配置 (`src-tauri/Cargo.toml`)

```toml
[package]
name = "vytdl-desktop"
version = "0.1.0"
edition = "2021"

[dependencies]
tauri = { version = "2", features = [] }
tokio = { version = "1", features = ["full"] }
sqlx = { version = "0.7", features = ["sqlite"] }

[profile.release]
strip = true          # 去除符号表
opt-level = "z"       # 最大优化
lto = true            # 链接时优化
codegen-units = 1     # 单代码生成单元
panic = "abort"       #  panic 时中止而非展开
```

### Vite 配置 (`vite.config.ts`)

```typescript
export default defineConfig({
  plugins: [react()],
  build: {
    target: 'es2021',
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          // 代码分割
          vendor: ['react', 'react-dom'],
          ui: ['lucide-react'],
        },
      },
    },
  },
});
```

## 打包优化

### 1. 减小应用体积

```toml
# Cargo.toml
[profile.release]
strip = true
opt-level = "z"
lto = true
codegen-units = 1
panic = "abort"
```

### 2. 前端优化

```bash
# 分析打包体积
npm run build -- --analyze

# 检查依赖大小
npm install -g bundle-phobia
bundle-phobia plyr
```

### 3. 资源处理

- 图标: 使用 PNG 替代 SVG 减少渲染开销
- 字体: 使用系统字体栈，避免打包大字体文件
- 视频播放器: 按需加载 Plyr

## 签名与发布

### macOS 代码签名

```bash
# 生成证书
# 1. 在 Apple Developer 下载证书
# 2. 导入钥匙串

# 签名
export MACOS_CERTIFICATE="Developer ID Application: Your Name"
codesign --deep --force --verify --verbose --sign "$MACOS_CERTIFICATE" \
  "src-tauri/target/release/bundle/macos/vYtDL Desktop.app"

# 公证
xcrun altool --notarize-app \
  --primary-bundle-id "com.vytdl.desktop" \
  --username "your@email.com" \
  --password "@keychain:AC_PASSWORD" \
  --file "vYtDL Desktop.dmg"
```

### Windows 代码签名

```powershell
# 使用 signtool
signtool sign /f certificate.pfx /p password `
  /tr http://timestamp.digicert.com `
  /td sha256 `
  /fd sha256 `
  "vYtDL Desktop.exe"
```

## 常见问题

### 1. 构建失败: `could not find system library`

**解决**:
```bash
# macOS
brew install pkg-config

# Linux
sudo apt install pkg-config libssl-dev
```

### 2. 构建失败: `webview2 not found`

**解决**: 安装 [WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/)

### 3. 应用启动白屏

**检查**:
1. 确认 `dist` 目录存在
2. 检查 `tauri.conf.json` 中的 `frontendDist` 路径
3. 开启开发者工具查看控制台错误

### 4. 资源文件未打包

**解决**: 在 `tauri.conf.json` 中添加:
```json
{
  "bundle": {
    "resources": ["go-downloader/**/*"]
  }
}
```

## 调试构建

### 开发调试

```bash
# 启用详细日志
RUST_LOG=debug npm run tauri:dev

# 前端调试
# 在 Tauri 窗口按 F12 打开 DevTools
```

### 生产调试

```bash
# 构建带调试符号的版本
npm run tauri:build -- --debug

# 查看日志
# macOS
tail -f ~/Library/Logs/vYtDL\ Desktop/log.txt

# Windows
# 查看 %APPDATA%/vYtDL Desktop/logs/
```

## CI/CD 集成

### GitHub Actions 完整示例

```yaml
name: Release
on:
  push:
    tags:
      - 'v*'

jobs:
  release:
    permissions:
      contents: write
    strategy:
      fail-fast: false
      matrix:
        platform: [macos-latest, ubuntu-20.04, windows-latest]
    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 18

      - name: Install Rust
        uses: dtolnay/rust-action@stable

      - name: Install dependencies (Ubuntu)
        if: matrix.platform == 'ubuntu-20.04'
        run: |
          sudo apt-get update
          sudo apt-get install -y libgtk-3-dev libwebkit2gtk-4.0-dev

      - name: Install frontend dependencies
        run: npm install

      - name: Build
        run: npm run tauri:build

      - name: Upload artifacts
        uses: actions/upload-artifact@v3
        with:
          name: ${{ matrix.platform }}
          path: |
            src-tauri/target/release/bundle/**/*.dmg
            src-tauri/target/release/bundle/**/*.msi
            src-tauri/target/release/bundle/**/*.AppImage
```

## 性能基准

| 指标 | 目标值 | 测试方法 |
|------|--------|----------|
| 冷启动时间 | < 3s | 秒表测量 |
| 内存占用 | < 200MB | 系统监视器 |
| 包体积 (macOS) | < 50MB | `du -h` |
| 包体积 (Windows) | < 40MB | 文件属性 |

## 参考链接

- [Tauri Build Guide](https://tauri.app/v1/guides/building/)
- [Tauri Distribution](https://tauri.app/v1/guides/distributing/)
- [Vite Build Guide](https://vitejs.dev/guide/build.html)
