/**
 * DSH Desktop - Electron Main Process
 *
 * Full-featured desktop client for DeepSeek Harness Web UI:
 *   - Mixed mode: auto-start backend or connect to existing service
 *   - System tray with minimize-to-tray
 *   - Global shortcut (Alt+D) to toggle visibility
 *   - Multi-tab support (multiple sessions in one window)
 *   - Chrome extension loading (unpacked or .crx)
 *   - Auto-update via electron-updater (GitHub Releases)
 */

const { app, BrowserWindow, BrowserView, Tray, Menu, nativeImage, shell, globalShortcut, dialog, session, ipcMain } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')
const Store = require('electron-store')
const { createT } = require('./locale')

// ── Configuration ────────────────────────────────────────────────────────────

const store = new Store({
  defaults: {
    harnessRoot: '',
    port: 3080,
    host: '127.0.0.1',
    globalShortcut: 'Alt+D',
    minimizeToTray: true,
    startMinimized: false,
    autoStartBackend: true,
    autoUpdate: true,
    windowBounds: { width: 1280, height: 860 },
    tabs: [], // persisted tab URLs for restore
    language: 'zh', // 'zh' | 'en'
    extensions: [] // Chrome extension paths (unpacked directories)
  }
})

let t = createT(store)

const DEFAULT_PORT = store.get('port')
const DEFAULT_HOST = store.get('host')
const WEB_URL = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`
const DSH_BOOT_MARKER = '__DSH_BOOT__'
const STARTUP_TIMEOUT_MS = 90_000
const HEALTH_CHECK_INTERVAL_MS = 30_000

// ── State ────────────────────────────────────────────────────────────────────

let mainWindow = null
let tray = null
let backendProcess = null
let backendAdopted = false
let healthCheckTimer = null
let isQuitting = false

/** @type {Array<{id: string, view: BrowserView, title: string, url: string}>} */
let tabs = []
let activeTabId = null

// ── Harness Discovery ────────────────────────────────────────────────────────

function isValidHarnessRoot(dir) {
  if (!dir) return false
  try {
    return (
      fs.existsSync(path.join(dir, 'package.json')) &&
      fs.existsSync(path.join(dir, 'apps', 'cli', 'src', 'bin.ts')) &&
      fs.existsSync(path.join(dir, 'apps', 'web'))
    )
  } catch {
    return false
  }
}

function findHarnessInDir(searchDir) {
  if (!searchDir || !fs.existsSync(searchDir)) return null
  try {
    const entries = fs.readdirSync(searchDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
      const candidate = path.join(searchDir, entry.name)
      if (isValidHarnessRoot(candidate)) return candidate
    }
  } catch { /* ignore */ }
  return null
}

function resolveHarnessRoot() {
  // 1. Stored setting
  const stored = store.get('harnessRoot')
  if (stored && isValidHarnessRoot(stored)) return stored

  // 2. Environment variable
  const envRoot = process.env.DSH_REPO_ROOT
  if (envRoot && isValidHarnessRoot(envRoot)) return envRoot

  // 3. repo-root.txt (beside the launcher)
  const launcherDir = path.resolve(__dirname, '..', '..', '..')
  const configFile = path.join(launcherDir, 'repo-root.txt')
  if (fs.existsSync(configFile)) {
    const value = fs.readFileSync(configFile, 'utf8').trim()
    if (value && isValidHarnessRoot(value)) return value
  }

  // 4. Auto-discovery: scan parent directories
  let cursor = path.dirname(launcherDir)
  for (let i = 0; i < 4 && cursor; i++) {
    const found = findHarnessInDir(cursor)
    if (found) return found
    const upper = path.dirname(cursor)
    if (upper === cursor) break
    cursor = upper
  }

  // 5. Drive root common names
  const driveRoot = path.parse(launcherDir).root
  for (const name of ['deepseek-harness', 'dsh', 'DeepSeek']) {
    const candidate = path.join(driveRoot, name)
    if (isValidHarnessRoot(candidate)) return candidate
  }

  // 6. User home
  const home = require('os').homedir()
  if (home) {
    const found = findHarnessInDir(home)
    if (found) return found
  }

  return null
}

// ── Backend Management ───────────────────────────────────────────────────────

function checkWebReady() {
  return new Promise((resolve) => {
    const req = http.get(WEB_URL, { timeout: 2000 }, (res) => {
      let body = ''
      res.on('data', (chunk) => { body += chunk })
      res.on('end', () => {
        resolve(res.statusCode === 200 && body.includes(DSH_BOOT_MARKER))
      })
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

async function waitForReady(timeoutMs = STARTUP_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await checkWebReady()) return true
    await new Promise(r => setTimeout(r, 1000))
  }
  return await checkWebReady()
}

function resolveRunner(harnessRoot) {
  const { execSync } = require('child_process')
  const isWin = process.platform === 'win32'
  function commandExists(c) {
    try { execSync(isWin ? `where ${c}` : `which ${c}`, { windowsHide: true, stdio: 'ignore' }); return true }
    catch { return false }
  }
  if (commandExists('pnpm')) return { cmd: isWin ? 'cmd.exe' : 'bash', args: isWin ? ['/d', '/s', '/c', 'pnpm dsh web'] : ['-c', 'pnpm dsh web'] }
  if (commandExists('npm')) return { cmd: isWin ? 'cmd.exe' : 'bash', args: isWin ? ['/d', '/s', '/c', 'npm run dsh -- web'] : ['-c', 'npm run dsh -- web'] }
  if (commandExists('node')) {
    const binTs = require('path').join(harnessRoot, 'apps', 'cli', 'src', 'bin.ts')
    if (require('fs').existsSync(binTs)) return { cmd: 'node', args: ['--import', 'tsx/esm', binTs, 'web'] }
  }
  return null
}

function startBackend(harnessRoot) {
  const runner = resolveRunner(harnessRoot)
  if (!runner) { console.error('[dsh-desktop] No pnpm/npm/node found'); return }
  console.log(`[dsh-desktop] Starting: ${runner.cmd} ${runner.args.join(' ')}`)

  backendProcess = spawn(runner.cmd, runner.args, {
    cwd: harnessRoot,
    windowsHide: true,
    stdio: 'ignore',
    detached: false,
    env: { ...process.env }
  })

  backendProcess.on('exit', (code) => {
    if (!isQuitting) {
      console.error(`[dsh-desktop] Backend exited with code ${code}`)
      backendProcess = null
      notifyAllTabs('backend-status', { running: false, code })
      updateTrayStatus('stopped')
    }
  })

  backendProcess.on('error', (err) => {
    console.error(`[dsh-desktop] Backend spawn error: ${err.message}`)
    backendProcess = null
  })
}

function stopBackend() {
  if (!backendProcess) return
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(backendProcess.pid), '/T', '/F'], { windowsHide: true })
    } else {
      process.kill(-backendProcess.pid, 'SIGTERM')
    }
  } catch { /* already dead */ }
  backendProcess = null
}

// ── Health Monitor ───────────────────────────────────────────────────────────

function startHealthMonitor() {
  healthCheckTimer = setInterval(async () => {
    if (backendProcess && backendProcess.exitCode !== null) {
      backendProcess = null
      updateTrayStatus('stopped')
    }
    const ready = await checkWebReady()
    if (!ready && !backendProcess && !backendAdopted) {
      updateTrayStatus('stopped')
    }
  }, HEALTH_CHECK_INTERVAL_MS)
}

function stopHealthMonitor() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer)
    healthCheckTimer = null
  }
}

// ── Multi-Tab Management ─────────────────────────────────────────────────────

let tabIdCounter = 0

function generateTabId() {
  tabIdCounter++
  return `tab-${Date.now()}-${tabIdCounter}`
}

function createTab(url = WEB_URL) {
  if (!mainWindow) return null

  const id = generateTabId()
  const view = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  view.webContents.on('page-title-updated', (_event, title) => {
    const tab = tabs.find(t => t.id === id)
    if (tab) {
      tab.title = title
      notifyTabBar()
    }
  })

  view.webContents.on('did-navigate', (_event, navUrl) => {
    const tab = tabs.find(t => t.id === id)
    if (tab) {
      tab.url = navUrl
      persistTabs()
    }
  })

  // Open external links in system browser
  view.webContents.setWindowOpenHandler(({ url: linkUrl }) => {
    if (linkUrl.startsWith('http') && !linkUrl.startsWith(WEB_URL)) {
      shell.openExternal(linkUrl)
      return { action: 'deny' }
    }
    // Internal links: open in new tab
    createTab(linkUrl)
    return { action: 'deny' }
  })

  view.webContents.loadURL(url)

  const tab = { id, view, title: t('newTab'), url }
  tabs.push(tab)

  activateTab(id)
  notifyTabBar()
  persistTabs()

  return tab
}

function activateTab(id) {
  if (!mainWindow) return
  const tab = tabs.find(t => t.id === id)
  if (!tab) return

  // Remove all views, add the active one
  for (const t of tabs) {
    mainWindow.removeBrowserView(t.view)
  }
  mainWindow.addBrowserView(tab.view)
  activeTabId = id

  // Resize view to fill content area (below tab bar)
  resizeActiveView()
  notifyTabBar()
}

function closeTab(id) {
  const index = tabs.findIndex(t => t.id === id)
  if (index === -1) return

  const tab = tabs[index]
  mainWindow.removeBrowserView(tab.view)
  tab.view.webContents.destroy()
  tabs.splice(index, 1)

  // If we closed the active tab, activate another
  if (activeTabId === id) {
    if (tabs.length > 0) {
      const newIndex = Math.min(index, tabs.length - 1)
      activateTab(tabs[newIndex].id)
    } else {
      // Last tab closed - create a new one
      createTab()
    }
  }

  notifyTabBar()
  persistTabs()
}

function resizeActiveView() {
  if (!mainWindow) return
  const tab = tabs.find(t => t.id === activeTabId)
  if (!tab) return

  const TAB_BAR_HEIGHT = 40
  const bounds = mainWindow.getContentBounds()
  tab.view.setBounds({
    x: 0,
    y: TAB_BAR_HEIGHT,
    width: bounds.width,
    height: bounds.height - TAB_BAR_HEIGHT
  })
}

function notifyTabBar() {
  if (!mainWindow || mainWindow.isDestroyed()) return
  const tabData = tabs.map(t => ({
    id: t.id,
    title: t.title || t('newTab'),
    active: t.id === activeTabId
  }))
  mainWindow.webContents.send('tabs-updated', tabData)
}

function notifyAllTabs(channel, data) {
  for (const tab of tabs) {
    try {
      tab.view.webContents.send(channel, data)
    } catch { /* view may be destroyed */ }
  }
}

function persistTabs() {
  store.set('tabs', tabs.map(t => t.url))
}

// ── Chrome Extension Loading ─────────────────────────────────────────────────

async function loadExtensions() {
  const extensionPaths = store.get('extensions')
  if (!extensionPaths || extensionPaths.length === 0) return

  const ses = session.defaultSession
  const loaded = []

  for (const extPath of extensionPaths) {
    if (!fs.existsSync(extPath)) {
      console.warn(`[dsh-desktop] Extension path not found: ${extPath}`)
      continue
    }
    try {
      const ext = await ses.loadExtension(extPath, { allowFileAccess: true })
      loaded.push({ id: ext.id, name: ext.name, path: extPath })
      console.log(`[dsh-desktop] Loaded extension: ${ext.name} (${ext.id})`)
    } catch (err) {
      console.error(`[dsh-desktop] Failed to load extension ${extPath}: ${err.message}`)
    }
  }

  return loaded
}

function addExtension(extPath) {
  const extensions = store.get('extensions')
  if (extensions.includes(extPath)) return false

  // Validate it looks like a Chrome extension
  const manifestPath = path.join(extPath, 'manifest.json')
  if (!fs.existsSync(manifestPath)) {
    dialog.showErrorBox(t('extInvalidTitle'), `\n\n${extPath}`)
    return false
  }

  extensions.push(extPath)
  store.set('extensions', extensions)

  // Load it immediately
  session.defaultSession.loadExtension(extPath, { allowFileAccess: true })
    .then((ext) => {
      console.log(`[dsh-desktop] Loaded extension: ${ext.name}`)
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: t('extLoadedTitle'),
        message: `"${ext.name}" `
      })
    })
    .catch((err) => {
      dialog.showErrorBox(t('extLoadFailTitle'), err.message)
      // Remove from stored list
      const updated = store.get('extensions').filter(p => p !== extPath)
      store.set('extensions', updated)
    })

  return true
}

function removeExtension(extPath) {
  const extensions = store.get('extensions').filter(p => p !== extPath)
  store.set('extensions', extensions)
  // Extension removal takes effect on restart
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: t('extRemovedTitle'),
    message: t('extRemovedMsg')
  })
}

// ── Auto-Update ──────────────────────────────────────────────────────────────

let autoUpdater = null

function initAutoUpdater() {
  if (!store.get('autoUpdate')) return
  try {
    // electron-updater is optional - only works in packaged builds
    const { autoUpdater: updater } = require('electron-updater')
    autoUpdater = updater

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      console.log(`[dsh-desktop] Update available: ${info.version}`)
      dialog.showMessageBox(mainWindow || undefined, {
        type: 'info',
        title: t('updateAvailTitle'),
        message: `A new version (${info.version}) is available.\nWould you like to download it?`,
        buttons: [t('updateBtnDownload'), t('updateBtnLater')],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0) {
          autoUpdater.downloadUpdate()
          if (tray) tray.setToolTip('DeepSeek Harness (downloading update...)')
        }
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      console.log(`[dsh-desktop] Update downloaded: ${info.version}`)
      dialog.showMessageBox(mainWindow || undefined, {
        type: 'info',
        title: t('updateReadyTitle'),
        message: `Version ${info.version} has been downloaded.\nRestart now to install?`,
        buttons: [t('updateBtnRestart'), t('updateBtnLater')],
        defaultId: 0
      }).then(({ response }) => {
        if (response === 0) {
          isQuitting = true
          autoUpdater.quitAndInstall()
        }
      })
    })

    autoUpdater.on('error', (err) => {
      console.warn(`[dsh-desktop] Auto-update error: ${err.message}`)
    })

    // Check for updates after a short delay
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(() => { /* silent */ })
    }, 10_000)

  } catch (err) {
    // electron-updater not available (dev mode or missing dependency)
    console.log('[dsh-desktop] Auto-updater not available (dev mode)')
  }
}

// ── Window Management ────────────────────────────────────────────────────────

function createMainWindow() {
  // Remove default menu bar (File/Edit/View/Window/Help)
  Menu.setApplicationMenu(null)

  const bounds = store.get('windowBounds')

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    minWidth: 800,
    minHeight: 600,
    icon: getIconPath(),
    title: 'DeepSeek Harness',
    show: false, // will show maximized after creation
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Load the tab bar shell (lightweight HTML)
  mainWindow.loadFile(path.join(__dirname, '..', 'assets', 'shell.html'))

  // Show maximized by default
  if (!store.get('startMinimized')) {
    mainWindow.maximize()
    mainWindow.show()
  }

  // Save window bounds on resize/move
  mainWindow.on('resize', () => {
    saveBounds()
    resizeActiveView()
  })
  mainWindow.on('move', saveBounds)

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (!isQuitting && store.get('minimizeToTray')) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
    tabs = []
    activeTabId = null
  })

  // Once shell is ready, create tabs
  mainWindow.webContents.on('did-finish-load', () => {
    // Restore tabs or create default
    const savedTabs = store.get('tabs')
    if (savedTabs && savedTabs.length > 0) {
      for (const url of savedTabs) {
        createTab(url)
      }
    } else {
      createTab(WEB_URL)
    }
  })
}

function saveBounds() {
  if (!mainWindow) return
  const bounds = mainWindow.getBounds()
  store.set('windowBounds', { width: bounds.width, height: bounds.height })
}

function showWindow() {
  if (!mainWindow) {
    createMainWindow()
  } else {
    mainWindow.show()
    mainWindow.focus()
  }
}

function getIconPath() {
  const icoPath = path.resolve(__dirname, '..', '..', '..', 'dsh-web.ico')
  if (fs.existsSync(icoPath)) return icoPath
  return path.join(__dirname, '..', 'assets', 'icon.png')
}

// ── System Tray ──────────────────────────────────────────────────────────────

function createTray() {
  const iconPath = getIconPath()
  const icon = nativeImage.createFromPath(iconPath)
  tray = new Tray(icon.resize({ width: 16, height: 16 }))
  tray.setToolTip('DeepSeek Harness')

  updateTrayMenu()

  tray.on('double-click', () => {
    showWindow()
  })
}

function updateTrayMenu() {
  const isRunning = backendProcess !== null || backendAdopted
  const statusLabel = isRunning ? t('trayRunning') : t('trayStopped')
  const extensionCount = store.get('extensions').length

  const contextMenu = Menu.buildFromTemplate([
    { label: t('appTitle'), enabled: false },
    { type: 'separator' },
    { label: statusLabel, enabled: false },
    { type: 'separator' },
    { label: t('trayOpenWindow'), click: () => showWindow() },
    { label: t('trayNewTab'), click: () => { showWindow(); createTab() } },
    { label: t('trayRestartBackend'), click: () => restartBackend() },
    { label: t.lang === 'zh' ? '检查 Harness 更新' : 'Check Harness Update', click: () => checkAndPromptHarnessUpdate() },
    { label: t.lang === 'zh' ? '检查更新' : 'Check for Updates', click: () => checkForAllUpdates() },
    { type: 'separator' },
    { label: `${t('trayExtensions')} (${extensionCount})`, click: () => showExtensionManager() },
    { label: t('traySettings'), click: () => showSettings() },

    { type: 'separator' },
    { label: t('trayQuit'), click: () => { isQuitting = true; app.quit() } }
  ])

  tray.setContextMenu(contextMenu)
}

function updateTrayStatus(status) {
  if (tray) {
    tray.setToolTip(` (${t('status' + status.charAt(0).toUpperCase() + status.slice(1)) || status})`)
    updateTrayMenu()
  }
}

// ── Backend Control ──────────────────────────────────────────────────────────

async function restartBackend() {
  const harnessRoot = resolveHarnessRoot()
  if (!harnessRoot) {
    dialog.showErrorBox(t('appName'), t('backendNotFound'))
    return
  }
  stopBackend()
  backendAdopted = false
  await new Promise(r => setTimeout(r, 2000))
  startBackend(harnessRoot)
  updateTrayStatus('starting')

  const ready = await waitForReady()
  if (ready) {
    updateTrayStatus('running')
    // Reload all tabs
    for (const tab of tabs) {
      tab.view.webContents.loadURL(tab.url)
    }
  } else {
    updateTrayStatus('error')
    dialog.showErrorBox(t('appName'), t('backendRestartFail'))
  }
}

// ── Launcher Self-Update ─────────────────────────────────────────────────────

/**
 * Check if the launcher repo (dsh-web-launcher) has upstream updates.
 */
async function checkLauncherUpdate() {
  const launcherDir = path.resolve(__dirname, '..', '..', '..')
  const gitDir = path.join(launcherDir, '.git')
  if (!fs.existsSync(gitDir)) return { hasUpdate: false, error: 'Launcher directory is not a git repo' }

  const { execFile } = require('child_process')
  const { promisify } = require('util')
  const execAsync = promisify(execFile)
  const gitOpts = { cwd: launcherDir, windowsHide: true, shell: process.platform === 'win32' }

  try {
    await execAsync('git', ['fetch', '--quiet'], gitOpts)
    const { stdout: branch } = await execAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], gitOpts)
    const { stdout: local } = await execAsync('git', ['rev-parse', 'HEAD'], gitOpts)
    const { stdout: remote } = await execAsync('git', ['rev-parse', `origin/${branch.trim()}`], gitOpts)

    const currentHead = local.trim().slice(0, 10)
    const remoteHead = remote.trim().slice(0, 10)
    const hasUpdate = currentHead !== remoteHead

    let behind = 0
    if (hasUpdate) {
      const { stdout: count } = await execAsync('git', ['rev-list', '--count', `HEAD..origin/${branch.trim()}`], gitOpts)
      behind = parseInt(count.trim(), 10) || 0
    }

    return { hasUpdate, currentHead, remoteHead, branch: branch.trim(), behind, launcherDir }
  } catch (err) {
    return { hasUpdate: false, error: err.message }
  }
}

/**
 * Pull latest launcher code + reinstall electron deps.
 * After update, app needs restart to use new code.
 */
async function updateLauncher() {
  const launcherDir = path.resolve(__dirname, '..', '..', '..')
  const electronDir = path.join(launcherDir, 'electron')

  const { execFile } = require('child_process')
  const { promisify } = require('util')
  const execAsync = promisify(execFile)
  const isWin = process.platform === 'win32'
  const shellOpts = { cwd: launcherDir, windowsHide: true, shell: isWin, maxBuffer: 8 * 1024 * 1024 }

  const steps = []
  try {
    const pull = await execAsync('git', ['pull', '--ff-only'], { cwd: launcherDir, windowsHide: true, shell: isWin })
    steps.push(`$ git pull --ff-only\n${(pull.stdout + pull.stderr).trim()}`)

    const install = await execAsync('pnpm', ['install'], { cwd: electronDir, windowsHide: true, shell: isWin, maxBuffer: 8 * 1024 * 1024 })
    steps.push(`$ pnpm install (electron/)\n${(install.stdout + install.stderr).trim().slice(0, 2000)}`)

    return { ok: true, output: steps.join('\n\n'), needRestart: true }
  } catch (err) {
    steps.push(`ERROR: ${((err.stdout || '') + (err.stderr || '') + (err.message || '')).slice(0, 2000)}`)
    return { ok: false, output: steps.join('\n\n'), error: err.message }
  }
}

async function checkForAllUpdates() {
  const zhMode = t.lang === 'zh'
  const isPackaged = app.isPackaged

  if (isPackaged && autoUpdater) {
    try {
      if (tray) tray.setToolTip(zhMode ? 'DeepSeek Harness (检查更新中...)' : 'DeepSeek Harness (checking...)')
      const result = await autoUpdater.checkForUpdates()
      if (!result || !result.updateInfo || result.updateInfo.version === app.getVersion()) {
        dialog.showMessageBox(mainWindow || undefined, {
          type: 'info',
          title: zhMode ? '已是最新版本' : 'Up to Date',
          message: zhMode
            ? `当前版本 ${app.getVersion()} 已是最新。`
            : `Version ${app.getVersion()} is up to date.`
        })
      }
    } catch (err) {
      dialog.showMessageBox(mainWindow || undefined, {
        type: 'info',
        title: zhMode ? '检查更新' : 'Check for Updates',
        message: zhMode
          ? `自动更新暂不可用（未找到 GitHub Release）。\n\n如需更新，请访问：\nhttps://github.com/KK-Irving/dsh-web-launcher/releases\n\n当前版本：${app.getVersion()}`
          : `Auto-update unavailable (no GitHub Release found).\n\nVisit:\nhttps://github.com/KK-Irving/dsh-web-launcher/releases\n\nCurrent version: ${app.getVersion()}`
      })
    }
    updateTrayMenu()
  } else {
    await checkAndPromptLauncherUpdate()
  }
}

