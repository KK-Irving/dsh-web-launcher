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

  // ── Theme ──────────────────────────────────────────────────────────────────
  // Resolved 'dark' | 'light' pushed by the main process when the harness UI,
  // OS preference or the New Tab cycle button changes the palette.
  onThemeChanged: (callback) => {
    ipcRenderer.on('dsh-theme', (_event, theme) => callback(theme))
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

  // ── Password vault (origin-scoped) ─────────────────────────────────────────
  // Web pages may only store/retrieve credentials under their own origin; the
  // main process re-validates origin === sender origin for every call.
  capturePasswordCandidate: (origin, username, password) =>
    ipcRenderer.send('pw-capture-candidate', { origin, username, password }),
  getSavedPasswordsForOrigin: (origin) => ipcRenderer.invoke('pw-get-for-origin', origin),
})

// ── Login-form capture heuristics ─────────────────────────────────────────────
// Runs in the isolated world (DOM is shared, page JS is not touched). Captures
// submit/click on forms containing a password field and hands the candidate to
// the main process; nothing is stored without explicit user confirmation in
// the save bar. Local pages (file://) and non-http(s) frames are skipped.
try {
  if (/^https?:/.test(location.protocol)) {
    let lastSent = 0
    const sendCandidate = (form) => {
      try {
        const pwd = form.querySelector('input[type=password]')
        if (!pwd || !pwd.value) return
        const vis = (el) => el.offsetParent !== null && !el.disabled
        if (!vis(pwd)) return
        const inputs = [...form.querySelectorAll('input')].filter(vis)
        const pi = inputs.indexOf(pwd)
        let user = ''
        for (let i = pi - 1; i >= 0; i--) {
          const t = inputs[i]
          const ty = (t.getAttribute('type') || 'text').toLowerCase()
          if (ty === 'text' || ty === 'email' || ty === 'tel') { user = t.value; break }
        }
        lastSent = Date.now()
        window.dshDesktop.capturePasswordCandidate(location.origin, user, pwd.value)
      } catch { /* never break the page */ }
    }
    const maybeSend = (form) => {
      if (Date.now() - lastSent < 4000) return
      sendCandidate(form)
    }
    document.addEventListener('submit', (ev) => {
      try {
        const f = ev.target
        if (f && f.querySelector && f.querySelector('input[type=password]')) maybeSend(f)
      } catch { /* never break the page */ }
    }, true)
    document.addEventListener('click', (ev) => {
      try {
        const t = ev.target
        const btn = t && t.closest ? t.closest('button, input[type=submit], [role=button]') : null
        if (!btn) return
        const f = btn.closest('form')
        if (f && f.querySelector && f.querySelector('input[type=password]')) {
          const pwd = f.querySelector('input[type=password]')
          if (pwd && pwd.value) maybeSend(f)
        }
      } catch { /* never break the page */ }
    }, true)
  }
} catch { /* never break the page */ }