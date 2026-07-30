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
- Roughly **one box in six** arrives as a blue `DOUBLE` instead of a gold `TAP`.
  It's the same box in the same rotation, and it needs two taps to clear rather
  than one — the pip row under the label tracks how many you've landed. Its
  reaction time runs from the spawn to the *second* tap, so it earns a little
  more than an ordinary box to cover the extra tap.
- Beat the three rivals to the line. Your best time is saved per track and level.
- Lose and you get the photo, a sad trombone and `YOU ARE A LOSER` across the
  screen. After a beat the caption fades out and the results fade in over it, so
  the photo stays as the backdrop while you line up a rematch. Winning is the
  only way to avoid it — a personal best on a losing run doesn't get you out of it.

Races last about **8 seconds**. Level 5 is tuned as a dead heat for a player
tapping around 450ms, so if you're winning it comfortably, move up.

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
| `F` | Race your friends |
| `M` | Mute / unmute |

There's no pausing in a multiplayer race — it would freeze only your own car.

Keyboard hints are hidden on touch devices, where they'd be noise.

## Multiplayer

Up to **6 players** race the same track at once. From the main menu, *Race Your
Friends*: one person hosts and gets a 4-character code, everyone else types it in.
Enter a name and it's remembered for next time.

The host picks the track and difficulty and starts the race. There are no AI cars
in a multiplayer race — one lane per player, and the road widens for a full grid.
Everyone taps their own box on their own screen; you see everyone else's car
moving in real time. Personal records aren't touched by multiplayer races, since
they're per track-and-level and this isn't a solo run.

### How it works

There's no backend — the game is static files on GitHub Pages. Players connect
**directly to each other** over WebRTC data channels, and the only thing that
touches a third party is the initial handshake, which goes through the public
PeerJS relay. No gameplay data passes through it.

`net.js` talks to that relay over a plain WebSocket rather than using the PeerJS
client library, because we need about 5% of what it does and this keeps the
project dependency-free. One wrinkle worth knowing if you ever touch that file:
**the relay validates the shape of what it forwards and hangs up on anything that
doesn't look like the official client.** A minimal `{sdp}` payload gets the socket
closed with code 1000 and no error message. So every signalling payload is padded
with the fields that client would send; only `sdp`, `candidate` and `connectionId`
actually matter to us.

The topology is a star, with the host as the authority: guests report their own
position to the host and the host echoes everyone's positions back out at 15Hz.
Between updates each remote car dead-reckons at its last known speed and eases
toward the authoritative position, so a late packet doesn't make it stutter.
There's deliberately no anti-cheat — anyone can edit their own speed in a console.

### Limitations

- **Backgrounding the app freezes your car.** Browsers stop
  `requestAnimationFrame` in hidden tabs, and iOS suspends the whole page when you
  switch apps, so your car stops while everyone else keeps racing. The host resolves
  the race 12s after the first finisher rather than waiting forever, and there's a
  90s hard stop in case nobody finishes.
- **Some networks block direct connections.** WebRTC uses STUN to punch through
  NAT, which works on most home and mobile networks but not all. There's no TURN
  relay to fall back on, so a strict corporate or carrier NAT can fail to connect.
  Joining says so rather than hanging.
- **Multiplayer needs internet**, even though single-player works fully offline.
- If the host leaves, the race ends for everyone.

## Tracks

Each map is a visual theme plus two gameplay modifiers — track length and how
fast speed drains. Rival pace is deliberately **not** changed by the map, so a
difficulty level means the same kind of challenge everywhere and only the
character of the race changes.

| Track | Length | Character |
| --- | --- | --- |
| 🏁 Sunset Speedway | ×1.0 | The reference tuning |
| 🌃 Neon City | ×0.94 | Short sprint — less room to build speed |
| 🏜️ Desert Dash | ×1.15 | Endurance; slightly gentler decay |
| 🏔️ Alpine Pass | ×1.0 | Speed drains 8% faster |

The modifiers are deliberately mild. The difficulty curve now runs close to the
limit of what a thumb can physically do, so a map swinging length by 20–30% shoves
its top levels past that limit — Neon at its old ×0.78 made levels 9 and 10
unwinnable.

## Difficulty

Levels run **0–10**. Every race is about **8 seconds** and **the rivals always run
the same speed** — a level doesn't change how fast they go, it changes how hard it
is for you to keep up. Three levers move together:

- **Box size** — 148px down to 78px, capped to a share of the viewport so it never
  swallows a phone screen
