#!/usr/bin/env pwsh

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = (Resolve-Path (Join-Path $scriptDir "..")).Path

Set-Location $projectDir

if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
    Write-Error "Error: pnpm is not installed.`nPlease install pnpm (https://pnpm.io/installation) and try again."
    exit 1
}

Write-Host "Starting vYtDL Desktop..."
Write-Host "Project directory: $projectDir"

pnpm tauri:dev
