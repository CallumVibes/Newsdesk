# Newsdesk

A clean news app for the Fire TV Stick and for Android phones. No clutter, just news.

One build, two layouts. On a TV it's headlines on the left, a large preview on the right, and a full-screen reader, all driven by the D-pad. On a phone it's a single column of headlines you tap to read. The app works out which one it is when it starts.

## Sources

| Source | How it's read |
| --- | --- |
| Weather | Open-Meteo, then met.no. Both are free and need no key. Each answers in its own language — a WMO number, or a symbol name — and both are put through a table into one of eleven drawn icons. |
| Prices | Bitcoin from CoinGecko, Coinbase or blockchain.info; gold and oil from Yahoo or Stooq, converted at a rate from Frankfurter; the debt from the ONS, then a counter site. The sources panel names whichever answered, and the dollar figure gold and oil were converted from. |
| Citadel Wire | Each wire holds several stories and is split into them, by list, by numbering, by heading, or by blank-line blocks. A wire that resists all four is kept whole as one digest, and only the newest such digest is shown. Nostr notes from `npub1q8g803ajr0lw3xngs0k6hn2q3mejf6dtgv05d06h6krqgv9uh97q5382kp`, with the site's RSS feeds as backup. Each wire is split into its individual stories. |
| Kagi News | RSS per category: UK, World, Technology, Science and Bitcoin. UK stories are given priority. Summaries are licensed CC BY-NC. |
| BBC News | A BBC topic page. Read from the schema.org listing the page publishes for search engines, which carries the headline, link, time and summary and outlives any amount of front-end rebuilding. Its links are read only if that is missing. `BB_FEEDS` takes a feed address to use in place of the page. |
| Vegan Food & Living | The site's news feed, with its WordPress API and any feed advertised on the homepage as backup. |
| On this day here | Wikidata for anyone born or died here on today's date, then Wikipedia's national "on this day" sifted for local place names. Checked before it is shown: a year has to be a year and a name has to be a name. |
| Local events | What's on in town, from the town council's `council_events` listing. Tried as the WordPress API, then the listing's feed, then the listing page itself. The listing often carries only a title and a link, so opening an event fetches its own page for the details and the date. |

## Tabs

- **Breaking** — only what matters to everyone, and only while it's recent. See below.
- **Today** — an optional AI briefing, then the day's biggest stories, local news, vegan food and living, what's on in town, and Bitcoin and markets.
- **Local** — the local news sites, the BBC topic and what's on in town.
- **UK & World** — Kagi's UK and World categories, plus general news off the wire.
- **Tech** — Kagi's Technology and Science categories, plus anything technical off the wire.
- **Bitcoin** — Kagi's Bitcoin category, plus anything off the wire that is about bitcoin itself.
- **Vegan** — Vegan Food & Living.
- **All** — everything, taking turns between sources so none of them floods the list.
- **History** — who was born or died here on today's date, and what happened here, oldest first.
- **Saved** — stories you kept. Only on the strip once there is something in it.

The Citadel Wire files nothing under a category, so each of its stories is placed by what it
says: **Bitcoin** means bitcoin itself, not money in general, since a wire like this one carries a
great deal about oil, bonds and banks and none of that belongs there. Technology and science go
to Tech, and everything else, financial or not, to UK & World. A wire that would not split is the
whole wire, prices and all, so it goes to UK & World rather than looking like a bitcoin story.
`CW_TOPICS` holds the two word lists that decide it, and is meant to be edited.

Every tab but Today is a flat newest-first list, taking turns between its sources. Headlines
carry a small picture, fetched only once the row is nearly on screen.

## Weather

A small icon and the temperature, leading the band of prices under the tabs, on both devices.

The icons are drawn rather than typed. An emoji sun is at the mercy of whatever font the device
ships — a Fire TV stick and a modern phone have different sets — and a missing one shows as an
empty box. These are SVG, so they are the same everywhere, scale with the text and take their
colour from the condition: a warm sun, a blue shower, an amber thunderstorm. At night a clear
sky is a moon.

A reading more than three hours old is dropped rather than shown, because stale weather is wrong
in a way a stale gold price is not. `WX_AT` sets the coordinates and `WX_STALE_MS` that limit.

## Prices

Bitcoin, gold, oil and the national debt, all in pounds, in a band under the tabs — the same
place on a phone as on the TV, and on one line.

