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
  tabBack: () => ipcRenderer.send('tab-back'),
  tabForward: () => ipcRenderer.send('tab-forward'),
  getTabs: () => ipcRenderer.invoke('get-tabs'),
  onTabsUpdated: (callback) => {
    ipcRenderer.on('tabs-updated', (_event, tabs) => callback(tabs))
  },
  onNavState: (callback) => {
    ipcRenderer.on('nav-state', (_event, state) => callback(state))
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
// submit / login-button click / Enter-in-password and hands the candidate to
// the main process DIRECTLY via ipcRenderer (contextBridge exports are only
// visible to the main world, not to this scope). Nothing is stored without
// explicit user confirmation in the save bar.
try {
  if (/^https?:/.test(location.protocol)) {
    let lastSent = 0
    const visible = (el) => {
      if (!el || el.disabled || el.readOnly) return false
      const r = el.getBoundingClientRect()
      if (!(r.width > 0 && r.height > 0)) return false
      const st = getComputedStyle(el)
      return st.visibility !== 'hidden' && st.display !== 'none'
    }
    // Document-scope pair: many SPA login pages have no <form> at all.
    const findPair = () => {
      const pwd = [...document.querySelectorAll('input[type=password]')].find(visible)
      if (!pwd) return null
      const container = pwd.closest('form') || pwd.parentElement || document
      const inputs = [...container.querySelectorAll('input')].filter(visible)
      const pi = inputs.indexOf(pwd)
      let user = null
      for (let i = pi - 1; i >= 0; i--) {
        const t = inputs[i]
        const ty = (t.getAttribute('type') || 'text').toLowerCase()
        if (ty === 'text' || ty === 'email' || ty === 'tel') { user = t; break }
      }
      if (!user) {
        user = [...document.querySelectorAll('input')].filter(visible).find(t => t !== pwd
          && ['text', 'email', 'tel'].includes((t.getAttribute('type') || 'text').toLowerCase())
          && /user|email|phone|mobile|account|login|name/i.test((t.name || '') + ' ' + (t.id || '') + ' ' + (t.placeholder || ''))
        ) || null
      }
      return { pwd, user }
    }
    const capture = (source) => {
      try {
        const now = Date.now()
        if (now - lastSent < 4000) return
        const pair = findPair()
        if (!pair || !pair.pwd.value) return
        lastSent = now
        ipcRenderer.send('pw-capture-candidate', {
          origin: location.origin,
          username: pair.user ? pair.user.value : '',
          password: pair.pwd.value,
          source
        })
      } catch { /* never break the page */ }
    }
    document.addEventListener('submit', () => capture('submit'), true)
    document.addEventListener('click', (ev) => {
      try {
        const t = ev.target
        if (!t || !t.closest) return
        if (!t.closest('button, input[type=submit], input[type=button], [role=button], a')) return
        capture('click')
      } catch { /* never break the page */ }
    }, true)
    document.addEventListener('keydown', (ev) => {
      try {
        if (ev.key !== 'Enter') return
        const t = ev.target
        if (!t || (t.getAttribute && t.getAttribute('type')) !== 'password') return
        capture('enter')
      } catch { /* never break the page */ }
    }, true)
  }
} catch { /* never break the page */ }