async function checkAndPromptLauncherUpdate() {
  const zhMode = t.lang === 'zh'
  const result = await checkLauncherUpdate()

  if (result.error) {
    dialog.showErrorBox(
      zhMode ? '检查客户端更新失败' : 'Launcher Update Check Failed',
      result.error
    )
    return
  }

  if (!result.hasUpdate) {
    dialog.showMessageBox(mainWindow || undefined, {
      type: 'info',
      title: zhMode ? '客户端已是最新' : 'Launcher Up to Date',
      message: zhMode
        ? `当前客户端代码已是最新版本（${result.currentHead}）。`
        : `Launcher code is up to date (${result.currentHead}).`
    })
    return
  }

  const { response } = await dialog.showMessageBox(mainWindow || undefined, {
    type: 'question',
    title: zhMode ? '发现客户端更新' : 'Launcher Update Available',
    message: zhMode
      ? `客户端仓库有 ${result.behind} 个新提交。\n当前：${result.currentHead}\n远程：${result.remoteHead}\n\n是否立即更新？（git pull + pnpm install）\n更新后需重启客户端生效。`
      : `Launcher repo has ${result.behind} new commit(s).\nLocal: ${result.currentHead}\nRemote: ${result.remoteHead}\n\nUpdate now? (git pull + pnpm install)\nApp restart required after update.`,
    buttons: [zhMode ? '立即更新' : 'Update Now', zhMode ? '稍后' : 'Later'],
    defaultId: 0
  })

  if (response !== 0) return

  if (tray) tray.setToolTip(zhMode ? 'DeepSeek Harness (正在更新客户端...)' : 'DeepSeek Harness (updating launcher...)')
  const updateResult = await updateLauncher()

  if (updateResult.ok) {
    const { response: restartResponse } = await dialog.showMessageBox(mainWindow || undefined, {
      type: 'info',
      title: zhMode ? '客户端更新完成' : 'Launcher Updated',
      message: zhMode
        ? '客户端代码已更新。需要重启应用才能生效。\n是否立即重启？'
        : 'Launcher code updated. Restart required to apply changes.\nRestart now?',
      detail: updateResult.output.slice(0, 2000),
      buttons: [zhMode ? '立即重启' : 'Restart Now', zhMode ? '稍后' : 'Later'],
      defaultId: 0
    })
    if (restartResponse === 0) {
      app.relaunch()
      isQuitting = true
      app.quit()
    }
  } else {
    dialog.showErrorBox(
      zhMode ? '客户端更新失败' : 'Launcher Update Failed',
      (updateResult.output || updateResult.error).slice(0, 2000)
    )
  }
  updateTrayMenu()
}
// ── Harness Update ───────────────────────────────────────────────────────────

