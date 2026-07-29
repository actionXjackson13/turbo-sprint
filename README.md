# Turbo Sprint

A browser drag race in the spirit of old arcade horse-racing games. You don't
steer — every car runs a straight lane. All you control is **speed**, by hitting
the key prompts as fast as they appear.

Open `index.html` in any browser. No build step, no dependencies.

## How to play

- Pick a difficulty on the start screen with **←/→** or the **0-9** keys, then **Enter**.
- A big highlighted key appears at the bottom, with the next few queued behind it.
- Prompts only ever use **W A S D**, so your left hand never leaves the keys.
- Press the highlighted key. The queue advances and your car surges forward.
- **The faster you react, the bigger the surge.** Under 0.3s is a `PERFECT!`.
- Your speed bleeds away constantly, so stopping means slowing down.
- Wrong key = `MISS`: you lose a chunk of speed and your streak resets.
- A clean streak adds up to +25% on every boost.
- First to the finish wins. Press **Enter** to race again.

## Files

| File | Role |
| --- | --- |
| `index.html` | Markup: canvas, HUD, prompt chips, overlay |
| `styles.css` | Full-viewport layout, chip animations, menu and results screens |
| `difficulty.js` | The 0-10 scale and every value it drives |
| `physics.js` | The speed model — decay, reaction-time boosts, miss penalty |
| `track.js` | World geometry, lanes, parallax scenery, start/finish |
| `car-sprite.js` | Shared side-view car drawing |
| `input.js` | Keyboard plumbing (ignores auto-repeat, so holding a key does nothing) |
| `player.js` | Player car — coasts down, boosted by taps |
| `ai-car.js` | Rival cars and the roster/pace table |
| `game.js` | Game loop, menu, prompt queue, camera, HUD, results |

## Difficulty

Levels run **0–10**, where **10 is the reference tuning** and everything below
scales down from it. Four levers move together so the drop in challenge is felt
immediately rather than hidden in one number:

- **Rival pace** — 52% of full speed at level 0
- **Track length** — 3000m at level 0, 6200m at level 10 (keeps every race ~14s)
- **Speed decay** — how fast you bleed speed between taps
- **Key pool** — `W` `A` at level 0, growing to the full `W` `A` `S` `D` by level 8

| Level | Name | Keys | Track | Rivals | You must tap at least every |
| --- | --- | --- | --- | --- | --- |
| 0 | Training Wheels | W A | 3000m | 13.5s | 1135ms |
| 2 | Rookie | W A | 3640m | 13.9s | 920ms |
| 4 | Club Racer | W A S | 4280m | 14.1s | 800ms |
| 6 | Pro | W A S | 4920m | 14.3s | 717ms |
| 8 | Champion | W A S D | 5560m | 14.5s | 634ms |
| 10 | Legend | W A S D | 6200m | 14.6s | 567ms |

Doing nothing loses at every level, so there's always a reason to tap. The
chosen level is remembered in `localStorage`.

Tuning lives in `difficulty.js` — the four `*Mult` / `trackLength` / `minSpeed`
functions are the whole model. `AICar.ROSTER` in `ai-car.js` holds the level-10
rival speeds those multipliers scale.

## Balance notes

`Physics.minSpeed` keeps a struggling player rolling instead of grinding to a
halt, and the race ends as soon as every rival has finished — last place is
locked in at that point, so there's no long crawl to the line.

## Note on caching

Asset links carry a `?v=N` query string. If you edit a `.js` or `.css` file and
the browser serves a stale copy, bump those numbers in `index.html`.
