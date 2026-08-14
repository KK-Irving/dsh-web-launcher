#Requires -Version 5.1
<#
.SYNOPSIS
生成文档截图到 docs\screenshots\（桌面快捷方式、托盘图标、托盘右键菜单）。
仅用于文档维护；截取的是本机真实屏幕与真实 start-web.ps1 弹出的右键菜单。

用法：powershell -NoProfile -ExecutionPolicy Bypass -File tools\capture-screenshots.ps1 [-OutDir <dir>]
#>
param(
    [string]$OutDir = (Join-Path (Split-Path -Parent $PSScriptRoot) 'docs\screenshots')
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
public static class CapWin {
    public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
    [DllImport("user32.dll")] public static extern IntPtr FindWindow(string cls, string name);
    [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool EnumChildWindows(IntPtr parent, EnumProc cb, IntPtr lParam);
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetClassName(IntPtr h, System.Text.StringBuilder sb, int max);
    [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left; public int Top; public int Right; public int Bottom; }
    public static List<IntPtr> FindTopWindows() {
        var list = new List<IntPtr>();
        EnumWindows((h, l) => { list.Add(h); return true; }, IntPtr.Zero);
        return list;
    }
    public static List<IntPtr> FindChildren(IntPtr parent, string cls) {
        var list = new List<IntPtr>();
        EnumChildWindows(parent, (h, l) => {
            var sb = new System.Text.StringBuilder(256);
            GetClassName(h, sb, 256);
            if (sb.ToString() == cls) { list.Add(h); }
            return true;
        }, IntPtr.Zero);
        return list;
    }
    public static string GetClass(IntPtr h) {
        var sb = new System.Text.StringBuilder(256);
        GetClassName(h, sb, 256);
        return sb.ToString();
    }
}
"@
[void][CapWin]::SetProcessDPIAware()

function Save-ScreenRegion([string]$Path, [int]$X, [int]$Y, [int]$W, [int]$H) {
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $x = [Math]::Max(0, [Math]::Min($X, $bounds.Width - 1))
    $y = [Math]::Max(0, [Math]::Min($Y, $bounds.Height - 1))
    $w = [Math]::Min($W, $bounds.Width - $x)
    $h = [Math]::Min($H, $bounds.Height - $y)
    if ($w -le 0 -or $h -le 0) { throw "截图区域无效 ($x,$y ${w}x${h})" }
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.CopyFromScreen($x, $y, 0, 0, (New-Object System.Drawing.Size($w, $h)))
    $g.Dispose()
    $bmp.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    return "${w}x${h}"
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

# ---- 1) 桌面图标区：枚举所有窗口的 SysListView32 子窗口，取面积最大者 ----
$desktopPath = Join-Path $OutDir 'desktop-shortcut.png'
$listRect = $null
$bestArea = 0
foreach ($top in [CapWin]::FindTopWindows()) {
    foreach ($lv in [CapWin]::FindChildren($top, 'SysListView32')) {
        $r = New-Object CapWin+RECT
        if ([CapWin]::GetWindowRect($lv, [ref]$r)) {
            $w = $r.Right - $r.Left
            $h = $r.Bottom - $r.Top
            $area = $w * $h
            if ($area -gt $bestArea) { $bestArea = $area; $listRect = $r }
        }
    }
}
if ($listRect -and ($listRect.Right - $listRect.Left) -gt 100 -and ($listRect.Bottom - $listRect.Top) -gt 60) {
    "DESKTOP_SHORTCUT " + (Save-ScreenRegion $desktopPath $listRect.Left $listRect.Top ($listRect.Right - $listRect.Left) ($listRect.Bottom - $listRect.Top))
} else {
    "DESKTOP_SHORTCUT SKIPPED (未找到桌面图标列表窗口)"
}

# ---- 2) 启动 -ShotMenu 实例：真实托盘图标 + 真实右键菜单 ----
$startScript = Join-Path (Split-Path -Parent $PSScriptRoot) 'start-web.ps1'
$shot = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-File', $startScript, '-ShotMenu') -PassThru -WindowStyle Hidden

# ---- 3) 等待菜单弹出：枚举顶层窗口，找右下角的 WindowsForms10* 菜单窗口（最多 20 秒）----
function Find-MenuRect {
    $found = @()
    foreach ($top in [CapWin]::FindTopWindows()) {
        $cls = [CapWin]::GetClass($top)
        if ($cls -notlike 'WindowsForms10*') { continue }
        $r = New-Object CapWin+RECT
        if (-not [CapWin]::GetWindowRect($top, [ref]$r)) { continue }
        $w = $r.Right - $r.Left
        $h = $r.Bottom - $r.Top
        if ($w -ge 120 -and $h -ge 120 -and $w -le 900 -and $h -le 900) {
            $found += New-Object PSObject -Property @{ Rect = $r; Score = ($r.Left + $r.Top) }
        }
    }
    if ($found.Count -eq 0) { return $null }
    # 选最靠右下（离托盘最近）的菜单窗口
    $best = $found | Sort-Object -Property Score -Descending | Select-Object -First 1
    return $best.Rect
}
$menuRect = $null
for ($i = 0; $i -lt 40; $i++) {
    $menuRect = Find-MenuRect
    if ($menuRect) { break }
    Start-Sleep -Milliseconds 500
}

$trayRect = $null
$trayHwnd = [CapWin]::FindWindow('Shell_TrayWnd', $null)
if ($trayHwnd -ne [IntPtr]::Zero) {
    $tr = New-Object CapWin+RECT
    if ([CapWin]::GetWindowRect($trayHwnd, [ref]$tr)) { $trayRect = $tr }
}

# ---- 4) 托盘图标特写（任务栏右端 340px）----
$trayPath = Join-Path $OutDir 'tray-icon.png'
if ($trayRect) {
    $th = $trayRect.Bottom - $trayRect.Top
    "TRAY_ICON " + (Save-ScreenRegion $trayPath ($trayRect.Right - 340) $trayRect.Top 340 $th)
} else {
    "TRAY_ICON SKIPPED (未找到任务栏)"
}

# ---- 5) 菜单特写 + 托盘与菜单同框 ----
$menuPath = Join-Path $OutDir 'tray-menu.png'
$overviewPath = Join-Path $OutDir 'tray-menu-overview.png'
if ($menuRect) {
    $mw = $menuRect.Right - $menuRect.Left
    $mh = $menuRect.Bottom - $menuRect.Top
    "TRAY_MENU " + (Save-ScreenRegion $menuPath ($menuRect.Left - 26) ($menuRect.Top - 26) ($mw + 52) ($mh + 52))
    if ($trayRect) {
        $ox = [Math]::Min($menuRect.Left - 26, $trayRect.Right - 380)
        $oy = [Math]::Min($menuRect.Top - 26, $trayRect.Top)
        $ow = [Math]::Max($menuRect.Right + 26, $trayRect.Right) - $ox
        $oh = [Math]::Max($menuRect.Bottom + 26, $trayRect.Bottom) - $oy
        "TRAY_MENU_OVERVIEW " + (Save-ScreenRegion $overviewPath $ox $oy $ow $oh)
    }
} else {
    # 回退：任务栏上方固定区域（菜单可能已显示但未能识别菜单窗口）
    if ($trayRect) {
        $th = $trayRect.Bottom - $trayRect.Top
        "TRAY_MENU FALLBACK " + (Save-ScreenRegion $menuPath ($trayRect.Right - 440) ($trayRect.Top - 320) 440 320)
        "TRAY_MENU_OVERVIEW FALLBACK " + (Save-ScreenRegion $overviewPath ($trayRect.Right - 440) ($trayRect.Top - 320) 440 (320 + $th))
    } else {
        "TRAY_MENU SKIPPED (未找到菜单窗口与任务栏)"
    }
}

# ---- 6) 清理：结束 ShotMenu 进程（菜单随之消失）----
if ($shot -and -not $shot.HasExited) {
    Stop-Process -Id $shot.Id -Force
    Start-Sleep -Milliseconds 300
}

"DONE_OUTDIR=$OutDir"