/**
 * Check if the harness repo has upstream updates available.
 * Returns { hasUpdate, currentHead, remoteHead, branch, error }
 */
async function checkHarnessUpdate() {
  const harnessRoot = resolveHarnessRoot()
  if (!harnessRoot) return { hasUpdate: false, error: t('backendNotFound') }

  const { execFile } = require('child_process')
  const { promisify } = require('util')
  const execAsync = promisify(execFile)
  const gitOpts = { cwd: harnessRoot, windowsHide: true, shell: process.platform === 'win32' }

  try {
    // Fetch latest refs from remote (non-destructive)
    await execAsync('git', ['fetch', '--quiet'], gitOpts)

    const { stdout: branch } = await execAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], gitOpts)
    const { stdout: local } = await execAsync('git', ['rev-parse', 'HEAD'], gitOpts)
    const { stdout: remote } = await execAsync('git', ['rev-parse', `origin/${branch.trim()}`], gitOpts)

    const currentHead = local.trim().slice(0, 10)
    const remoteHead = remote.trim().slice(0, 10)
    const hasUpdate = currentHead !== remoteHead

    // Count commits behind
    let behind = 0
    if (hasUpdate) {
      const { stdout: count } = await execAsync('git', ['rev-list', '--count', `HEAD..origin/${branch.trim()}`], gitOpts)
      behind = parseInt(count.trim(), 10) || 0
    }

    return { hasUpdate, currentHead, remoteHead, branch: branch.trim(), behind }
  } catch (err) {
    return { hasUpdate: false, error: err.message }
  }
}

