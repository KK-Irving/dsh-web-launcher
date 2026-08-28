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

const { app, BrowserWindow, BrowserView, Tray, Menu, nativeImage, shell, globalShortcut, dialog, session, ipcMain, net } = require('electron')
const path = require('path')
const { spawn } = require('child_process')
const http = require('http')
const fs = require('fs')
const Store = require('electron-store')

const { createT } = require('./locale')

// ── Logging System ────────────────────────────────────────────────────────────
// Logs written to: <install_or_dev_dir>/logs/<YYYY-MM-DD>/<HH-mm-ss>.log
// Controlled by store.debugLog (toggle from tray menu)

const _logsEnabled = (() => {
  try {
    // Read store early - electron-store may not be initialized yet at require time
    // We'll re-check after store is created
    return false
  } catch { return false }
})()
let _logStream = null
let _logDir = ''

function initLogger() {
  const enabled = store.get('debugLog')
  if (!enabled) { _log = () => {}; return }

  const baseDir = app.isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..', '..', '..')
  const now = new Date()
  const dateStr = now.getFullYear() + '-' + String(now.getMonth()+1).padStart(2,'0') + '-' + String(now.getDate()).padStart(2,'0')
  const timeStr = String(now.getHours()).padStart(2,'0') + '-' + String(now.getMinutes()).padStart(2,'0') + '-' + String(now.getSeconds()).padStart(2,'0')
  _logDir = path.join(baseDir, 'logs', dateStr)
  
  try {
    fs.mkdirSync(_logDir, { recursive: true })
    const logFile = path.join(_logDir, timeStr + '.log')
    _logStream = fs.createWriteStream(logFile, { flags: 'a' })
    _log = (msg) => {
      const ts = new Date().toLocaleString('zh-CN', { hour12: false, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone })
      const line = `[${ts}] ${msg}`
      _logStream.write(line + '\n')
    }
    _log('=== DeepSeek Harness Desktop v' + app.getVersion() + ' ===')
    _log('Platform: ' + process.platform + ' ' + process.arch)
    _log('Electron: ' + process.versions.electron)
    _log('Packaged: ' + app.isPackaged)
    _log('Exe: ' + process.execPath)
    _log('Timezone: ' + Intl.DateTimeFormat().resolvedOptions().timeZone)
    _log('Log file: ' + logFile)
  } catch (err) {
    console.error('[dsh-desktop] Failed to init logger:', err.message)
    _log = () => {}
  }
}

function _log(msg) {
  // Placeholder until initLogger runs; if debugLog is off, stays as no-op
}

function getLogDir() {
  const baseDir = app.isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..', '..', '..')
  return path.join(baseDir, 'logs')
}




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
    theme: 'system', // 'system' | 'dark' | 'light'
    bookmarks: null, // user-editable bookmarks array
    debugLog: false, // enable startup/runtime logging
    extensions: [] // Chrome extension paths (unpacked directories)
  }
})

let t = createT(store)

const DEFAULT_PORT = store.get('port')
const DEFAULT_HOST = store.get('host')
const WEB_URL = `http://${DEFAULT_HOST}:${DEFAULT_PORT}`
const DSH_BOOT_MARKER = '__DSH_BOOT__'
const STARTUP_TIMEOUT_MS = 180_000
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
  // 1. Stored setting (primary for packaged builds)
  const stored = store.get('harnessRoot')
  if (stored && isValidHarnessRoot(stored)) return stored

  // 2. Environment variable
  const envRoot = process.env.DSH_REPO_ROOT
  if (envRoot && isValidHarnessRoot(envRoot)) return envRoot

  // 3. repo-root.txt (beside the launcher or beside the exe)
  const launcherDir = app.isPackaged
    ? path.dirname(app.getPath('exe'))
    : path.resolve(__dirname, '..', '..', '..')
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
        // 200 + boot marker = unauthenticated DSH (older builds); the auth
        // wall added later answers 401 with its own text — either proves a
        // live DSH web server. A 200 without the marker is someone else.
        if (res.statusCode === 200) resolve(body.includes(DSH_BOOT_MARKER))
        else if (res.statusCode === 401) resolve(body.includes('authentication required'))
        else resolve(false)
      })
    })
    req.on('error', () => resolve(false))
    req.on('timeout', () => { req.destroy(); resolve(false) })
  })
}

