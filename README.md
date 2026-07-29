# Turbo Sprint

A browser drag race in the spirit of old arcade horse-racing games. You don't
steer — every car runs a straight lane. All you control is **speed**, by hitting
the key prompts as fast as they appear.

Open `index.html` in any browser. No build step, no dependencies, no asset
files — even the sound is synthesised at runtime.

## How to play

- **Main menu:** Race, Personal Records, or How to Play. Mouse or keyboard.
- Pick a **track** and a **difficulty**, then start.
- A key appears in the big gold box, with the next few queued behind it. Press it.
- Prompts only ever use **W A S D**, so your left hand never leaves the keys.
- **The faster you react, the bigger the surge.** Under 0.3s is a `PERFECT!`.
- Your speed bleeds away constantly, so stopping means slowing down.
- Wrong key = `MISS`: you lose speed and your streak resets.
- A clean streak adds up to +25% on every boost.
- Beat the three rivals to the line. Your best time is saved per track and level.

### Controls

| Input | Does |
| --- | --- |
| Mouse | Everything — every menu, button, map card and difficulty segment is clickable |
| `W` `A` `S` `D` | Hit the prompts during a race |
| `←` `→` or `0`-`9` | Change difficulty |
| `↑` `↓` | Change track |
| `Enter` / `Space` | Confirm, start, race again |
| `Esc` | Pause mid-race, or back out of a menu |
| `M` | Mute / unmute |

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
scales down from it. Four levers move together:

- **Rival pace** — 52% of full speed at level 0
- **Track length** — shorter at low levels, so races stay ~14s throughout
- **Speed decay** — how fast you bleed speed between taps
- **Key pool** — `W` `A` at level 0, growing to all four by level 8

The slowest tap interval that still wins, per track and level:

| Level | Speedway | Neon | Desert | Alpine |
| --- | --- | --- | --- | --- |
| 0 | 1135ms | 1083ms | 1165ms | 1098ms |
| 2 | 920ms | 890ms | 971ms | 861ms |
| 4 | 800ms | 767ms | 854ms | 749ms |
| 6 | 717ms | 673ms | 767ms | 659ms |
| 8 | 634ms | 600ms | 687ms | 583ms |
| 10 | **567ms** | 520ms | 617ms | 517ms |

Every combination is monotonic (higher level is never easier) and idling always
loses, so there's a reason to tap at every setting.

## Records

Best times are stored per **track × level** in `localStorage`, so all 44
combinations have their own target. Only a finished race can set a record — a
DNF never overwrites one. During a race, a thin white marker on the progress bar
shows where your personal best would be right now, so you can see whether you're
ahead of your own pace.

## Files

| File | Role |
| --- | --- |
| `index.html` | Markup: canvas, HUD, prompt chips, overlay |
| `styles.css` | Layout, menus, chip animations, results and records screens |
| `maps.js` | Track themes and their gameplay modifiers |
| `difficulty.js` | The 0-10 scale and every value it drives |
| `records.js` | Personal-best storage |
| `audio.js` | Web Audio sound effects, generated (no files) |
| `particles.js` | Exhaust puffs, miss sparks, win confetti |
| `physics.js` | The speed model — decay, reaction-time boosts, miss penalty |
| `track.js` | World geometry, lanes, parallax scenery, start/finish |
| `car-sprite.js` | Shared side-view car drawing |
| `input.js` | Keyboard handling (ignores auto-repeat, so holding a key does nothing) |
| `player.js` | Your car — coasts down, boosted by taps |
| `ai-car.js` | Rival cars and the level-10 pace table |
| `game.js` | Screen flow, prompt queue, camera, HUD, results |

## Tuning notes

`Physics.minSpeed` keeps a struggling player rolling instead of grinding to a
halt, and the race ends as soon as every rival has finished — last place is
locked in at that point, so there's no long crawl to the line.

To rebalance, change `AICar.ROSTER` speeds in `ai-car.js` (level-10 reference)
or the scaling functions in `difficulty.js`. The win-threshold table above is
produced by simulating the real speed model, not by guesswork — worth
re-checking after any change to pace, decay or track length.

## Note on caching

Asset links carry a `?v=N` query string. If you edit a `.js` or `.css` file and
the browser serves a stale copy, bump those numbers in `index.html`.
