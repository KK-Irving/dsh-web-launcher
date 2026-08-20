# DeepSeek Harness Web 一键启动器

[DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web 界面的 Windows 一键启动方案：双击桌面快捷方式启动服务，通过任务栏托盘图标管理，无需命令行。

> English guide: [README.md](README.md)。

## 功能特性

- 自动定位 `deepseek-harness` 仓库（`-RepoRoot` 参数 > `DSH_REPO_ROOT` 环境变量 > `repo-root.txt` > 自动发现）。
- 以隐藏窗口运行 `pnpm dsh web` 启动 Web 服务，不残留命令行窗口。
- 服务就绪后自动用默认浏览器打开 `http://127.0.0.1:3080`。
- 任务栏通知区域显示托盘图标，右键菜单：
  - 打开 Web 界面（双击托盘图标等效）
  - 启动/停止插件热更新监听 (dev:web)（切换 client-plugin 的 HMR 监听）
  - 打开日志目录
  - 重启 Web 服务
  - 退出（停止服务）
- 单实例运行：重复双击只会再次打开浏览器。
- 若端口已有命令行启动的服务，启动器会"接管"它；退出时先询问是否一并停止。
- 支持通过 `-Port` 参数自定义端口。
- 后台健康监控：服务进程意外退出时弹出气泡通知。
- 自动语言检测：根据系统语言显示中文或英文界面。
- 运行日志写入本仓库 `logs\` 目录。

## 截图

| 桌面快捷方式 | 托盘图标 | 右键菜单 | 菜单与任务栏同框 |
| --- | --- | --- | --- |
| ![桌面快捷方式](docs/screenshots/desktop-shortcut.png) | ![托盘图标](docs/screenshots/tray-icon.png) | ![托盘右键菜单](docs/screenshots/tray-menu.png) | ![托盘菜单概览](docs/screenshots/tray-menu-overview.png) |

> 截图由 `tools\capture-screenshots.ps1` 从真实运行中截取；界面变化后可重新运行刷新。

## 环境要求

- Windows 10/11（使用系统内置的 Windows PowerShell 5.1，无需额外安装）。
- Node.js 与 [pnpm](https://pnpm.io/) —— 使用与 `deepseek-harness` 仓库 `package.json` 中 `engines` 字段一致的版本。无 pnpm 时依次回退到 npm、直接 node 调用。
- 一个已安装依赖的 `deepseek-harness` 仓库：
  ```sh
  cd <仓库路径>
  pnpm install
  pnpm run build   # 构建 apps/web，首次启动前需要
  ```

## 安装（任意用户、任意路径）

1. 将本仓库 clone 到任意位置，例如：
   ```sh
   git clone <本仓库地址> dsh-web-launcher
   ```
2. 运行安装器：自动定位 harness 仓库、写入本机配置、创建桌面快捷方式：
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File dsh-web-launcher\install.ps1
   # 或显式指定仓库路径：
   powershell -NoProfile -ExecutionPolicy Bypass -File dsh-web-launcher\install.ps1 -RepoRoot "D:\code\deepseek-harness"
   # 或指定自定义端口：
   powershell -NoProfile -ExecutionPolicy Bypass -File dsh-web-launcher\install.ps1 -RepoRoot "D:\code\deepseek-harness" -Port 8080
   ```
3. 双击桌面上的 **DeepSeek Harness Web** 即可。

固定到任务栏：右键桌面快捷方式 → 固定到任务栏。

## 卸载

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File dsh-web-launcher\install.ps1 -Uninstall
```

此操作删除桌面快捷方式和 `repo-root.txt`。启动器脚本和图标文件保留在当前目录，如不再需要可手动删除整个目录。

## 仓库定位顺序

1. `-RepoRoot <路径>` 参数（`install.ps1` 会把它写入桌面快捷方式）
2. `DSH_REPO_ROOT` 环境变量
3. `start-web.ps1` 同级的 `repo-root.txt`（`install.ps1` 写入，已 git 忽略）
4. 自动发现（基于目录结构扫描，不限定文件夹名称）：
   - 启动器同级及上层目录（最多 4 层）的所有子文件夹
   - 当前盘根下的常见名称：`deepseek-harness`、`dsh`、`DeepSeek`
   - 用户主目录（`%USERPROFILE%`）下的所有子文件夹

目录需同时包含 `package.json`、`apps\cli\src\bin.ts` 和 `apps\web\` 才会被认可。**文件夹名称不限** —— 启动器完全通过内部目录结构识别 harness 仓库，因此你可以使用任意名称。

找到目录后，启动器还会检查其 git remote 地址。如果 remote URL 看起来不像 `deepseek-harness`，会显示黄色提示供你确认。非 git 目录（如解压缩的源码包）也能正常使用，仅显示一条提示信息。

## 使用

- 双击桌面快捷方式，或直接运行：
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File start-web.ps1
  ```
- 指定自定义端口：
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File start-web.ps1 -Port 8080
  ```
- 自检模式（打印环境信息后退出）：
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File start-web.ps1 -Test
  ```
- 重新生成图标（用 Edge 无头模式渲染 `apps/web/public/favicon.svg` 的鲸鱼 logo，失败自动降级为内置样式图标）：
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File refresh-icon.ps1
  ```
- 刷新文档截图：
  ```powershell
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\capture-screenshots.ps1
  ```

## 目录结构

```
dsh-web-launcher/
├── start-web.ps1                    # 主启动脚本（托盘图标 + 服务控制）
├── install.ps1                      # 安装/卸载器：定位 harness 仓库 + 创建桌面快捷方式
├── refresh-icon.ps1                 # 重新生成 dsh-web.ico
├── lib\common.ps1                   # 共享函数库（仓库定位、启动命令、端口检测、国际化）
├── tools\capture-screenshots.ps1    # 文档截图工具
├── docs\screenshots\                # README 引用的截图
├── dsh-web.ico                      # 托盘 / 快捷方式图标
├── VERSION                          # 启动器版本标识
├── logs\                            # 运行日志（git 忽略）
└── repo-root.txt                    # 本机 harness 仓库路径（git 忽略）
```

## 常见问题

- **托盘提示"未找到仓库"** —— 运行 `install.ps1 -RepoRoot "<路径>"`，或设置 `DSH_REPO_ROOT`。
- **服务启动后立刻退出** —— 查看 `logs\web-server.err.log`，通常是仓库未执行 `pnpm install` / `pnpm run build`。
- **端口被其他程序占用** —— 只有响应包含 `__DSH_BOOT__` 标记时才会判定为"已有 dsh 服务"；否则启动失败并在日志中体现端口冲突。可使用 `-Port` 指定其他端口。
- **一台机器多个 harness 仓库** —— 每个仓库各运行一次 `install.ps1`；快捷方式名称固定，装第二个前先重命名已有快捷方式。
- **托盘图标被收纳** —— 从任务栏"显示隐藏的图标"中拖出即可。
- **气泡提示"服务进程已意外退出"** —— 健康监控每 30 秒检测一次；查看 `logs\web-server.err.log` 了解详情，然后通过托盘菜单重启。

## 许可

MIT 许可，见 [LICENSE](LICENSE)。

本启动器是 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（MIT 许可）的辅助工具，未内置或复制任何 harness 代码：它只是在你本地的 harness 仓库上启动服务，并在生成图标时读取该仓库的 `apps/web/public/favicon.svg`。harness 仓库是独立项目，其本身及第三方依赖的许可条款以该仓库内的 LICENSE 与 THIRD_PARTY_NOTICES.md 为准。