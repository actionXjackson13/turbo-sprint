/**
 * SoundBoard in the DJ booth.
 *
 * A deliberately thin shell. It does not contain a copy of the app — it loads
 * the live site, the same one a phone loads — and it owns only the handful of
 * things a web page genuinely cannot do for itself:
 *
 *   - a window that stays above rekordbox, wherever the DJ drags it
 *   - staying alive and connected while minimised, from the tray
 *   - stopping the machine sleeping in the middle of a set
 *
 * Keeping it thin is the point. Every change to SoundBoard reaches this app the
 * next time it is opened, with nothing to reinstall — which matters because the
 * part that reads rekordbox is still to come, and shipping a new .exe for every
 * fix to it would be a miserable way to iterate on something I cannot test.
 */
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  ipcMain,
  nativeImage,
  powerSaveBlocker,
  shell,
} = require('electron')
const path = require('node:path')
const fs = require('node:fs')

/** Where SoundBoard lives. Overridable for testing against a local build. */
const APP_URL =
  process.env.SOUNDBOARD_URL ||
  'https://actionxjackson13.github.io/turbo-sprint/dj/'

/** Only ever our own origin in a window. Everything else opens in a browser. */
const APP_ORIGIN = new URL(APP_URL).origin

const STATE_FILE = path.join(app.getPath('userData'), 'window-state.json')

let mainWindow = null
let panelWindow = null
let tray = null
let awakeId = null
let quitting = false

// ---------------------------------------------------------------------------
// Remembering where things were
// ---------------------------------------------------------------------------

/**
 * The panel's position is not a nicety.
 *
 * A DJ puts it in the one corner their rekordbox layout leaves free, and having
 * to do that again at the start of every night is the kind of small friction
 * that ends with the app not being opened.
 */
function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

function writeState(patch) {
  try {
    fs.writeFileSync(
      STATE_FILE,
      JSON.stringify({ ...readState(), ...patch }, null, 2),
    )
  } catch {
    // A read-only profile directory. The app still works; it just forgets.
  }
}

function rememberBounds(win, key) {
  const save = () => {
    if (!win.isDestroyed() && !win.isMinimized()) {
      writeState({ [key]: win.getBounds() })
    }
  }
  win.on('moved', save)
  win.on('resized', save)
}

// ---------------------------------------------------------------------------
// Windows
// ---------------------------------------------------------------------------

function iconImage() {
  const file = path.join(__dirname, 'icon.png')
  return fs.existsSync(file) ? nativeImage.createFromPath(file) : undefined
}

