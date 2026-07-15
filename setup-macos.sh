#!/bin/bash
# ContentForge macOS 环境设置脚本
set -e

echo "🔧 ContentForge macOS Setup"
echo ""

# 检查 Python 3.10+
PYTHON="/opt/homebrew/bin/python3.13"
if [ ! -f "$PYTHON" ]; then
    echo "❌ Python 3.13 not found. Installing via Homebrew..."
    /opt/homebrew/bin/brew install python@3.13
fi

PYTHON="/opt/homebrew/bin/python3.13"
$PYTHON --version

# 创建虚拟环境
VENV="$(cd "$(dirname "$0")" && pwd)/.venv-cf"
if [ ! -d "$VENV" ]; then
    echo "📦 Creating virtual environment..."
    $PYTHON -m venv "$VENV"
fi

echo "✅ Virtual environment: $VENV"

# 激活并安装依赖
echo "📦 Installing Python dependencies..."
"$VENV/bin/pip" install --upgrade pip
"$VENV/bin/pip" install -e "$(cd "$(dirname "$0")" && pwd)/agent-reach"
"$VENV/bin/pip" install yt-dlp faster-whisper requests

# 检查 FFmpeg
FFMPEG="/opt/homebrew/Cellar/ffmpeg/7.1.1_2/bin/ffmpeg"
if [ ! -f "$FFMPEG" ]; then
    echo "⚠️ FFmpeg not found. Install with: /opt/homebrew/bin/brew install ffmpeg"
else
    echo "✅ FFmpeg: $FFMPEG"
fi

# 设置 PATH 配置脚本
CF_ENV="$(cd "$(dirname "$0")" && pwd)/contentforge/core/scripts/cf-env.sh"
cat > "$CF_ENV" << 'EOF'
#!/bin/bash
# ContentForge 环境变量 — source 此文件后使用 contentforge CLI
if [ -n "${ZSH_VERSION:-}" ]; then
  _cf_script="${(%):-%x}"
else
  _cf_script="${BASH_SOURCE[0]}"
fi
SCRIPT_DIR="$(cd "$(dirname "$_cf_script")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

export PATH="/opt/homebrew/bin:${PATH}"
export PATH="${REPO_ROOT}/.venv-cf/bin:${PATH}"
export PYTHONPATH="${REPO_ROOT}/contentforge/core/python:${PYTHONPATH}"
export CF_HOME="${REPO_ROOT}"
export CONTENTFORGE_VENV="${REPO_ROOT}/.venv-cf"
EOF
chmod +x "$CF_ENV"

echo ""
echo "✅ ContentForge environment ready!"
echo ""
echo "To use: source contentforge/core/scripts/cf-env.sh"
echo "To verify: agent-reach doctor --json"
