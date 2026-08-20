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
$script:VersionFile = Join-Path $script:LauncherDir 'VERSION'

# ── 国际化 ────────────────────────────────────────────────────────────────────
# 检测系统 UI 语言；非中文环境使用英文文字。
$script:IsChinese = ([System.Globalization.CultureInfo]::CurrentUICulture.TwoLetterISOLanguageName -eq 'zh')

function Get-I18n([string]$ZhText, [string]$EnText) {
    if ($script:IsChinese) { return $ZhText }
    return $EnText
}

# ── 版本读取 ──────────────────────────────────────────────────────────────────
function Get-LauncherVersion {
    if (Test-Path -LiteralPath $script:VersionFile) {
        return (Get-Content -LiteralPath $script:VersionFile -Raw -ErrorAction SilentlyContinue).Trim()
    }
    return 'unknown'
}

# ── 端口覆盖 ──────────────────────────────────────────────────────────────────
function Set-WebPort([int]$Port) {
    if ($Port -gt 0 -and $Port -le 65535) {
        $script:WebPort = $Port
        $script:WebUrl = "http://$($script:WebHost):$($script:WebPort)"
    }
}

# ── Harness 仓库验证与定位 ────────────────────────────────────────────────────
function Test-HarnessRoot([string]$Path) {
    if (-not $Path) { return $false }
    if (-not (Test-Path -LiteralPath (Join-Path $Path 'package.json'))) { return $false }
    if (-not (Test-Path -LiteralPath (Join-Path $Path 'apps\cli\src\bin.ts'))) { return $false }
    # 额外验证 apps\web 存在（launcher 是为 web 服务的）
    if (-not (Test-Path -LiteralPath (Join-Path $Path 'apps\web'))) { return $false }
    return $true
}

function Test-HarnessDeps([string]$Path) {
    return (Test-Path -LiteralPath (Join-Path $Path 'node_modules'))
}

function Test-HarnessWebDist([string]$Path) {
    return (Test-Path -LiteralPath (Join-Path $Path 'apps\web\dist'))
}

function Get-HarnessGitInfo([string]$Path) {
    # 返回 harness 仓库的 git 信息（branch, head, remote），用于诊断和确认
    $info = @{ IsGit = $false }
    if (-not $Path) { return $info }
    $gitDir = Join-Path $Path '.git'
    if (-not (Test-Path -LiteralPath $gitDir)) { return $info }
    $info.IsGit = $true
    try {
        $info.Branch = (& git -C $Path rev-parse --abbrev-ref HEAD 2>$null)
        $info.Head = (& git -C $Path rev-parse --short HEAD 2>$null)
        $info.Remote = (& git -C $Path remote get-url origin 2>$null)
        $info.IsHarnessRepo = ($info.Remote -match 'deepseek-harness|deepseek.*harness')
    } catch {
        $info.Error = $_.Exception.Message
    }
    return $info
}

function Show-HarnessNotFoundHelp {
    # 找不到仓库时的详细提示
    $sep = '─' * 60
    Write-Host ''
    Write-Host $sep -ForegroundColor Yellow
    Write-Host (Get-I18n '  未找到 deepseek-harness 仓库！' '  deepseek-harness repository not found!') -ForegroundColor Yellow
    Write-Host $sep -ForegroundColor Yellow
    Write-Host ''
    Write-Host (Get-I18n '  自动搜索范围：' '  Auto-search scope:')
    Write-Host (Get-I18n '    - 启动器同级及上层目录（最多 4 层）的所有子文件夹' '    - All subfolders alongside and above the launcher (up to 4 levels)')
    Write-Host (Get-I18n '    - 当前盘根下的 deepseek-harness / dsh / DeepSeek' '    - Drive root: deepseek-harness / dsh / DeepSeek')
    Write-Host (Get-I18n '    - 用户主目录下的子文件夹' '    - Subfolders under user home directory')
    Write-Host ''
    Write-Host (Get-I18n '  判定条件（目录需同时满足）：' '  Validation criteria (directory must contain all):')
    Write-Host '    - package.json'
    Write-Host '    - apps\cli\src\bin.ts'
    Write-Host '    - apps\web\'
    Write-Host ''
    Write-Host (Get-I18n '  解决方法：' '  Solutions:')
    Write-Host (Get-I18n '    1. 显式指定路径：' '    1. Specify path explicitly:')
    Write-Host '       install.ps1 -RepoRoot "D:\your\path\to\deepseek-harness"'
    Write-Host (Get-I18n '    2. 设置环境变量：' '    2. Set environment variable:')
    Write-Host '       $env:DSH_REPO_ROOT = "D:\your\path\to\deepseek-harness"'
    Write-Host (Get-I18n '    3. 把仓库 clone 到启动器同级目录' '    3. Clone the repo alongside the launcher directory')
    Write-Host ''
    Write-Host (Get-I18n '  提示：仓库文件夹名称不限于 "deepseek-harness"，任何名称均可，' '  Note: The folder name does not have to be "deepseek-harness";')
    Write-Host (Get-I18n '        只要目录结构符合上述条件即被识别。' '        any name works as long as the directory structure matches.')
    Write-Host $sep -ForegroundColor Yellow
    Write-Host ''
}