/**
 * Pull latest harness code + reinstall deps + rebuild.
 * Returns { ok, output, error }
 */
async function updateHarness() {
  const harnessRoot = resolveHarnessRoot()
  if (!harnessRoot) return { ok: false, error: t('backendNotFound') }

  const { execFile } = require('child_process')
  const { promisify } = require('util')
  const execAsync = promisify(execFile)
  const isWin = process.platform === 'win32'
  const shellOpts = { cwd: harnessRoot, windowsHide: true, shell: isWin, maxBuffer: 8 * 1024 * 1024 }

  const steps = []
  try {
    // 1. git pull --ff-only
    const pull = await execAsync('git', ['pull', '--ff-only'], { cwd: harnessRoot, windowsHide: true })
    steps.push(`$ git pull --ff-only\n${(pull.stdout + pull.stderr).trim()}`)

    // 2. pnpm install
    const install = await execAsync('pnpm', ['install'], shellOpts)
    steps.push(`$ pnpm install\n${(install.stdout + install.stderr).trim().slice(0, 2000)}`)

    // 3. pnpm run build
    const build = await execAsync('pnpm', ['run', 'build'], shellOpts)
    steps.push(`$ pnpm run build\n${(build.stdout + build.stderr).trim().slice(0, 2000)}`)

    return { ok: true, output: steps.join('\n\n') }
  } catch (err) {
    const errOutput = (err.stdout || '') + (err.stderr || '') + (err.message || '')
    steps.push(`ERROR: ${errOutput.slice(0, 2000)}`)
    return { ok: false, output: steps.join('\n\n'), error: err.message }
  }
}
// ── Settings & Extension Manager ─────────────────────────────────────────────

