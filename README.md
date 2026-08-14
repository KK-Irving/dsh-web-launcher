# DeepSeek Harness Web Launcher

One-click Windows launcher for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI: double-click a desktop shortcut to start the service, and control it from a taskbar tray icon.

> 中文说明见 [README.zh.md](README.zh.md)。

## Features

- Locates your `deepseek-harness` checkout automatically (explicit `-RepoRoot`, `DSH_REPO_ROOT` env var, `repo-root.txt`, or auto-discovery).
- Starts the Web UI with `pnpm dsh web` in a hidden window; no console window stays around.
- Opens `http://127.0.0.1:3080` in your default browser as soon as the service is ready.
- Shows a tray icon in the taskbar notification area with a right-click menu:
  - 打开 Web 界面 (open the Web UI; double-clicking the tray icon does the same)
  - 启动插件热更新监听 (dev:web) (toggle the client-plugin HMR watcher)
  - 打开日志目录 (open the log folder)
  - 重启 Web 服务 (restart the service)
  - 退出（停止服务） (exit and stop the service)
- Single instance: launching it again just re-opens the browser.
- If a service started from a command line is already running on port 3080, the launcher adopts it; on exit it asks before stopping it.
- Logs go to `logs\` inside this repository.

## Screenshots

| Desktop shortcut | Tray icon | Right-click menu | Menu + taskbar |
| --- | --- | --- | --- |
| ![Desktop shortcut](docs/screenshots/desktop-shortcut.png) | ![Tray icon](docs/screenshots/tray-icon.png) | ![Tray menu](docs/screenshots/tray-menu.png) | ![Tray menu overview](docs/screenshots/tray-menu-overview.png) |

> Screenshots are captured from a real run with `tools\capture-screenshots.ps1`; re-run it to refresh them after UI changes.

## Requirements

- Windows 10/11 (uses Windows PowerShell 5.1, which is built in).
- Node.js ^22.19 || >=24 and [pnpm](https://pnpm.io/) (the launcher falls back to `npm`, then to a direct `node` call).
- A `deepseek-harness` checkout with dependencies installed:
  ```sh
  cd <your-checkout>
  pnpm install
  pnpm run build   # builds apps/web; required before the first launch
  ```

## Install (any user, any path)

1. Clone this repository anywhere, for example:
   ```sh
   git clone <this-repo-url> dsh-web-launcher
   ```
2. Run the installer. It locates the harness checkout, writes the local config, and creates the desktop shortcut:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File dsh-web-launcher\install.ps1
   # or with an explicit checkout path:
   powershell -NoProfile -ExecutionPolicy Bypass -File dsh-web-launcher\install.ps1 -RepoRoot "D:\code\deepseek-harness"
   ```
3. Double-click **DeepSeek Harness Web** on the desktop.

To pin to the taskbar: right-click the desktop shortcut → *Pin to taskbar*.

## How the harness checkout is located

Priority order:

1. `-RepoRoot <path>` argument (written into the desktop shortcut by `install.ps1`)
2. `DSH_REPO_ROOT` environment variable
3. `repo-root.txt` next to `start-web.ps1` (written by `install.ps1`, git-ignored)
4. Auto-discovery: a sibling `deepseek-harness` folder, up to 4 levels up, then `<drive>:\deepseek-harness`

A directory is accepted when it contains `package.json` and `apps\cli\src\bin.ts`.

## Usage

- Double-click the desktop shortcut, or run directly:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File start-web.ps1
  ```
- Self-check mode (prints environment info and exits):
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File start-web.ps1 -Test
  ```
- Regenerate the icon (renders the whale logo from `apps/web/public/favicon.svg` via headless Edge; falls back to a built-in style icon):
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File refresh-icon.ps1
  ```
- Refresh the documentation screenshots:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\capture-screenshots.ps1
  ```

## Repository layout

```
dsh-web-launcher/
├── start-web.ps1                    # main launcher (tray icon + service control)
├── install.ps1                      # installer: locate harness + desktop shortcut
├── refresh-icon.ps1                 # regenerate dsh-web.ico
├── lib\common.ps1                   # shared helpers (checkout discovery, runners, probing)
├── tools\capture-screenshots.ps1    # documentation screenshot capture
├── docs\screenshots\                # screenshots referenced by the READMEs
├── dsh-web.ico                      # tray / shortcut icon
├── logs\                            # runtime logs (git-ignored)
└── repo-root.txt                    # local checkout path (git-ignored)
```

## Troubleshooting

- **Tray balloon says the checkout was not found** — run `install.ps1 -RepoRoot "<path>"`, or set `DSH_REPO_ROOT`.
- **The service exits immediately** — open `logs\web-server.err.log`; usually missing `pnpm install` / `pnpm run build` in the checkout.
- **Port 3080 is occupied by another app** — the launcher treats a ready-but-not-dsh service as "already running" only when the response contains the `__DSH_BOOT__` marker; otherwise start-up fails and the log shows the port conflict.
- **Multiple checkouts on one machine** — run `install.ps1` per checkout; rename the first shortcut before installing the next one, since the shortcut name is fixed.
- **Tray icon is hidden** — drag it out of the taskbar overflow area ("Show hidden icons").

## License

MIT — see [LICENSE](LICENSE).

This launcher is an auxiliary tool for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (MIT licensed) and does not vendor or copy any harness code. It only starts the harness binaries from your local checkout and reads the checkout's `apps/web/public/favicon.svg` when the icon is regenerated. The harness checkout itself is a separate repository governed by its own license; see the harness repository's LICENSE and THIRD_PARTY_NOTICES.md for the terms of the harness and its dependencies.