function Show-HarnessGitWarning([string]$Path) {
    # 当找到的仓库不像官方 harness 仓库时给出提示
    $gitInfo = Get-HarnessGitInfo $Path
    if (-not $gitInfo.IsGit) {
        Write-Host (Get-I18n "  提示：$Path 不是 git 仓库（可能是解压缩的源码包）。" "  Note: $Path is not a git repo (may be an extracted archive).") -ForegroundColor DarkYellow
        return
    }
    if ($gitInfo.Remote -and -not $gitInfo.IsHarnessRepo) {
        Write-Host (Get-I18n "  提示：该仓库的 remote 地址为 $($gitInfo.Remote)" "  Note: Repo remote is $($gitInfo.Remote)") -ForegroundColor DarkYellow
        Write-Host (Get-I18n '        看起来不是官方 deepseek-harness 仓库，请确认是否正确。' '        This does not look like the official deepseek-harness repo. Please confirm.') -ForegroundColor DarkYellow
    }
}

function Resolve-HarnessRoot([string]$Explicit) {
    # 优先级：-RepoRoot 参数 > DSH_REPO_ROOT 环境变量 > repo-root.txt > 自动发现（结构扫描）
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
        if ($value) {
            # 路径规范化：防止格式异常或相对路径注入
            $value = [System.IO.Path]::GetFullPath($value)
            if (Test-HarnessRoot $value) { return $value }
        }
    }
    # 自动发现：不限定文件夹名称，通过结构验证判定
    # 策略 1：launcher 同级所有目录
    $parent = Split-Path -Parent $script:LauncherDir
    $found = Find-HarnessInDir $parent
    if ($found) { return $found }
    # 策略 2：从 launcher 父目录向上最多 4 层，每层扫描子目录
    $cursor = $parent
    for ($i = 0; $i -lt 4 -and $cursor; $i++) {
        $upper = Split-Path -Parent $cursor
        if (-not $upper -or $upper -eq $cursor) { break }
        $cursor = $upper
        $found = Find-HarnessInDir $cursor
        if ($found) { return $found }
    }
    # 策略 3：常见安装位置（盘根下的已知名称）
    $driveRoot = [System.IO.Path]::GetPathRoot($script:LauncherDir)
    if ($driveRoot) {
        foreach ($name in @('deepseek-harness', 'dsh', 'DeepSeek')) {
            $candidate = Join-Path $driveRoot $name
            if (Test-HarnessRoot $candidate) { return $candidate }
        }
    }
    # 策略 4：用户 home 目录下查找
    $userHome = $env:USERPROFILE
    if ($userHome) {
        $found = Find-HarnessInDir $userHome
        if ($found) { return $found }
    }
    return $null
}

function Find-HarnessInDir([string]$SearchDir) {
    # 在指定目录下扫描一级子目录，返回第一个通过 Test-HarnessRoot 验证的路径
    if (-not $SearchDir -or -not (Test-Path -LiteralPath $SearchDir)) { return $null }
    try {
        $dirs = Get-ChildItem -LiteralPath $SearchDir -Directory -ErrorAction SilentlyContinue
        foreach ($dir in $dirs) {
            if ($dir.Name.StartsWith('.')) { continue }
            if ($dir.Name -eq 'node_modules') { continue }
            if (Test-HarnessRoot $dir.FullName) { return $dir.FullName }
        }
    } catch { }
    return $null
}

# ── 命令解析 ──────────────────────────────────────────────────────────────────
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

# ── 服务管理 ──────────────────────────────────────────────────────────────────
function Start-WebServerProcess([string]$HarnessRoot, [string]$LogDir) {
    $runner = Get-RunnerInfo
    if (-not $runner) {
        throw (Get-I18n '未找到 pnpm / npm / node，请先安装 Node.js 与 pnpm。' 'pnpm / npm / node not found. Please install Node.js and pnpm first.')
    }
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

# ── Web 就绪检测 ──────────────────────────────────────────────────────────────
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

# ── 诊断工具 ──────────────────────────────────────────────────────────────────
function Get-NodeVersion {
    try {
        $node = Get-Command 'node.exe' -ErrorAction SilentlyContinue
        if ($node) { return (& $node.Source --version 2>$null).Trim() }
    } catch { }
    return $null
}

function Get-PnpmVersion {
    try {
        $pnpm = Resolve-Pnpm
        if ($pnpm) { return (& $env:ComSpec /d /s /c "pnpm --version" 2>$null).Trim() }
    } catch { }
    return $null
}

function Get-LogsDirSize {
    if (-not (Test-Path -LiteralPath $script:LogDir)) { return '0 bytes' }
    try {
        $bytes = (Get-ChildItem -LiteralPath $script:LogDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        if ($null -eq $bytes) { $bytes = 0 }
        if ($bytes -ge 1MB) { return "$([Math]::Round($bytes / 1MB, 2)) MB" }
        if ($bytes -ge 1KB) { return "$([Math]::Round($bytes / 1KB, 1)) KB" }
        return "$bytes bytes"
    } catch { return 'unknown' }
}