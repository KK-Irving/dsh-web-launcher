#Requires -Version 5.1
<#
.SYNOPSIS
安装 DeepSeek Harness Web 一键启动器：定位 deepseek-harness 仓库、写入配置、
（可选）刷新图标、在桌面创建快捷方式。

.PARAMETER RepoRoot
显式指定 deepseek-harness 仓库根路径；不传则自动发现，找不到时交互询问。
.PARAMETER SkipIconRefresh
跳过图标刷新（沿用仓库内已有的 dsh-web.ico）。

.EXAMPLE
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -RepoRoot "D:\code\deepseek-harness"
#>
param(
    [string]$RepoRoot = '',
    [switch]$SkipIconRefresh
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
. (Join-Path $PSScriptRoot 'lib\common.ps1')

$harness = Resolve-HarnessRoot $RepoRoot
if (-not $harness) {
    Write-Host '未自动定位到 deepseek-harness 仓库。'
    Write-Host '也可以显式指定：install.ps1 -RepoRoot "D:\code\deepseek-harness"'
    if ([Environment]::UserInteractive) {
        $inputPath = Read-Host '请输入 deepseek-harness 仓库路径（直接回车退出）'
        if ($inputPath) { $harness = Resolve-HarnessRoot $inputPath }
    }
    if (-not $harness) { Write-Error '无法定位 deepseek-harness 仓库，安装中止。'; exit 1 }
}

Write-Host "harness 仓库   : $harness"
Write-Host "启动器目录     : $script:LauncherDir"

# 写入配置（git 忽略文件，仅本机生效）
[System.IO.File]::WriteAllText($script:RepoConfigFile, $harness + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
Write-Host "配置已写入     : $($script:RepoConfigFile)"

# 图标
if (-not $SkipIconRefresh) {
    try {
        & (Join-Path $PSScriptRoot 'refresh-icon.ps1') -RepoRoot $harness -OutIco $script:IconPath | ForEach-Object { Write-Host "  $_" }
    } catch {
        Write-Warning "图标刷新失败（将沿用现有图标）：$($_.Exception.Message)"
    }
}
if (-not (Test-Path -LiteralPath $script:IconPath)) {
    Write-Warning '缺少 dsh-web.ico，托盘图标将使用系统默认样式。可稍后运行 refresh-icon.ps1 生成。'
}

# 桌面快捷方式
$desktop = [Environment]::GetFolderPath('Desktop')
$lnkPath = Join-Path $desktop 'DeepSeek Harness Web.lnk'
$startScript = Join-Path $PSScriptRoot 'start-web.ps1'
$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($lnkPath)
$shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$startScript`" -RepoRoot `"$harness`""
$shortcut.WorkingDirectory = $harness
$shortcut.IconLocation = "$($script:IconPath),0"
$shortcut.Description = 'DeepSeek Harness Web 一键启动'
$shortcut.WindowStyle = 7
$shortcut.Save()
Write-Host "桌面快捷方式   : $lnkPath"

if (-not (Test-HarnessDeps $harness)) {
    Write-Warning "harness 仓库尚未安装依赖（node_modules 不存在）。请先在仓库目录运行：pnpm install"
} elseif (-not (Test-Path -LiteralPath (Join-Path $harness 'apps\web\dist'))) {
    Write-Warning '未检测到 apps\web\dist，首次使用前请先在仓库目录运行：pnpm run build'
}

Write-Host ''
Write-Host '安装完成。双击桌面「DeepSeek Harness Web」即可启动。'
Write-Host '提示：同一台机器上运行多个 harness 仓库时，可重复执行 install.ps1 分别安装，'
Write-Host '      快捷方式名称相同会被覆盖，如需并存请先重命名快捷方式。'
