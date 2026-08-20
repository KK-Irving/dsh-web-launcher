# DeepSeek Harness Web 启动器

> **v2.0.2** — 新增 [Electron 桌面客户端](#electron-桌面客户端)：多标签页、Chrome 扩展、Harness 一键更新。

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 界面的 Windows 启动方案，提供两种模式：

- **PowerShell 启动器** — 轻量托盘图标，用默认浏览器打开
- **Electron 桌面客户端** — 独立窗口，多标签页、扩展支持、全局快捷键、Harness 自动更新

> English guide: [README.md](README.md)。

---

## Electron 桌面客户端

独立桌面应用，无需浏览器。完整文档见 [`electron/README.md`](electron/README.md)。

### 快速开始

```powershell
# 一键安装并启动：
powershell -NoProfile -ExecutionPolicy Bypass -File electron\scripts\setup.ps1

# 或手动：
cd electron
pnpm install
pnpm start
```

### 主要功能

- **多标签页** — Ctrl+T 新建、Ctrl+W 关闭、中键关闭、标签持久化
- **系统托盘** — 关闭窗口最小化到托盘，双击恢复
- **全局快捷键** — Alt+D 切换窗口显示/隐藏
- **Chrome 扩展** — 通过托盘菜单加载未打包的 Chrome 扩展
- **Harness 一键更新** — 托盘菜单中检查更新，一键 `git pull` + `pnpm install` + `pnpm run build`
- **客户端自动更新** — 检查 GitHub Releases 的新版本
- **中英文切换** — 默认中文，可在设置中切换为英文
- **无默认菜单栏** — 简洁界面，启动即最大化

### 打包分发

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File electron\scripts\setup.ps1 -Build
# 产物：electron\dist\（NSIS 安装程序 + 便携版 exe）
```

---

## PowerShell 启动器（经典模式）

原始的轻量托盘图标启动器 — 在默认浏览器中打开 DSH Web。

### 功能特性

- 自动定位 `deepseek-harness` 仓库（`-RepoRoot` 参数 > `DSH_REPO_ROOT` 环境变量 > `repo-root.txt` > 结构化自动发现）。
- 以隐藏窗口运行 `pnpm dsh web` 启动 Web 服务，不残留命令行窗口。
- 服务就绪后自动用默认浏览器打开 `http://127.0.0.1:3080`。
- 任务栏通知区域显示托盘图标，右键菜单：
  - 打开 Web 界面（双击托盘图标等效）
  - 启动/停止插件热更新监听 (dev:web)
  - 打开日志目录
  - 重启 Web 服务
  - 退出（停止服务）
- 单实例运行：重复双击只会再次打开浏览器。
- 若端口已有命令行启动的服务，启动器会"接管"它；退出时先询问是否一并停止。
- 支持通过 `-Port` 参数自定义端口。
- 后台健康监控：服务进程意外退出时弹出气泡通知。
- 自动语言检测：根据系统语言显示中文或英文界面。
- 运行日志写入本仓库 `logs\` 目录。

### 截图

| 桌面快捷方式 | 托盘图标 | 右键菜单 | 菜单与任务栏同框 |
| --- | --- | --- | --- |
| ![桌面快捷方式](docs/screenshots/desktop-shortcut.png) | ![托盘图标](docs/screenshots/tray-icon.png) | ![托盘右键菜单](docs/screenshots/tray-menu.png) | ![托盘菜单概览](docs/screenshots/tray-menu-overview.png) |

### 安装

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1
# 或显式指定路径：
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -RepoRoot "D:\code\deepseek-harness"
```

### 卸载

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File install.ps1 -Uninstall
```

---

## 环境要求

- Windows 10/11
- Node.js 与 [pnpm](https://pnpm.io/) — 使用与 `deepseek-harness` 仓库 `package.json` 中 `engines` 字段一致的版本。
- 一个已安装依赖的 `deepseek-harness` 仓库：
  ```sh
  cd <仓库路径>
  pnpm install
  pnpm run build   # 构建 apps/web，首次启动前需要
  ```

## 仓库定位顺序

两种模式共用相同的定位逻辑：

1. `-RepoRoot <路径>` 参数 / 存储的配置
2. `DSH_REPO_ROOT` 环境变量
3. `start-web.ps1` 同级的 `repo-root.txt`（`install.ps1` 写入，已 git 忽略）
4. 自动发现（基于目录结构扫描，不限定文件夹名称）：
   - 启动器同级及上层目录（最多 4 层）的所有子文件夹
   - 当前盘根下的常见名称：`deepseek-harness`、`dsh`、`DeepSeek`
   - 用户主目录（`%USERPROFILE%`）下的所有子文件夹

目录需同时包含 `package.json`、`apps\cli\src\bin.ts` 和 `apps\web\` 才会被认可。**文件夹名称不限** — 启动器完全通过内部目录结构识别 harness 仓库，因此你可以使用任意名称。

找到目录后会检查其 git remote 地址。如果 remote URL 看起来不像 `deepseek-harness`，会显示提示供你确认。非 git 目录（如解压缩的源码包）也能正常使用。

## 目录结构

```
dsh-web-launcher/
├── electron/                        # Electron 桌面客户端 (v2.0)
│   ├── package.json                 # Electron + 打包配置
│   ├── README.md                    # Electron 完整文档
│   ├── scripts/
│   │   ├── setup.ps1                # 一键安装 + 启动
│   │   └── setup.bat                # 同上（cmd.exe 版）
│   └── src/
│       ├── main/index.js            # 主进程（窗口/托盘/标签/后端/扩展/更新）
│       ├── main/locale.js           # 国际化字符串（中/英）
│       ├── preload/index.js         # 安全桥接（IPC）
│       └── assets/shell.html        # 标签栏 UI
├── start-web.ps1                    # PowerShell 启动器（托盘图标 + 服务控制）
├── install.ps1                      # PowerShell 安装/卸载器
├── refresh-icon.ps1                 # 重新生成 dsh-web.ico
├── lib\common.ps1                   # 共享函数库（仓库定位、启动命令、端口检测、国际化）
├── tools\capture-screenshots.ps1    # 文档截图工具
├── docs\screenshots\                # README 引用的截图
├── dsh-web.ico                      # 托盘 / 快捷方式图标
├── VERSION                          # 项目版本（2.0.0）
├── logs\                            # 运行日志（git 忽略）
└── repo-root.txt                    # 本机 harness 仓库路径（git 忽略）
```

## 常见问题

- **托盘提示"未找到仓库"** — 运行 `install.ps1 -RepoRoot "<路径>"`，或设置 `DSH_REPO_ROOT`。
- **服务启动后立刻退出** — 查看 `logs\web-server.err.log`，通常是仓库未执行 `pnpm install` / `pnpm run build`。
- **端口被其他程序占用** — 只有响应包含 `__DSH_BOOT__` 标记时才会判定为"已有 dsh 服务"；否则启动失败并在日志中体现端口冲突。可使用 `-Port` 指定其他端口。
- **Electron「检查更新」报错** — 确保 `git` 在系统 PATH 中，且 harness 目录是一个配置了 remote 的 git 仓库。
- **一台机器多个 harness 仓库** — 每个仓库各运行一次 `install.ps1`；快捷方式名称固定，装第二个前先重命名已有快捷方式。
- **托盘图标被收纳** — 从任务栏"显示隐藏的图标"中拖出即可。
- **气泡提示"服务进程已意外退出"** — 健康监控每 30 秒检测一次；查看 `logs\web-server.err.log` 了解详情，然后通过托盘菜单重启。

## 许可

MIT 许可，见 [LICENSE](LICENSE)。

本启动器是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT 许可）的辅助工具，未内置或复制任何 harness 代码：它只是在你本地的 harness 仓库上启动服务，并在生成图标时读取该仓库的 `apps/web/public/favicon.svg`。harness 仓库是独立项目，其本身及第三方依赖的许可条款以该仓库内的 LICENSE 与 THIRD_PARTY_NOTICES.md 为准。