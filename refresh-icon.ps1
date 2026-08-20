#Requires -Version 5.1
<#
.SYNOPSIS
重新生成 dsh-web.ico。优先用 Edge 无头模式渲染 deepseek-harness 仓库的
apps/web/public/favicon.svg 并提取鲸鱼 logo，失败时降级为内置样式图标（蓝色圆角方块 + DSH 字样）。

.PARAMETER OutIco
输出图标路径（默认 <launcher>\dsh-web.ico）。
.PARAMETER RepoRoot
deepseek-harness 仓库根路径（可选，默认自动解析）。
#>
param(
    [string]$OutIco = (Join-Path $PSScriptRoot 'dsh-web.ico'),
    [string]$RepoRoot = ''
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0
. (Join-Path $PSScriptRoot 'lib\common.ps1')

$script:HarnessRoot = Resolve-HarnessRoot $RepoRoot
$script:FaviconPath = $null
if ($script:HarnessRoot) {
    $candidate = Join-Path $script:HarnessRoot 'apps\web\public\favicon.svg'
    if (Test-Path -LiteralPath $candidate) { $script:FaviconPath = $candidate }
}

Add-Type -AssemblyName System.Drawing

function Get-EdgePath {
    $candidates = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft\Edge\Application\msedge.exe')
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    return $null
}

function Resize-Image([System.Drawing.Bitmap]$Source, [int]$Size) {
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.DrawImage($Source, 0, 0, $Size, $Size)
    $g.Dispose()
    return $bmp
}

function New-TextIcon([int]$Size) {
    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $radius = [int]([Math]::Max(4, $Size * 0.22))
    $diameter = 2 * $radius
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $diameter, $diameter, 180, 90)
    $path.AddArc($Size - $diameter, 0, $diameter, $diameter, 270, 90)
    $path.AddArc($Size - $diameter, $Size - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc(0, $Size - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush($rect, [System.Drawing.Color]::FromArgb(255, 77, 107, 254), [System.Drawing.Color]::FromArgb(255, 58, 77, 222), 60.0)
    $g.FillPath($brush, $path)
    $font = New-Object System.Drawing.Font('Segoe UI', ([float]($Size * 0.40)), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textRect = New-Object System.Drawing.RectangleF(0, 0, $Size, $Size)
    $g.DrawString('DSH', $font, [System.Drawing.Brushes]::White, $textRect, $format)
    $format.Dispose(); $font.Dispose(); $brush.Dispose(); $path.Dispose(); $g.Dispose()
    return $bmp
}

function New-WhaleMaster {
    if (-not $script:FaviconPath) { throw '未找到 favicon.svg' }
    $edge = Get-EdgePath
    if (-not $edge) { throw '未找到 Edge 浏览器' }
    $tmpDir = Join-Path $PSScriptRoot 'tmp'
    New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
    $svgUri = 'file:///' + ($script:FaviconPath -replace '\\', '/')
    $wrapPath = Join-Path $tmpDir 'favicon-wrap.html'
    $html = "<!doctype html><meta name=`"color-scheme`" content=`"dark`"><body style=`"margin:0;background:#000`"><img src=`"$svgUri`" width=`"256`" height=`"256`"></body>"
    [System.IO.File]::WriteAllText($wrapPath, $html)
    $shotPath = Join-Path $tmpDir 'favicon-shot.png'
    if (Test-Path -LiteralPath $shotPath) { Remove-Item -LiteralPath $shotPath -Force }
    $profileDir = Join-Path $tmpDir 'edge-profile'
    $wrapUri = 'file:///' + ($wrapPath -replace '\\', '/')
    $edgeArgs = @(
        '--headless=new',
        '--disable-gpu',
        '--hide-scrollbars',
        '--force-dark-mode',
        '--no-first-run',
        "--user-data-dir=$profileDir",
        '--virtual-time-budget=3000',
        '--run-all-compositor-stages-before-draw',
        '--window-size=256,256',
        "--screenshot=$shotPath",
        $wrapUri
    )
    $null = Start-Process -FilePath $edge -ArgumentList $edgeArgs -Wait -PassThru -WindowStyle Hidden
    if (-not (Test-Path -LiteralPath $shotPath)) { throw 'Edge 未生成截图' }
    $source = [System.Drawing.Bitmap]::FromFile($shotPath)
    if ($source.Width -lt 64 -or $source.Height -lt 64) { throw '截图尺寸异常' }

    # 使用 LockBits 批量操作像素（比逐像素 GetPixel/SetPixel 快 50-100 倍）
    $master = New-Object System.Drawing.Bitmap(256, 256, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $srcRect = New-Object System.Drawing.Rectangle(0, 0, $source.Width, $source.Height)
    $dstRect = New-Object System.Drawing.Rectangle(0, 0, 256, 256)
    $srcData = $source.LockBits($srcRect, [System.Drawing.Imaging.ImageLockMode]::ReadOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $dstData = $master.LockBits($dstRect, [System.Drawing.Imaging.ImageLockMode]::WriteOnly, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $pixelCount = 256 * 256
    $srcBytes = New-Object byte[] ($pixelCount * 4)
    $dstBytes = New-Object byte[] ($pixelCount * 4)
    [System.Runtime.InteropServices.Marshal]::Copy($srcData.Scan0, $srcBytes, 0, $srcBytes.Length)
    $opaque = 0
    for ($i = 0; $i -lt $pixelCount; $i++) {
        $offset = $i * 4
        # BGRA format
        $b = $srcBytes[$offset]
        $g2 = $srcBytes[$offset + 1]
        $r = $srcBytes[$offset + 2]
        $luminance = [int](0.299 * $r + 0.587 * $g2 + 0.114 * $b)
        $alpha = [int]([Math]::Min(255, [Math]::Max(0, ($luminance - 24) * 1.6)))
        if ($alpha -gt 0) {
            $dstBytes[$offset] = 254       # B
            $dstBytes[$offset + 1] = 107   # G
            $dstBytes[$offset + 2] = 77    # R
            $dstBytes[$offset + 3] = $alpha # A
            if ($alpha -gt 200) {
                $px = $i % 256
                $py = [Math]::Floor($i / 256)
                if (($px % 4 -eq 0) -and ($py % 4 -eq 0)) { $opaque++ }
            }
        }
        # else: stays 0,0,0,0 (transparent)
    }
    [System.Runtime.InteropServices.Marshal]::Copy($dstBytes, 0, $dstData.Scan0, $dstBytes.Length)
    $source.UnlockBits($srcData)
    $master.UnlockBits($dstData)
    $source.Dispose()

    if ($opaque -lt 40) { throw '提取的 logo 过于稀疏' }
    return $master
}

function Save-Png([System.Drawing.Bitmap]$Bitmap, [string]$Path) {
    $Bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
}

function New-Ico([System.Drawing.Bitmap]$Master, [string]$OutPath) {
    $tmpDir = Join-Path $PSScriptRoot 'tmp'
    New-Item -ItemType Directory -Force -Path $tmpDir | Out-Null
    $sizes = @(256, 64, 48, 32, 16)
    $entries = @()
    foreach ($size in $sizes) {
        $bitmap = $Master
        if ($size -ne 256) { $bitmap = Resize-Image $Master $size }
        $pngPath = Join-Path $tmpDir "icon-$size.png"
        Save-Png $bitmap $pngPath
        $entries += New-Object PSObject -Property @{ Size = $size; PngPath = $pngPath }
    }
    $stream = New-Object System.IO.MemoryStream
    $writer = New-Object System.IO.BinaryWriter($stream)
    $writer.Write([UInt16]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]$entries.Count)
    $offset = 6 + 16 * $entries.Count
    foreach ($entry in $entries) {
        $bytes = [System.IO.File]::ReadAllBytes($entry.PngPath)
        $dim = $entry.Size
        if ($dim -ge 256) { $dim = 0 }
        $writer.Write([Byte]$dim)
        $writer.Write([Byte]$dim)
        $writer.Write([Byte]0)
        $writer.Write([Byte]0)
        $writer.Write([UInt16]1)
        $writer.Write([UInt16]32)
        $writer.Write([UInt32]$bytes.Length)
        $writer.Write([UInt32]$offset)
        $offset += $bytes.Length
    }
    foreach ($entry in $entries) {
        $writer.Write([System.IO.File]::ReadAllBytes($entry.PngPath))
    }
    $writer.Flush()
    [System.IO.File]::WriteAllBytes($OutPath, $stream.ToArray())
    $writer.Dispose()
    $stream.Dispose()
}

try {
    $master = New-WhaleMaster
    "ICON_SOURCE=whale"
} catch {
    "ICON_SOURCE=fallback ($($_.Exception.Message))"
    $master = New-TextIcon 256
}
New-Ico -Master $master -OutPath $OutIco
"WROTE=$OutIco"
$master.Dispose()

# 清理临时目录
$tmpDir = Join-Path $PSScriptRoot 'tmp'
if (Test-Path -LiteralPath $tmpDir) {
    Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
}