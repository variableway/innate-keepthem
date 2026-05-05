#!/usr/bin/env bash
# vYtDL One-Click Setup Script for macOS and Linux
# This script installs all dependencies required to build and run the vYtDL suite.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo ""
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}  vYtDL Suite - One-Click Setup Script${NC}"
    echo -e "${BLUE}============================================${NC}"
    echo ""
}

print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

print_info() {
    echo -e "${YELLOW}→${NC} $1"
}

detect_os() {
    if [[ "$OSTYPE" == "linux-gnu"* ]]; then
        OS="linux"
        if command -v apt-get &> /dev/null; then
            DISTRO="debian"
        elif command -v yum &> /dev/null; then
            DISTRO="rhel"
        elif command -v pacman &> /dev/null; then
            DISTRO="arch"
        else
            DISTRO="unknown"
        fi
    elif [[ "$OSTYPE" == "darwin"* ]]; then
        OS="macos"
        DISTRO="macos"
    else
        print_error "Unsupported OS: $OSTYPE"
        exit 1
    fi
    print_info "Detected OS: $OS ($DISTRO)"
}

check_command() {
    command -v "$1" &> /dev/null
}

install_homebrew() {
    if [[ "$OS" == "macos" ]]; then
        if ! check_command brew; then
            print_info "Installing Homebrew..."
            /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
            if [[ -f /opt/homebrew/bin/brew ]]; then
                eval "$(/opt/homebrew/bin/brew shellenv)"
            elif [[ -f /usr/local/bin/brew ]]; then
                eval "$(/usr/local/bin/brew shellenv)"
            fi
            print_success "Homebrew installed"
        else
            print_success "Homebrew already installed"
        fi
    fi
}

install_go() {
    if check_command go; then
        print_success "Go already installed: $(go version)"
        return
    fi

    print_info "Installing Go..."
    if [[ "$OS" == "macos" ]]; then
        brew install go
    elif [[ "$DISTRO" == "debian" ]]; then
        sudo apt-get update
        sudo apt-get install -y golang-go
    elif [[ "$DISTRO" == "rhel" ]]; then
        sudo yum install -y golang
    elif [[ "$DISTRO" == "arch" ]]; then
        sudo pacman -S --noconfirm go
    fi
    print_success "Go installed: $(go version)"
}

install_node() {
    if check_command node && check_command npm; then
        print_success "Node.js already installed: $(node --version)"
        return
    fi

    print_info "Installing Node.js..."
    if [[ "$OS" == "macos" ]]; then
        brew install node
    elif [[ "$DISTRO" == "debian" ]]; then
        curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
        sudo apt-get install -y nodejs
    elif [[ "$DISTRO" == "rhel" ]]; then
        curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
        sudo yum install -y nodejs
    elif [[ "$DISTRO" == "arch" ]]; then
        sudo pacman -S --noconfirm nodejs npm
    fi
    print_success "Node.js installed: $(node --version)"
}

install_pnpm() {
    if check_command pnpm; then
        print_success "pnpm already installed: $(pnpm --version)"
        return
    fi

    print_info "Installing pnpm..."
    npm install -g pnpm
    print_success "pnpm installed: $(pnpm --version)"
}

install_rust() {
    if check_command cargo; then
        print_success "Rust already installed: $(cargo --version)"
        return
    fi

    print_info "Installing Rust..."
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
    source "$HOME/.cargo/env"
    print_success "Rust installed: $(cargo --version)"
}

install_yt_dlp() {
    if check_command yt-dlp; then
        print_success "yt-dlp already installed: $(yt-dlp --version)"
        return
    fi

    print_info "Installing yt-dlp..."
    if [[ "$OS" == "macos" ]]; then
        brew install yt-dlp
    elif [[ "$DISTRO" == "debian" ]]; then
        sudo apt-get update
        sudo apt-get install -y yt-dlp || {
            print_info "Installing yt-dlp via pip..."
            sudo apt-get install -y python3-pip
            pip3 install -U yt-dlp
        }
    elif [[ "$DISTRO" == "rhel" ]]; then
        sudo yum install -y yt-dlp || pip3 install -U yt-dlp
    elif [[ "$DISTRO" == "arch" ]]; then
        sudo pacman -S --noconfirm yt-dlp
    fi
    print_success "yt-dlp installed: $(yt-dlp --version)"
}

install_ffmpeg() {
    if check_command ffmpeg; then
        print_success "FFmpeg already installed: $(ffmpeg -version | head -1)"
        return
    fi

    print_info "Installing FFmpeg..."
    if [[ "$OS" == "macos" ]]; then
        brew install ffmpeg
    elif [[ "$DISTRO" == "debian" ]]; then
        sudo apt-get update
        sudo apt-get install -y ffmpeg
    elif [[ "$DISTRO" == "rhel" ]]; then
        sudo yum install -y ffmpeg
    elif [[ "$DISTRO" == "arch" ]]; then
        sudo pacman -S --noconfirm ffmpeg
    fi
    print_success "FFmpeg installed"
}

install_docker() {
    if check_command docker && check_command docker-compose; then
        print_success "Docker already installed: $(docker --version)"
        return
    fi

    print_info "Docker not found. Please install Docker manually:"
    echo "  macOS: brew install --cask docker"
    echo "  Linux: https://docs.docker.com/engine/install/"
    echo "  Or use: curl -fsSL https://get.docker.com | sh"
}

verify_installations() {
    echo ""
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}  Installation Verification${NC}"
    echo -e "${BLUE}============================================${NC}"
    echo ""

    local all_ok=true

    for cmd in go node pnpm cargo yt-dlp ffmpeg; do
        if check_command "$cmd"; then
            case "$cmd" in
                go) print_success "Go: $(go version)" ;;
                node) print_success "Node.js: $(node --version)" ;;
                pnpm) print_success "pnpm: $(pnpm --version)" ;;
                cargo) print_success "Rust: $(cargo --version)" ;;
                yt-dlp) print_success "yt-dlp: $(yt-dlp --version)" ;;
                ffmpeg) print_success "FFmpeg: $(ffmpeg -version | head -1 | awk '{print $3}')" ;;
            esac
        else
            print_error "$cmd: NOT FOUND"
            all_ok=false
        fi
    done

    echo ""
    if $all_ok; then
        echo -e "${GREEN}All dependencies installed successfully!${NC}"
    else
        echo -e "${YELLOW}Some dependencies are missing. Please install them manually.${NC}"
    fi
}

print_next_steps() {
    echo ""
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}  Next Steps${NC}"
    echo -e "${BLUE}============================================${NC}"
    echo ""
    echo "1. Build the CLI:"
    echo "   cd vYtDL && go build -o vYtDL ."
    echo ""
    echo "2. Run the desktop app in dev mode:"
    echo "   cd vYtDL-desktop/apps/desktop && pnpm install && pnpm tauri dev"
    echo ""
    echo "3. Deploy the web UI:"
    echo "   docker-compose up -d"
    echo ""
    echo "4. Load the Chrome extension:"
    echo "   Open chrome://extensions/ → Developer mode → Load unpacked → Select url-extractor/"
    echo ""
    echo -e "${GREEN}Happy downloading!${NC}"
    echo ""
}

# Main
print_header
detect_os
install_homebrew
install_go
install_node
install_pnpm
install_rust
install_yt_dlp
install_ffmpeg
install_docker
verify_installations
print_next_steps