async function checkAndPromptHarnessUpdate() {
  const zhMode = t.lang === 'zh'
  if (tray) tray.setToolTip(zhMode ? 'DeepSeek Harness (正在检查更新...)' : 'DeepSeek Harness (checking for updates...)')

  const result = await checkHarnessUpdate()

  if (result.error) {
    dialog.showErrorBox(
      zhMode ? '检查更新失败' : 'Update Check Failed',
      result.error
    )
    updateTrayMenu()
    return
  }

  if (!result.hasUpdate) {
    dialog.showMessageBox(mainWindow || undefined, {
      type: 'info',
      title: zhMode ? 'Harness 已是最新' : 'Harness Up to Date',
      message: zhMode
        ? `当前分支 ${result.branch} 已是最新版本（${result.currentHead}）。`
        : `Branch ${result.branch} is up to date (${result.currentHead}).`
    })
    updateTrayMenu()
    return
  }

  const { response } = await dialog.showMessageBox(mainWindow || undefined, {
    type: 'question',
    title: zhMode ? '发现 Harness 更新' : 'Harness Update Available',
    message: zhMode
      ? `分支 ${result.branch} 有 ${result.behind} 个新提交可用。\n当前：${result.currentHead}\n远程：${result.remoteHead}\n\n是否立即更新？（将执行 git pull + pnpm install + pnpm run build）`
      : `Branch ${result.branch} has ${result.behind} new commit(s).\nLocal: ${result.currentHead}\nRemote: ${result.remoteHead}\n\nUpdate now? (git pull + pnpm install + pnpm run build)`,
    buttons: [zhMode ? '立即更新' : 'Update Now', zhMode ? '稍后' : 'Later'],
    defaultId: 0
  })

  if (response !== 0) {
    updateTrayMenu()
    return
  }

  // Perform update
  if (tray) tray.setToolTip(zhMode ? 'DeepSeek Harness (正在更新...)' : 'DeepSeek Harness (updating...)')

  const updateResult = await updateHarness()

  if (updateResult.ok) {
    const { response: restartResponse } = await dialog.showMessageBox(mainWindow || undefined, {
      type: 'info',
      title: zhMode ? '更新完成' : 'Update Complete',
      message: zhMode
        ? '仓库已更新、依赖已安装、构建已完成。\n是否重启后端服务？'
        : 'Repository updated, dependencies installed, build complete.\nRestart the backend service?',
      detail: updateResult.output.slice(0, 3000),
      buttons: [zhMode ? '重启后端' : 'Restart Backend', zhMode ? '稍后手动重启' : 'Later'],
      defaultId: 0
    })
    if (restartResponse === 0) {
      await restartBackend()
    }
  } else {
    dialog.showErrorBox(
      zhMode ? '更新失败' : 'Update Failed',
      (zhMode ? '更新过程中出错：\n\n' : 'Error during update:\n\n') + (updateResult.output || updateResult.error).slice(0, 3000)
    )
  }

  updateTrayMenu()
}
function showSettings() {
  const harnessRoot = resolveHarnessRoot() || '(not found)'
  const extCount = store.get('extensions').length
  dialog.showMessageBox(mainWindow || undefined, {
    type: 'info',
    title: t('settingsTitle'),
    message: [
      `Harness Root: ${harnessRoot}`,
      `Port: ${DEFAULT_PORT}`,
      `Global Shortcut: ${store.get('globalShortcut')}`,
      `Minimize to Tray: ${store.get('minimizeToTray')}`,
      `Auto-start Backend: ${store.get('autoStartBackend')}`,
      `Auto-update: ${store.get('autoUpdate')}`,
      `Extensions: ${extCount}`
    ].join('\n'),
    buttons: [t('settingsBtnOk'), t('settingsBtnChangePath'), t.lang === 'zh' ? 'Switch to English' : '切换为中文'],
  }).then(({ response }) => {
    if (response === 2) {
      const newLang = t.lang === 'zh' ? 'en' : 'zh'
      store.set('language', newLang)
      t = createT(store)
      updateTrayMenu()
      dialog.showMessageBox(mainWindow || undefined, { message: newLang === 'en' ? 'Language switched to English. Some changes take effect after restart.' : '已切换为中文。部分更改将在重启后生效。' })
      return
    }
    if (response === 1) {
      dialog.showOpenDialog({ properties: ['openDirectory'] }).then(({ filePaths }) => {
        if (filePaths.length > 0 && isValidHarnessRoot(filePaths[0])) {
          store.set('harnessRoot', filePaths[0])
          dialog.showMessageBox({ message: `Updated to: ${filePaths[0]}` })
        } else if (filePaths.length > 0) {
          dialog.showErrorBox(t('settingsInvalidPath'), t('settingsInvalidPathMsg'))
        }
      })
    }
  })
}

