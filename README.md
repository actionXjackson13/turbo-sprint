# Turbo Sprint

A drag race in the spirit of old arcade horse-racing games, built to play on a
phone. You don't steer — every car runs a straight lane. All you control is
**speed**, by tapping a box that keeps jumping around the screen.

Open `index.html` in any browser, or install it to a phone home screen — see
[Installing on iPhone](#installing-on-iphone). No build step, no dependencies,
no asset files beyond the app icons; even the sound is synthesised at runtime.

## How to play

- **Main menu:** Race, Personal Records, or How to Play.
- Pick a **track** and a **difficulty**, then start.
- A gold box pops up somewhere on the screen. **Tap it.**
- The instant you hit it, it reappears somewhere else. Keep chasing it.
- **The faster you get to it, the bigger the surge.** Under 0.5s is a `PERFECT!`.
- Your speed bleeds away constantly, so stopping means slowing down.
- Tapping anywhere else = `MISS`: you lose speed and your streak resets.
- A clean streak adds up to +25% on every boost.
- Beat the three rivals to the line. Your best time is saved per track and level.

Timing windows are wider than a keyboard game's would be, because a "reaction"
here includes finding the box and moving your thumb to it — not just twitching a
finger already resting on a key.

### Controls

Tapping (or clicking) is the whole game; the keyboard only drives the menus.

| Input | Does |
| --- | --- |
| Tap / click | Everything — the box during a race, and every menu, button, map card and difficulty segment |
| `←` `→` or `0`-`9` | Change difficulty |
| `↑` `↓` | Change track |
| `Enter` / `Space` | Confirm, start, race again |
| `Esc` | Pause mid-race, or back out of a menu |
| `M` | Mute / unmute |

Keyboard hints are hidden on touch devices, where they'd be noise.

## Tracks

Each map is a visual theme plus two gameplay modifiers — track length and how
fast speed drains. Rival pace is deliberately **not** changed by the map, so a
difficulty level means the same kind of challenge everywhere and only the
character of the race changes.

| Track | Length | Character |
| --- | --- | --- |
| 🏁 Sunset Speedway | ×1.0 | The reference tuning |
| 🌃 Neon City | ×0.78 | Short sprint — less room to build speed |
| 🏜️ Desert Dash | ×1.3 | Endurance; slightly gentler decay |
| 🏔️ Alpine Pass | ×1.0 | Speed drains 18% faster |

## Difficulty

Levels run **0–10**, where **10 is the reference tuning** and everything below
scales down from it. Five levers move together:

- **Rival pace** — 52% of full speed at level 0
- **Track length** — shorter at low levels, so races stay ~14s throughout
- **Speed decay** — how fast you bleed speed between taps
- **Box size** — 148px down to 78px, capped to a share of the viewport so it
  never swallows a phone screen
- **Box travel** — how far the box jumps each time, as a fraction of the playable
  diagonal. Both ends matter: a *minimum* stops it reappearing under your thumb,
  and a *maximum* is what actually makes low levels gentle. In portrait on a
  phone that works out to a ~94px hop at level 0 against ~493px at level 10.

The slowest tap interval that still wins, per track and level:

| Level | Speedway | Neon | Desert | Alpine |
| --- | --- | --- | --- | --- |
| 0 | 1373ms | 1281ms | 1404ms | 1321ms |
| 2 | 1062ms | 1025ms | 1126ms | 985ms |
| 4 | 916ms | 870ms | 980ms | 844ms |
| 6 | 807ms | 760ms | 871ms | 742ms |
| 8 | 718ms | 670ms | 778ms | 657ms |
| 10 | **635ms** | 582ms | 690ms | 580ms |

Every combination is monotonic (higher level is never easier) and idling always
loses, so there's a reason to tap at every setting.

These thresholds are looser than the old keyboard version's, because a tap costs
you thumb travel that a keypress didn't. In practice level 10 is *harder* than it
was: 580ms is a comfortable keypress interval but a demanding one when the box is
78px wide and half a screen away.

## Records

Best times are stored per **track × level** in `localStorage`, so all 44
combinations have their own target. Only a finished race can set a record — a
DNF never overwrites one. During a race, a thin white marker on the progress bar
shows where your personal best would be right now, so you can see whether you're
ahead of your own pace.

## Files

| File | Role |
| --- | --- |
| `index.html` | Markup: canvas, HUD, tap target, overlay |
| `styles.css` | Layout, menus, target animations, results and records screens |
| `maps.js` | Track themes and their gameplay modifiers |
| `difficulty.js` | The 0-10 scale and every value it drives |
| `records.js` | Personal-best storage |
| `audio.js` | Web Audio sound effects, generated (no files) |
| `particles.js` | Exhaust puffs, miss sparks, win confetti |
| `physics.js` | The speed model — decay, reaction-time boosts, miss penalty |
| `track.js` | World geometry, lanes, parallax scenery, start/finish |
| `car-sprite.js` | Shared side-view car drawing |
| `target.js` | The tap box — where it lands, how big, how long it's been there |
| `input.js` | Keyboard handling, for the menus only |
| `player.js` | Your car — coasts down, boosted by taps |
| `ai-car.js` | Rival cars and the level-10 pace table |
| `game.js` | Screen flow, tap hit/miss handling, camera, HUD, results |
| `sw.js` | Service worker: makes the installed app work offline |
| `manifest.webmanifest` | App name, colours and icons for installation |
| `icons/` | App icons, including the 180px `apple-touch-icon` iOS uses |

`target.js` owns *where* the box is; `game.js` owns *what hitting it means*. The
box is a DOM element rather than something drawn on the canvas, so hit testing is
just a pointer event and the pop/shake animations come from CSS.

## Tuning notes

`Physics.minSpeed` keeps a struggling player rolling instead of grinding to a
halt, and the race ends as soon as every rival has finished — last place is
locked in at that point, so there's no long crawl to the line.

To rebalance, change `AICar.ROSTER` speeds in `ai-car.js` (level-10 reference)
or the scaling functions in `difficulty.js`. The win-threshold table above is
produced by simulating the real speed model, not by guesswork — worth
re-checking after any change to pace, decay or track length.

The simulation runs in the browser console against the live `Difficulty`,
`Physics` and `AICar.ROSTER`: race the model at a fixed tap interval, bisect for
the slowest interval that still wins, and assert four things across all 11 levels
× 4 tracks — every level winnable, thresholds monotonic, level 10 hardest, and
idling always loses. There's no Node in this project, so the console is the test
runner.

## Installing on iPhone

This is a PWA, not a native app — there's no App Store listing and no developer
account involved. Installed from Safari it gets its own home-screen icon,
launches full-screen with no browser UI, and runs with no network.

1. Serve the folder over **HTTPS**. GitHub Pages does this for free: in the repo's
   *Settings → Pages*, set the source to `master` / root. The repo has to be
   **public** — free Pages won't serve a private one.
2. Open the resulting URL in **Safari** on the phone. Chrome and Firefox on iOS
   can't install to the home screen; only Safari can.
3. Share → **Add to Home Screen**.

HTTPS isn't optional: iOS refuses to register a service worker over plain
`http://`, and without the service worker there's no offline play. Serving from a
PC on the local network gets you an icon that only works while that PC is on.

Two iOS limitations worth knowing, neither of them fixable from here:

- **Orientation can't be locked.** iOS ignores both the manifest's `orientation`
  field and the Screen Orientation API. Portrait plays fine — you just see less
  track ahead — so the menus show a dismissible nudge to turn the phone sideways
  rather than pretending portrait is unsupported.
- **The hardware mute switch silences Web Audio.** If the game is silent, check
  the side switch before looking for a bug.

## Note on caching

`sw.js` uses stale-while-revalidate: it answers from the cache immediately, so
the game starts instantly and works offline, then refreshes the cache in the
background. **The practical consequence is that an edit lands one reload late** —
the first reload after a change serves the old copy and fetches the new one, and
the second reload runs it. That's true in local development as well as on the
phone.

`CACHE` in `sw.js` is a purge knob, not a release knob: bump it to throw the whole
cache away and re-download. Ordinary updates don't need it. (The old `?v=N` query
strings on the script tags are gone — they'd have become a second, conflicting
cache key.)
