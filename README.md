# Turbo Sprint

A browser drag race in the spirit of old arcade horse-racing games. You don't
steer — every car runs a straight lane. All you control is **speed**, by hitting
the key prompts as fast as they appear.

Open `index.html` in any browser. No build step, no dependencies.

## How to play

- A big highlighted key appears at the bottom, with the next few queued behind it.
- Press that key. The queue advances and your car surges forward.
- **The faster you react, the bigger the surge.** Under 0.3s is a `PERFECT!`.
- Your speed bleeds away constantly, so stopping means slowing down.
- Wrong key = `MISS`: you lose a chunk of speed and your streak resets.
- A clean streak adds up to +25% on every boost.
- First across 6200m wins. Press **Enter** to race again.

## Files

| File | Role |
| --- | --- |
| `index.html` | Markup: canvas, HUD, prompt chips, overlay |
| `styles.css` | Full-viewport layout, chip animations, results screen |
| `physics.js` | The speed model — decay, reaction-time boosts, miss penalty |
| `track.js` | World geometry, lanes, parallax scenery, start/finish |
| `car-sprite.js` | Shared side-view car drawing |
| `input.js` | Keyboard plumbing (ignores auto-repeat, so holding a key does nothing) |
| `player.js` | Player car — coasts down, boosted by taps |
| `ai-car.js` | Rival cars and the roster/pace table |
| `game.js` | Game loop, prompt queue, camera, HUD, results |

## Balance

Rivals run a steady pace with a slow surge/fade so the lead changes hands. They
finish in **14.6–15.1s**. Player finish times by average tap interval:

| Tap every | Finish | Result |
| --- | --- | --- |
| 250ms | 10.95s | win by 3.7s |
| 350ms | 11.40s | win by 3.2s |
| 450ms | 12.37s | win by 2.2s |
| 550ms | 13.87s | win by 0.7s |
| 600ms | 15.62s | loss |

So the win threshold sits around a 570ms tap interval. `Physics.MIN_SPEED`
(150 px/s) keeps a struggling player rolling instead of grinding to a halt, and
the race ends as soon as every rival has finished — last place is locked in at
that point, so there's no long crawl to the line.

To make it harder or easier, change `baseSpeed` in `AICar.ROSTER` (`ai-car.js`).
Everything else scales off `Physics` constants in `physics.js`.

## Note on caching

Asset links carry a `?v=N` query string. If you edit a `.js` or `.css` file and
the browser serves a stale copy, bump those numbers in `index.html`.