Five figures will not fit across a phone at a comfortable size, so the band fits itself to the
width it has, giving up the cheapest thing first: a little size, then the percentages — keeping
the arrows, since which way it went is most of what a glance wants and it costs a fifth of the
width — then a little more size, down to a floor. Below that the second row comes back, because
a band too small to read is worse than a tall one. It is measured rather than calculated, since
the width depends on the numbers (a six-figure bitcoin price is wider than a five) and on
whichever font the device actually loaded. A TV clears the first rung without moving.
`MKT_COMFY_REM` and `MKT_MIN_REM` set the two floors.

They used to sit in the phone's top right corner, in the room the clock gave up. That corner
fitted four figures and no more: a fifth had nowhere to go, and a five-figure bitcoin price
carrying its change was wider than half of it and lost its label off the left edge. Across the
whole width they take the room they need and wrap when they run out.

Gold and oil are quoted in dollars wherever you look, so they are converted with a live rate.
Every figure has a chain of providers tried in turn, and gold and oil fall back to the dollar
line the Citadel Wire already prints, so one dead endpoint doesn't empty the banner. Anything
that can't be read is left out rather than guessed at, and the sources panel says what is
missing. Nothing needs an API key.

The debt comes from the Office for National Statistics, which publishes public sector net debt
monthly — the figure every counter site is derived from. The newest month is the total, and the
change over the year before it sets the pace to count on at, so the rate is measured rather than
assumed.

The same measure is published as several series in different units, and one of them is a
percentage of GDP, which answers about 95 and looks like a perfectly good number. So the unit is
worked out from the size of the answer rather than assumed, and `ONS_DEBT_URLS` is tried in turn
until one lands where a national debt could plausibly be. A series that has stopped publishing is
refused too, however plausible its last figure. A counter site is tried next, and `DEBT_SEED` — a
real reading with the date it was taken — last of all, which the panel then calls an estimate.

That seed also guards the other two: a total is rejected unless it is within half to twice what
the seed extrapolates to, wide enough for years of drift but enough to catch a figure off by a
factor of a thousand, or the wrong ONS series. A cached total is re-checked the same way on
load, on refresh and before each draw, so one written by an older build can't sit there.

## What reaches Breaking

Breaking is about importance, not just freshness, so a story has to be recent **and** matter
to everyone. There are three ways in:

- **Kagi** stories qualify on how many outlets are covering them — at least `KG_BREAKING_MIN`,
  and within `KG_BREAKING_SHARE` of the day's most widely covered story. The bar is relative,
  so it adjusts itself as the day's news gets bigger or smaller. If a feed arrives without its
  source list, the top `KG_BREAKING_TOP` of each category are used instead.
- **Local sources** (`LOCAL_NEWS`) have no such count, so a headline is judged on what it says:
  it needs more words from `URGENT_WORDS` than from `SOFT_WORDS`. A road closed by a crash gets
  in; six houses for sale does not.
- **The wire and Vegan Food & Living** only appear when a story is explicitly labelled breaking.

If nothing clears the bar, the tab says so rather than filling up with whatever is newest.
Both word lists sit near the top of `index.html` and are meant to be edited.

## On this day, here

The **History** tab is today's date, locally. Two ways at it, because neither works alone.

**Wikidata** knows where people were born and died and where things happened, so it can be asked
for anyone whose birthday or anniversary falls today and whose place sits anywhere inside the
county. That fills the tab most days. The query asks for the places first and the people second —
asking the other way round makes the service walk every birthday there has ever been. The county's
own id is looked up rather than assumed, and remembered once found; `HH_QID_DEFAULT` is the
fallback if the lookup fails.

**Wikipedia's own "on this day"** is the other, but it is a national list, so a line is kept only
where it — or the page it points at — actually names somewhere local. Most days that is nothing,
which is why it is second rather than first.

Whatever comes back is checked before it is shown: a year has to be a year, a name has to be a
name, and a thing with no English name is dropped rather than displayed as a Q-number. A query
answering in a shape the app did not expect empties the tab rather than filling it with nonsense.

Rows show the year rather than how long ago anything was fetched, and history never reaches
Breaking whatever words are in it. It is kept out of **Today** and **All**, where a row from 1743
among the morning's headlines would read as a mistake, but it is fetched, cached and searched like
any other source.

## Search

Searches what the app already has — every story its sources last gave it, everything saved, and
every briefing held. Nothing is fetched: this is for "where was that thing I saw", not for
searching the web.

