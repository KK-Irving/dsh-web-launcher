/**
 * DSH Desktop - Locale / i18n
 *
 * Default: Chinese (zh)
 * Configurable: store.get('language') === 'en' switches all text to English.
 * All user-facing strings live here for easy maintenance.
 */

const strings = {
  zh: {
    // App
    appName: 'DeepSeek Harness',
    appTitle: 'DeepSeek Harness 桌面版',

    // Tray menu
    trayRunning: '● 运行中',
    trayStopped: '○ 已停止',
    trayOpenWindow: '打开窗口',
    trayNewTab: '新建标签页',
    trayRestartBackend: '重启后端服务',
    trayExtensions: '扩展程序',
    traySettings: '设置...',
    trayCheckUpdate: '检查更新',
    trayQuit: '退出',

    // Tray tooltip status
    statusRunning: '运行中',
    statusStopped: '已停止',
    statusStarting: '启动中',
    statusError: '错误',
    statusNoRepo: '未找到仓库',
    statusDownloading: '正在下载更新...',

    // Tab
    newTab: '新标签页',

    // Dialogs - Harness not found
    notFoundTitle: '未找到 DeepSeek Harness 仓库',
    notFoundMessage:
      '无法定位 deepseek-harness 仓库。\n\n' +
      '已搜索范围：\n' +
      '  - 应用程序同级及上层目录\n' +
      '  - 盘根目录（deepseek-harness / dsh / DeepSeek）\n' +
      '  - 用户主目录\n\n' +
      '请在「设置」中手动指定路径，或设置 DSH_REPO_ROOT 环境变量。',

    // Dialogs - Backend start failed
    backendFailTitle: '后端启动失败',
    backendFailMessage:
      'DSH Web 后端在 {0} 秒内未能就绪。\n\n' +
      '可能原因：\n' +
      '  - pnpm 未安装或不在 PATH 中\n' +
      '  - 依赖未安装（需运行：pnpm install）\n' +
      '  - 未构建（需运行：pnpm run build）\n\n' +
      '仓库路径：',

    // Dialogs - Backend general
    backendNotFound: '未找到 harness 仓库，请在设置中配置。',
    backendRestartFail: '后端启动失败，请检查 pnpm 是否已安装并且仓库已构建。',

    // Dialogs - Settings
    settingsTitle: 'DSH 桌面版设置',
    settingsHarnessRoot: '仓库路径',
    settingsPort: '端口',
    settingsShortcut: '全局快捷键',
    settingsMinimizeToTray: '关闭时最小化到托盘',
    settingsAutoStart: '自动启动后端',
    settingsAutoUpdate: '自动检查更新',
    settingsExtensions: '扩展程序',
    settingsLanguage: '界面语言',
    settingsBtnOk: '确定',
    settingsBtnChangePath: '更改仓库路径',
    settingsUpdatedTo: '已更新为：',
    settingsInvalidPath: '无效路径',
    settingsInvalidPathMsg: '所选目录不是有效的 deepseek-harness 仓库（缺少 package.json、apps/cli/src/bin.ts 或 apps/web）。',

    // Dialogs - Extensions
    extTitle: 'Chrome 扩展程序',
    extNone: '暂无已安装的扩展。\n\n点击「添加扩展」加载一个未打包的 Chrome 扩展目录。',
    extInstalled: '已安装的扩展',
    extBtnOk: '确定',
    extBtnAdd: '添加扩展',
    extBtnRemoveLast: '移除最后一个',
    extSelectTitle: '选择未打包的 Chrome 扩展目录',
    extInvalidTitle: '无效的扩展',
    extInvalidMsg: '所选目录中未找到 manifest.json。\n请选择一个包含 manifest.json 的 Chrome 扩展目录。',
    extLoadedTitle: '扩展已加载',
    extLoadedMsg: '已加载，下次启动时也会自动加载。',
    extLoadFailTitle: '扩展加载失败',
    extRemovedTitle: '扩展已移除',
    extRemovedMsg: '该扩展已从列表中移除。\n重启应用后生效。',

    // Dialogs - Update (app auto-update)
    updateAvailTitle: '发现新版本',
    updateAvailMsg: '有新版本可用，是否下载？',
    updateBtnDownload: '下载',
    updateBtnLater: '稍后',
    updateReadyTitle: '更新已就绪',
    updateReadyMsg: '已下载完成，是否立即重启安装？',
    updateBtnRestart: '立即重启',

    // Dialogs - Harness Update
    harnessCheckUpdate: '检查 Harness 更新',
    harnessChecking: '正在检查更新...',
    harnessUpdating: '正在更新...',
    harnessCheckFailTitle: '检查更新失败',
    harnessUpToDateTitle: 'Harness 已是最新',
    harnessUpToDateMsg: '当前分支 {0} 已是最新版本（{1}）。',
    harnessUpdateAvailTitle: '发现 Harness 更新',
    harnessUpdateAvailMsg: '分支 {0} 有 {1} 个新提交可用。\n当前：{2}\n远程：{3}\n\n是否立即更新？（将执行 git pull + pnpm install + pnpm run build）',
    harnessUpdateNow: '立即更新',
    harnessUpdateCompleteTitle: '更新完成',
    harnessUpdateCompleteMsg: '仓库已更新、依赖已安装、构建已完成。\n是否重启后端服务？',
    harnessRestartBackend: '重启后端',
    harnessRestartLater: '稍后手动重启',
    harnessUpdateFailTitle: '更新失败',
    harnessUpdateFailPrefix: '更新过程中出错：\n\n',
  },

  en: {
    // App
    appName: 'DeepSeek Harness',
    appTitle: 'DeepSeek Harness Desktop',

    // Tray menu
    trayRunning: '● Running',
    trayStopped: '○ Stopped',
    trayOpenWindow: 'Open Window',
    trayNewTab: 'New Tab',
    trayRestartBackend: 'Restart Backend',
    trayExtensions: 'Extensions',
    traySettings: 'Settings...',
    trayCheckUpdate: 'Check for Updates',
    trayQuit: 'Quit',

    // Tray tooltip status
    statusRunning: 'running',
    statusStopped: 'stopped',
    statusStarting: 'starting',
    statusError: 'error',
    statusNoRepo: 'no repo',
    statusDownloading: 'downloading update...',

    // Tab
    newTab: 'New Tab',

    // Dialogs - Harness not found
    notFoundTitle: 'DeepSeek Harness Not Found',
    notFoundMessage:
      'Could not locate the deepseek-harness repository.\n\n' +
      'Searched:\n' +
      '  - Directories alongside and above this app\n' +
      '  - Drive root (deepseek-harness / dsh / DeepSeek)\n' +
      '  - User home directory\n\n' +
      'Please specify the path in Settings, or set DSH_REPO_ROOT environment variable.',

    // Dialogs - Backend start failed
    backendFailTitle: 'Backend Start Failed',
    backendFailMessage:
      'The DSH web backend did not become ready within {0} seconds.\n\n' +
      'Possible causes:\n' +
      '  - pnpm not installed or not in PATH\n' +
      '  - Dependencies not installed (run: pnpm install)\n' +
      '  - Not built yet (run: pnpm run build)\n\n' +
      'Harness path: ',

    // Dialogs - Backend general
    backendNotFound: 'Cannot find harness repository. Please configure in Settings.',
    backendRestartFail: 'Backend failed to start. Check that pnpm is installed and the harness has been built.',

    // Dialogs - Settings
    settingsTitle: 'DSH Desktop Settings',
    settingsHarnessRoot: 'Harness Root',
    settingsPort: 'Port',
    settingsShortcut: 'Global Shortcut',
    settingsMinimizeToTray: 'Minimize to Tray',
    settingsAutoStart: 'Auto-start Backend',
    settingsAutoUpdate: 'Auto-update',
    settingsExtensions: 'Extensions',
    settingsLanguage: 'Language',
    settingsBtnOk: 'OK',
    settingsBtnChangePath: 'Change Harness Path',
    settingsUpdatedTo: 'Updated to: ',
    settingsInvalidPath: 'Invalid Path',
    settingsInvalidPathMsg: 'The selected directory is not a valid deepseek-harness repository (missing package.json, apps/cli/src/bin.ts, or apps/web).',

    // Dialogs - Extensions
    extTitle: 'Chrome Extensions',
    extNone: 'No extensions installed.\n\nClick "Add Extension" to load an unpacked Chrome extension.',
    extInstalled: 'Installed extensions',
    extBtnOk: 'OK',
    extBtnAdd: 'Add Extension',
    extBtnRemoveLast: 'Remove Last',
    extSelectTitle: 'Select Unpacked Chrome Extension Directory',
    extInvalidTitle: 'Invalid Extension',
    extInvalidMsg: 'No manifest.json found in the selected directory.\nPlease select an unpacked Chrome extension directory.',
    extLoadedTitle: 'Extension Loaded',
    extLoadedMsg: 'has been loaded.\nIt will be available on next restart as well.',
    extLoadFailTitle: 'Extension Load Failed',
    extRemovedTitle: 'Extension Removed',
    extRemovedMsg: 'The extension has been removed from the list.\nRestart the app for changes to take effect.',

    // Dialogs - Update (app auto-update)
    updateAvailTitle: 'Update Available',
    updateAvailMsg: 'A new version is available. Download it?',
    updateBtnDownload: 'Download',
    updateBtnLater: 'Later',
    updateReadyTitle: 'Update Ready',
    updateReadyMsg: 'has been downloaded. Restart now to install?',
    updateBtnRestart: 'Restart',

    // Dialogs - Harness Update
    harnessCheckUpdate: 'Check Harness Update',
    harnessChecking: 'checking for updates...',
    harnessUpdating: 'updating...',
    harnessCheckFailTitle: 'Update Check Failed',
    harnessUpToDateTitle: 'Harness Up to Date',
    harnessUpToDateMsg: 'Branch {0} is up to date ({1}).',
    harnessUpdateAvailTitle: 'Harness Update Available',
    harnessUpdateAvailMsg: 'Branch {0} has {1} new commit(s).\nLocal: {2}\nRemote: {3}\n\nUpdate now? (git pull + pnpm install + pnpm run build)',
    harnessUpdateNow: 'Update Now',
    harnessUpdateCompleteTitle: 'Update Complete',
    harnessUpdateCompleteMsg: 'Repository updated, dependencies installed, build complete.\nRestart the backend service?',
    harnessRestartBackend: 'Restart Backend',
    harnessRestartLater: 'Later',
    harnessUpdateFailTitle: 'Update Failed',
    harnessUpdateFailPrefix: 'Error during update:\n\n',
  }
}

/**
 * Get the i18n function bound to current language.
 * @param {import('electron-store').default} store
 * @returns {(key: string, ...args: string[]) => string}
 */
function createT(store) {
  const lang = store.get('language') || 'zh'
  const dict = strings[lang] || strings.zh

  /**
   * Translate a key. Extra args replace {0}, {1}... placeholders.
   */
  function t(key, ...args) {
    let text = dict[key] || strings.zh[key] || key
    for (let i = 0; i < args.length; i++) {
      text = text.replace(`{${i}}`, args[i])
    }
    return text
  }

  t.lang = lang
  return t
}

module.exports = { createT, strings }