function showExtensionManager() {
  const extensions = store.get('extensions')
  const message = extensions.length === 0
    ? t('extNone')
    : `Installed extensions (${extensions.length}):\n\n` + extensions.map((p, i) => `${i + 1}. ${path.basename(p)}\n   ${p}`).join('\n\n')

  dialog.showMessageBox(mainWindow || undefined, {
    type: 'info',
    title: t('extTitle'),
    message,
    buttons: [t('extBtnOk'), t('extBtnAdd'), ...(extensions.length > 0 ? [t('extBtnRemoveLast')] : [])]
  }).then(({ response }) => {
    if (response === 1) {
      dialog.showOpenDialog({
        properties: ['openDirectory'],
        title: t('extSelectTitle')
      }).then(({ filePaths }) => {
        if (filePaths.length > 0) {
          addExtension(filePaths[0])
        }
      })
    } else if (response === 2 && extensions.length > 0) {
      removeExtension(extensions[extensions.length - 1])
    }
  })
}

// ── Global Shortcut ──────────────────────────────────────────────────────────

function registerGlobalShortcut() {
  const shortcut = store.get('globalShortcut')
  if (!shortcut) return

  try {
    globalShortcut.register(shortcut, () => {
      if (mainWindow && mainWindow.isVisible() && mainWindow.isFocused()) {
        mainWindow.hide()
      } else {
        showWindow()
      }
    })
  } catch (err) {
    console.warn(`[dsh-desktop] Failed to register global shortcut "${shortcut}": ${err.message}`)
  }
}