Every word has to appear somewhere, so a second word narrows rather than widens, and a word in
the headline counts for more than one buried in the summary. Results replace the list itself,
so opening one works exactly as it does anywhere else.

On a phone, the ⌕ button beside ☰. On a television, open ☰ and press ▶ to **Search stories**,
then OK — ▼ from the box drops into the results, ▲ goes back to it, and Back leaves. OK on its
own in the panel still refreshes, as it always did.

## Saving, sharing and the calendar

Open a story and the foot of the reader offers what you can do with it. On a phone they are
buttons; on a television, press ▼ once you have read to the bottom and the strip lights up, then
◀ ▶ between them and OK.

- **Save** keeps the story in a **Saved** tab, which only appears on the strip once there is
  something in it. What is kept is a copy, so a saved story still opens and reads after its source
  has dropped it from the feed — which all of them do within days.
- **Share** hands it to whatever the phone has: messages, mail, a notes app.
- **Add to calendar** opens your calendar's own new-event screen, filled in, for an event whose
  date could be read. Nothing is written to your calendar by the app; you save it, or you don't.

A television is offered neither of the last two — there is nothing to share to and no calendar to
open — so its strip stays at two.

## Remote (Fire TV)

| Button | Does |
| --- | --- |
| ◀ ▶ | Switch tab (they wrap round, so nothing is more than four presses away), or move between stories in the reader |
| ▲ ▼ | Move through headlines, or scroll |
| OK | Read a story |
| ☰ Menu | Sources panel: what loaded, from where, and any errors. ◀ ▶ pick between **Refresh all** and **Search stories**, OK runs the one lit. |
| Back | Top of list, then Today, then exit |

After 3 idle minutes it shows one story at a time, dimmed and drifting to protect the screen. Any button wakes it.

## Touch (phone and tablet)

| Gesture | Does |
| --- | --- |
| Tap a tab | Switch tab. The strip scrolls, and keeps the current tab in view |
| Swipe left or right | Switch tab, or move between stories in the reader |
| Tap a headline | Read the story |
| Scroll | Normal scrolling throughout |
| ⌕ (top right) | Search everything loaded and saved |
| ☰ (top right) | Sources panel: what loaded, from where, and any errors |
| Back | Top of list, then Today, then exit |

The phone keeps its status bar, rotates freely and is left to sleep on its own, so there's no idle screen and nothing holds the display awake.

## Tests

```sh
tests/unpack.sh                              # the project, back out of the workflow file
node tests/check-source.js .newsdesk-unpacked
npm i --no-save jsdom
node tests/logic.test.js .newsdesk-unpacked
```

`check-source.js` needs nothing installed. It reads the project as text and checks that the build
has everything it needs, that the JavaScript parses, that the manifest still says what the app does,
and that the facts written twice in two languages agree — the briefing hours in `BRIEF_SLOTS` and in
`Briefings.kt`, and the `Native` bridge the page calls against the one Kotlin offers.

`logic.test.js` boots the real page under jsdom with every source stubbed and checks the rules
themselves: what reaches Breaking, where a wire story lands, event dates, the debt figure, the
briefing editions and how a screen is built. Both run in CI before Gradle is asked for an APK, so a
bad push fails in seconds. `tests/README.md` has the detail.

## Build

The whole project is embedded in `.github/workflows/build-newsdesk.yml`, so that one file is all the repo needs. No laptop required.

1. Push the workflow file, or run it from the **Actions** tab.
2. Download the `newsdesk-apk-<run>` artifact.
3. Install it:

```
adb install -r newsdesk-<run>.apk
```

It's signed with a fixed key, so each build installs over the last one.

## AI briefing (optional)

