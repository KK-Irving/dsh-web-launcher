#Requires -Version 5.1
<#
.SYNOPSIS
一键安装依赖并启动 DSH Desktop（Electron 版）。

.DESCRIPTION
自动完成：
  1. 检查 Node.js 和 pnpm 是否可用
  2. 安装 Electron 依赖（pnpm install）
  3. 启动桌面客户端（pnpm start）

.PARAMETER BuildOnly
仅安装依赖，不启动。
.PARAMETER Build
安装依赖后执行打包（生成 dist/ 下的安装程序）。
#>
param(
    [switch]$BuildOnly,
    [switch]$Build
)

$ErrorActionPreference = 'Stop'
$electronDir = $PSScriptRoot | Split-Path -Parent

Write-Host '=== DSH Desktop Setup ===' -ForegroundColor Cyan
Write-Host ''

# Check Node.js
$node = Get-Command 'node' -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Error 'Node.js not found. Please install Node.js first (https://nodejs.org/).'
    exit 1
}
Write-Host "  Node.js : $(& node --version)" -ForegroundColor Green

# Check pnpm
$pnpm = Get-Command 'pnpm' -ErrorAction SilentlyContinue
if (-not $pnpm) {
    $pnpm = Get-Command 'pnpm.cmd' -ErrorAction SilentlyContinue
}
if (-not $pnpm) {
    Write-Host '  pnpm not found. Installing via corepack...' -ForegroundColor Yellow
    & corepack enable
    & corepack prepare pnpm@latest --activate
}
Write-Host "  pnpm    : $(& pnpm --version)" -ForegroundColor Green
Write-Host ''

# Install dependencies
Write-Host '[1/2] Installing dependencies...' -ForegroundColor Cyan
Push-Location $electronDir
try {
    & pnpm install
    if ($LASTEXITCODE -ne 0) { throw 'pnpm install failed' }
    Write-Host '  Dependencies installed.' -ForegroundColor Green
} finally {
    Pop-Location
}

if ($Build) {
    Write-Host ''
    Write-Host '[2/2] Building distributable...' -ForegroundColor Cyan
    Push-Location $electronDir
    try {
        & pnpm run build:win
        if ($LASTEXITCODE -ne 0) { throw 'electron-builder failed' }
        Write-Host ''
        Write-Host "  Build output: $electronDir\dist\" -ForegroundColor Green
        Write-Host '  Look for the .exe installer and portable executable.' -ForegroundColor Green
    } finally {
        Pop-Location
    }
    exit 0
}

if ($BuildOnly) {
    Write-Host ''
    Write-Host 'Setup complete. Run "pnpm start" in the electron/ directory to launch.' -ForegroundColor Green
    exit 0
}

# Launch
Write-Host ''
Write-Host '[2/2] Launching DSH Desktop...' -ForegroundColor Cyan
Push-Location $electronDir
try {
    & pnpm start
} finally {
    Pop-Location
}