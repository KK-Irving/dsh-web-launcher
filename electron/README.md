# DSH Desktop (Electron)

Electron-based desktop client for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI. Provides a standalone window with tabs, extension support, and system integration — no default browser required.

## Features

- **Mixed mode**: automatically starts `pnpm dsh web` backend, or connects to an already-running service
- **Multi-tab**: Ctrl+T to open new tabs, Ctrl+W to close, Ctrl+R to reload, Ctrl+Tab / Ctrl+Shift+Tab to switch, middle-click to close
- **New Tab dashboard**: tray "New Tab" and Ctrl+T open a local start page with an address bar (browse any site in-client), editable bookmarks and live backend status
- **Theme sync**: changing appearance (light/dark/system) in DSH Settings recolors all New Tab pages *and* the tab bar in real time — also on OS preference change
- **System tray**: close the window to minimize to tray; double-click tray icon to restore
- **Global shortcut**: `Alt+D` to toggle window visibility (configurable)
- **Chrome extensions**: load unpacked Chrome extensions (Manifest V2/V3) via the tray menu
- **Auto-update**: checks GitHub Releases for new versions, downloads and installs on user confirmation
- **Auto-discovery**: finds the harness repo by directory structure (not folder name)
- **Single instance**: launching again brings the existing window to front
- **Health monitor**: detects backend crashes and updates tray status
- **Tab persistence**: open tabs survive app restart
- **Window state restore**: normal bounds/position vs maximized are remembered across launches
- **Debug log**: opt-in via tray menu (`调试日志`) — includes captured backend output so failed startups are diagnosable
- **Browsing isolation**: external websites opened in tabs cannot invoke desktop IPC (config writes, backend control, update flows); only local pages and the harness origin can

## Quick Start

**一键安装并启动（推荐）：**

```powershell
# PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -File electron\scripts\setup.ps1

# 或双击
electron\scripts\setup.bat
```

**手动执行：**

```bash
cd electron
pnpm install       # 安装依赖（首次 + Electron 二进制下载）
pnpm start         # 启动桌面客户端
```

> 前提：harness 仓库已构建（`pnpm install && pnpm run build`）。首次启动时客户端会自动定位仓库。

## Development

```bash
cd electron
pnpm dev    # starts with DevTools enabled
```

## Build Distributable

```powershell
# 一键打包（安装 + 构建安装程序）
powershell -NoProfile -ExecutionPolicy Bypass -File electron\scripts\setup.ps1 -Build

# 或手动
cd electron
pnpm build:win        # NSIS installer + portable exe → dist/
pnpm build:portable   # portable exe only
pnpm pack             # unpacked directory (for testing)
```

## Harness Update (one-click)

客户端内置了 harness 仓库的更新检测：

- **托盘右键 → 「检查 Harness 更新」**
- 自动执行 `git fetch` → 比较本地/远程 HEAD
- 发现更新后提示一键执行：`git pull --ff-only` → `pnpm install` → `pnpm run build`
- 更新完成后可选立即重启后端服务

这意味着用户**无需手动操作命令行**，harness 更新后客户端可以无痛继续使用。

也可以通过 preload API 在页面内调用：

```js
// 检查是否有更新
const status = await window.dshDesktop.checkHarnessUpdate()
// { hasUpdate: true, behind: 3, branch: 'master', currentHead: '...', remoteHead: '...' }

// 执行更新
const result = await window.dshDesktop.updateHarness()
// { ok: true, output: '...' }
```

The built app includes auto-update support via GitHub Releases (electron-updater reads `latest.yml` from the release assets). To publish:

1. Bump `version` in `electron/package.json` and keep the root `VERSION` file in sync
2. Tag it: `git tag vX.Y.Z && git push --tags`
3. Build with `pnpm build:win`, then create a GitHub Release with the tag
4. Attach **all** artifacts from `electron/dist/`: installer `.exe`, portable `.exe`, the matching `.blockmap`, and `latest.yml` — without `latest.yml` + blockmap running clients cannot detect or delta-update
5. Running apps will detect the new release automatically

## Keyboard Shortcuts

| Shortcut                          | Action                                           |
| --------------------------------- | ------------------------------------------------ |
| `Alt+D`                         | Toggle window (global, works when app is hidden) |
| `Ctrl+T`                        | New tab (opens the local New Tab page)           |
| `Ctrl+W`                        | Close current tab                                |
| `Ctrl+R`                        | Reload current tab                               |
| `Ctrl+Tab` / `Ctrl+Shift+Tab` | Next / previous tab (wrap-around)                |
| `F12`                           | Toggle DevTools for the current tab              |
| Middle-click tab                  | Close that tab                                   |

