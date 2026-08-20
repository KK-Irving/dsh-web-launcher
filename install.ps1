#Requires -Version 5.1
<#
.SYNOPSIS
安装 DeepSeek Harness Web 一键启动器：定位 deepseek-harness 仓库、写入配置、
（可选）刷新图标、在桌面创建快捷方式。

.PARAMETER RepoRoot
显式指定 deepseek-harness 仓库根路径；不传则自动发现，找不到时交互询问。
.PARAMETER Port
Web 服务端口（默认 3080），写入快捷方式参数。
.PARAMETER SkipIconRefresh
跳过图标刷新（沿用仓库内已有的 dsh-web.ico）。
.PARAMETER Uninstall
卸载模式：删除桌面快捷方式、清除 repo-root.txt。

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -RepoRoot "D:\code\deepseek-harness"
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -Uninstall
#>
param(
    [string]$RepoRoot = '',
    [int]$Port = 0,
    [switch]$SkipIconRefresh,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
. (Join-Path $PSScriptRoot 'lib\common.ps1')

if ($Port -gt 0) { Set-WebPort $Port }

# ── 卸载模式 ──────────────────────────────────────────────────────────────────
if ($Uninstall) {
    $desktop = [Environment]::GetFolderPath('Desktop')
    $lnkPath = Join-Path $desktop 'DeepSeek Harness Web.lnk'
    if (Test-Path -LiteralPath $lnkPath) {
        Remove-Item -LiteralPath $lnkPath -Force
        Write-Host (Get-I18n "已删除桌面快捷方式：$lnkPath" "Removed desktop shortcut: $lnkPath")
    } else {
        Write-Host (Get-I18n '未找到桌面快捷方式，跳过。' 'Desktop shortcut not found, skipping.')
    }
    if (Test-Path -LiteralPath $script:RepoConfigFile) {
        Remove-Item -LiteralPath $script:RepoConfigFile -Force
        Write-Host (Get-I18n "已删除配置文件：$($script:RepoConfigFile)" "Removed config file: $($script:RepoConfigFile)")
    }
    Write-Host ''
    Write-Host (Get-I18n '卸载完成。启动器脚本和图标文件保留在当前目录，如不再需要可手动删除整个目录。' 'Uninstall complete. Launcher scripts remain in place; delete the directory manually if no longer needed.')
    exit 0
}

# ── 安装模式 ──────────────────────────────────────────────────────────────────
$harness = Resolve-HarnessRoot $RepoRoot
if (-not $harness) {
    Show-HarnessNotFoundHelp
    if ([Environment]::UserInteractive) {
        $inputPath = Read-Host (Get-I18n '请输入 deepseek-harness 仓库路径（直接回车退出）' 'Enter deepseek-harness repo path (Enter to quit)')
        if ($inputPath) { $harness = Resolve-HarnessRoot $inputPath }
    }
    if (-not $harness) {
        Write-Error (Get-I18n '无法定位 deepseek-harness 仓库，安装中止。' 'Cannot locate deepseek-harness repo. Install aborted.')
        exit 1
    }
}

# 验证 git 仓库信息
Show-HarnessGitWarning $harness

Write-Host "harness $(Get-I18n '仓库' 'repo')   : $harness"
Write-Host "$(Get-I18n '启动器目录' 'Launcher dir')     : $script:LauncherDir"

# 写入配置（git 忽略文件，仅本机生效）
[System.IO.File]::WriteAllText($script:RepoConfigFile, $harness + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Host "$(Get-I18n '配置已写入' 'Config written')     : $($script:RepoConfigFile)"

# 图标
if (-not $SkipIconRefresh) {
    try {
        & (Join-Path $PSScriptRoot 'refresh-icon.ps1') -RepoRoot $harness -OutIco $script:IconPath | ForEach-Object { Write-Host "  $_" }
    } catch {
        Write-Warning (Get-I18n "图标刷新失败（将沿用现有图标）：$($_.Exception.Message)" "Icon refresh failed (using existing): $($_.Exception.Message)")
    }
}
if (-not (Test-Path -LiteralPath $script:IconPath)) {
    Write-Warning (Get-I18n '缺少 dsh-web.ico，托盘图标将使用系统默认样式。可稍后运行 refresh-icon.ps1 生成。' 'Missing dsh-web.ico. Tray icon will use system default. Run refresh-icon.ps1 later to generate.')
}

# 桌面快捷方式
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'DeepSeek Harness Web.lnk'
$startScript = Join-Path $PSScriptRoot 'start-web.ps1'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$portArg = ''
if ($Port -gt 0) { $portArg = " -Port $Port" }
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`" -RepoRoot `"$harness`"$portArg"
$shortcut.WorkingDirectory = $harness
$shortcut.IconLocation = "$($script:IconPath),0"
$shortcut.Description = 'DeepSeek Harness Web'
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Host "$(Get-I18n '桌面快捷方式' 'Desktop shortcut')   : $lnkPath"

if (-not (Test-HarnessDeps $harness)) {
    Write-Warning (Get-I18n "harness 仓库尚未安装依赖（node_modules 不存在）。请先在仓库目录运行：pnpm install" "Harness repo missing dependencies (no node_modules). Run: pnpm install")
} elseif (-not (Test-HarnessWebDist $harness)) {
    Write-Warning (Get-I18n '未检测到 apps\web\dist，首次使用前请先在仓库目录运行：pnpm run build' 'apps\web\dist not found. Run: pnpm run build before first use.')
}

Write-Host ''
Write-Host (Get-I18n '安装完成。双击桌面「DeepSeek Harness Web」即可启动。' 'Install complete. Double-click "DeepSeek Harness Web" on desktop to launch.')
Write-Host (Get-I18n '提示：同一台机器上运行多个 harness 仓库时，可重复执行 install.ps1 分别安装，' 'Tip: For multiple harness repos, run install.ps1 for each;')
Write-Host (Get-I18n '      快捷方式名称相同会被覆盖，如需并存请先重命名快捷方式。' '      shortcuts with the same name will be overwritten.')