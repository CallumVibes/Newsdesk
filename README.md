# Newsdesk

A clean news app for the Fire TV Stick and for Android phones. No clutter, just news.

One build, two layouts. On a TV it's headlines on the left, a large preview on the right, and a full-screen reader, all driven by the D-pad. On a phone it's a single column of headlines you tap to read. The app works out which one it is when it starts.

## Sources

| Source | How it's read |
| --- | --- |
| Prices | Bitcoin from CoinGecko, Coinbase or blockchain.info; gold and oil from Yahoo or Stooq, converted at a rate from Frankfurter; the debt from the ONS, then a counter site. The sources panel names whichever answered, and the dollar figure gold and oil were converted from. |
| Citadel Wire | Each wire holds several stories and is split into them, by list, by numbering, by heading, or by blank-line blocks. A wire that resists all four is kept whole as one digest, and only the newest such digest is shown. Nostr notes from `npub1q8g803ajr0lw3xngs0k6hn2q3mejf6dtgv05d06h6krqgv9uh97q5382kp`, with the site's RSS feeds as backup. Each wire is split into its individual stories. |
| Kagi News | RSS per category: UK, World, Technology, Science and Bitcoin. UK stories are given priority. Summaries are licensed CC BY-NC. |
| Vegan Food & Living | The site's news feed, with its WordPress API and any feed advertised on the homepage as backup. |
| Local events | What's on in town, from the town council's `council_events` listing. Tried as the WordPress API, then the listing's feed, then the listing page itself. The listing often carries only a title and a link, so opening an event fetches its own page for the details and the date. |

## Tabs

- **Breaking** — only what matters to everyone, and only while it's recent. See below.
- **Today** — an optional AI briefing, then the day's biggest stories, local news, vegan food and living, what's on in town, and Bitcoin and markets.
- **Local** — the two local news sites and what's on in town.
- **UK & World** — Kagi's UK and World categories, plus general news off the wire.
- **Tech** — Kagi's Technology and Science categories, plus anything technical off the wire.
- **Bitcoin** — Kagi's Bitcoin category, plus money and markets off the wire.
- **Vegan** — Vegan Food & Living.
- **All** — everything, taking turns between sources so none of them floods the list.

The Citadel Wire files nothing under a category, so each of its stories is placed by what it
says: money and markets to Bitcoin, technology and science to Tech, and everything else to
UK & World. `CW_TOPICS` holds the two word lists that decide it, and is meant to be edited.

Every tab but Today is a flat newest-first list, taking turns between its sources. Headlines
carry a small picture, fetched only once the row is nearly on screen.

## Prices

Bitcoin, gold, oil and the national debt, all in pounds. On the TV they sit in a band under
the tabs; on a phone they take the top right corner, where the clock used to be, since the
phone shows the time in its own status bar anyway. Each price carries its move over the day.

Gold and oil are quoted in dollars wherever you look, so they are converted with a live rate.
Every figure has a chain of providers tried in turn, and gold and oil fall back to the dollar
line the Citadel Wire already prints, so one dead endpoint doesn't empty the banner. Anything
that can't be read is left out rather than guessed at, and the sources panel says what is
missing. Nothing needs an API key.

The debt comes from the Office for National Statistics, which publishes public sector net debt
monthly in millions — the figure every counter site is derived from. The newest month is the
total, and the change over the year before it sets the pace to count on at, so the rate is
measured rather than assumed. `ONS_DEBT_URL` holds the series; change it there if the ONS moves
it. A counter site is tried next, and `DEBT_SEED` — a real reading with the date it was taken —
last of all, which the panel then calls an estimate.

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
- **Local papers** have no such count, so a headline is judged on what it says: it needs more
  words from `URGENT_WORDS` than from `SOFT_WORDS`. A road closed by a crash gets in; six
  houses for sale does not.
- **The wire and Vegan Food & Living** only appear when a story is explicitly labelled breaking.

If nothing clears the bar, the tab says so rather than filling up with whatever is newest.
Both word lists sit near the top of `index.html` and are meant to be edited.

## Remote (Fire TV)

| Button | Does |
| --- | --- |
| ◀ ▶ | Switch tab (they wrap round, so nothing is more than four presses away), or move between stories in the reader |
| ▲ ▼ | Move through headlines, or scroll |
| OK | Read a story |
| ☰ Menu | Sources panel: what loaded, from where, and any errors. OK refreshes. |
| Back | Top of list, then Today, then exit |

After 3 idle minutes it shows one story at a time, dimmed and drifting to protect the screen. Any button wakes it.

## Touch (phone and tablet)

| Gesture | Does |
| --- | --- |
| Tap a tab | Switch tab. The strip scrolls, and keeps the current tab in view |
| Swipe left or right | Switch tab, or move between stories in the reader |
| Tap a headline | Read the story |
| Scroll | Normal scrolling throughout |
| ☰ (top right) | Sources panel: what loaded, from where, and any errors |
| Back | Top of list, then Today, then exit |

The phone keeps its status bar, rotates freely and is left to sleep on its own, so there's no idle screen and nothing holds the display awake.

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

Add a repository secret named `PPQ_API_KEY` with a [PPQ.ai](https://ppq.ai) key and rebuild. The app then writes a short briefing each morning from that day's stories, rewriting it at most every 3 hours and never more than 6 times a day.

Optionally add a repository variable `PPQ_MODEL` to pick a model. The default is `claude-sonnet-4-5`.

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

## Requirements

Fire OS 5 or newer, or an Android 5.1+ phone or tablet. One APK covers both. Built with Gradle 8.9, Java 17 and AGP 8.5.