// ── IPC Handlers (Tab Bar Communication) ─────────────────────────────────────

function registerTabIpc() {
  ipcMain.on('tab-new', () => { createTab() })
  ipcMain.on('tab-close', (_event, id) => { closeTab(id || activeTabId) })
  ipcMain.on('tab-activate', (_event, id) => { activateTab(id) })
  ipcMain.on('tab-reload', (_event, id) => {
    const tab = tabs.find(t => t.id === id)
    if (tab) tab.view.webContents.reload()
  })

  // Window controls from tab bar
  ipcMain.on('window-minimize', () => { if (mainWindow) mainWindow.minimize() })
  ipcMain.on('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) mainWindow.unmaximize()
      else mainWindow.maximize()
    }
  })
  ipcMain.on('window-close', () => { if (mainWindow) mainWindow.close() })

  // Config access
  ipcMain.handle('get-config', (_event, key) => store.get(key))
  ipcMain.handle('set-config', (_event, key, value) => { store.set(key, value); return true })
  ipcMain.handle('set-language', (_event, lang) => {
    if (lang === 'zh' || lang === 'en') {
      store.set('language', lang)
      t = createT(store)
      updateTrayMenu()
      return true
    }
    return false
  })
  ipcMain.handle('get-backend-status', () => ({
    running: backendProcess !== null || backendAdopted,
    adopted: backendAdopted,
    url: WEB_URL
  }))
  ipcMain.handle('restart-backend', async () => { await restartBackend(); return { ok: true } })
  ipcMain.handle('get-tabs', () => tabs.map(t => ({ id: t.id, title: t.title, active: t.id === activeTabId })))

  // Harness update
  ipcMain.handle('check-harness-update', async () => await checkHarnessUpdate())
  ipcMain.handle('update-harness', async () => await updateHarness())
  ipcMain.handle('check-launcher-update', async () => await checkLauncherUpdate())
  ipcMain.handle('update-launcher', async () => await updateLauncher())
}

