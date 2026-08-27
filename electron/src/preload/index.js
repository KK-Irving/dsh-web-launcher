/**
 * DSH Desktop - Preload Script
 *
 * Exposes a safe bridge between the renderer (DSH Web UI in BrowserView)
 * and the Electron main process. contextIsolation is enabled.
 *
 * This preload is used by both:
 *   - The shell.html tab bar (main window)
 *   - Each BrowserView tab (DSH Web content)
 */

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('dshDesktop', {
  // ── Identity ───────────────────────────────────────────────────────────────
  platform: process.platform,
  isElectron: true,

  // ── Window Controls ────────────────────────────────────────────────────────
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),

  // ── Tab Management ─────────────────────────────────────────────────────────
  newTab: () => ipcRenderer.send('tab-new'),
  closeTab: (id) => ipcRenderer.send('tab-close', id),
  activateTab: (id) => ipcRenderer.send('tab-activate', id),
  reloadTab: (id) => ipcRenderer.send('tab-reload', id),
  getTabs: () => ipcRenderer.invoke('get-tabs'),
  onTabsUpdated: (callback) => {
    ipcRenderer.on('tabs-updated', (_event, tabs) => callback(tabs))
  },

  // ── Backend ────────────────────────────────────────────────────────────────
  getBackendStatus: () => ipcRenderer.invoke('get-backend-status'),
  restartBackend: () => ipcRenderer.invoke('restart-backend'),
  onBackendStatus: (callback) => {
    ipcRenderer.on('backend-status', (_event, status) => callback(status))
  },

  // ── Settings ───────────────────────────────────────────────────────────────
  getConfig: (key) => ipcRenderer.invoke('get-config', key),
  setConfig: (key, value) => ipcRenderer.invoke('set-config', key, value),

  // ── Language ───────────────────────────────────────────────────────────────
  getLanguage: () => ipcRenderer.invoke('get-config', 'language'),
  setLanguage: (lang) => ipcRenderer.invoke('set-language', lang),

  // ── Theme Sync ─────────────────────────────────────────────────────────────
  // DSH Web pages are sandboxed (no direct ipcRenderer); they use this bridge
  // to report their resolved color scheme so the main process can persist it
  // and propagate the change to all New Tab pages.
  reportTheme: (scheme) => ipcRenderer.send('dsh-theme-changed', scheme),

  // ── Harness Update ─────────────────────────────────────────────────────────
  checkHarnessUpdate: () => ipcRenderer.invoke('check-harness-update'),
  updateHarness: () => ipcRenderer.invoke('update-harness'),

  // ── Launcher Self-Update ───────────────────────────────────────────────────
  checkLauncherUpdate: () => ipcRenderer.invoke('check-launcher-update'),
  updateLauncher: () => ipcRenderer.invoke('update-launcher'),
})