- **Box travel** — how far the box jumps each time, as a fraction of the playable
  diagonal. Both ends matter: a *minimum* stops it reappearing under your thumb,
  and a *maximum* is what makes low levels gentle. On a phone in landscape that's
  a ~97px hop at level 0 against ~533px at level 10.
- **Speed decay** — how fast you bleed speed between taps

### Why raw tap intervals stopped being the yardstick

The obvious difficulty metric is "the slowest tap interval that still wins", and
it was the right one when every prompt was a keypress under your finger. It isn't
any more, because the box's own size and travel decide how fast a thumb can
*possibly* go. A 78px box half a screen away can't be hit as quickly as a 148px
box that barely moves, so the same 500ms interval is trivial at level 0 and
superhuman at level 10.

So the model has two numbers per level. **Achievable** is what a thumb can
physically do at that level's box geometry, from Fitts' law —
`180ms + 130ms × log₂(jump / size + 1)` — calibrated against real play. **Required**
is the slowest interval that still beats the rivals. Difficulty is the ratio:

**demand ratio = required ÷ achievable**

Above 1.0 you have slack; 1.0 is a photo finish; below 1.0 you have to beat the
average thumb. *This* is what has to fall monotonically, and it does:

| Level | Achievable | Speedway required | Ratio | Neon | Desert | Alpine |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | 288ms | 594ms | 2.07 | 2.00 | 2.33 | 2.06 |
| 2 | 366ms | 525ms | 1.44 | 1.38 | 1.61 | 1.42 |
| 4 | 428ms | 472ms | 1.10 | 1.07 | 1.23 | 1.08 |
| 5 | 459ms | 463ms | **1.01** | 0.99 | 1.13 | 0.99 |
| 6 | 484ms | 464ms | 0.96 | 0.93 | 1.08 | 0.94 |
| 8 | 526ms | 470ms | 0.89 | 0.87 | 1.00 | 0.87 |
| 10 | 568ms | 493ms | **0.87** | 0.84 | 0.96 | 0.85 |

Level 5 is deliberately pinned at a ratio of 1.0 — a dead heat for a player
tapping around 450ms. Level 10 asks you to beat the model by 13%. Nothing is
allowed below 0.84, which is the fairness floor: past that a level stops being
hard and starts being impossible.

Note the required column is **not** monotonic — it bottoms out around level 6 and
rises again. That's the box eating your reaction budget, and it's why `decayMult`
in `difficulty.js` is a solved table that peaks mid-scale instead of a clean lerp.
Stacking harsher decay *and* a meaner box at the top made levels 9 and 10
unwinnable; the ratio column is the thing that stays honest.

Idling always loses on every track and level, so there's a reason to tap at every
setting.

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
| `images/loser.jpg` | The photo that takes over the screen when you lose |
| `target.js` | The tap box — where it lands, how big, which kind it is, how long it's been there |
| `input.js` | Keyboard handling, for the menus only |
| `player.js` | Your car — coasts down, boosted by taps |
| `ai-car.js` | Rival cars and their (level-independent) speeds |
| `net.js` | Multiplayer: signalling, WebRTC peers, lobby and race sync |
| `remote-car.js` | Another player's car, positioned from the network |
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

To rebalance, change `AICar.ROSTER` speeds in `ai-car.js` (they apply at every
level) or the curves in `difficulty.js`. The tables above are produced by
simulating the real speed model, not by guesswork — worth re-checking after any
change to rival speed, decay, track length, box size or box travel. Changing the
box changes the *achievable* column, which moves every ratio.

The simulation runs in the browser console against the live `Difficulty`,
`Physics`, `Target` and `AICar.ROSTER`. There's no Node in this project, so the
console is the test runner. It:

1. samples `Target.spawn` a few thousand times per level to get the real mean jump
   distance, and feeds that plus the box size through Fitts' law → **achievable**;
2. races the speed model at a fixed tap interval and bisects for the slowest
   interval that still wins → **required**;
3. asserts, across all 11 levels × 4 tracks: every level winnable, the demand
   ratio monotonically falling, no ratio below the 0.84 fairness floor, and idling
   always losing.

One caveat when comparing the sim against real play: rivals get a random surge
phase (`AICar.phase`), so a race near a ratio of 1.0 swings ±0.2–0.3s on luck. The
sim zeroes the phase for repeatability, which is why it reports a tighter margin
than you'll feel. Near a photo finish, the lead genuinely changes hands.

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
