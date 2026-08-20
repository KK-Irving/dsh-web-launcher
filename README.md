# DeepSeek Harness Web Launcher

One-click Windows launcher for the [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web UI: double-click a desktop shortcut to start the service, and control it from a taskbar tray icon.

> 中文说明见 [README.zh.md](README.zh.md)。

## Features

- Locates your `deepseek-harness` checkout automatically (explicit `-RepoRoot`, `DSH_REPO_ROOT` env var, `repo-root.txt`, or auto-discovery).
- Starts the Web UI with `pnpm dsh web` in a hidden window; no console window stays around.
- Opens `http://127.0.0.1:3080` in your default browser as soon as the service is ready.
- Shows a tray icon in the taskbar notification area with a right-click menu:
  - Open Web UI (double-clicking the tray icon does the same)
  - Start/stop HMR watcher (dev:web) (toggle the client-plugin HMR watcher)
  - Open log folder
  - Restart Web service
  - Exit (stop service)
- Single instance: launching it again just re-opens the browser.
- If a service started from a command line is already running on port 3080, the launcher adopts it; on exit it asks before stopping it.
- Configurable port via `-Port` parameter.
- Background health monitoring: notifies via balloon when the service process crashes.
- Automatic locale detection: UI text displays in Chinese or English based on system language.
- Logs go to `logs\` inside this repository.

## Screenshots

| Desktop shortcut | Tray icon | Right-click menu | Menu + taskbar |
| --- | --- | --- | --- |
| ![Desktop shortcut](docs/screenshots/desktop-shortcut.png) | ![Tray icon](docs/screenshots/tray-icon.png) | ![Tray menu](docs/screenshots/tray-menu.png) | ![Tray menu overview](docs/screenshots/tray-menu-overview.png) |

> Screenshots are captured from a real run with `tools\capture-screenshots.ps1`; re-run it to refresh them after UI changes.

## Requirements

- Windows 10/11 (uses Windows PowerShell 5.1, which is built in).
- Node.js and [pnpm](https://pnpm.io/) — use the same versions required by your `deepseek-harness` checkout (see its `engines` field in `package.json`). The launcher falls back to `npm`, then to a direct `node` call.
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
   # or with a custom port:
   powershell -NoProfile -ExecutionPolicy Bypass -File dsh-web-launcher\install.ps1 -RepoRoot "D:\code\deepseek-harness" -Port 8080
   ```
3. Double-click **DeepSeek Harness Web** on the desktop.

To pin to the taskbar: right-click the desktop shortcut → *Pin to taskbar*.

## Uninstall

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File dsh-web-launcher\install.ps1 -Uninstall
```

This removes the desktop shortcut and `repo-root.txt`. The launcher scripts and icon remain in place; delete the directory manually if no longer needed.

## How the harness checkout is located

Priority order:

1. `-RepoRoot <path>` argument (written into the desktop shortcut by `install.ps1`)
2. `DSH_REPO_ROOT` environment variable
3. `repo-root.txt` next to `start-web.ps1` (written by `install.ps1`, git-ignored)
4. Auto-discovery (structure-based scan, not limited to a specific folder name):
   - All subdirectories alongside and above the launcher (up to 4 levels)
   - Drive root: common names `deepseek-harness`, `dsh`, `DeepSeek`
   - All subdirectories under the user's home folder (`%USERPROFILE%`)

A directory is accepted when it contains `package.json`, `apps\cli\src\bin.ts`, and `apps\web\`. **The folder name does not matter** — the launcher identifies the harness purely by its internal structure, so you can name it anything you like.

When a matching directory is found, the launcher also checks its git remote. If the remote URL does not match `deepseek-harness`, a warning is displayed so you can confirm it's the right repo. Non-git directories (e.g. extracted archives) are accepted with a note.

## Usage

- Double-click the desktop shortcut, or run directly:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File start-web.ps1
  ```
- With a custom port:
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File start-web.ps1 -Port 8080
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
├── install.ps1                      # installer/uninstaller: locate harness + desktop shortcut
├── refresh-icon.ps1                 # regenerate dsh-web.ico
├── lib\common.ps1                   # shared helpers (checkout discovery, runners, probing, i18n)
├── tools\capture-screenshots.ps1    # documentation screenshot capture
├── docs\screenshots\                # screenshots referenced by the READMEs
├── dsh-web.ico                      # tray / shortcut icon
├── VERSION                          # launcher version identifier
├── logs\                            # runtime logs (git-ignored)
└── repo-root.txt                    # local checkout path (git-ignored)
```

## Troubleshooting

- **Tray balloon says the checkout was not found** — run `install.ps1 -RepoRoot "<path>"`, or set `DSH_REPO_ROOT`.
- **The service exits immediately** — open `logs\web-server.err.log`; usually missing `pnpm install` / `pnpm run build` in the checkout.
- **Port 3080 is occupied by another app** — the launcher treats a ready-but-not-dsh service as "already running" only when the response contains the `__DSH_BOOT__` marker; otherwise start-up fails and the log shows the port conflict. Use `-Port` to choose a different port.
- **Multiple checkouts on one machine** — run `install.ps1` per checkout; rename the first shortcut before installing the next one, since the shortcut name is fixed.
- **Tray icon is hidden** — drag it out of the taskbar overflow area ("Show hidden icons").
- **Balloon says service exited unexpectedly** — the health monitor checks every 30 seconds; open `logs\web-server.err.log` for details, then use the tray menu to restart.

## License

MIT — see [LICENSE](LICENSE).

This launcher is an auxiliary tool for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (MIT licensed) and does not vendor or copy any harness code. It only starts the harness binaries from your local checkout and reads the checkout's `apps/web/public/favicon.svg` when the icon is regenerated. The harness checkout itself is a separate repository governed by its own license; see the harness repository's LICENSE and THIRD_PARTY_NOTICES.md for the terms of the harness and its dependencies.