# 共享函数库：被 start-web.ps1 / install.ps1 / refresh-icon.ps1 在脚本顶层 dot-source。
# 本文件位于 <launcher>\lib\ 下，LauncherDir 取其父目录。

Set-StrictMode -Version 2.0

$script:LauncherDir = Split-Path -Parent $PSScriptRoot
$script:WebHost = '127.0.0.1'
$script:WebPort = 3080
$script:WebUrl = "http://$($script:WebHost):$($script:WebPort)"
$script:RepoConfigFile = Join-Path $script:LauncherDir 'repo-root.txt'
$script:LogDir = Join-Path $script:LauncherDir 'logs'
$script:IconPath = Join-Path $script:LauncherDir 'dsh-web.ico'

function Test-HarnessRoot([string]$Path) {
    if (-not $Path) { return $false }
    if (-not (Test-Path -LiteralPath (Join-Path $Path 'package.json'))) { return $false }
    if (-not (Test-Path -LiteralPath (Join-Path $Path 'apps\cli\src\bin.ts'))) { return $false }
    return $true
}

function Test-HarnessDeps([string]$Path) {
    return (Test-Path -LiteralPath (Join-Path $Path 'node_modules'))
}

function Resolve-HarnessRoot([string]$Explicit) {
    # 优先级：-RepoRoot 参数 > DSH_REPO_ROOT 环境变量 > repo-root.txt > 自动发现
    if ($Explicit) {
        $full = [System.IO.Path]::GetFullPath($Explicit)
        if (Test-HarnessRoot $full) { return $full }
    }
    if ($env:DSH_REPO_ROOT) {
        $full = [System.IO.Path]::GetFullPath($env:DSH_REPO_ROOT)
        if (Test-HarnessRoot $full) { return $full }
    }
    if (Test-Path -LiteralPath $script:RepoConfigFile) {
        $value = (Get-Content -LiteralPath $script:RepoConfigFile -Raw -ErrorAction SilentlyContinue).Trim()
        if ($value -and (Test-HarnessRoot $value)) { return $value }
    }
    # launcher 同级目录：<launcher 父目录>\deepseek-harness
    $parent = Split-Path -Parent $script:LauncherDir
    $sibling = Join-Path $parent 'deepseek-harness'
    if (Test-HarnessRoot $sibling) { return $sibling }
    # 从 launcher 父目录向上最多 4 层查找 deepseek-harness
    $cursor = $parent
    for ($i = 0; $i -lt 4 -and $cursor; $i++) {
        $candidate = Join-Path $cursor 'deepseek-harness'
        if (Test-HarnessRoot $candidate) { return $candidate }
        $upper = Split-Path -Parent $cursor
        if (-not $upper -or $upper -eq $cursor) { break }
        $cursor = $upper
    }
    # launcher 所在盘根：<盘>:\deepseek-harness
    $driveRoot = [System.IO.Path]::GetPathRoot($script:LauncherDir)
    if ($driveRoot) {
        $candidate = Join-Path $driveRoot 'deepseek-harness'
        if (Test-HarnessRoot $candidate) { return $candidate }
    }
    return $null
}

function Resolve-Pnpm {
    $cmd = Get-Command 'pnpm.cmd' -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    $cmd = Get-Command 'pnpm' -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.CommandType -eq 'Application') { return $cmd.Source }
    return $null
}

function Get-RunnerInfo {
    # 返回用于启动 web 服务的命令（不包含工作目录）
    $pnpm = Resolve-Pnpm
    if ($pnpm) { return @{ File = $env:ComSpec; Args = @('/d', '/s', '/c', 'pnpm dsh web') } }
    $npm = Get-Command 'npm.cmd' -ErrorAction SilentlyContinue
    if ($npm) { return @{ File = $env:ComSpec; Args = @('/d', '/s', '/c', 'npm run dsh -- web') } }
    $node = Get-Command 'node.exe' -ErrorAction SilentlyContinue
    if ($node) { return @{ File = $node.Source; Args = @('--import', 'tsx/esm', 'apps/cli/src/bin.ts', 'web') } }
    return $null
}

function Start-WebServerProcess([string]$HarnessRoot, [string]$LogDir) {
    $runner = Get-RunnerInfo
    if (-not $runner) { throw '未找到 pnpm / npm / node，请先安装 Node.js 与 pnpm。' }
    New-Item -ItemType Directory -Force -Path $LogDir | Out-Null
    $stdout = Join-Path $LogDir 'web-server.log'
    $stderr = Join-Path $LogDir 'web-server.err.log'
    return Start-Process -FilePath $runner.File -ArgumentList $runner.Args -WorkingDirectory $HarnessRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
}

function Stop-ProcessTree([int]$TargetPid) {
    if ($TargetPid -le 0) { return }
    $null = & "$env:SystemRoot\System32\taskkill.exe" /PID $TargetPid /T /F 2>$null
}

function Get-PortOwner([int]$Port) {
    try {
        $conn = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($conn -and $conn.OwningProcess) { return [int]$conn.OwningProcess }
    } catch { }
    try {
        $netstat = & "$env:SystemRoot\System32\netstat.exe" -ano 2>$null
        foreach ($line in $netstat) {
            if ($line -notmatch ":$Port\s") { continue }
            if ($line -match "LISTENING\s+(\d+)\s*$") { return [int]$Matches[1] }
        }
    } catch { }
    return 0
}

function Test-WebReady([string]$Url) {
    try {
        $resp = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 2
        return ($resp.StatusCode -eq 200) -and ($resp.Content -match '__DSH_BOOT__')
    } catch {
        return $false
    }
}

function Wait-WebReady([string]$Url, [int]$TimeoutSec) {
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-WebReady $Url) { return $true }
        Start-Sleep -Seconds 1
    }
    return (Test-WebReady $Url)
}

function Open-UrlInBrowser([string]$Url) {
    try { Start-Process $Url } catch { }
}
