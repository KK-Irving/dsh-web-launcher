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
    trayDebugLog: '调试日志',
    trayQuit: '退出',

    // Debug log dialog
    debugLogEnabledTitle: '调试日志',
    debugLogEnabledMsg: '调试日志已开启。\n\n请重启客户端以记录完整的启动日志。\n\n日志路径：\n{0}\n\n提示：可在新标签页「快捷操作」中点击「日志」直接打开该文件夹。',
    debugLogDisabledMsg: '调试日志已关闭。下次启动将不再记录日志。',

    // Backend restart feedback
    backendRestartDoneTitle: '重启完成',
    backendRestartDoneMsg: '后端服务已成功重启。',
    backendRestartFailTitle: '后端重启失败',
    backendRestartFailMsg: '后端重启失败。\n\n可能原因：\n  - 旧进程未完全退出\n  - 依赖或构建未完成\n\n请尝试退出客户端后重新启动。',

    // Generic update-flow labels (shared by harness / launcher flows)
    updateFailedTitle: '更新失败',
    updateErrorGeneric: '更新过程中出错',
    updateNeedRestart: '需要重启客户端生效',

    // Launcher (client self) update dialogs
    launcherCheckFailTitle: '检查客户端更新失败',
    launcherUpToDateTitle: '客户端已是最新',
    launcherUpToDateMsg: '当前客户端代码已是最新版本（{0}）。',
    launcherAvailTitle: '发现客户端更新',
    launcherAvailMsg: '客户端仓库有 {0} 个新提交。\n当前：{1}\n远程：{2}\n\n是否立即更新？（git pull + pnpm install）\n更新后需重启客户端生效。',
    launcherUpdatingTitle: '客户端更新中...',
    launcherUpdatingSubtitle: '正在执行 git pull + pnpm install',
    launcherUpdatedTitle: '客户端更新完成',
    launcherUpdatedMsg: '客户端代码已更新。需要重启应用才能生效。\n是否立即重启？',

    // Packaged-mode update hints
    clientUpToDateTitle: '已是最新版本',
    clientUpToDateMsg: '当前版本 {0} 已是最新。',
    autoUpdateUnavailableMsg: '自动更新暂不可用（未找到 GitHub Release）。\n\n如需更新，请访问：\nhttps://github.com/KK-Irving/dsh-web-launcher/releases\n\n当前版本：{0}',
    manualUpdateVisitMsg: '如需更新，请访问：\nhttps://github.com/KK-Irving/dsh-web-launcher/releases\n\n当前版本：{0}',
    checkingUpdatesTooltip: '检查更新中...',

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

    // Dialogs - Settings
    settingsTitle: 'DSH 桌面版设置',
    settingsBtnOk: '确定',
    settingsBtnChangePath: '更改仓库路径',
    settingsInvalidPath: '无效路径',
    settingsInvalidPathMsg: '所选目录不是有效的 deepseek-harness 仓库（缺少 package.json、apps/cli/src/bin.ts 或 apps/web）。',

    // Dialogs - Extensions
    extTitle: 'Chrome 扩展程序',
    extNone: '暂无已安装的扩展。\n\n点击「添加扩展」加载一个未打包的 Chrome 扩展目录。',
    extBtnOk: '确定',
    extBtnAdd: '添加扩展',
    extBtnRemoveLast: '移除最后一个',
    extSelectTitle: '选择未打包的 Chrome 扩展目录',
    extInvalidTitle: '无效的扩展',
    extLoadedTitle: '扩展已加载',
    extLoadFailTitle: '扩展加载失败',
    extRemovedTitle: '扩展已移除',
    extRemovedMsg: '该扩展已从列表中移除。\n重启应用后生效。',

    // Dialogs - Update (app auto-update)
    updateAvailTitle: '发现新版本',
    updateBtnDownload: '下载',
    updateBtnLater: '稍后',
    updateReadyTitle: '更新已就绪',
    updateBtnRestart: '立即重启',

    // Update window - Client flow
    cliTitle: '客户端更新',
    cliFoundSub: '发现新版本 v{0}',
    cliSkippedSub: '已跳过，可稍后在托盘菜单或新标签页再次检查',
    cliStartDlLog: '开始下载 v{0} ...',
    cliProgressSub: '下载中 {0}% · {1}/{2} MB · {3} MB/s',
    cliReadySub: 'v{0} 下载完成，随时可以重启安装',
    cliReadyLog: '安装包已就绪，将关闭应用后自动运行安装程序',
    cliUpToDateDone: '当前已是最新版本 v{0}',
    webAuthRequiredTitle: '需要重新认证',
    webAuthRequiredMsg: '当前 Web 服务由外部启动，客户端拿不到认证令牌。\n请通过托盘菜单「重启 Web 服务」让客户端接管后端，即可自动完成登录。',
    webAuthStillFailTitle: '自动登录未完成',
    webAuthStillFailMsg: '后端已重启，但 Web 认证仍未生效（未捕获到 dsh web 令牌）。\n请开启托盘「调试日志」后再次重启服务，并检查 logs 目录中 startup-crash.log 与当次日志。',

    // Update window - Harness flow
    harnessCheckUpdate: '检查 Harness 更新',
    harnessStepPull: 'git pull --ff-only（更新代码）',
    harnessStepClean: 'pnpm run clean（清除构建残留）',
    harnessStepInstall: 'pnpm install（更新依赖）',
    harnessStepBuild: 'pnpm run build（重新构建）',
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
    harnessUpdateFailPrefix: '更新过程中出错：\n\n',
    harnessUpdateDoneSubtitle: '仓库已更新、依赖已安装、构建已完成',

    // Update progress window (shared)
    updateProgressTitle: '{0} 更新中...',
    updateProgressSubtitleSteps: '正在执行更新流程，请勿关闭此窗口',

    // Splash status lines
    splashConnected: '✓ 已连接到运行中的服务',
    splashReady: '✓ 服务已就绪，正在打开界面...',
    splashManualMode: '手动模式：请自行启动后端',
    tipRestartingBackend: '正在重启后端...',
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
    trayDebugLog: 'Debug Log',
    trayQuit: 'Quit',

    // Debug log dialog
    debugLogEnabledTitle: 'Debug Log',
    debugLogEnabledMsg: 'Debug logging enabled.\n\nRestart the client to capture full startup logs.\n\nLog path:\n{0}\n\nTip: Click "Logs" in the new tab page to open this folder.',
    debugLogDisabledMsg: 'Debug logging disabled. No logs will be written on next launch.',

    // Backend restart feedback
    backendRestartDoneTitle: 'Restart Complete',
    backendRestartDoneMsg: 'Backend service restarted successfully.',
    backendRestartFailTitle: 'Backend Restart Failed',
    backendRestartFailMsg: 'Backend restart failed.\n\nPossible causes:\n  - Old process not fully exited\n  - Dependencies/build incomplete\n\nTry exiting the client and restarting.',

    // Generic update-flow labels (shared by harness / launcher flows)
    updateFailedTitle: 'Update Failed',
    updateErrorGeneric: 'Error during update',
    updateNeedRestart: 'Restart required to apply',

    // Launcher (client self) update dialogs
    launcherCheckFailTitle: 'Launcher Update Check Failed',
    launcherUpToDateTitle: 'Launcher Up to Date',
    launcherUpToDateMsg: 'Launcher code is up to date ({0}).',
    launcherAvailTitle: 'Launcher Update Available',
    launcherAvailMsg: 'Launcher repo has {0} new commit(s).\nLocal: {1}\nRemote: {2}\n\nUpdate now? (git pull + pnpm install)\nApp restart required after update.',
    launcherUpdatingTitle: 'Updating Client...',
    launcherUpdatingSubtitle: 'Running git pull + pnpm install',
    launcherUpdatedTitle: 'Client Updated',
    launcherUpdatedMsg: 'Launcher code updated. Restart required to apply changes.\nRestart now?',

    // Packaged-mode update hints
    clientUpToDateTitle: 'Up to Date',
    clientUpToDateMsg: 'Version {0} is up to date.',
    autoUpdateUnavailableMsg: 'Auto-update unavailable (no GitHub Release found).\n\nVisit:\nhttps://github.com/KK-Irving/dsh-web-launcher/releases\n\nCurrent version: {0}',
    manualUpdateVisitMsg: 'To update, visit:\nhttps://github.com/KK-Irving/dsh-web-launcher/releases\n\nCurrent version: {0}',
    checkingUpdatesTooltip: 'checking...',

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

    // Dialogs - Settings
    settingsTitle: 'DSH Desktop Settings',
    settingsBtnOk: 'OK',
    settingsBtnChangePath: 'Change Harness Path',
    settingsInvalidPath: 'Invalid Path',
    settingsInvalidPathMsg: 'The selected directory is not a valid deepseek-harness repository (missing package.json, apps/cli/src/bin.ts, or apps/web).',

    // Dialogs - Extensions
    extTitle: 'Chrome Extensions',
    extNone: 'No extensions installed.\n\nClick "Add Extension" to load an unpacked Chrome extension.',
    extBtnOk: 'OK',
    extBtnAdd: 'Add Extension',
    extBtnRemoveLast: 'Remove Last',
    extSelectTitle: 'Select Unpacked Chrome Extension Directory',
    extInvalidTitle: 'Invalid Extension',
    extLoadedTitle: 'Extension Loaded',
    extLoadFailTitle: 'Extension Load Failed',
    extRemovedTitle: 'Extension Removed',
    extRemovedMsg: 'The extension has been removed from the list.\nRestart the app for changes to take effect.',

    // Dialogs - Update (app auto-update)
    updateAvailTitle: 'Update Available',
    updateBtnDownload: 'Download',
    updateBtnLater: 'Later',
    updateReadyTitle: 'Update Ready',
    updateBtnRestart: 'Restart',

    // Update window - Client flow
    cliTitle: 'Client Update',
    cliFoundSub: 'New version v{0} available',
    cliSkippedSub: 'Skipped — check again anytime from the tray menu or New Tab page',
    cliStartDlLog: 'Downloading v{0} ...',
    cliProgressSub: 'Downloading {0}% · {1}/{2} MB · {3} MB/s',
    cliReadySub: 'v{0} downloaded — restart to install whenever you like',
    cliReadyLog: 'Installer is ready; the app will close and run it automatically',
    cliUpToDateDone: 'Already on the latest version v{0}',
    webAuthRequiredTitle: 'Re-authentication required',
    webAuthRequiredMsg: 'The running web service was started externally, so the client has no auth token.\nUse the tray menu "Restart Web Service" to let the client own the backend and sign in automatically.',
    webAuthStillFailTitle: 'Automatic sign-in incomplete',
    webAuthStillFailMsg: 'The backend restarted, but web authentication is still inactive (the dsh web token line was never captured).\nEnable the tray "Debug Log", restart the service again, and check startup-crash.log plus that run\'s log in the logs folder.',

    // Update window - Harness flow
    harnessCheckUpdate: 'Check Harness Update',
    harnessStepPull: 'git pull --ff-only (fetch updates)',
    harnessStepClean: 'pnpm run clean (clear stale build artifacts)',
    harnessStepInstall: 'pnpm install (update dependencies)',
    harnessStepBuild: 'pnpm run build (rebuild)',
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
    harnessUpdateFailPrefix: 'Error during update:\n\n',
    harnessUpdateDoneSubtitle: 'Repo updated, deps installed, build complete',

    // Update progress window (shared)
    updateProgressTitle: 'Updating {0}...',
    updateProgressSubtitleSteps: 'Running update process, do not close this window',

    // Splash status lines
    splashConnected: '✓ Connected to running service',
    splashReady: '✓ Service ready, opening UI...',
    splashManualMode: 'Manual mode: start backend yourself',
    tipRestartingBackend: 'restarting backend...',
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