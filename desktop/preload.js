/**
 * The only thing the page is allowed to reach.
 *
 * The window loads a live website, so it is treated as untrusted: context
 * isolation on, node integration off, sandbox on, and this handful of named
 * calls as the entire surface between the page and the machine. Nothing here
 * reads a file, runs a command, or takes a path — every one of them is a fixed
 * verb with an id or a boolean.
 *
 * `version` is how the web app knows it is running in the shell rather than a
 * browser tab, which is what makes the pop-out button open a real always-on-top
 * window instead of a Picture-in-Picture one.
 */
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('soundboard', {
  version: '1.0.0',
  openPanel: (eventId) => ipcRenderer.send('panel:open', String(eventId)),
  closePanel: () => ipcRenderer.send('panel:close'),
  isPanelOpen: () => ipcRenderer.invoke('panel:is-open'),
  keepAwake: (on) => ipcRenderer.send('power:keep-awake', Boolean(on)),
})