Shortcuts work regardless of which view has keyboard focus — they are registered as hidden application-menu accelerators (no menu bar is rendered).

## Chrome Extensions

Load unpacked Chrome extensions via:

- Tray menu → Extensions → Add Extension
- Select the extension's root directory (must contain `manifest.json`)

Extensions persist across restarts. Supports Manifest V2 and V3 unpacked extensions. To remove, use the tray menu or delete the path from `%APPDATA%/dsh-desktop/config.json`.

> Note: `.crx` packed extensions are not directly supported by Electron's `session.loadExtension`. Unpack them first.

## Configuration

Settings stored at `%APPDATA%/dsh-desktop/config.json`:

| Key                  | Default         | Description                                                                                      |
| -------------------- | --------------- | ------------------------------------------------------------------------------------------------ |
| `harnessRoot`      | (auto-detected) | Path to deepseek-harness repo                                                                    |
| `port`             | `3080`        | Web service port                                                                                 |
| `host`             | `127.0.0.1`   | Web service host                                                                                 |
| `globalShortcut`   | `Alt+D`       | Toggle window visibility                                                                         |
| `minimizeToTray`   | `true`        | Close button minimizes to tray                                                                   |
| `startMinimized`   | `false`       | Start hidden (tray only)                                                                         |
| `autoStartBackend` | `true`        | Auto-start`pnpm dsh web`                                                                       |
| `autoUpdate`       | `true`        | Check GitHub for updates                                                                         |
| `tabs`             | `[]`          | Persisted tab URLs (auto-managed)                                                                |
| `extensions`       | `[]`          | Chrome extension directory paths                                                                 |
| `language`         | `'zh'`        | UI language (`'zh'` / `'en'`)                                                                |
| `theme`            | `'system'`    | New Tab page & tab bar palette (`'system'` / `'dark'` / `'light'`, follows DSH appearance) |
| `bookmarks`        | built-ins       | New Tab page bookmarks (`null` = defaults)                                                     |
| `debugLog`         | `false`       | Write startup/runtime logs incl. backend output; toggle from tray menu                           |
| `windowBounds`     | `1280×860`   | Last window size/position + maximized flag (auto-managed)                                        |

## Architecture

```
electron/
├── package.json                     # Electron + electron-builder config
├── src/
│   ├── main/
│   │   ├── index.js                 # Main process: window, tray, tabs, backend, extensions, updater
│   │   └── locale.js                # i18n dictionary (zh/en) — all main-process user-facing strings
│   ├── preload/
│   │   └── index.js                 # Context bridge: safe IPC for shell, content views and theme sync
│   └── assets/
│       ├── shell.html               # Tab bar UI (themed via CSS variables + dsh-theme channel)
│       ├── newtab.html              # New Tab dashboard (address bar, bookmarks, status)
│       ├── splash.html              # Startup splash with rotating tips
│       └── update-progress.html     # Harness/launcher update progress steps + log
└── dist/                            # Build output (git-ignored)
```

The app uses a `BrowserView` per tab — each tab is an independent web view loading the DSH Web UI or any other site. The main window only renders the tab bar (`shell.html`). This keeps tabs isolated and allows each to have its own navigation state.

> **IPC trust boundary**: every tab view shares the preload bridge, so all privileged IPC handlers validate the sender frame origin — only local app pages (`file://`) and the harness host may call them. Arbitrary websites in tabs get the bridge but their calls are dropped and logged.

## Comparison with PowerShell Launcher

| Feature                  | PowerShell launcher  | Electron desktop                                                                                 |
| ------------------------ | -------------------- | ------------------------------------------------------------------------------------------------ |
| System tray              | ✅                   | ✅                                                                                               |
| Opens in browser         | ✅ (default browser) | ❌ (own window)                                                                                  |
| Multi-tab                | ❌                   | ✅                                                                                               |
| Chrome extensions        | ❌                   | ✅                                                                                               |
| Global shortcut          | ❌                   | ✅                                                                                               |
| Auto-update              | ❌                   | ✅                                                                                               |
| Requires Node.js + pnpm  | ✅                   | ✅ (host toolchain needed — the backend is spawned externally, only Electron itself is bundled) |
| File size                | ~50 KB scripts       | ~80 MB packaged installers                                                                       |
| Cross-platform potential | Windows only         | Windows-only today (macOS/Linux would need shell-layer & icon pipeline replacements)             |

Both versions coexist in this repository. Use whichever fits your workflow.