// ── App Lifecycle ────────────────────────────────────────────────────────────

const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showWindow()
  })

  app.on('ready', async () => {
    // Register IPC for tab bar
    registerTabIpc()

    // Load Chrome extensions
    await loadExtensions()

    // Create tray
    createTray()
    updateTrayStatus('starting')

    // Register global shortcut
    registerGlobalShortcut()

    // Init auto-updater
    initAutoUpdater()

    // Resolve harness root
    const harnessRoot = resolveHarnessRoot()

    if (!harnessRoot) {
      updateTrayStatus('no repo')
      createMainWindow()
      dialog.showErrorBox(
        t('notFoundTitle'),
        t('notFoundMessage')
      )
      return
    }

    store.set('harnessRoot', harnessRoot)
    console.log(`[dsh-desktop] Harness root: ${harnessRoot}`)

    // Check if service is already running
    const alreadyRunning = await checkWebReady()

    if (alreadyRunning) {
      backendAdopted = true
      updateTrayStatus('running')
      console.log('[dsh-desktop] Adopted existing DSH web service')
    } else if (store.get('autoStartBackend')) {
      startBackend(harnessRoot)
      updateTrayStatus('starting')

      const ready = await waitForReady()
      if (ready) {
        updateTrayStatus('running')
      } else {
        updateTrayStatus('error')
        const zhFail = t.lang === 'zh'
        dialog.showErrorBox(
          t('backendFailTitle'),
          zhFail
            ? `DSH Web 后端在 90 秒内未就绪。\n\n可能原因：\n  - pnpm / npm / node 未安装或不在 PATH 中\n  - 首次使用需先在仓库目录执行：\n    pnpm install && pnpm run build\n\n仓库路径：${harnessRoot}`
            : `DSH web backend not ready within 90s.\n\nPossible causes:\n  - pnpm / npm / node not in PATH\n  - First time? Run: pnpm install && pnpm run build\n\nHarness path: ${harnessRoot}`
        )
      }
    }

    // Create main window
    createMainWindow()

    // Start health monitor
    startHealthMonitor()
  })

  app.on('window-all-closed', () => {
    if (!store.get('minimizeToTray')) {
      isQuitting = true
      app.quit()
    }
  })

  app.on('before-quit', () => {
    isQuitting = true
    stopHealthMonitor()
    globalShortcut.unregisterAll()
    if (backendProcess && !backendAdopted) {
      stopBackend()
    }
  })

  app.on('activate', () => {
    showWindow()
  })
}