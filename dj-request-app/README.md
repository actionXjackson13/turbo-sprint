# SoundBoard — DJ song requests

A mobile-first PWA where guests at an event request songs from the DJ, upvote
each other's requests, and vote on what plays next. The DJ gets a control
panel to moderate requests, run the queue, and start voting rounds.

The app never plays or streams audio. It manages requests, votes and the
visible queue only.

**Live: <https://actionxjackson13.github.io/turbo-sprint/dj/>** — running in
demo mode, installable to a phone home screen.

---

## Quick start

```bash
cd dj-request-app && npm install && npm run dev
```

Open <http://localhost:5173>. **No configuration is needed** — with no Supabase
credentials the app runs against a local in-memory backend seeded with a full
sample event. See [Demo mode](#demo-mode).

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check and produce a production build |
| `npm run preview` | Serve the production build locally |
| `npm run type-check` | TypeScript only |
| `npm run lint` | Oxlint |
| `npm run test` | Vitest (unit + migration suites) |
| `npm run deploy` | Build for GitHub Pages into `../dj/` (then commit & push) |

### Deploying

GitHub Pages serves this repo from the master branch root, which an unrelated
project already occupies, so the app is published into a `dj/` subdirectory:

```bash
npm run deploy
cd .. && git add dj && git commit -m "Redeploy SoundBoard" && git push
```

Because it is served from a subdirectory, the app uses **hash routing** — Pages
provides no SPA rewrite there, so `/dj/e/<id>` would 404 on reload. Guests
share an event *code* rather than a URL, so this costs nothing. `DEPLOY_BASE`
controls the base path; unset (the default) builds for a domain root, which is
what you want on Vercel, Netlify or any host serving the app at `/`.

---

## Demo mode

Demo mode is the default whenever Supabase credentials are absent. On the
welcome screen you'll see a dashed **Demo mode** panel with a single
**Enter demo mode** button. There is one demo mode and it holds both sides at
once: the sample DJ is signed in for you *and* you hold a guest identity, so
you never pick a side up front.

The seeded event is **Summer Rooftop Party**, join code **`PLAY`**, with one
DJ, six guests, requests spread across every status, a now-playing track, a
short queue, and an active voting round.

### Switching who you are

Every in-event screen carries a dashed **Demo** pill above the bottom
navigation showing who you currently are. Tap it to open the switcher:

- **The DJ** — jumps to the control panel, signing the sample DJ in if needed.
- **Any guest** — become Priya, Marcus, or anyone else at the event. "My
  requests", your votes and your response to the running round all follow you.
- **Add another guest** — creates a new guest and switches to them, so you can
  fill the queue from several people, stack up votes on one song, or get past
  the five-active-requests-per-guest cap while trying things out.

This is demo-only by construction. A real guest's identity is a Supabase
anonymous auth uid the client cannot choose, so the switcher talks to
`services/demo/demoIdentity.ts` directly rather than through `DataService` —
adding it to the shared interface would oblige `SupabaseService` to implement
something it must never allow.

Demo data is stored in `localStorage`, so it survives refresh — which is what
makes the "guest session persists" behaviour real rather than simulated. It
also syncs across browser tabs, so you can open the DJ in one tab and a guest
in another and watch changes propagate live without a server. The *acting
guest* is kept in `sessionStorage` instead, precisely so that each tab can be a
different person rather than all tabs switching together.

**Reset demo data** from the DJ's *Event settings* screen. This also drops you
back to the seeded "You" identity, since any guest you added no longer exists.

---

## Connecting a real Supabase project

Demo mode is a development sandbox. For a real event you need a Supabase
project.

### 1. Create the project

Create one at <https://supabase.com/dashboard>, then note the **Project URL**
and **anon public** key from *Project Settings → API*.

### 2. Enable anonymous sign-ins

*Authentication → Sign In / Providers → Anonymous sign-ins* → **enable**.

This is required. Guests never create an account, but they do get a real
(anonymous) Supabase session so that the database can verify who they are —
see [Security model](#security-model).

Also make sure **Email** is enabled for DJ accounts. If you leave *Confirm
email* on, a new DJ must click the confirmation link before signing in; the app
shows a message saying so.

### 3. Apply the migrations

Run the five files in `supabase/migrations/` **in order**. Either paste each
into the dashboard SQL editor, or use the CLI:

```bash
supabase link --project-ref <your-project-ref> && supabase db push
```

| File | Contents |
| --- | --- |
| `0001_init_schema.sql` | Tables, keys, constraints, indexes; enables RLS |
| `0002_functions_triggers.sql` | Triggers and the server-authoritative RPCs |
| `0003_rls_policies.sql` | Row-level security policies and column grants |
| `0004_realtime.sql` | Realtime publication |
| `0005_fuzzy_dedupe.sql` | `pg_trgm`, rebuilt normalisation, similarity lookup |

### 4. Configure the app

```bash
cp .env.example .env
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | for Supabase | Project URL |
| `VITE_SUPABASE_ANON_KEY` | for Supabase | Anon public key |
| `VITE_DEMO_MODE` | no | `true` forces demo mode even with credentials set |

Restart the dev server. If either credential is missing, the app silently falls
back to demo mode.

---

## Testing the app

### Guest

1. Open the app, tap **Join an event**, enter the code (`PLAY` in demo).
2. Enter a display name and join.
3. **Refresh the page** — you stay in the event.
4. Tap **Request a song**, enter a title and artist, send it.
5. Request something already on the list — the app offers to upvote the
   existing request instead. Try it with deliberate mistakes: `Blinding Light`
   / `The Weekend` still finds `Blinding Lights` / `The Weeknd`. See
   [Duplicate detection](#duplicate-detection).
6. Tap the vote pill on any request to add or remove your vote. Your own
   request's founding vote is locked.
7. **Requests** is one list — toggle it between **Most wanted** and
   **Newest**. See [Request lists](#request-lists).
8. **My Songs** shows your requests and their live status.
9. **Vote** shows the active round; pick a song, then pick another to change
   your vote — the total does not increase.

### DJ

1. **I'm the DJ → Sign in** (or create an account).
2. Open an event, or **Create an event**.
3. The **Event** card at the foot of the control panel holds the join code and
   the **Open / Pause / Close** intake toggle — set-up details you need once,
   not all night.
4. Control panel leads with **Now playing** — **Play next song** promotes the
   top of the queue in one tap. Below it, the queue preview, then one request
   list toggling between **New** and **Most wanted** (the same ranking the
   guests see). See [Request lists](#request-lists).
5. **Play next** on any live request jumps it to the front of the queue. See
   [Queue and Play next](#queue-and-play-next).
6. **Requests** tab: filter by status, sort newest or top-voted, and
   accept / queue / decline / mark played / remove, or block a guest. Vote
   tallies show on every card.
7. **Queue** tab: **Play next song** at the top advances the night by one.
   Each row's **Play next** jumps that song to the front instead. Reorder by
   holding the grip and dragging, or by tapping a number and picking a slot.
   See [Reordering the queue](#reordering-the-queue).
8. **Vote** tab → create a round with 2–4 songs and a duration, watch tallies,
   end it early, then send any option to the queue with **Play next** or
   **Add to queue**.
9. **Settings**: rename, end the event, reset demo data.

### Seeing live updates

Open two browser tabs — DJ in one, guest in the other. Actions in one appear in
the other without a refresh (via Supabase Realtime, or the `storage` event in
demo mode).

---

## Built for a real room

Four things that only matter once the app is in a venue rather than on a
desk:

**Getting people in.** *Show QR to the room* on the control panel opens a
full-screen display: the join code sized to be read from across a room, a
scannable QR beside it, and a native share sheet for the group chat. Scanning
lands the guest on the join screen with the code already filled in. The code
travels in the hash (`/#/join?code=XXXX`) because the app uses hash routing —
a query string before the hash would never reach the router.

The QR is generated by a library, not by hand. It is a spec-heavy format where
a subtle error produces a code that looks perfectly plausible and simply fails
to scan — a defect you would find out about in front of a room full of people.
The tests decode the generated code with an independent scanner (`jsqr`) and
assert the join URL comes back, which is the same thing a guest's camera does.

**The DJ's screen stays awake.** DJ event screens hold a Screen Wake Lock, so
the phone does not lock every thirty seconds while it is being used as a
glanceable queue. Guest screens deliberately do not: it is the DJ's battery to
spend. The lock is re-acquired on returning to the tab, since the system drops
it whenever the page is backgrounded.

**Blocking is reversible.** *Event settings* lists everyone who has joined,
with block and unblock. Previously the app could only ever block — a mis-tap
silently removed a guest for the rest of the night with no way back.

**Taps are felt, not just seen.** Voting and moderation fire a short haptic.
In a dark, loud room a toast is easy to miss and a colour change easy to
overlook. It is best-effort — absent on iOS Safari, and skipped entirely for
anyone who has asked the OS for reduced motion.

---

## Design rules

The first build drew almost everything at 12–16px and weight 600, inside a
bordered card. Measured on the DJ's control panel that came to 28 of 43 text
elements at semibold and 18 outlined boxes on one screen — so nothing could
stand out, because emphasis is relative and when everything is bold nothing
is. Four rules keep that from creeping back:

1. **Weight is a signal, not a default.** Body text is 400–500. 600 and above
   is reserved for the handful of things that genuinely lead a screen. The same
   screen now has 4 semibold elements instead of 28.
2. **Separate with surface and space, not outlines.** `AppCard` draws no border
   by default; a slightly lighter surface is enough. Only a selected or winning
   item gets an outline. That screen went from 18 bordered boxes to 4.
3. **Air goes between groups, not inside them.** Sections are spaced generously
   (`space-y-7`); rows within a list are tight (`space-y-2`). Loosening
   everything uniformly is what made screens feel simultaneously cramped and
   sprawling.
4. **Slim visually, never in the hit area.** Chips and links render at 28px but
   carry an invisible 44px tap target via an `::after` overlay. No control is
   under 44px on any screen.

Type steps live in `src/index.css` as `text-label` / `text-meta` / `text-row` /
`text-title` / `text-hero`, deliberately far apart so the hierarchy survives
contact with real content.

Contrast is checked, not eyeballed: every text/background pair on all nine
screens meets WCAG AA (4.5:1, or 3:1 for large text). That audit is what caught
`fg-subtle` sitting at 3.4:1 and white-on-brand-500 buttons at 4.2:1 — both now
fixed. Disabled controls sit below the floor deliberately; WCAG exempts them,
and looking inactive is the point.

---

## Request lists

The guest event screen and the DJ control panel each show **one** request list
with a toggle, rather than stacking several sections that repeat the same
songs under different headings. Both read `features/requests/requestLists.ts`,
so the DJ is never looking at a different room than the one in front of them.

- Guests toggle **Most wanted** / **Newest**.
- The DJ toggles **New** (pending, the inbox) / **Most wanted**.

**Where the numbers come from.** Every request carries a `voteCount` derived
from rows in `request_votes`, kept current by a Postgres trigger (`DemoService`
mirrors the same maths). A request is never at zero: creating one writes the
submitter's **founding vote** in the same transaction, so it starts at 1. Any
guest can then add one vote, once — re-voting is idempotent rather than an
error, so optimistic UI and realtime updates can't inflate a tally between
them. A guest may withdraw a vote they added, but not the founding vote on
their own request.

**How the list is built.**

1. Keep only *live* requests — `pending`, `accepted`, `queued`. Played and
   declined ones are finished business; leaving them in would pin a song the DJ
   already dealt with to the top all night.
2. Sort by `voteCount`, highest first.
3. Break ties towards the **newer** request, so a fresh ask with the same
   support surfaces above one that has been sitting there.
4. Take the top 5.

Because the ranking spans three statuses, a song can sit in Most wanted while
already queued. The DJ's copy accounts for this: the buttons follow the
request's own status — *Queue / Accept / Decline* for a pending one,
*Queue / Decline* once accepted, *Mark played* once queued. Destructive moves
(remove, block guest) stay on the **Requests** screen behind a confirmation
rather than one stray tap away.

---

## Duplicate detection

Two guests asking for the same song should end up as one request with two
votes, not two requests with one each — a split vote misrepresents what the
room wants. Before a request is created, the app looks for a match and offers
**Upvote this instead**, with **Request it anyway** always available. The nudge
is advisory; nothing is blocked.

Matching happens in two stages:

1. **Normalise** — lowercase, delete apostrophes, reduce every other run of
   punctuation to a single space, collapse whitespace. Deleting apostrophes
   rather than replacing them is what makes `Don't` and `Dont` identical;
   turning them into spaces produced `don t`, which matched neither.
2. **Compare** — an exact match on the normalised title *and* artist always
   wins. Otherwise the closest request scoring at least **0.55** trigram
   similarity is offered.

The artist is part of the key on purpose: "Hello" by Adele and "Hello" by
Lionel Richie are different requests.

The threshold was measured, not guessed. Across realistic pairs, true
duplicates scored no lower than 0.74 (`Blinding Light`/`The Weekend` vs
`Blinding Lights`/`The Weeknd`) and distinct songs no higher than 0.40
(`Yesterday` vs `Let It Be`, both by The Beatles). 0.55 sits in that gap, and
`test/utils/similarity.test.ts` fails if either class drifts within 0.1 of it.

Against Postgres this is `find_similar_request`, using `pg_trgm`'s
`similarity()` over a GIN index. In demo mode there is no database, so
`src/utils/similarity.ts` reimplements pg_trgm's exact algorithm — padded
3-grams compared as a Jaccard index — rather than substituting an easier
metric, so both backends reach the same verdict. The migration test asserts
the SQL agrees with the TypeScript on the same cases.

---

## Queue and Play next

Two different gestures, deliberately named apart:

- **Start next song** sits on the DJ's Now playing card. It promotes whatever
  is at the front of the queue to the current track — the transport control.
  Promoting a request also retires it from the queue, so this is the whole
  "next track" move in one tap.
- **Play next** sits on a request, wherever that request is still live
  (pending, accepted or queued), on both the control panel and the Requests
  screen. It puts that song at the *front* of the queue. **Queue** joins the
  back of it; Play next jumps it.

Play next composes two existing operations — set the status to queued, then
reorder — rather than adding a method to `DataService`. Nothing new has to be
implemented against Postgres, and the reorder stays a single authoritative
write. The queue is re-read first rather than taken from what the screen last
rendered: another device may have queued something in the meantime, and
writing a stale ordering back would silently drop it to the end.

A request already queued shows Play next as its only action on the control
panel — retiring a song is the Queue tab's job, or happens on its own when the
next one starts. Played and declined requests get **Reopen** instead; they go
back through the normal flow rather than jumping the queue from the dead.

---

## Navigation

Four tabs each, and every tab is a place rather than an action.

| | Tabs |
| --- | --- |
| **Guest** | Home · Requests · Vote · My Songs |
| **DJ** | Control · Requests · Queue · Vote · Settings |

**Home** answers "what now?": what is playing, a vote only while one is
running, **Request Song**, and the three most popular requests behind a
**View all**. Browsing and ordering live on the **Requests** tab, which is the
slot the compose action used to occupy — a verb sitting among destinations,
with no way to see past the first few songs.

**Vote** greys out, with a reason, when no round is running. It keeps its slot
rather than appearing and disappearing, so the tabs beside it never move.

The DJ's **Vote** is a destination of its own rather than a block on the
control panel. Its tab carries a badge with the running total, which is the one
thing the control panel used to show at a glance.

### Request cards

A card carries at most two buttons — normally **Play Next** and **Add to
Queue** — plus **⋯**, which opens the rest: accept, decline, mark as played,
remove from the queue, reopen, delete, block a guest. The sheet asks
`cardActionLabels` what the card is already showing and leaves those out, so
the two never appear twice. Both DJ screens render the same card actions from
`pages/dj/requestActions.tsx`.

---

## Reordering the queue

Two ways, because they suit different moves.

**Hold the grip, then drag.** The three-line handle sits where the up/down
arrows used to. It takes a 500ms hold before the row lifts — the queue is
scrolled far more often than it is reordered, and without the delay every
scroll of the list risks dragging a song. The row outlines and follows the
finger, the rest glide out of its way, and a short buzz marks the lift, each
slot crossed, and the drop.

**Tap the number, pick a slot.** Dragging is fine for a place or two and
tedious from tenth to second. The position chip opens a menu of every slot;
choosing one moves that song there and pushes the rest down. It also keeps
reordering reachable without a pointer — a drag is not something a keyboard or
switch user can perform, and this is the same operation as a list of buttons.

Both paths end in the same single `reorderQueue` write, so a half-finished
drag never leaves the queue in a partial state.

**Play next vs Play next song.** A row's **Play next** moves that song to the
front of the queue; it does not interrupt what is playing. **Play next song**,
at the top beside the current track, starts whatever is at the front. One
decides the order, the other advances the night — the same split the control
panel uses, and the same wording, so the two screens do not teach different
vocabularies.

---

## Security model

Guest controls are hidden in the UI where they don't apply, but **the UI is
never the protection**. Every rule is enforced in the database.

**Guests get a real identity.** A guest is signed in anonymously, so
`auth.uid()` inside an RLS policy is a verified value. A browser-generated id
in `localStorage` could not be trusted this way, and the policies would have
degraded into rubber stamps.

**Operations a client must not decide are RPCs, not table writes.** Joining an
event, creating a request, blocking a guest, ending or finalising a round,
promoting a winner, and reordering the queue all run as `SECURITY DEFINER`
functions. The corresponding tables have no matching `INSERT`/`UPDATE` policy,
so there is no second path in.

Specifically:

- **Vote totals** are derived from vote rows by a trigger. A column grant
  withholds `vote_count` from clients, so even the owning DJ cannot write it.
- **One vote per guest** per request, and one ballot per guest per round, are
  unique indexes — not application checks.
- **Founding votes** can only be created by `create_song_request`, and the
  delete policy excludes them, so a submitter cannot un-vote their own request.
- **The five-active-request cap** is a trigger, so it holds regardless of which
  client sends the insert.
- **A round's deadline** is an RLS predicate compared against the database's
  own `now()`. This closes the gap between a round expiring and anyone marking
  it ended: a late vote is refused even if no client has finalised the round
  yet. The on-screen countdown is display only.
- **DJ ownership** is checked per row, so one DJ cannot touch another's event.

`profiles` and `events` are readable by anyone: guests must look up an event by
code *before* they have any membership, and neither table holds anything
private. Emails and passwords live in `auth.users`, which is never exposed.

Individual voting ballots are readable by everyone at the event. That is a
deliberate trade-off — Realtime only delivers rows a client may read, so
private ballots would mean guests never saw live totals. Writing a ballot is
still pinned to its owner.

---

## Project structure

```
dj-request-app/
├── public/icons/              PWA icons
├── src/
│   ├── components/            Presentational UI primitives (no data access)
│   ├── layouts/               App shell, guest/DJ shells with bottom nav
│   ├── pages/guest/           Welcome, Join, Display name, Event home,
│   │                          Request, Request details, My requests, Vote
│   ├── pages/dj/              Sign up/in, Dashboard, Create event, Control
│   │                          panel, Requests, Queue, Create vote, Active
│   │                          vote, Settings
│   ├── features/              Business logic hooks (requests, voting rounds)
│   ├── contexts/              Service, toast, guest session, DJ auth, DJ event
│   ├── hooks/                 useService, useAsyncData/useLiveData,
│   │                          useCountdown, useOnlineStatus, …
│   ├── services/
│   │   ├── types.ts           The DataService contract
│   │   ├── index.ts           Picks the backend from the environment
│   │   ├── demo/              In-memory backend + seed data
│   │   └── supabase/          Supabase backend, client, mappers, errors
│   ├── data/                  Constants, event-code generator
│   ├── types/                 Domain model
│   ├── utils/                 Normalisation, validation, clipboard, errors
│   └── lib/                   Env config, route paths
├── supabase/migrations/       0001 … 0004
└── test/                      Unit, service, and migration suites
```

Screens depend only on the `DataService` interface, never on a concrete
backend. `services/`, `types/`, `utils/` and `data/` contain no React or DOM
imports, so that layer could be lifted into a React Native app unchanged.

---

## How it was verified

`npm run test` runs 134 tests:

- **`normalizeText`** — the duplicate-matching rules, shared with the SQL
  function of the same name.
- **`qr`** — the generated QR is decoded back with an independent scanner, so
  the tests prove it is actually scannable rather than merely well-formed.
- **`similarity`** — pg_trgm's algorithm reimplemented for demo mode, plus the
  duplicate/distinct song pairs the 0.55 threshold was chosen against, with a
  guard that neither class drifts close to the boundary.
- **`DemoService`** — vote maths, dedupe, intake rules, the request cap, DJ
  ownership, queue ordering, and the full voting-round lifecycle. Demo mode
  enforces the same rules the database does, so behaviour verified here is the
  behaviour you get against Supabase.
- **Demo personas** — that switching guest genuinely re-scopes identity rather
  than relabelling the UI: "my requests", the per-guest request cap and
  one-vote-each all follow whoever you are currently being.
- **Request lists** — the orderings shared by the guest screen and the DJ
  control panel: which statuses each keeps, the vote tie-break, the cap, and
  that neither reorders the array it was given.
- **Play next** — that queueing appends to the back and the reorder puts the
  chosen song in front without duplicating or dropping anything. Both are
  pinned, because "Play next" silently becomes "play last" if the first ever
  changes.
- **Migrations** — the real `.sql` files are executed against an in-process
  Postgres (PGlite) with `auth.uid()` stubbed, then exercised as four different
  users through a non-superuser role so RLS actually applies. This checks the
  trigger, the cap, generated columns, founding-vote rules, cross-DJ and
  cross-guest access, deadline enforcement, winner resolution, and that
  `find_similar_request` reaches the same verdicts as the client.

Both guest and DJ flows were also driven end to end in a 390 px viewport, and
layout was checked at 375 px, 768 px and 1280 px (centred phone-width column,
no horizontal overflow, every touch target ≥ 44 px).

---

## Limitations

- **The Supabase path has not been run against a live project.** The schema,
  policies and RPCs are exercised against PGlite, and the client is written
  against the same contract as the verified demo backend, but no hosted
  Supabase project existed during development. Expect to smoke-test sign-up,
  realtime and RLS once yours is connected.
- **Duplicate detection can still be fooled.** It is typo-tolerant (see
  [Duplicate detection](#duplicate-detection)), but it compares text only — it
  has no idea that "Fatboy Slim" and "Norman Cook" are the same person, or that
  a song has an alternate title. Catching those needs a music catalogue, which
  the spec deliberately rules out.
- **Timed rounds finalise opportunistically.** A round whose clock has run out
  is closed by the first client that notices. If nobody has the app open, the
  round stays "expired but not marked ended" until someone looks — though no
  late votes can be cast in the meantime, because the deadline is enforced in
  RLS. `pg_cron` would close this cosmetic gap.
- **Event codes are four characters** and unique only among *live* events, so
  codes are reused once an event ends. Fine for a party, not for long-lived
  public events.
- **No email change, password reset, or account deletion** — these are
  Supabase Auth features that simply aren't surfaced in the UI yet.
- **Two npm advisories are unresolved and both are inapplicable here.**
  `react-router` GHSA-qwww-vcr4-c8h2 affects RSC mode with server actions; this
  is a client-only SPA with no server runtime, and no fixed stable release
  exists yet. The `workbox-build → ejs` chain is a build-time dependency of the
  PWA plugin and ships nothing to the browser.

---

## Toward native iOS and Android

The structure already anticipates this: `services/`, `types/`, `utils/` and
`data/` are free of React and DOM imports, and every screen talks to the
`DataService` interface rather than to Supabase directly.

A reasonable path:

1. **Extract the shared core** — move those four folders into a workspace
   package (`packages/core`) that both clients depend on. `SupabaseService`
   moves with it; `supabase-js` runs on React Native given a storage adapter
   (`AsyncStorage`) and the URL polyfill.
2. **Swap the storage seam.** `utils/guestId.ts` and the demo store are the
   only places that touch `localStorage`. Inject a small
   `get/set/remove` storage interface so native can supply `AsyncStorage`.
3. **Rebuild the screens in React Native.** The components map closely —
   `AppButton`/`AppInput`/`AppCard` become `Pressable`/`TextInput`/`View`,
   `BottomNavigation` becomes a bottom tab navigator, `ConfirmationDialog`
   becomes a native action sheet. The `features/` hooks port unchanged, since
   they contain no DOM code.
4. **Keep this PWA.** It stays the zero-install option for guests, who are the
   people least likely to download an app for one evening. Native is most
   valuable for the DJ, where push notifications for incoming requests and
   background reliability actually matter.
5. **Add push** via Expo Notifications, triggered by a Supabase Edge Function
   on new-request inserts — the one genuinely native capability this product
   would benefit from.