Add a repository secret named `PPQ_API_KEY` with a [PPQ.ai](https://ppq.ai) key and rebuild. The app
then writes three briefings a day from the stories in **Today**: a **morning** edition from 05:00, an
**afternoon** one from 12:00 and an **evening** one from 17:00. A scheduled job wakes the app up a few minutes after each hour,
opens this same page with nothing on screen, and lets it write the briefing into the storage the app
reads from — so the briefing is waiting when you next open it, whether or not the app was running.
If the job cannot run, the edition is written the next time the app refreshes after its hour instead.

When a briefing is written while you weren't looking, a notification carries its headline; tapping it
opens the app. One per edition, and never for an edition already written, so a retried job stays quiet.
Android 13 and later ask permission the first time the app opens; refusing changes nothing except that
the briefings arrive silently. A television is watched rather than notified at, so it gets none. Turn
them off like any other app's, under Briefings in Android's notification settings.

Every edition is kept for four days, newest first, so this morning's is still there at teatime.
Today's sit together under **Briefings** in the Today tab, each labelled with the edition it is;
the ☰ panel lists everything held, including the previous few days'. An edition rewritten — by the
Refresh button, or by a retry after a failure — replaces its own entry rather than making a second.
`BRIEF_KEEP` and `BRIEF_KEEP_DAYS` set how much is held.

Each edition is told which one it is, and is given the previous one so it carries on rather than repeats:
the morning leads on what happened overnight, the afternoon on what has moved since, the evening draws
the day together. `BRIEF_SLOTS` sets the hours and the angle of each. `BRIEF_MAX_PER_DAY` still caps the
paid calls, retries included.

Optionally add a repository variable `PPQ_MODEL` to pick a model. The default is `claude-sonnet-4-5`.

## Home screen widget (phone)

Long-press the home screen, pick **Widgets**, then **Newsdesk briefing**. It shows the latest
edition, its headline and all of its paragraphs, scrolled if it doesn't fit. Tap anywhere on it to
open the app. It resizes in both directions, so it can be a two-line headline or half a screen.

The widget never fetches anything and never starts the app. The page hands each briefing over as it
saves it — in the app or in the background job, which is the same code either way — and the widget
draws whatever was last handed over. So the morning edition is on the home screen before the phone
is picked up, and if nothing has been written yet the widget says so rather than sitting blank.

Its header carries the time the briefing was written, and the date too once it's yesterday's, so a
stale briefing looks stale rather than current.

A Fire TV has no home screen widgets, so it simply never offers one.

**Keep this repo private.** The key is built into the APK.

## Settings

Near the top of `app/src/main/assets/index.html`:

| Setting | Does |
| --- | --- |
| `HOME_TAB` | Which tab opens first |
| `BREAKING_HOURS` | How new a story must be to count as breaking |
| `BREAKING_PER_SOURCE` | Most stories one source may put on **Breaking** |
| `BREAKING_MAX` | Most rows **Breaking** will ever show |
| `KG_BREAKING_MIN` / `KG_BREAKING_SHARE` | How widely covered a Kagi story must be to count |
| `URGENT_WORDS` / `SOFT_WORDS` | What makes a local headline important, or not |
| `ROW_IMAGES` | Small picture on each headline; `false` for text only |
| `BTC_SOURCES`, `GOLD_SOURCES`, `OIL_SOURCES` | Where prices come from, tried in order |
| `RATE_SOURCES` | Where the dollar to pound rate comes from |
| `MKT_STALE_MS` | How old a price may be before it stops being shown |
| `WX_AT` | Where the weather is for |
| `WX_STALE_MS` | How old a forecast may be before it stops being shown |
| `KAGI_WANT` | Which Kagi categories to pull |
| `KAGI_BOOST` | How much of a head start UK stories get |
| `EVENT_WINDOW_DAYS` | How far ahead **On in town** looks before falling back to the soonest events |
| `EVENTS_SHOWN` | How many events sit in Today |
| `CW_RELAYS` | Which Nostr relays to ask |
| `IDLE_AFTER_MS` | How long before the idle screen starts |

## Events

**On in town** is a diary, not a news feed, so it behaves differently from every other source:

- It sorts forwards. The next thing on is at the top, and anything already over drops to the bottom.
- It never appears under **Breaking news**, and a future date can't masquerade as a story that just broke.
- Rows read "Tomorrow, 16:30" rather than "2h ago". An event whose date can't be read shows no time at all rather than the day it was posted.

The date comes from the listing's own field where it has one, and is otherwise read out of the title or the blurb ("5 September 2026", "12th June at 4:30pm"). The AI briefing is told these are upcoming events rather than news, and is given the date.

## Theme

White on near-black, with one accent: Bitcoin orange, `#F7931A`. Every source and every tab used
to carry a colour of its own; they all take the accent now, and the greys are neutral rather than
the teal-tinted ones they replace, so nothing competes with it. `ACCENT` near the top of
`index.html` is the single place it is set.

Two colours are not part of the theme and stay as they are: green and red on a price's move. That
is the one place in the app where colour is the only thing carrying the meaning.

## Requirements

Fire OS 5 or newer, or an Android 5.1+ phone or tablet. One APK covers both. Built with Gradle 8.9, Java 17 and AGP 8.5.
