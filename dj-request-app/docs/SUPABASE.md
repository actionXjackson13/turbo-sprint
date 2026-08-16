# Moving SoundBoard onto Supabase

Demo mode keeps the whole party inside one phone's browser storage, and guests
reach it over a direct connection to that phone. It works, and it costs nothing,
but it is why accounts do not follow you to another device, why the DJ's app has
to stay open and awake all night, and why a guest on mobile data sometimes
cannot get in at all.

Supabase replaces that with a real Postgres database the app talks to over the
internet. Every phone reads and writes the same rows, so nothing depends on the
DJ's handset being reachable.

Everything below is a one-off. Budget fifteen minutes.

---

## 1. Create the project

1. Go to <https://supabase.com>, sign up, and create a new project.
2. Pick a region physically near where you throw parties — every request makes a
   round trip to it.
3. It will ask you to set a database password. Save it somewhere; you will not
   need it for this app, but you cannot see it again.

The free plan is enough. A party's worth of songs and votes is a few hundred
rows.

## 2. Install the schema

1. Open **SQL Editor** in the left sidebar.
2. Open `supabase/schema.sql` from this repository, copy all of it, paste it in.
3. Press **Run**.

That one file creates the tables, the security rules, and the stored procedures
the app calls. It is generated from `supabase/migrations/` — if you ever change
those, run `npm run schema` to rebuild it.

Run it once, on a fresh project. If you run it again it stops immediately and
tells you so, rather than half-applying itself. To start over it will print the
three lines that reset the database.

## 3. Two settings that will otherwise bite

Both live under **Authentication → Sign In / Providers**.

- **Turn on Anonymous sign-ins.** Guests never make an account; the app gives
  each one an anonymous identity so the database can tell them apart and the
  security rules have something to check. With this off, your own DJ account
  works perfectly and *every guest* bounces off the join screen — which looks
  like anything except a project setting.
- **Turn off "Confirm email"** under the Email provider, unless you want to
  click a confirmation link before a new DJ account can sign in. The app handles
  it either way and will tell you to check your email, but for one person
  signing up once it is friction with no benefit.

## 4. Point the app at it

1. In Supabase, open **Project Settings → API**.
2. Copy the **Project URL** and the **anon public** key.
3. In `dj-request-app/`, create a file called `.env`:

   ```
   VITE_SUPABASE_URL=https://yourproject.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJ...
   ```

4. `npm run deploy`, then commit and push.

The app decides which backend to use by whether those two values are set. With
them, it is a Supabase app; without them, it falls back to demo mode. Nothing
else changes.

### About that key

The **anon** key is meant to be public — it ships inside the JavaScript of every
Supabase app, and it grants nothing on its own. What actually protects the data
is row level security: the rules in the schema decide, for every single row,
who may read or write it. Those are tested in `test/supabase/migrations.test.ts`.

The **service_role** key on that same settings page is the opposite. It bypasses
every rule. It does not belong in this app, in the repository, or in a message
to anyone.

## 5. What changes once it is on

- **Accounts are real.** Sign in on your phone, your laptop, a borrowed device.
  Email and password are checked by Supabase, and a forgotten one can be reset.
- **Guests connect to the database, not to you.** No direct phone-to-phone
  connection, no relay, nothing to fail on a strange network. The app stops
  using peer-to-peer entirely.
- **The party outlives your screen.** Lock the phone, take a call, let the
  battery die and plug it in — requests keep arriving and guests keep seeing the
  queue.
- **Nothing is lost to a cleared browser.** Events, requests, votes and sets all
  live in the database.

Two things are unchanged: the in-app YouTube player still runs on the DJ's
device, so that phone still plays the music; and the YouTube key still lives in
that browser rather than the database.

## 6. Your demo data does not come with you

Everything you made while in demo mode — events, sets, the account you signed up
with — lives in a browser and stays there. Once the app is pointed at Supabase
it starts empty, and you make a fresh account. Sets are the only thing worth
rebuilding by hand, and there are not many yet.

If you want to look at the old data, an unconfigured build (or
`VITE_DEMO_MODE=true`) still opens the same local database.

---

## 7. Optional: importing an Apple Music playlist

Building a set a song at a time is fine for six and absurd for sixty. With one
small function deployed, the app can take an Apple Music playlist's share link
and build the set from it.

It needs a function because Apple serves playlist pages without the header a
browser requires to read another site's response. The page itself is public —
anyone can open it — but only something outside the browser can fetch it. That
is the entire job: fetch the page, return the song ids on it. The titles and
artists are then looked up by the app through Apple's free catalogue endpoint,
the same one the search box already uses.

### Deploying it

1. In Supabase, open **Edge Functions** in the left sidebar.
2. **Deploy a new function** → **Via Editor**.
3. Name it exactly `import-playlist`. The app calls it by that name.
4. It gives you a file called `index.ts`. Replace everything in it with
   `supabase/functions/import-playlist/index.ts` from this repository.
5. **Deploy**.

That is one file and one paste. `index.ts` is generated — the function is
written as `parse.ts` and `handler.ts`, and `npm run function` flattens them
into the single file above, because a second file in the browser editor is a
step that gets missed and fails the build with "Module not found".

Leave JWT verification on. Only a signed-in DJ ever calls this, and the app
sends their session automatically.

### Using it

**My sets → Import from an Apple Music playlist**, then paste the link.

The playlist has to be shared first — in Apple Music, open it, tap the three
dots, and turn on sharing. Apple only puts the track list on a page that anyone
can open, so a private playlist comes back empty however valid the link looks.

Nothing is written to your Apple Music account. The songs are copied into a set
here, and the app reads the page once.

### What it cannot do

Read your library or your private playlists. That needs Apple's Music API and a
paid Apple Developer membership, which is the same wall this project hit when
it looked at Shortcuts. Sharing a playlist is the free way around it.