function createMainWindow() {
  const saved = readState().main
  mainWindow = new BrowserWindow({
    width: saved?.width ?? 1100,
    height: saved?.height ?? 780,
    x: saved?.x,
    y: saved?.y,
    minWidth: 380,
    minHeight: 480,
    backgroundColor: '#0a0a12',
    icon: iconImage(),
    title: 'SoundBoard',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  rememberBounds(mainWindow, 'main')
  mainWindow.loadURL(APP_URL)
  mainWindow.webContents.on('did-fail-load', (_e, _code, description) => {
    mainWindow.loadFile(path.join(__dirname, 'offline.html'), {
      hash: encodeURIComponent(description || ''),
    })
  })

  /**
   * Closing the window puts SoundBoard in the tray rather than shutting it
   * down. Half the point of a desktop app is that requests keep arriving while
   * the DJ is looking at rekordbox — a close button that severed that would
   * make it a worse browser tab.
   */
  mainWindow.on('close', (event) => {
    if (quitting) return
    event.preventDefault()
    mainWindow.hide()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

/**
 * The panel: frameless, always on top, and dragged by its own header.
 *
 * Frameless because a title bar is 30 of the 640 pixels available and says
 * nothing; the app draws its own draggable strip instead (the `-webkit-app-
 * region: drag` header on the panel screen).
 */
function createPanelWindow(eventId) {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.show()
    panelWindow.focus()
    return
  }

  const saved = readState().panel
  panelWindow = new BrowserWindow({
    width: saved?.width ?? 380,
    height: saved?.height ?? 640,
    x: saved?.x,
    y: saved?.y,
    minWidth: 300,
    minHeight: 320,
    frame: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0a0a12',
    title: 'SoundBoard panel',
    webPreferences: {
      preload: path.join(__dirname, 'panel-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Above full-screen apps too, which is where rekordbox usually is. The
  // 'screen-saver' level is the one that clears a full-screen window on both
  // Windows and macOS; 'floating' does not.
  panelWindow.setAlwaysOnTop(true, 'screen-saver')
  panelWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  rememberBounds(panelWindow, 'panel')
  panelWindow.loadURL(`${APP_URL}#/dj/panel/${encodeURIComponent(eventId)}`)
  panelWindow.on('closed', () => {
    panelWindow = null
  })
}

function closePanel() {
  if (panelWindow && !panelWindow.isDestroyed()) panelWindow.close()
  panelWindow = null
}

// ---------------------------------------------------------------------------
// Tray
// ---------------------------------------------------------------------------

function createTray() {
  const image = iconImage()
  if (!image) return

  tray = new Tray(image.resize({ width: 16, height: 16 }))
  tray.setToolTip('SoundBoard')
  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Open SoundBoard',
        click: () => {
          if (!mainWindow) createMainWindow()
          mainWindow.show()
          mainWindow.focus()
        },
      },
      { label: 'Close the panel', click: closePanel },
      { type: 'separator' },
      {
        label: 'Quit',
        click: () => {
          quitting = true
          app.quit()
        },
      },
    ]),
  )
  tray.on('click', () => {
    if (!mainWindow) createMainWindow()
    mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
  })
}

// ---------------------------------------------------------------------------
// What the page may ask for
// ---------------------------------------------------------------------------

ipcMain.on('panel:open', (_event, eventId) => {
  if (typeof eventId === 'string' && eventId) createPanelWindow(eventId)
})

ipcMain.on('panel:close', closePanel)

ipcMain.handle('panel:is-open', () =>
  Boolean(panelWindow && !panelWindow.isDestroyed()),
)

/**
 * A laptop that sleeps mid-set takes the requests with it.
 *
 * The browser's own wake lock only holds while a tab is visible, which is
 * exactly what a DJ working in rekordbox cannot promise — so the shell holds it
 * instead, for as long as an event is open.
 */
ipcMain.on('power:keep-awake', (_event, on) => {
  if (on && awakeId === null) {
    awakeId = powerSaveBlocker.start('prevent-display-sleep')
  } else if (!on && awakeId !== null) {
    powerSaveBlocker.stop(awakeId)
    awakeId = null
  }
})

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

// One instance. A second launch raises the window that is already running
// rather than opening a rival copy pointed at the same event.
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    createMainWindow()
    createTray()

    /**
     * Anything that is not SoundBoard opens in the real browser.
     *
     * The app links out to Google's console, Apple Music and a playlist or two.
     * None of those belong in a chromeless window with a preload script
     * attached — the browser is where a person can see the address they are
     * about to sign in to.
     */
    app.on('web-contents-created', (_e, contents) => {
      contents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url)
        return { action: 'deny' }
      })
      contents.on('will-navigate', (event, url) => {
        if (new URL(url).origin !== APP_ORIGIN) {
          event.preventDefault()
          shell.openExternal(url)
        }
      })
    })
  })

  app.on('before-quit', () => {
    quitting = true
    if (awakeId !== null) powerSaveBlocker.stop(awakeId)
  })

  // On macOS the app stays running with no windows; the dock icon brings it
  // back. On Windows the tray does that job, so there is nothing to do here.
  app.on('activate', () => {
    if (!mainWindow) createMainWindow()
    else mainWindow.show()
  })
}
