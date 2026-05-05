# vYtDL One-Click Setup Script for Windows
# This script installs all dependencies required to build and run the vYtDL suite.

param(
    [switch]$SkipVerify
)

$ErrorActionPreference = "Stop"

function Write-Header {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  vYtDL Suite - One-Click Setup Script" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
}

function Write-Success { param($Message) Write-Host "  OK  $Message" -ForegroundColor Green }
function Write-ErrorMsg { param($Message) Write-Host "  ERR $Message" -ForegroundColor Red }
function Write-Info { param($Message) Write-Host "  ... $Message" -ForegroundColor Yellow }

function Test-Command { param($Name) return [bool](Get-Command $Name -ErrorAction SilentlyContinue) }

function Install-WinGetPackage {
    param($PackageId, $CommandName)
    if (Test-Command $CommandName) {
        Write-Success "$PackageId already installed"
        return $true
    }
    Write-Info "Installing $PackageId..."
    try {
        winget install --id $PackageId --accept-source-agreements --accept-package-agreements
        Write-Success "$PackageId installed"
        return $true
    } catch {
        Write-ErrorMsg "Failed to install $PackageId`: $_"
        return $false
    }
}

function Install-Node {
    if (Test-Command "node") {
        Write-Success "Node.js already installed: $(node --version)"
        return
    }
    Write-Info "Installing Node.js..."
    try {
        winget install --id OpenJS.NodeJS --accept-source-agreements --accept-package-agreements
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        Write-Success "Node.js installed: $(node --version)"
    } catch {
        Write-ErrorMsg "Failed to install Node.js. Please install manually from https://nodejs.org/"
    }
}

function Install-Pnpm {
    if (Test-Command "pnpm") {
        Write-Success "pnpm already installed: $(pnpm --version)"
        return
    }
    Write-Info "Installing pnpm..."
    try {
        npm install -g pnpm
        Write-Success "pnpm installed: $(pnpm --version)"
    } catch {
        Write-ErrorMsg "Failed to install pnpm: $_"
    }
}

function Install-Rust {
    if (Test-Command "cargo") {
        Write-Success "Rust already installed: $(cargo --version)"
        return
    }
    Write-Info "Installing Rust..."
    try {
        $rustupInit = "$env:TEMP\rustup-init.exe"
        Invoke-WebRequest -Uri "https://win.rustup.rs/x86_64" -OutFile $rustupInit
        & $rustupInit -y
        Remove-Item $rustupInit -Force
        # Refresh PATH
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")
        Write-Success "Rust installed: $(cargo --version)"
    } catch {
        Write-ErrorMsg "Failed to install Rust. Please install manually from https://rustup.rs/"
    }
}

function Install-Go {
    if (Test-Command "go") {
        Write-Success "Go already installed: $(go version)"
        return
    }
    Install-WinGetPackage -PackageId "GoLang.Go" -CommandName "go"
}

function Install-YtDlp {
    if (Test-Command "yt-dlp") {
        Write-Success "yt-dlp already installed: $(yt-dlp --version)"
        return
    }
    Install-WinGetPackage -PackageId "yt-dlp.yt-dlp" -CommandName "yt-dlp"
}

function Install-Ffmpeg {
    if (Test-Command "ffmpeg") {
        Write-Success "FFmpeg already installed"
        return
    }
    Install-WinGetPackage -PackageId "Gyan.FFmpeg" -CommandName "ffmpeg"
}

function Install-Docker {
    if (Test-Command "docker") {
        Write-Success "Docker already installed: $(docker --version)"
        return
    }
    Write-Info "Docker not found. Please install Docker Desktop manually:"
    Write-Host "  https://docs.docker.com/desktop/install/windows-install/"
}

function Test-Winget {
    if (-not (Test-Command "winget")) {
        Write-ErrorMsg "winget not found. Please update Windows or install App Installer from Microsoft Store."
        exit 1
    }
    Write-Success "winget available"
}

function Confirm-Installations {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  Installation Verification" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""

    $checks = @(
        @{ Name = "go"; Version = { go version } },
        @{ Name = "node"; Version = { node --version } },
        @{ Name = "pnpm"; Version = { pnpm --version } },
        @{ Name = "cargo"; Version = { cargo --version } },
        @{ Name = "yt-dlp"; Version = { yt-dlp --version } },
        @{ Name = "ffmpeg"; Version = { ffmpeg -version | Select-Object -First 1 } }
    )

    $allOk = $true
    foreach ($check in $checks) {
        if (Test-Command $check.Name) {
            $ver = & $check.Version
            Write-Success "$($check.Name): $ver"
        } else {
            Write-ErrorMsg "$($check.Name): NOT FOUND"
            $allOk = $false
        }
    }

    Write-Host ""
    if ($allOk) {
        Write-Host "All dependencies installed successfully!" -ForegroundColor Green
    } else {
        Write-Host "Some dependencies are missing. Please install them manually." -ForegroundColor Yellow
    }
}

function Show-NextSteps {
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host "  Next Steps" -ForegroundColor Cyan
    Write-Host "============================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Build the CLI:"
    Write-Host "   cd vYtDL"
    Write-Host "   go build -o vYtDL.exe ."
    Write-Host ""
    Write-Host "2. Run the desktop app in dev mode:"
    Write-Host "   cd vYtDL-desktop\apps\desktop"
    Write-Host "   pnpm install"
    Write-Host "   pnpm tauri dev"
    Write-Host ""
    Write-Host "3. Deploy the web UI:"
    Write-Host "   docker-compose up -d"
    Write-Host ""
    Write-Host "4. Load the Chrome extension:"
    Write-Host "   Open chrome://extensions/ → Developer mode → Load unpacked → Select url-extractor\""
    Write-Host ""
    Write-Host "Happy downloading!" -ForegroundColor Green
    Write-Host ""
}

# Main
Write-Header
Test-Winget
Install-Go
Install-Node
Install-Pnpm
Install-Rust
Install-YtDlp
Install-Ffmpeg
Install-Docker
Confirm-Installations
Show-NextSteps
