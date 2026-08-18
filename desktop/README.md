# SoundBoard for the DJ booth

The SoundBoard app in its own window, plus a panel that floats over rekordbox.

## What it adds

A browser can do most of what SoundBoard needs. Three things it cannot:

- **A window that stays on top.** The panel sits above rekordbox wherever you
  drag it, and remembers where that was.
- **Staying connected while minimised.** It lives in the system tray. Requests
  keep arriving whether or not you are looking at it.
- **Keeping the laptop awake.** A machine that sleeps mid-set takes the
  requests with it. The browser's own version of this only works while its
  window is visible, which is exactly what you cannot promise while mixing.

## What it is not

It does not contain a copy of SoundBoard. It loads the live site — the same one
your phone loads — so every change to the app reaches this window the next time
you open it, with nothing to reinstall.

That matters for what comes next: reading rekordbox automatically. Almost all of
that work lands in the app rather than in this shell, so it will arrive without
a new installer.

## Getting it

1. Go to the repository's **Actions** tab → **Desktop app** → **Run workflow**.
2. When it finishes, download **SoundBoard-Windows** from the run's Artifacts.
3. Unzip it and run the installer.

Windows will say *"Windows protected your PC"* the first time, because the app
is not code-signed. Click **More info** → **Run anyway**. Signing costs a few
hundred dollars a year and buys nothing except the absence of that dialog.

## Running it from source

With [Node.js](https://nodejs.org) installed:

```
cd desktop
npm install
npm start
```

To point it at a local build of the app instead of the live site:

```
SOUNDBOARD_URL=http://localhost:5173/ npm start     # macOS / Linux
set SOUNDBOARD_URL=http://localhost:5173/ && npm start   # Windows
```

## How it is put together

| File | What it does |
| --- | --- |
| `main.js` | The windows, the tray, the wake lock, and the four things the page may ask for |
| `preload.js` | The main window's bridge — the entire surface between the website and the machine |
| `panel-preload.js` | The panel's bridge, narrower still: it may close itself and nothing else |
| `offline.html` | Shown when the app cannot be reached, since it lives on the web |

The window loads a live website, so it is treated as untrusted: context
isolation on, node integration off, sandbox on. The bridge exposes four named
verbs, none of which take a path or run a command. Links to anywhere that is not
SoundBoard open in the real browser, where you can see the address before you
sign in to it.
