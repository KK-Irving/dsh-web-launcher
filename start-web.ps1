#Requires -Version 5.1
<#
.SYNOPSIS
DeepSeek Harness Web 一键启动器（托盘图标版）。

.DESCRIPTION
自动定位 deepseek-harness 仓库（-RepoRoot 参数 > DSH_REPO_ROOT 环境变量 > repo-root.txt > 自动发现），
未运行服务时以隐藏窗口启动 `pnpm dsh web`，就绪后自动用默认浏览器打开 Web 界面；
在任务栏通知区域显示托盘图标，右键菜单：
    打开 Web 界面 / 插件热更新监听(dev:web) / 打开日志目录 / 重启 Web 服务 / 退出（停止服务）
双击托盘图标再次打开 Web 界面；服务日志写入 launcher\logs\。

.PARAMETER RepoRoot
显式指定 deepseek-harness 仓库根路径（可选，默认自动解析）。
.PARAMETER Test
自检模式：打印环境信息后退出，不启动托盘与服务。
.PARAMETER ShotMenu
截图辅助模式：仅创建托盘图标并在任务栏上方弹出右键菜单后保持运行（供截图工具使用）。
.PARAMETER NoBrowser
启动后不自动打开浏览器。
#>
param(
    [switch]$Test,
    [string]$RepoRoot = '',
    [switch]$ShotMenu,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
. (Join-Path $PSScriptRoot 'lib\common.ps1')

$script:HarnessRoot = Resolve-HarnessRoot $RepoRoot
$script:StartupTimeoutSec = 90

$script:WebServerProc = $null
$script:AdoptedExternal = $false
$script:HmrProc = $null
$script:tray = $null
$script:menu = $null
$script:mutex = $null
$script:hmrItem = $null

function Open-WebInBrowser {
    Open-UrlInBrowser $script:WebUrl
}

function Open-LogDir {
    New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null
    try { Start-Process explorer.exe $script:LogDir } catch { }
}

function Show-ErrorBalloon([string]$Text) {
    if ($script:tray) { $script:tray.ShowBalloonTip(4000, 'DeepSeek Harness Web', $Text, [System.Windows.Forms.ToolTipIcon]::Error) }
}

function Start-Hmr {
    $pnpm = Resolve-Pnpm
    if (-not $pnpm) { throw '未找到 pnpm，无法启动 dev:web 监听。' }
    New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null
    $stdout = Join-Path $script:LogDir 'dev-web.log'
    $stderr = Join-Path $script:LogDir 'dev-web.err.log'
    $script:HmrProc = Start-Process -FilePath $env:ComSpec -ArgumentList @('/d', '/s', '/c', 'pnpm run dev:web') -WorkingDirectory $script:HarnessRoot -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr -PassThru
}

function Toggle-Hmr($menuItem) {
    if ($script:HmrProc -and -not $script:HmrProc.HasExited) {
        Stop-ProcessTree $script:HmrProc.Id
        $script:HmrProc = $null
        $menuItem.Text = '启动插件热更新监听 (dev:web)'
        $script:tray.ShowBalloonTip(2000, 'DeepSeek Harness', '已停止 dev:web 监听。', [System.Windows.Forms.ToolTipIcon]::Info)
        return
    }
    try {
        Start-Hmr
        $menuItem.Text = '停止插件热更新监听 (dev:web)'
        $script:tray.ShowBalloonTip(2000, 'DeepSeek Harness', 'dev:web 监听已启动。', [System.Windows.Forms.ToolTipIcon]::Info)
    } catch {
        Show-ErrorBalloon "dev:web 启动失败：$($_.Exception.Message)"
    }
}

function Confirm-StopExternal {
    if (-not $script:AdoptedExternal) { return $true }
    $answer = [System.Windows.Forms.MessageBox]::Show(
        '当前 Web 服务并非由本启动器启动（可能来自命令行窗口），退出时是否一并停止它？',
        'DeepSeek Harness',
        [System.Windows.Forms.MessageBoxButtons]::YesNo,
        [System.Windows.Forms.MessageBoxIcon]::Question)
    return ($answer -eq [System.Windows.Forms.DialogResult]::Yes)
}

function Stop-WebServer {
    if ($script:WebServerProc -and -not $script:WebServerProc.HasExited) {
        Stop-ProcessTree $script:WebServerProc.Id
    } elseif ($script:AdoptedExternal) {
        $owner = Get-PortOwner $script:WebPort
        if ($owner -gt 0) { Stop-ProcessTree $owner }
    }
    $script:WebServerProc = $null
    $script:AdoptedExternal = $false
}

function Restart-Web {
    if (-not $script:HarnessRoot) { Show-ErrorBalloon '未找到 deepseek-harness 仓库，无法重启。'; return }
    if (-not (Confirm-StopExternal)) { return }
    Stop-WebServer
    Start-Sleep -Seconds 2
    try {
        $script:WebServerProc = Start-WebServerProcess $script:HarnessRoot $script:LogDir
    } catch {
        Show-ErrorBalloon "重启失败：$($_.Exception.Message)"
        return
    }
    if (Wait-WebReady $script:WebUrl $script:StartupTimeoutSec) {
        $script:tray.Text = 'DeepSeek Harness Web（运行中）'
        $script:tray.ShowBalloonTip(2500, 'DeepSeek Harness Web', '服务已重启。', [System.Windows.Forms.ToolTipIcon]::Info)
        Open-WebInBrowser
    } else {
        Show-ErrorBalloon '重启后服务未能就绪，请查看 logs\ 下的日志。'
    }
}

function Exit-Launcher {
    if ($script:HmrProc -and -not $script:HmrProc.HasExited) {
        Stop-ProcessTree $script:HmrProc.Id
        $script:HmrProc = $null
    }
    if (Confirm-StopExternal) { Stop-WebServer }
    if ($script:tray) {
        $script:tray.Visible = $false
        $script:tray.Dispose()
        $script:tray = $null
    }
    [System.Windows.Forms.Application]::Exit()
}

function Add-MenuItem([System.Windows.Forms.ContextMenuStrip]$Menu, [string]$Text, [scriptblock]$Action) {
    $item = New-Object System.Windows.Forms.ToolStripMenuItem($Text)
    if ($Action) { $item.Add_Click($Action) }
    [void]$Menu.Items.Add($item)
    return $item
}

function New-TrayIcon {
    $tray = New-Object System.Windows.Forms.NotifyIcon
    $tray.Text = 'DeepSeek Harness Web'
    if (Test-Path -LiteralPath $script:IconPath) {
        $tray.Icon = New-Object System.Drawing.Icon($script:IconPath)
    } else {
        $tray.Icon = [System.Drawing.SystemIcons]::Application
    }
    $tray.ContextMenuStrip = $script:menu
    $tray.Add_DoubleClick({ Open-WebInBrowser })
    $tray.Visible = $true
    return $tray
}

function Build-TrayUi {
    $script:menu = New-Object System.Windows.Forms.ContextMenuStrip
    $null = Add-MenuItem $script:menu '打开 Web 界面' { Open-WebInBrowser }
    if ($script:HarnessRoot) {
        $script:hmrItem = Add-MenuItem $script:menu '启动插件热更新监听 (dev:web)' { Toggle-Hmr $script:hmrItem }
        $null = Add-MenuItem $script:menu '打开日志目录' { Open-LogDir }
        $null = Add-MenuItem $script:menu '重启 Web 服务' { Restart-Web }
    }
    [void]$script:menu.Items.Add((New-Object System.Windows.Forms.ToolStripSeparator))
    $null = Add-MenuItem $script:menu '退出（停止服务）' { Exit-Launcher }
    return (New-TrayIcon)
}

if ($Test) {
    "LauncherDir  = $($script:LauncherDir)"
    "HarnessRoot  = $($script:HarnessRoot)"
    if ($script:HarnessRoot) { "DepsInstalled = $(Test-HarnessDeps $script:HarnessRoot)" }
    "WebUrl       = $($script:WebUrl)"
    "pnpm         = $(Resolve-Pnpm)"
    $runner = Get-RunnerInfo
    if ($runner) {
        "runner.File  = $($runner.File)"
        "runner.Args  = $($runner.Args -join ' ')"
    } else {
        'runner       = <not found>'
    }
    "webReady     = $(Test-WebReady $script:WebUrl)"
    "portOwner    = $(Get-PortOwner $script:WebPort)"
    "iconExists   = $(Test-Path -LiteralPath $script:IconPath)"
    exit 0
}

if ($ShotMenu) {
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing
    $script:tray = Build-TrayUi
    $workArea = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
    $x = [Math]::Max($workArea.Left, $workArea.Right - 360)
    $y = [Math]::Max($workArea.Top, $workArea.Bottom - 300)
    $script:menu.Show((New-Object System.Drawing.Point($x, $y)))
    Start-Sleep -Seconds 90
    if ($script:tray) { $script:tray.Visible = $false; $script:tray.Dispose(); $script:tray = $null }
    exit 0
}

New-Item -ItemType Directory -Force -Path $script:LogDir | Out-Null

$script:mutex = New-Object System.Threading.Mutex($false, "Local\DSH-Web-Launcher-$($script:WebPort)")
if (-not $script:mutex.WaitOne(0)) {
    Open-WebInBrowser
    exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$script:tray = Build-TrayUi

if (-not $script:HarnessRoot) {
    $script:tray.Text = 'DeepSeek Harness Web（未找到仓库）'
    Show-ErrorBalloon '未找到 deepseek-harness 仓库。请运行 install.ps1 或用 -RepoRoot 指定路径。'
} elseif (Test-WebReady $script:WebUrl) {
    $script:AdoptedExternal = $true
    $script:tray.Text = 'DeepSeek Harness Web（运行中）'
    $script:tray.ShowBalloonTip(2500, 'DeepSeek Harness Web', '检测到服务已在运行，正在打开浏览器。', [System.Windows.Forms.ToolTipIcon]::Info)
    if (-not $NoBrowser) { Open-WebInBrowser }
} else {
    try {
        $script:WebServerProc = Start-WebServerProcess $script:HarnessRoot $script:LogDir
        $script:tray.Text = 'DeepSeek Harness Web（启动中）'
    } catch {
        Show-ErrorBalloon "启动失败：$($_.Exception.Message)"
    }
    if ($script:WebServerProc -and (Wait-WebReady $script:WebUrl $script:StartupTimeoutSec)) {
        $script:tray.Text = 'DeepSeek Harness Web（运行中）'
        $script:tray.ShowBalloonTip(2500, 'DeepSeek Harness Web', '服务已启动，正在打开浏览器。', [System.Windows.Forms.ToolTipIcon]::Info)
        if (-not $NoBrowser) { Open-WebInBrowser }
    } elseif (-not $script:WebServerProc) {
        $script:tray.Text = 'DeepSeek Harness Web（启动失败）'
    } elseif ($script:WebServerProc.HasExited) {
        Show-ErrorBalloon '服务进程已退出，请查看 logs\web-server.err.log。'
    } else {
        Show-ErrorBalloon '等待服务就绪超时，请查看 logs\ 下的日志。'
    }
}

[System.Windows.Forms.Application]::Run()

if ($script:HmrProc -and -not $script:HmrProc.HasExited) { Stop-ProcessTree $script:HmrProc.Id }
if ($script:mutex) {
    try { $script:mutex.ReleaseMutex() } catch { }
    $script:mutex.Dispose()
}
