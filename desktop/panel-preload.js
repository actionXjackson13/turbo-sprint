/**
 * The panel window's bridge.
 *
 * Narrower than the main window's on purpose: the panel must not be able to
 * open a second panel, and it has no business holding the wake lock. All it
 * gets is a way to close itself, so a "hide" control inside it can work without
 * a title bar to click.
 *
 * It still reports a `version`, so the app knows it is in the shell and can
 * leave out anything that assumes a browser.
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('soundboard', {
  version: '1.0.0',
  openPanel: () => {},
  closePanel: () => ipcRenderer.send('panel:close'),
  isPanelOpen: () => Promise.resolve(true),
  keepAwake: () => {},
})