/** Cookie-authenticated probe: true only when the server serves the app (200). */
function probeWebAuthOk() {
  return new Promise((resolve) => {
    try {
      const req = net.request({ url: WEB_URL, useSessionCookies: true })
      req.on('response', (res) => { res.resume(); resolve(res.statusCode === 200) })
      req.on('error', () => resolve(false))
      req.end()
    } catch { resolve(false) }
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

// ── Web authentication (DSH browser-session token/cookie) ────────────────────
// DSH now requires browser auth: the URL printed by `dsh web` carries a
// per-process ?token= that mints a durable HttpOnly cookie (default 30 days,
// signed with the harness home's persisted secret). The client consumes the
// token once via a hidden window in the default session; every tab (which
// shares that session) is then authenticated without further work.

let webAuthTokenUrl = null
let webAuthMinting = null

/** Wait for the backend to print its token URL, then mint the session cookie. */
function ensureWebAuthCookie(timeoutMs = 12000) {
  if (webAuthMinting) return webAuthMinting
  webAuthMinting = new Promise((resolve) => {
    const started = Date.now()
    const poll = () => {
      if (webAuthTokenUrl) {
        mintWebAuthCookie(webAuthTokenUrl).then(resolve)
        return
      }
      if (Date.now() - started > timeoutMs || !backendProcess) { resolve(); return }
      setTimeout(poll, 250)
    }
    poll()
  }).finally(() => { webAuthMinting = null })
  return webAuthMinting
}

function mintWebAuthCookie(authUrl) {
  return new Promise((resolve) => {
    let settled = false
    const win = new BrowserWindow({
      show: false, width: 420, height: 300,
      autoHideMenuBar: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })
    const finish = (minted) => {
      if (settled) return
      settled = true
      try { win.destroy() } catch { /* already gone */ }
      _log('web auth cookie minted=' + minted)
      if (minted) reloadDshTabs()
      resolve()
    }
    // did-finish-load on the final '/' (after the 303 + Set-Cookie) means minted
    win.webContents.on('did-finish-load', () => {
      if ((win.webContents.getURL() || '').startsWith(WEB_URL)) finish(true)
    })
    win.webContents.on('did-fail-load', () => finish(false))
    win.loadURL(authUrl).catch(() => finish(false))
    setTimeout(() => finish(false), 8000)
  })
}

/** Reload DSH web tabs so they pick up the freshly minted cookie. */
function reloadDshTabs() {
  for (const tab of tabs) {
    if (tab.view && !tab.view.webContents.isDestroyed()
      && typeof tab.url === 'string' && tab.url.startsWith(WEB_URL)) {
      tab.view.webContents.loadURL(tab.url).catch(() => { /* view closing */ })
    }
  }
}

function resolveRunner(harnessRoot) {
  _log('resolveRunner for: ' + harnessRoot)
  const { execSync } = require('child_process')
  const isWin = process.platform === 'win32'
  function commandExists(c) {
    try { execSync(isWin ? `where ${c}` : `which ${c}`, { windowsHide: true, stdio: 'ignore' }); return true }
    catch { return false }
  }
  if (commandExists('pnpm')) return { cmd: isWin ? 'cmd.exe' : 'bash', args: isWin ? ['/d', '/s', '/c', 'pnpm dsh web --no-open'] : ['-c', 'pnpm dsh web'] }
  if (commandExists('npm')) return { cmd: isWin ? 'cmd.exe' : 'bash', args: isWin ? ['/d', '/s', '/c', 'npm run dsh -- web --no-open'] : ['-c', 'npm run dsh -- web'] }
  if (commandExists('node')) {
    const binTs = require('path').join(harnessRoot, 'apps', 'cli', 'src', 'bin.ts')
    if (require('fs').existsSync(binTs)) return { cmd: 'node', args: ['--import', 'tsx/esm', binTs, 'web', '--no-open'] }
  }
  return null
}

function startBackend(harnessRoot) {
  const runner = resolveRunner(harnessRoot)
  if (!runner) { console.error('[dsh-desktop] No pnpm/npm/node found'); return }
  console.log(`[dsh-desktop] Starting: ${runner.cmd} ${runner.args.join(' ')}`)
  _log(`startBackend: ${runner.cmd} ${runner.args.join(' ')}`)

  // Always pipe backend output: it is both diagnosability (debug log) and
  // functionality — the `dsh web: <url>?token=...` line printed by DSH carries
  // the browser-auth token the client must consume once to mint its cookie.
  backendProcess = spawn(runner.cmd, runner.args, {
    cwd: harnessRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
    env: { ...process.env }
  })

  {
    let loggedLines = 0
    const pump = (streamName) => (chunk) => {
      for (const line of String(chunk).split(/\r?\n/)) {
        if (!line.trim()) continue
        loggedLines++
        // Capture the authenticated web URL (first local URL wins; LAN copy ignored)
        const authMatch = line.match(/^dsh web: (\S+?token=[A-Za-z0-9_-]+)/)
        if (authMatch) {
          if (webAuthTokenUrl !== authMatch[1]) {
            webAuthTokenUrl = authMatch[1]
            journal('captured dsh web auth url (token rotates per backend start)')
          }
        }
        // Full output early on; afterwards only error-looking lines to cap log size
        if (loggedLines <= 200 || /error|failed|exception|EADDRINUSE|EPERM/i.test(line)) {
          _log(`backend ${streamName}: ${line}`)
        }
      }
    }
    backendProcess.stdout.on('data', pump('stdout'))
    backendProcess.stderr.on('data', pump('stderr'))
  }

  backendProcess.on('exit', (code) => {
    if (!isQuitting) {
      console.error(`[dsh-desktop] Backend exited with code ${code}`)
      _log(`backend exited: code=${code}`)
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
  _log('stopBackend called')
  try {
    if (process.platform === 'win32') {
      spawn('taskkill', ['/PID', String(backendProcess.pid), '/T', '/F'], { windowsHide: true })
    } else {
      // The backend is spawned with detached:false, so no process group exists
      // and the old process.kill(-pid, ...) targeted a group that never was —
      // an ESRCH no-op that left the backend running. Kill the child directly,
      // escalating to SIGKILL after a short grace period.
      const proc = backendProcess
      const pid = proc.pid
      try { proc.kill('SIGTERM') } catch { /* already gone */ }
      setTimeout(() => {
        try {
          if (pid && process.kill(pid, 0)) process.kill(pid, 'SIGKILL')
        } catch { /* exited already */ }
      }, 2000)
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

  // New tab page: load local HTML instead of remote URL
  if (url === 'newtab') {
    _log('createTab: newtab')
    const id = generateTabId()
    const view = new BrowserView({
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    })
    view.webContents.loadFile(path.join(__dirname, '..', 'assets', 'newtab.html'))
    const tab = { id, view, title: t('newTab'), url: 'newtab' }
    tabs.push(tab)
    activateTab(id)
    notifyTabBar()
    persistTabs()
    return tab
  }

  const id = generateTabId()
  const view = new BrowserView({
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  view.webContents.on('page-title-updated', (_event, title) => {
    const tab = tabs.find(tb => tb.id === id)
    if (tab) {
      tab.title = title
      notifyTabBar()
    }
  })

  view.webContents.on('did-navigate', (_event, navUrl) => {
    const tab = tabs.find(tb => tb.id === id)
    if (tab) {
      tab.url = navUrl
      persistTabs()
    }
  })

  // Watch for DSH theme changes via injected MutationObserver
  view.webContents.on('dom-ready', () => {
    // DSH applies themes by writing html.style.colorScheme and toggling
    // body[data-ds-dark-theme]. Tab renderers are sandboxed (no `require`),
    // so report through the dshDesktop preload bridge instead.
    view.webContents.executeJavaScript(`
      (function() {
        if (window.__dshThemeObserver) return;
        let lastScheme = null;
        function reportTheme() {
          const scheme = (document.body && document.body.hasAttribute('data-ds-dark-theme'))
            ? 'dark'
            : (document.documentElement.style.colorScheme === 'dark' ? 'dark' : 'light');
          if (scheme === lastScheme) return;
          lastScheme = scheme;
          if (window.dshDesktop && window.dshDesktop.reportTheme) {
            window.dshDesktop.reportTheme(scheme);
          }
        }
        const observer = new MutationObserver(reportTheme);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
        if (document.body) {
          observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
        } else {
          document.addEventListener('DOMContentLoaded', () => {
            observer.observe(document.body, { attributes: true, attributeFilter: ['data-ds-dark-theme'] });
          });
        }
        window.__dshThemeObserver = observer;
        reportTheme();
      })()
    `).catch(() => {})
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

  _log('createTab: ' + url)
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
  const tab = tabs.find(tb => tb.id === id)
  if (!tab) return

  // Remove all views, add the active one
  for (const tb of tabs) {
    mainWindow.removeBrowserView(tb.view)
  }
  mainWindow.addBrowserView(tab.view)
  activeTabId = id

  // Resize view to fill content area (below tab bar)
  resizeActiveView()
  notifyTabBar()
}

function closeTab(id) {
  const index = tabs.findIndex(tb => tb.id === id)
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
      // Last tab closed - open the local New Tab page (consistent with the "+" button)
      createTab('newtab')
    }
  }

  notifyTabBar()
  persistTabs()
}

function resizeActiveView() {
  if (!mainWindow) return
  const tab = tabs.find(tb => tb.id === activeTabId)
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
  const tabData = tabs.map(tb => ({
    id: tb.id,
    title: tb.title || t('newTab'),
    active: tb.id === activeTabId
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

/** Push a resolved theme to the shell tab bar and every New Tab page. */
function pushThemeToRenderers(theme) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('dsh-theme', theme)
  } catch { /* window gone */ }
  for (const tb of tabs) {
    if (tb.url === 'newtab' && tb.view && !tb.view.webContents.isDestroyed()) {
      tb.view.webContents.send('newtab-theme', theme)
    }
  }
}

function persistTabs() {
  store.set('tabs', tabs.map(tb => tb.url))
}

// ── Chrome Extension Loading ─────────────────────────────────────────────────

async function loadExtensions() {
  _log('loadExtensions: ' + (store.get('extensions') || []).length + ' extensions')
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
  _log('addExtension: ' + extPath)
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

// Dedicated client-update window (own steps/progress bar — do NOT reuse the
// harness update-progress page: its step names are git/pnpm-specific and the
// shared lifecycle caused check-phase confusion).
let clientUpdWindow = null
let clientUpdFoundVersion = null
let clientUpdStage = 'check' // 'check' | 'download' — for error step mapping
let lastProgressSentAt = 0

function createClientUpdateWindow() {
  if (clientUpdWindow && !clientUpdWindow.isDestroyed()) return
  clientUpdWindow = new BrowserWindow({
    width: 470, height: 430,
    resizable: false, minimizable: true, maximizable: false,
    frame: false, show: false, autoHideMenuBar: true,
    icon: getIconPath(), title: t('cliTitle'),
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  })
  clientUpdWindow.loadFile(path.join(__dirname, '..', 'assets', 'client-update.html'))
  clientUpdWindow.once('ready-to-show', () => clientUpdWindow.show())
  clientUpdWindow.on('closed', () => { clientUpdWindow = null })
}

function clientUpdWinOpen() {
  return !!(clientUpdWindow && !clientUpdWindow.isDestroyed())
}

function sendClientUI(data) {
  if (!clientUpdWinOpen()) return
  clientUpdWindow.webContents.send('client-update-ui', {
    ...data, lang: t.lang, theme: currentResolvedTheme()
  })
}

function closeClientUpdateWindow() {
  if (clientUpdWindow && !clientUpdWindow.isDestroyed()) clientUpdWindow.close()
  clientUpdWindow = null
  clientUpdFoundVersion = null
}

/**
 * Foreground client-update flow — parity with the harness updater, but in a
 * purpose-built window: check GitHub → confirm download (in-window) → live
 * percentage → Restart & Install. Every state is visible; nothing is silent.
 */
async function startClientUpdateFlow() {
  if (!app.isPackaged || !autoUpdater) {
    // Dev/source builds keep their flows (git-pull launcher update / GitHub link)
    await checkForAllUpdates()
    return
  }
  if (clientUpdWinOpen()) { clientUpdWindow.focus(); return }
  createClientUpdateWindow()
  clientUpdStage = 'check'
  sendClientUI({ phase: 'checking', clearLog: true })
  journal('client update flow started')
  try {
    const res = await autoUpdater.checkForUpdates()
    const v = res && res.updateInfo && res.updateInfo.version
    if (!v || v === app.getVersion()) {
      sendClientUI({ phase: 'uptodate', message: t('cliUpToDateDone', app.getVersion()) })
    } else {
      clientUpdFoundVersion = v
      sendClientUI({
        phase: 'found', version: v,
        subtitle: t('cliFoundSub', v),
        message: t('cliFoundSub', v)
      })
    }
  } catch (err) {
    journal('client update check failed: ' + (err && err.stack || err))
    sendClientUI({ phase: 'error', failedStep: 1, errorMessage: String(err.message || err) })
  }
}

function handleClientUpdateAction(payload) {
  const action = payload && payload.action
  if (action === 'download') {
    const v = clientUpdFoundVersion || ''
    clientUpdStage = 'download'
    sendClientUI({ phase: 'downloading', percent: 0, subtitle: t('cliStartDlLog', v), log: t('cliStartDlLog', v) })
    autoUpdater.downloadUpdate().catch((err) => {
      journal('client update download failed: ' + (err && err.stack || err))
      sendClientUI({ phase: 'error', failedStep: 2, errorMessage: String(err.message || err) })
    })
  } else if (action === 'skip') {
    clientUpdStage = 'check'
    sendClientUI({ phase: 'skipped', message: t('cliSkippedSub') })
  } else if (action === 'install') {
    closeClientUpdateWindow()
    isQuitting = true
    try {
      autoUpdater.quitAndInstall()
    } catch (err) {
      journal('quitAndInstall failed: ' + (err && err.stack || err))
      dialog.showErrorBox(t('updateFailedTitle'), String(err.message || err))
    }
  } else if (action === 'close') {
    closeClientUpdateWindow()
  }
}

function     initAutoUpdater() {
  if (!store.get('autoUpdate')) return
  try {
    // electron-updater is optional - only works in packaged builds
    const { autoUpdater: updater } = require('electron-updater')
    autoUpdater = updater

    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    autoUpdater.on('update-available', (info) => {
      console.log(`[dsh-desktop] Update available: ${info.version}`)
      // The dedicated window reports this itself; dialogs only for silent checks.
      if (clientUpdWinOpen()) return
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

    // Live download percentage into the dedicated window.
    autoUpdater.on('download-progress', (p) => {
      if (!clientUpdWinOpen()) return
      const now = Date.now()
      const pct = Math.round(p.percent || 0)
      const milestone = (pct % 10 === 0)
      if (!milestone && now - lastProgressSentAt < 400) return
      lastProgressSentAt = now
      const transferred = (p.transferred / 1048576).toFixed(1)
      const total = (p.total / 1048576).toFixed(1)
      const speed = ((p.bytesPerSecond || 0) / 1048576).toFixed(2)
      sendClientUI({
        phase: 'downloading', percent: pct,
        subtitle: t('cliProgressSub', pct, transferred, total, speed)
      })
      if (milestone) sendClientUI({ log: `${pct}% · ${transferred}/${total} MB` })
    })

    autoUpdater.on('update-downloaded', (info) => {
      console.log(`[dsh-desktop] Update downloaded: ${info.version}`)
      if (clientUpdWinOpen()) {
        sendClientUI({
          phase: 'ready', version: info.version,
          subtitle: t('cliReadySub', info.version),
          message: t('cliReadyLog')
        })
        return
      }
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
      journal('auto-updater error: ' + (err && err.stack || err))
      if (clientUpdWinOpen()) {
        sendClientUI({
          phase: 'error',
          failedStep: clientUpdStage === 'download' ? 2 : 1,
          errorMessage: String(err.message || err)
        })
      }
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


// ── Splash Window ────────────────────────────────────────────────────────────

let splashWindow = null

function     createSplashWindow() {
  const { BrowserWindow } = require('electron')
  splashWindow = new BrowserWindow({
    width: 500,
    height: 350,
    frame: false,
    transparent: false,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    show: true,
    backgroundColor: '#1a1a2e',
    title: 'DSH 启动中…',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  splashWindow.loadFile(path.join(__dirname, '..', 'assets', 'splash.html'))
  splashWindow.on('closed', () => { splashWindow = null })
}

function sendSplashStatus(data) {
  if (splashWindow && !splashWindow.isDestroyed()) {
    data.version = app.getVersion()
    splashWindow.webContents.send('splash-status', data)
  }
}

// ── Startup crash journal ────────────────────────────────────────────────────
// _log() is opt-in via debugLog; when startup breaks on a normal install there
// is nothing to look at. This appends unconditionally (best-effort) so every
// early failure leaves a trace next to the other logs.
function startupLogDir() {
  try { return getLogDir() } catch { return process.cwd() }
}
function journal(msg) {
  try {
    const dir = startupLogDir()
    require('fs').mkdirSync(dir, { recursive: true })
    require('fs').appendFileSync(
      require('path').join(dir, 'startup-crash.log'),
      `[${new Date().toISOString()}] ${msg}\n`
    )
  } catch { /* never let diagnostics break the app */ }
}

/** setTimeout wrapper that reports instead of silently swallowing failures. */
function safeTimeout(fn, ms) {
  setTimeout(() => {
    try { fn() } catch (err) {
      journal('deferred-step failed: ' + (err && err.stack || err))
      console.error('[dsh-desktop] deferred step failed:', err)
    }
  }, ms)
}

function closeSplashAndShowMain() {
  _log('closeSplashAndShowMain')
  // Create the main window BEFORE closing the splash: if creation fails the
  // splash stays on screen as feedback and the failure lands in the journal,
  // instead of leaving a headless process.
  const win = createMainWindow()
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
    splashWindow = null
  }
  return win
}

/**
 * Register window-wide keyboard accelerators through an invisible application
 * menu (root items visible:false ⇒ nothing rendered in the title area).
 */
function registerAcceleratorMenu() {
  function activeTab() {
    return tabs.find(tb => tb.id === activeTabId) || null
  }
  const menu = Menu.buildFromTemplate([
    {
      label: 'Shortcuts',
      visible: false,
      submenu: [
        { label: 'New Tab', accelerator: 'CmdOrCtrl+T', click: () => createTab('newtab') },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => closeTab(activeTabId) },
        { label: 'Reload Tab', accelerator: 'CmdOrCtrl+R', click: () => { const tab = activeTab(); if (tab && !tab.view.webContents.isDestroyed()) tab.view.webContents.reload() } },
        { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: () => cycleActiveTab(1) },
        { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: () => cycleActiveTab(-1) },
        { label: 'Toggle Developer Tools', accelerator: 'F12', click: () => { const tab = activeTab(); if (tab && !tab.view.webContents.isDestroyed()) tab.view.webContents.toggleDevTools() } }
      ]
    }
  ])
  Menu.setApplicationMenu(menu)
}

/** Activate neighbor tab with wrap-around; direction ±1. */
function cycleActiveTab(step) {
  if (tabs.length < 2) return
  const idx = tabs.findIndex(tb => tb.id === activeTabId)
  const next = ((idx === -1 ? 0 : idx) + step + tabs.length) % tabs.length
  activateTab(tabs[next].id)
}

function createMainWindow() {
  _log('createMainWindow')
  // Hidden application menu: its accelerators (Ctrl+T/W/R, F12) work no matter
  // whether the tab bar or a BrowserView holds keyboard focus — plain
  // window-level keydown listeners can't see keys typed inside BrowserViews.
  // The root item is visible:false, but that alone only hides it from layout —
  // Windows can still reveal the bar via Alt/F10 (exposing "Shortcuts").
  // setMenuBarVisibility(false) below disables the bar entirely, so the menu
  // exists purely as an accelerator carrier and can never surface as UI.
  try {
    registerAcceleratorMenu()
  } catch (err) {
    // Menu failure must never take the whole window down with it — degrade to
    // no accelerators instead of an unshippable client.
    journal('registerAcceleratorMenu FAILED (continuing without shortcuts): ' + (err && err.stack || err))
    console.error('[dsh-desktop] accelerator menu registration failed:', err)
  }
  journal('menu ok')

  const saved = store.get('windowBounds') || {}

  const windowOptions = {
    width: saved.width || 1280,
    height: saved.height || 860,
    minWidth: 800,
    minHeight: 600,
    icon: getIconPath(),
    title: 'DeepSeek Harness',
    show: false, // will show (maximized or normal) after creation
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  }

  // Restore position only when it still lands on a connected display
  if (typeof saved.x === 'number' && typeof saved.y === 'number') {
    try {
      const { screen } = require('electron')
      const visible = screen.getAllDisplays().some(d => (
        saved.x >= d.workArea.x &&
        saved.x < d.workArea.x + d.workArea.width &&
        saved.y >= d.workArea.y &&
        saved.y < d.workArea.y + d.workArea.height
      ))
      if (visible) { windowOptions.x = saved.x; windowOptions.y = saved.y }
    } catch { /* screen unavailable — use default centering */ }
  }
  const restoreMaximized = !!saved.isMaximized

  mainWindow = new BrowserWindow(windowOptions)

  // Fully disable the menu bar (Alt/F10 can never reveal it). The in-memory
  // menu from registerAcceleratorMenu() keeps its accelerators working.
  mainWindow.setMenuBarVisibility(false)
  journal('main window created bounds=' + JSON.stringify(mainWindow.getBounds()))

  // Load the tab bar shell (lightweight HTML)
  mainWindow.loadFile(path.join(__dirname, '..', 'assets', 'shell.html'))

  // Show maximized by default on first run, afterwards restore last state
  if (!store.get('startMinimized')) {
    if (restoreMaximized) mainWindow.maximize()
    mainWindow.show()
    journal('main window shown restoreMaximized=' + restoreMaximized)
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
  if (!mainWindow || mainWindow.isDestroyed()) return
  const bounds = mainWindow.getBounds()
  // Never persist garbage measurements (e.g. transient/composited states can
  // report tiny or zeroed rects); restoring those would strand the window.
  if (!(bounds.width >= 500 && bounds.height >= 400)) return
  const prev = store.get('windowBounds') || {}
  store.set('windowBounds', {
    ...prev,
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    isMaximized: mainWindow.isMaximized()
  })
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
  // In packaged build, icon is in extraResources
  if (app.isPackaged) {
    const resourceIco = path.join(process.resourcesPath, 'dsh-web.ico')
    if (fs.existsSync(resourceIco)) return resourceIco
  }
  // Dev mode: relative to project root
  const devIco = path.resolve(__dirname, '..', '..', '..', 'dsh-web.ico')
  if (fs.existsSync(devIco)) return devIco
  // Fallback: create a simple 16x16 icon from nativeImage
  return ''
}

// ── System Tray ──────────────────────────────────────────────────────────────

function     createTray() {
  const iconPath = getIconPath()
  let icon
  if (iconPath && fs.existsSync(iconPath)) {
    icon = nativeImage.createFromPath(iconPath)
    // .ico files on Windows work directly with Tray, no need to resize
  } else {
    // Fallback: use app's built-in icon or create a 16x16 data URL icon
    const fallbackDataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMklEQVQ4T2NkYPj/n4EBFTAiC6ALMDIyMjKgK0AXQA9kdAHsauEC2NUNGgOjYTAaBgBfmBARGoiJlAAAAABJRU5ErkJggg=='
    icon = nativeImage.createFromDataURL(fallbackDataUrl)
  }
  try {
    tray = new Tray(icon)
  } catch (err) {
    console.error('[dsh-desktop] Failed to create tray:', err.message)
    // Last resort fallback
    const fallback = nativeImage.createFromDataURL('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMklEQVQ4T2NkYPj/n4EBFTAiC6ALMDIyMjKgK0AXQA9kdAHsauEC2NUNGgOjYTAaBgBfmBARGoiJlAAAAABJRU5ErkJggg==')
    tray = new Tray(fallback)
  }
  tray.setToolTip('DeepSeek Harness')

  updateTrayMenu()

  tray.on('double-click', () => {
    showWindow()
  })
}

function toggleDebugLog() {
  _log('toggleDebugLog called')
  const current = store.get('debugLog')
  store.set('debugLog', !current)
  updateTrayMenu()
  const logPath = getLogDir()
  dialog.showMessageBox(mainWindow || undefined, {
    type: 'info',
    title: t('debugLogEnabledTitle'),
    message: !current
      ? t('debugLogEnabledMsg', logPath)
      : t('debugLogDisabledMsg')
  })
}

function openLogFolder() {
  _log('openLogFolder: ' + getLogDir())
  const logDir = getLogDir()
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true })
  shell.openPath(logDir)
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
    { label: t('trayNewTab'), click: () => { showWindow(); createTab('newtab') } },
    { label: t('trayRestartBackend'), click: () => restartBackend() },
    { label: t('harnessCheckUpdate'), click: () => checkAndPromptHarnessUpdate() },
    { label: t('trayCheckUpdate'), click: () => startClientUpdateFlow() },
    { type: 'separator' },
    { label: `${t('trayExtensions')} (${extensionCount})`, click: () => showExtensionManager() },
    { label: t('traySettings'), click: () => showSettings() },

    { label: (store.get('debugLog') ? '✓ ' : '') + t('trayDebugLog'), click: () => toggleDebugLog() },
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
  _log('restartBackend called')
  const harnessRoot = resolveHarnessRoot()
  if (!harnessRoot) {
    dialog.showErrorBox(t('appName'), t('backendNotFound'))
    _log('restartBackend: no harness root')
    return
  }

  // Show feedback immediately
  if (tray) tray.setToolTip('DeepSeek Harness (' + t('tipRestartingBackend') + ')')
  updateTrayStatus('starting')

  // 1. Stop existing backend (own or adopted)
  _log('restartBackend: stopping old backend')
  stopBackend()
  backendAdopted = false

  // 2. Wait for port to be released (max 20s)
  _log('restartBackend: waiting for port release')
  const portReleased = await waitForPortFree(DEFAULT_PORT, 20000)
  if (!portReleased) {
    _log('restartBackend: port NOT released after 20s, force killing')
    killProcessOnPort(DEFAULT_PORT)
    await new Promise(r => setTimeout(r, 2000))
  }

  // 3. Start new backend
  _log('restartBackend: starting new backend')
  startBackend(harnessRoot)

  // 4. Wait for ready (with progress feedback)
  _log('restartBackend: waiting for ready')
  const ready = await waitForReady()
  if (ready) {
    _log('restartBackend: backend ready')
    // Fresh process = fresh token; re-mint before reloading tabs.
    await ensureWebAuthCookie()
    updateTrayStatus('running')
    if (tray) tray.setToolTip('DeepSeek Harness')
    // Reload all tabs
    for (const tab of tabs) {
      if (tab.view && !tab.view.webContents.isDestroyed() && tab.url !== 'newtab') {
        tab.view.webContents.loadURL(tab.url)
      }
    }
    dialog.showMessageBox(mainWindow || undefined, {
      type: 'info',
      title: t('backendRestartDoneTitle'),
      message: t('backendRestartDoneMsg')
    })
  } else {
    _log('restartBackend: FAILED to become ready')
    updateTrayStatus('error')
    if (tray) tray.setToolTip('DeepSeek Harness')
    dialog.showErrorBox(
      t('backendRestartFailTitle'),
      t('backendRestartFailMsg')
    )
  }
}

function waitForPortFree(port, timeoutMs) {
  return new Promise((resolve) => {
    const startTime = Date.now()
    const check = () => {
      const net = require('net')
      const socket = new net.Socket()
      let resolved = false
      socket.setTimeout(800)
      socket.once('connect', () => {
        socket.destroy()
        if (Date.now() - startTime > timeoutMs) {
          resolve(false)
        } else {
          setTimeout(check, 800)
        }
      })
      socket.once('timeout', () => { socket.destroy(); resolve(true) })
      socket.once('error', () => { socket.destroy(); resolve(true) })
      socket.connect(port, '127.0.0.1')
    }
    check()
  })
}

/**
 * PIDs of every process LISTENING on exactly this TCP port (Windows).
 * Parses netstat columns directly instead of findstr, so ":3080" can no
 * longer prefix-match neighbors like ":30800", and every owner is returned
 * rather than just the first line hit.
 * @returns {string[]} PIDs (strings), possibly empty
 */
function listListeningPids(port) {
  if (process.platform !== 'win32') return []
  try {
    const { execSync } = require('child_process')
    const result = execSync('netstat -ano -p tcp', { windowsHide: true, encoding: 'utf8' })
    const pids = new Set()
    for (const rawLine of result.split('\n')) {
      const cols = rawLine.trim().split(/\s+/)
      // Proto  LocalAddress  ForeignAddress  State  PID
      if (cols.length >= 5 &&
          /^LISTENING$/i.test(cols[3]) &&
          cols[1].endsWith(':' + port)) {
        pids.add(cols[4])
      }
    }
    return [...pids]
  } catch {
    return []
  }
}

function killProcessOnPort(port) {
  const pids = listListeningPids(port)
  if (pids.length === 0) return
  const { execSync } = require('child_process')
  for (const pid of pids) {
    try {
      _log('killProcessOnPort: killing PID ' + pid + ' on port ' + port)
      execSync('taskkill /PID ' + pid + ' /T /F', { windowsHide: true })
    } catch (e) {
      _log('killProcessOnPort: PID ' + pid + ' failed: ' + e.message)
    }
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
    const pull = await execAsync('git', ['pull', '--ff-only'], { cwd: launcherDir, windowsHide: true, shell: isWin, maxBuffer: 8 * 1024 * 1024 })
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
  _log('checkForAllUpdates called, isPackaged=' + app.isPackaged)
  const isPackaged = app.isPackaged

  if (isPackaged) {
    // Packaged mode: use electron-updater if available, otherwise show GitHub link
    if (autoUpdater) {
      try {
        if (tray) tray.setToolTip('DeepSeek Harness (' + t('checkingUpdatesTooltip') + ')')
        const result = await autoUpdater.checkForUpdates()
        if (!result || !result.updateInfo || result.updateInfo.version === app.getVersion()) {
          dialog.showMessageBox(mainWindow || undefined, {
            type: 'info',
            title: t('clientUpToDateTitle'),
            message: t('clientUpToDateMsg', app.getVersion())
          })
        }
      } catch (err) {
        dialog.showMessageBox(mainWindow || undefined, {
          type: 'info',
          title: t('trayCheckUpdate'),
          message: t('autoUpdateUnavailableMsg', app.getVersion())
        })
      }
      updateTrayMenu()
    } else {
      // autoUpdater not initialized (autoUpdate disabled or require failed)
      dialog.showMessageBox(mainWindow || undefined, {
        type: 'info',
        title: t('trayCheckUpdate'),
        message: t('manualUpdateVisitMsg', app.getVersion())
      })
    }
  } else {
    // Source mode: git pull
    await checkAndPromptLauncherUpdate()
  }
}

async function checkAndPromptLauncherUpdate() {
  const result = await checkLauncherUpdate()

  if (result.error) {
    dialog.showErrorBox(
      t('launcherCheckFailTitle'),
      result.error
    )
    return
  }

  if (!result.hasUpdate) {
    dialog.showMessageBox(mainWindow || undefined, {
      type: 'info',
      title: t('launcherUpToDateTitle'),
      message: t('launcherUpToDateMsg', result.currentHead)
    })
    return
  }

  const { response } = await dialog.showMessageBox(mainWindow || undefined, {
    type: 'question',
    title: t('launcherAvailTitle'),
    message: t('launcherAvailMsg', String(result.behind), result.currentHead, result.remoteHead),
    buttons: [t('harnessUpdateNow'), t('updateBtnLater')],
    defaultId: 0
  })

  if (response !== 0) return

  if (tray) tray.setToolTip('DeepSeek Harness (updating launcher...)')
  _log('user confirmed launcher update')
  createUpdateWindow()
  sendUpdateProgress({
    title: t('launcherUpdatingTitle'),
    subtitle: t('launcherUpdatingSubtitle')
  })
  const updateResult = await updateLauncher()
  sendUpdateProgress({
    finished: true,
    title: updateResult.ok ? t('launcherUpdatedTitle') : t('updateFailedTitle'),
    subtitle: updateResult.ok
      ? t('updateNeedRestart')
      : t('updateErrorGeneric')
  })

  if (updateResult.ok) {
    const { response: restartResponse } = await dialog.showMessageBox(mainWindow || undefined, {
      type: 'info',
      title: t('launcherUpdatedTitle'),
      message: t('launcherUpdatedMsg'),
      detail: updateResult.output.slice(0, 2000),
      buttons: [t('updateBtnRestart'), t('updateBtnLater')],
      defaultId: 0
    })
    if (restartResponse === 0) {
      app.relaunch()
      isQuitting = true
      app.quit()
    }
  } else {
    dialog.showErrorBox(
      t('updateFailedTitle'),
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
// ── Update Progress Window ───────────────────────────────────────────────────

let updateWindow = null

function createUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) return
  updateWindow = new BrowserWindow({
    width: 560,
    height: 480,
    frame: false,
    resizable: false,
    alwaysOnTop: true,
    center: true,
    backgroundColor: '#0c0c14',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  updateWindow.loadFile(path.join(__dirname, '..', 'assets', 'update-progress.html'))
  updateWindow.on('closed', () => { updateWindow = null })
}

/** Resolved light/dark for aux windows (system preference resolved locally). */
function currentResolvedTheme() {
  const pref = store.get('theme') || 'system'
  if (pref === 'system') {
    try { return require('electron').nativeTheme.shouldUseDarkColors ? 'dark' : 'light' } catch { return 'dark' }
  }
  return pref === 'light' ? 'light' : 'dark'
}

function sendUpdateProgress(data) {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.webContents.send('update-progress', { ...data, lang: t.lang, theme: currentResolvedTheme() })
  }
}

function closeUpdateWindow() {
  if (updateWindow && !updateWindow.isDestroyed()) {
    updateWindow.close()
    updateWindow = null
  }
}

ipcMain.on('close-update-window', (event) => {
  if (!isTrustedSender(event)) return
  closeUpdateWindow()
})

ipcOn('client-update-action', (event, payload) => {
  handleClientUpdateAction(payload)
})

async function updateHarness(onProgress) {
  _log('updateHarness started')
  const harnessRoot = resolveHarnessRoot()
  if (!harnessRoot) return { ok: false, error: t('backendNotFound') }

  const { execFile } = require('child_process')
  const { promisify } = require('util')
  const execAsync = promisify(execFile)
  const isWin = process.platform === 'win32'
  const shellOpts = { cwd: harnessRoot, windowsHide: true, shell: isWin, maxBuffer: 8 * 1024 * 1024 }

  const emit = (data) => {
    _log('updateHarness: ' + JSON.stringify(data))
    sendUpdateProgress(data)
    if (onProgress) onProgress(data)
  }

  const steps = []
  let curStep = 1
  try {
    // Step names are sent first so the progress page renders the right rows.
    emit({
      steps: [
        t('harnessStepPull'),
        t('harnessStepClean'),
        t('harnessStepInstall'),
        t('harnessStepBuild')
      ]
    })

    // 1. git pull --ff-only
    curStep = 1
    emit({ step: 1, state: 'active' })
    _log('step1 git pull --ff-only starting')
    const pull = await execAsync('git', ['pull', '--ff-only'], shellOpts)
    const pullOutput = (pull.stdout + pull.stderr).trim()
    steps.push('$ git pull --ff-only\n' + pullOutput)
    emit({ step: 1, state: 'done', log: 'git pull OK', isSuccess: true })
    if (pullOutput) {
      pullOutput.split('\n').slice(0, 30).forEach(l => emit({ log: l }))
    }
    _log('step1 git pull done')

    // 2. pnpm run clean — stale build outputs from the previous checkout made
    //    `pnpm run build` fail after dependency upgrades. Best-effort: an older
    //    checkout without the clean script must not abort the update.
    curStep = 2
    emit({ step: 2, state: 'active', log: '$ pnpm run clean' })
    _log('step2 pnpm run clean starting')
    try {
      const clean = await execAsync('pnpm', ['run', 'clean'], shellOpts)
      const cleanOutput = (clean.stdout + clean.stderr).trim()
      if (cleanOutput) steps.push('$ pnpm run clean\n' + cleanOutput.slice(0, 2000))
      emit({ step: 2, state: 'done', log: 'pnpm run clean OK', isSuccess: true })
    } catch (cleanErr) {
      const cleanOutput = ((cleanErr.stdout || '') + (cleanErr.stderr || '')).trim()
      if (cleanOutput) steps.push('$ pnpm run clean\n' + cleanOutput.slice(0, 2000))
      emit({ step: 2, state: 'done', log: 'pnpm run clean unavailable — continuing', isSuccess: true })
    }
    _log('step2 pnpm run clean done')

    // 3. pnpm install
    curStep = 3
    emit({ step: 3, state: 'active', log: '$ pnpm install' })
    _log('step3 pnpm install starting')
    const install = await execAsync('pnpm', ['install'], shellOpts)
    const installOutput = (install.stdout + install.stderr).trim()
    steps.push('$ pnpm install\n' + installOutput.slice(0, 2000))
    emit({ step: 3, state: 'done', log: 'pnpm install OK', isSuccess: true })
    if (installOutput) {
      installOutput.split('\n').slice(-30).forEach(l => emit({ log: l }))
    }
    _log('step3 pnpm install done')

    // 4. pnpm run build
    curStep = 4
    emit({ step: 4, state: 'active', log: '$ pnpm run build' })
    _log('step4 pnpm run build starting')
    const build = await execAsync('pnpm', ['run', 'build'], shellOpts)
    const buildOutput = (build.stdout + build.stderr).trim()
    steps.push('$ pnpm run build\n' + buildOutput.slice(0, 2000))
    emit({ step: 4, state: 'done', log: 'pnpm run build OK', isSuccess: true })
    if (buildOutput) {
      buildOutput.split('\n').slice(-30).forEach(l => emit({ log: l }))
    }
    _log('step4 pnpm run build done')

    return { ok: true, output: steps.join('\n\n') }
  } catch (err) {
    const errOutput = (err.stdout || '') + (err.stderr || '') + (err.message || '')
    steps.push('ERROR: ' + errOutput.slice(0, 2000))
    emit({ step: curStep, state: 'failed', log: 'ERROR: ' + err.message, isError: true })
    _log('updateHarness FAILED at step ' + curStep + ': ' + err.message)
    return { ok: false, output: steps.join('\n\n'), error: err.message }
  }
}

// ── Settings & Extension Manager ─────────────────────────────────────────────

async function checkAndPromptHarnessUpdate() {
  _log('checkAndPromptHarnessUpdate called')
  if (tray) tray.setToolTip('DeepSeek Harness (' + t('checkingUpdatesTooltip') + ')')

  const result = await checkHarnessUpdate()

  if (result.error) {
    dialog.showErrorBox(
      t('harnessCheckFailTitle'),
      result.error
    )
    updateTrayMenu()
    return
  }

  if (!result.hasUpdate) {
    dialog.showMessageBox(mainWindow || undefined, {
      type: 'info',
      title: t('harnessUpToDateTitle'),
      message: t('harnessUpToDateMsg', result.branch, result.currentHead)
    })
    updateTrayMenu()
    return
  }

  const { response } = await dialog.showMessageBox(mainWindow || undefined, {
    type: 'question',
    title: t('harnessUpdateAvailTitle'),
    message: t('harnessUpdateAvailMsg', result.branch, String(result.behind), result.currentHead, result.remoteHead),
    buttons: [t('harnessUpdateNow'), t('updateBtnLater')],
    defaultId: 0
  })

  if (response !== 0) {
    updateTrayMenu()
    return
  }

  // Perform update with progress window
  if (tray) tray.setToolTip('DeepSeek Harness (updating...)')
  _log('user confirmed harness update, opening progress window')
  createUpdateWindow()
  sendUpdateProgress({
    title: t('updateProgressTitle', 'Harness'),
    subtitle: t('updateProgressSubtitleSteps')
  })

  const updateResult = await updateHarness()

  sendUpdateProgress({
    finished: true,
    title: updateResult.ok ? t('harnessUpdateCompleteTitle') : t('updateFailedTitle'),
    subtitle: updateResult.ok ? t('harnessUpdateDoneSubtitle') : t('updateErrorGeneric')
  })
  _log('harness update finished: ok=' + updateResult.ok)

  if (updateResult.ok) {
    const { response: restartResponse } = await dialog.showMessageBox(mainWindow || undefined, {
      type: 'info',
      title: t('harnessUpdateCompleteTitle'),
      message: t('harnessUpdateCompleteMsg'),
      detail: updateResult.output.slice(0, 3000),
      buttons: [t('harnessRestartBackend'), t('harnessRestartLater')],
      defaultId: 0
    })
    if (restartResponse === 0) {
      await restartBackend()
    }
  } else {
    dialog.showErrorBox(
      t('updateFailedTitle'),
      t('harnessUpdateFailPrefix') + (updateResult.output || updateResult.error).slice(0, 3000)
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
      dialog.showMessageBox(mainWindow || undefined, { message: newLang === 'en' ? 'Switched to English. Tray and new tabs apply immediately; already open pages refresh their language when reopened.' : '已切换为中文。托盘与新标签页立即生效，已打开页面的语言在重新打开后更新。' })
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
  _log('showExtensionManager called')
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
  _log('registerGlobalShortcut: ' + store.get('globalShortcut'))
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

// ── Sender Trust Boundary ─────────────────────────────────────────────────────
// Only local app pages (file:// shell / newtab / splash / update windows) and
// the harness web UI itself (WEB_URL) may invoke desktop IPC. Arbitrary
// websites opened in tabs get the preload bridge too, so privileged channels
// (config writes, backend control, update/git flows) must reject them here.
function isTrustedSender(event) {
  try {
    const raw = (event.senderFrame && event.senderFrame.url) || ''
    const u = new URL(raw)
    // file:// covers shell/newtab/splash/update windows; the harness origin
    // covers DSH web pages (some flows navigate via the literal 127.0.0.1:port,
    // so compare the parsed origin instead of the WEB_URL string).
    if (u.protocol === 'file:') return true
    return u.origin === `http://${DEFAULT_HOST}:${DEFAULT_PORT}`
  } catch {
    return false
  }
}

function ipcOn(channel, handler) {
  ipcMain.on(channel, (event, ...args) => {
    if (!isTrustedSender(event)) { _log(`ipc blocked [${channel}] from untrusted frame`); return }
    handler(event, ...args)
  })
}

function ipcHandle(channel, handler) {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrustedSender(event)) { _log(`ipc blocked [${channel}] from untrusted frame`); return null }
    return handler(event, ...args)
  })
}

function     registerTabIpc() {
  ipcOn('tab-new', () => { _log('tab-new'); createTab('newtab') })
  ipcOn('tab-close', (_event, id) => { _log('tab-close: ' + (id || activeTabId)); closeTab(id || activeTabId) })
  ipcOn('tab-activate', (_event, id) => { _log('tab-activate: ' + id); activateTab(id) })
  ipcOn('tab-reload', (_event, id) => {
    const tab = tabs.find(tb => tb.id === (id || activeTabId))
    if (tab && !tab.view.webContents.isDestroyed()) tab.view.webContents.reload()
  })

  // Window controls from tab bar
  ipcOn('window-minimize', () => { if (mainWindow) mainWindow.minimize() })
  ipcOn('window-maximize', () => {
    if (mainWindow) {
      if (mainWindow.isMaximized()) mainWindow.unmaximize()
      else mainWindow.maximize()
    }
  })
  ipcOn('window-close', () => { if (mainWindow) mainWindow.close() })

  // Config access
  ipcHandle('get-config', (_event, key) => store.get(key))
  ipcHandle('set-config', (_event, key, value) => { store.set(key, value); return true })
  ipcHandle('set-language', (_event, lang) => {
    if (lang === 'zh' || lang === 'en') {
      store.set('language', lang)
      t = createT(store)
      updateTrayMenu()
      return true
    }
    return false
  })
  ipcHandle('get-backend-status', () => ({
    running: backendProcess !== null || backendAdopted,
    adopted: backendAdopted,
    url: WEB_URL
  }))
  ipcHandle('restart-backend', async () => { await restartBackend(); return { ok: true } })
  ipcHandle('get-tabs', () => tabs.map(tb => ({ id: tb.id, title: tb.title, active: tb.id === activeTabId })))

  // Harness update
  ipcHandle('check-harness-update', async () => await checkHarnessUpdate())
  ipcHandle('update-harness', async () => await updateHarness())
  ipcHandle('check-launcher-update', async () => await checkLauncherUpdate())
  ipcOn('splash-ready', () => { sendSplashStatus({ version: app.getVersion(), lang: t.lang, phase: 'starting' }) })

  // ── New Tab Page IPC ─────────────────────────────────────────────────────────
  ipcOn('newtab-open-url', (event, inputUrl) => {
    _log('newtab-open-url: ' + inputUrl)
    // Ensure URL has protocol
    let finalUrl = inputUrl.trim()
    if (!finalUrl) return
    if (!/^https?:\/\//i.test(finalUrl)) finalUrl = 'https://' + finalUrl

    // Navigate current newtab to the URL
    const currentTab = tabs.find(tb => tb.id === activeTabId)
    if (currentTab && currentTab.url === 'newtab') {
      currentTab.view.webContents.loadURL(finalUrl)
      currentTab.url = finalUrl
      currentTab.title = finalUrl.replace(/^https?:\/\//, '').split('/')[0]
      notifyTabBar()
    } else {
      createTab(finalUrl)
    }
  })

  ipcOn('newtab-ready', (event) => {
    const { nativeTheme } = require('electron')
    event.sender.send('newtab-info', {
      lang: t.lang,
      version: app.getVersion(),
      port: DEFAULT_PORT,
      harnessRoot: store.get('harnessRoot') || '',
      backendStatus: backendProcess ? 'running' : (backendAdopted ? 'running' : 'stopped'),
      theme: store.get('theme') || 'system',
      bookmarks: store.get('bookmarks') || null
    })
    // Listen for theme changes and notify
    nativeTheme.off('updated', notifyNewtabTheme)
    nativeTheme.on('updated', notifyNewtabTheme)
  })

  

function notifyNewtabTheme() {
    const { nativeTheme } = require('electron')
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    pushThemeToRenderers(theme)
  }

  ipcOn('dsh-theme-changed', (event, scheme) => {
    _log('dsh-theme-changed: ' + scheme)
    const theme = (scheme === 'dark') ? 'dark' : 'light'
    store.set('theme', theme)
    // Sync shell tab bar and all newtab views
    pushThemeToRenderers(theme)
  })

  ipcOn('newtab-set-theme', (event, theme) => {
    _log('newtab-set-theme: ' + theme)
    store.set('theme', theme)
    if (theme !== 'system') {
      pushThemeToRenderers(theme === 'light' ? 'light' : 'dark')
    } else {
      // System preference: resolve once here so renderers get a concrete value
      const { nativeTheme } = require('electron')
      pushThemeToRenderers(nativeTheme.shouldUseDarkColors ? 'dark' : 'light')
    }
  })

  ipcOn('newtab-save-bookmarks', (event, bookmarks) => {
    _log('newtab-save-bookmarks: ' + (bookmarks ? bookmarks.length : 0) + ' items')
    store.set('bookmarks', bookmarks)
  })

  ipcOn('newtab-action', (event, action) => {
    _log('newtab-action: ' + action)
    switch (action) {
      case 'new-session': {
        // Navigate current newtab view to DSH instead of creating another tab
        const currentTab = tabs.find(tb => tb.id === activeTabId)
        if (currentTab && currentTab.url === 'newtab') {
          currentTab.view.webContents.loadURL(`http://127.0.0.1:${DEFAULT_PORT}`)
          currentTab.url = `http://127.0.0.1:${DEFAULT_PORT}`
          currentTab.title = 'DeepSeek Harness'
          notifyTabBar()
        } else {
          createTab(`http://127.0.0.1:${DEFAULT_PORT}`)
        }
        break
      }

      case 'open-logs':
        openLogFolder()
        break
      case 'restart-backend':
        stopBackend()
        setTimeout(() => {
          const root = store.get('harnessRoot')
          if (root) startBackend(root)
        }, 1000)
        break
      case 'check-harness-update':
        checkAndPromptHarnessUpdate()
        break
      case 'check-update':
        startClientUpdateFlow()
        break
      case 'load-extension': {
        const { dialog: dlg } = require('electron')
        dlg.showOpenDialog(mainWindow, {
          properties: ['openDirectory'],
          title: t('extSelectTitle')
        }).then(({ filePaths }) => {
          if (filePaths && filePaths.length > 0) {
            addExtension(filePaths[0])
          }
        })
        break
      }
      case 'manage-extensions':
        // Open extensions info dialog
        const exts = store.get('extensions') || []
        require('electron').dialog.showMessageBox(mainWindow || undefined, {
          type: 'info',
          title: t('extTitle'),
          message: exts.length > 0
            ? exts.map((e, i) => `${i+1}. ${e.split(/[/\\]/).pop()}`).join('\n')
            : t('extNone'),
          buttons: [t('extBtnOk')]
        })
        break
    }
  })
  ipcHandle('update-launcher', async () => await updateLauncher())
}

// ── App Lifecycle ────────────────────────────────────────────────────────────

initLogger()

// Last-resort diagnostics: every early failure must leave a trace even with
// debugLog off — opaque "nothing happens" reports are undiagnosable.
process.on('uncaughtException', (err) => {
  journal('uncaughtException: ' + (err && err.stack || err))
  console.error('[dsh-desktop] uncaughtException:', err)
})
process.on('unhandledRejection', (reason) => {
  const detail = reason && reason.stack || String(reason)
  journal('unhandledRejection: ' + detail)
  console.error('[dsh-desktop] unhandledRejection:', reason)
})

journal('--- launch v' + app.getVersion() + ' pid=' + process.pid + ' ---')
_log('before requestSingleInstanceLock')
const gotTheLock = app.requestSingleInstanceLock()
_log('gotTheLock=' + gotTheLock)
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showWindow()
  })

  app.on('ready', async () => {
    try {
      _log('ready event fired')
      // Register IPC for tab bar
      registerTabIpc()
      journal('registerTabIpc ok')
      _log('registerTabIpc done')

      // Load Chrome extensions
      await loadExtensions()
      journal('loadExtensions ok')
      _log('loadExtensions done')

      // Create tray
      _log('before createTray')
      createTray()
      journal('createTray ok')
      _log('createTray done')
      updateTrayStatus('starting')

      // Register global shortcut
      registerGlobalShortcut()

      // Init auto-updater
      initAutoUpdater()
      _log('initAutoUpdater done')

      // Resolve harness root
      const harnessRoot = resolveHarnessRoot()
      journal('harnessRoot=' + (harnessRoot || 'NULL'))
      _log('harnessRoot=' + (harnessRoot || 'NULL'))

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

      // Create splash window immediately for user feedback
      createSplashWindow()
      journal('splash created')

      // Check if service is already running
      const alreadyRunning = await checkWebReady()
      journal('checkWebReady=' + alreadyRunning)

      if (alreadyRunning) {
        backendAdopted = true
        updateTrayStatus('running')
        _log('adopted existing service on port')
        console.log('[dsh-desktop] Adopted existing DSH web service')
        sendSplashStatus({ status: t('splashConnected'), progress: 100 })
        safeTimeout(() => { closeSplashAndShowMain() }, 800)
        // Adopted services give us no stdout token; the durable cookie from a
        // previous client-owned run usually still covers us. When it does not,
        // tell the user exactly how to recover instead of leaving 401 pages.
        safeTimeout(async () => {
          if (!(await probeWebAuthOk())) {
            dialog.showMessageBox(mainWindow || undefined, {
              type: 'warning',
              title: t('webAuthRequiredTitle'),
              message: t('webAuthRequiredMsg')
            })
          }
        }, 2500)
      } else if (store.get('autoStartBackend')) {
        sendSplashStatus({ phase: 'starting', lang: t.lang })
        startBackend(harnessRoot)
        updateTrayStatus('starting')

        sendSplashStatus({ phase: 'waiting', lang: t.lang })
        const ready = await waitForReady()
        _log('waitForReady result: ' + ready)
        if (ready) {
          // Mint the browser-auth cookie before the first tab loads, so the
          // user never sees the 401 wall on a fresh harness.
          if (backendProcess) await ensureWebAuthCookie()
          updateTrayStatus('running')
          sendSplashStatus({ status: t('splashReady'), progress: 100 })
          safeTimeout(() => { closeSplashAndShowMain() }, 500)
        } else {
          updateTrayStatus('starting')
          sendSplashStatus({ phase: 'slow', lang: t.lang })
          // Don't block — open main window anyway, backend may come up later
          safeTimeout(() => { closeSplashAndShowMain() }, 2000)
        }
      } else {
        // Auto-start disabled — just open the window
        sendSplashStatus({ status: t('splashManualMode'), progress: 100 })
        safeTimeout(() => { closeSplashAndShowMain() }, 1000)
      }

      // Start health monitor
      startHealthMonitor()
    } catch (err) {
      // Startup is fully broken — record it, then surface to the user instead
      // of leaving a headless zombie process.
      journal('READY FAILED: ' + (err && err.stack || err))
      console.error('[dsh-desktop] startup failed:', err)
      try {
        dialog.showErrorBox('DSH Desktop 启动失败 / Startup failed', String(err && err.stack || err))
      } catch { /* no dialog possible */ }
      app.quit()
    }
  })

  app.on('window-all-closed', () => {
    if (!store.get('minimizeToTray')) {
      isQuitting = true
      app.quit()
    }
  })

  app.on('before-quit', (event) => {
    if (!isQuitting) {
      // First call: stop everything
      isQuitting = true
      _log('app before-quit')
    }
    stopHealthMonitor()
    globalShortcut.unregisterAll()
    // Always stop the web backend on exit (whether self-started or adopted)
    if (backendProcess) {
      stopBackend()
    } else if (backendAdopted) {
      // Adopted external service: also kill it by exact port owner(s)
      killProcessOnPort(DEFAULT_PORT)
      backendAdopted = false
    }
  })

  app.on('activate', () => {
    showWindow()
  })
}