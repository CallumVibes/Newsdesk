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
| Plant-based recipes | Six kitchens' feeds, pooled rather than tried in turn, deduped and newest first. Posts that are not recipes — giveaways, podcasts, gift guides — are filtered out, and a feed that has not moved in four months is treated as a kitchen that has closed. |
| On this day here | Wikidata for anyone born or died here on today's date, Wikipedia's national "on this day" sifted for local place names, and the county's own digitised archive at herefordshirehistory.org.uk. Checked before it is shown: a year has to be a year and a name has to be a name. |
| Local events | What's on in town, from the town council's `council_events` listing. Tried as the WordPress API, then the listing's feed, then the listing page itself. The listing often carries only a title and a link, so opening an event fetches its own page for the details and the date. |

## Tabs

- **Breaking** — only what matters to everyone, and only while it's recent. See below.
- **Today** — an optional AI briefing, then the day's biggest stories, local news, vegan food and living, what's on in town, and Bitcoin and markets.
- **Local** — the local news sites, the BBC topic and what's on in town.
- **UK & World** — Kagi's UK and World categories, plus general news off the wire.
- **Tech** — Kagi's Technology and Science categories, plus anything technical off the wire.
- **Bitcoin** — Kagi's Bitcoin category, plus anything off the wire that is about bitcoin itself.
- **Vegan** — Vegan Food & Living.
- **All** — everything, newest first, with no source allowed to run away with the list.
- **Recipes** — plant-based cooking, newest first, pooled from several kitchens.
- **History** — who was born or died here on today's date, what happened here, and pictures from the county archive, oldest first.
- **Saved** — stories you kept. Only on the strip once there is something in it.

The Citadel Wire files nothing under a category, so each of its stories is placed by what it
says: **Bitcoin** means bitcoin itself, not money in general, since a wire like this one carries a
great deal about oil, bonds and banks and none of that belongs there. Technology and science go
to Tech, and everything else, financial or not, to UK & World. A wire that would not split is the
whole wire, prices and all, so it goes to UK & World rather than looking like a bitcoin story.
`CW_TOPICS` holds the two word lists that decide it, and is meant to be edited.

Every tab but Today is a flat newest-first list. Headlines carry a small picture, fetched only
once the row is nearly on screen.

**Newest first means newest first.** The sources used to take strict turns — one from each pile,
then one from each again — so where a story landed depended on how far down its own pile it was
rather than when it happened. A quiet source's second story could sit above a busy source's story
from twenty minutes ago, and the list read as though it were in no order at all.

What the turns were for still holds: one source should not fill the screen. So the piles are merged
by age, and a source may have **three rows in a row** (`RUN_MAX`) before it has to let another in —
if another has anything left to offer. Nothing is dropped to keep the rhythm; once the other sources
are spent, the rest of a run simply follows.

A diary is not news and does not compete on freshness: an exhibition announced last week is still
what is on this week. Ordered by its posting date it would sink to the bottom and stay there, so
it's threaded through at one event every six stories (`DIARY_EVERY`), still reading forwards, with
anything that won't fit at that spacing following at the end.

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

## Recipes

Six plant-based kitchens, pooled rather than tried in turn: one blog has a quiet fortnight, six
between them do not. Every one of them is a plant-based kitchen, so nothing is filtered for that;
what is filtered out is everything that is not a recipe, because even a recipe site posts about
itself. A feed that has not moved in `RC_FRESH_DAYS` is treated as a kitchen that has closed.

A row names the kitchen rather than the hour, because a recipe from last week is as good as one
from this morning. Recipes never reach **Breaking**, and are kept out of **Today** and **All** the
way History is.

**On "trending":** none of these feeds publishes a view count or a share count, so nothing here
can honestly rank by popularity — anything claiming to would be sorting by date and calling it
something else. What pooling six kitchens does buy you is something new most days, newest first,
which is what "daily" is actually worth. `RC_KITCHENS` is a plain list; add or remove to taste.

## On this day, here

The **History** tab is today's date, locally. Three ways at it, because none of them works alone.

**Wikidata** knows where people were born and died and where things happened, so it can be asked
for anyone whose birthday or anniversary falls today and whose place sits anywhere inside the
county. That fills the tab most days. The query asks for the places first and the people second —
asking the other way round makes the service walk every birthday there has ever been.

Which Herefordshire it asks about matters more than it sounds. Wikidata has several. **Q23129** is
the county as it is now — the ceremonial county and unitary authority that every modern place in
it records itself as part of. **Q67531905** is the *historic* county, which nothing records itself
as part of, because a place says where it is rather than where it used to be; asking that one what
it contains answers nothing at all, every day, for ever.

Q67531905 is exactly what the first version picked, because "historic county of England" has the
word *county* in it — and having picked it, it wrote it down, so the route stayed silent until the
panel was taught to say so. The description is read properly now: anything placing the thing in
the past is skipped, anything naming what it is today wins, and a plain "county of England" will
do if nothing better is offered. The stored key is `nd.hhqid.v2`, so a phone that remembered the
wrong one forgets it. `HH_QID_DEFAULT` is the fallback if the lookup fails, and is Q23129 — it
used to be Q23124, which is the West Midlands.

**Wikipedia's own "on this day"** is the second, but it is a national list, so a line is kept only
where it — or the page it points at — actually names somewhere local. Most days that is nothing,
which is why it is second rather than first.

**[Herefordshire History](https://herefordshirehistory.org.uk/)** is the third, and the only one of
them that is nothing but here. It is Herefordshire Libraries' digitised collection — some forty
thousand photographs, postcards, posters, newspapers, maps and letters, on a [PastView](https://pastview.com)
site. The other two are national services asked about a county; neither has a picture of Church
Street with the barge boards still on it.

It publishes no feed and no API, so the app reads its pages. The archive is a **tree**: a collection
holds sub-collections, a sub-collection holds pictures, and either kind of page can be either. One
collection is asked for, chosen by the day; if what comes back is a shelf rather than the books, one
shelf is taken down — again by the day — so the tab works its way round the whole archive instead of
showing the same twenty pictures for ever. Two requests at most, once every ten minutes.

An item's address is `/archive/<collection>/<sub>/<7-digit number>-<name>`. The short form
`/view/<number>-<name>` is the same item — the site answers it with a redirect — so both are read.
Telling a picture from a shelf takes two signals, because one isn't enough: the site says which it
means (`archive-item-link` against `archive-collection-link`), and where a redesign has taken the
class names away the number decides, since a catalogue number is seven figures and a shelf called
`1960-floods-hereford` is a year.

An item is named by whatever the page says: the caption in the link, then the picture's description,
then the name in the address. A file extension is stripped — some of it is catalogued by file name.
A year in the caption sorts the row in among the rest; undated ones follow. And because the archive
catalogues twenty-four photographs of Church Street as twenty-four photographs of Church Street, one
of each caption is kept, and the day's rotation brings the others round.

**robots.txt is respected**: `/search` is disallowed and is not touched. Its `Crawl-delay: 5` is
aimed at crawlers working through a site; this makes at most two requests per refresh.

> This route was written twice. The first version looked for `/view/<id>-<slug>`, a shape taken from
> search-result snippets rather than the site — the live pages have never used it. It matched
> nothing, every day, silently, until the ☰ panel was taught to report a route that answers with
> nothing. The fixtures under `tests/fixtures/` are the site's own markup now, not a guess at it.

### When a route goes quiet

A source with three routes behind it can lose two of them and still look perfectly well: the tab
has stories in it, and the panel says where they came from. What it did not say was what *else*
was asked and answered with nothing — the difference between a route having a quiet day and one
that has been broken since the site it reads was last rebuilt.

So every route now counts what it got, and the ☰ panel lists any that failed or came back empty
under **Nothing came from:**, with the address and the reason — `HTTP 404`, `Timed out`, or
`answered with nothing`. A route that worked is not listed; there is nothing to say about it.

### A photograph is the story

An archive item is a photograph with a caption; the picture *is* the thing, not an illustration
beside an article. It used to be drawn in the same fixed strip a news story's picture gets, which
cropped the top off a street and left half the screen empty below the caption because there was no
article to fill it. A history item now gets its own shape: as much width as the screen allows,
its own height, nothing cropped, capped so the caption stays on screen. Its row in the list carries
a bigger thumbnail too.

### A menu is not the start of the article

**Full story** on a Hereford Times piece used to begin with the paper's section menu — featured,
News, Sport, Letters, Hereford FC, E-editions — as though the article opened with a list of the rest
of the website. The menu is marked up as headings that are links, outside any `<nav>`, and inside
the same container as the story, which is how it got through: the container holding the paragraphs
is the one that wins, and the menu was in it.

Two rules catch it, and both earn their place:

**A heading you can click is somewhere to go, not something to read** — both ways round. The link
can be *inside* the heading, and on a card the heading is inside the *link* instead. The first
version of this only looked downwards from the heading, which is why the menu kept coming through:
of the five shapes such a menu can take, it caught one, and not the one in use.

**A row of short headings with nothing to read between them is a menu**, whatever it's marked up as
— `MENU_RUN` of them or more, each no longer than `MENU_LEN`. An article's headings have the
article in between them; that is what they are for. This one needs no link at all, so it catches a
menu marked up as plain headings, which no link rule can.

The first is for a short menu of two or three, under the run rule's line. The second is for a menu
that isn't linked at all. Neither covers the other.

### Nothing to press

A Wikipedia entry used to open showing its description — *English darts player* — and nothing else,
with the article one tap away behind **Full story**. There was nothing else on the screen to read,
so the tap asked a question with only one answer. Where an entry opens with too little to read and
there is an article to fetch, it is fetched on opening. That already happened for the local paper
and the diary; history entries join them.

An archive item goes the other way. Its page on the library's site is their own picture viewer, and
behind it there is nothing to read but *"Scroll the mousewheel to zoom"* and a note about colour
accuracy — checked against the real page. The photograph **is** the story and it is already on the
screen, so no full story is offered, because there is none.

### Looking properly at a photograph

A picture of Church Street in 1969 has shop signs in it, and the way to read them is to get closer.
Tap the photograph in a story and it opens on black, above everything, showing all of it. Pinch to
zoom about the point between your fingers, drag to move it, double tap to go in and back out, Back
or **Close** to leave — Back takes the picture first and leaves you in the story you were reading.

It cannot be dragged off the screen and lost: once the picture is bigger than the screen an edge may
not come inside it. The image is placed by `transform` rather than by layout, which is the only way
to move and scale something every frame without asking the page to lay itself out again.

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

  A news story is somebody else's article, and what is worth sending is the article — so it goes as
  **the headline, a blank line, and the link**. It used to send 400 characters of the app's own
  summary, cut off mid-sentence, with the link at the 402nd character and the headline nowhere in
  the message at all (it was the subject line, which most messaging apps throw away). A briefing is
  the exception: it has no link and no rest, so all of it goes, in its paragraphs. A story with
  nothing to link to sends the words it has.
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

Every press and swipe gives a short buzz. It goes through Android's own haptic feedback rather
than the vibrator, so **Android's touch-vibration setting governs it** — turn that off and this
goes quiet with it, and the app asks for no vibrate permission. A press and a swipe feel
different, and saving a story has a third feel of its own, because something changed. A Fire TV
remote has nothing to buzz, so it is never asked.

| Gesture | Does |
| --- | --- |
| Tap a tab | Switch tab. The strip scrolls, and keeps the current tab in view |
| Swipe left or right | Switch tab, or move between stories in the reader |
| Tap a headline | Read the story |
| Pull down from the top | Refresh every source, with a spinner that follows your thumb |
| Scroll | Normal scrolling throughout |
| ⌕ (top right) | Search everything loaded and saved |
| ☰ (top right) | Sources panel: what loaded, from where, and any errors. **Refresh all** and the light/dark toggle are along its foot |
| Back | Top of list, then Today, then exit |

### Pull down for the news

At the top of the list, keep pulling: past about two thirds of an inch the ring fills in, and
letting go refreshes every source. It's deliberately hard to do by accident — the travel is
resisted, and the gesture has to be going more down than along, or a flick across for the next
tab that drifted a little would refresh the app every time.

### Pull down in the reader too

The same gesture inside a story, where *again* means this story rather than every source: it
re-fetches the full text. The reader is a page of its own over the top of everything, so it has an
indicator of its own inside it — the list's would be underneath.

### "4 new stories"

The app refreshes itself every ten minutes whether or not you asked. If that lands stories above
where you're reading, two things happen. The page doesn't move: the headline under the top edge
of the screen stays exactly where it was, rather than the list jumping down by four rows under
your thumb. And a pill appears at the top saying how many arrived. Tap it to go up to them.

The count is read off the list rather than tallied up: it's the number of stories now sitting
above the one that was at the top the last time you were at the top. So it can't drift out of
step, and scrolling up yourself puts the pill away just as tapping it does.

Both are phone gestures, and neither appears on the TV — a remote has nothing to pull with, and
the D-pad keeps your place already.

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
and that the facts written twice in two languages agree — the briefing times in `BRIEF_SLOTS` and in
`Briefings.kt`, read to the minute, and the `Native` bridge the page calls against the one Kotlin
offers.

`logic.test.js` boots the real page under jsdom with every source stubbed and checks the rules
themselves: what reaches Breaking, where a wire story lands, event dates, the debt figure, the
briefing editions and how a screen is built. Both run in CI before Gradle is asked for an APK, so a
bad push fails in seconds. `tests/README.md` has the detail.

## As a web app

The same `index.html` the APK carries is also a progressive web app: a manifest, an icon and a
service worker that keeps the shell so it opens without a network. Nothing hosts it — there is no
publish workflow, deliberately — so this is capability rather than a deployment. Serve
`app/src/main/assets/` over https from anywhere and it installs to a home screen and runs without
browser furniture.

Two things to know before you do.

The service worker never caches a story, only the app's own files. The news is the one thing that
must not come out of a cupboard, and the page already keeps its last fetch and shows that while it
refreshes.

And CORS. In the app, Kotlin does the fetching, so it never applies. In a browser it applies to
everything and not one of these sources allows it, so the web version reads every address through
a public CORS proxy — `WEB_PROXIES`, tried in turn — which means a third party sees every address
the app reads. The ☰ panel says so when it is running that way. The installed app uses none of
them, and none of this code runs inside the APK at all: a service worker cannot register from a
`file://` page, and `WEB_PROXIES` is only reached when there is no native bridge.

Anything you do host must not carry the PPQ key. `config.js` is where it lands at build time;
overwrite it with an empty one before serving the folder.

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
then writes four briefings a day from the stories in **Today**: a **morning** edition from 05:00, an
**afternoon** one from 12:00, an **evening** one from 17:00 and a **night** one from 21:30 — the last
thing before bed, written to settle the day rather than open it up. A scheduled job wakes the app up
a few minutes after each of those times,
opens this same page with nothing on screen, and lets it write the briefing into the storage the app
reads from — so the briefing is waiting when you next open it, whether or not the app was running.
If the job cannot run, the edition is written the next time the app refreshes after its time instead.

The times are kept as minutes since midnight in both languages, not hours — the last edition is on a
half hour, and an hour was fine enough until it wasn't. `BRIEF_MAX_PER_DAY` went from six to eight
alongside it, so each edition keeps its two paid calls (one rewrite or one failure each) rather than
four editions sharing the three's allowance.

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

Before the first edition of a new day is written there is nothing from today, and then the last
day's stay — all of them, not the newest alone — because at seven in the morning the evening
briefing is still the freshest news there is. They go when a new day's first replaces them, or
after `BRIEF_SHOW_H` hours, past which showing them would mislead rather than inform.

Two pages write briefings: the app's, and the background job's, which runs in a WebView of its own
with its own memory. They share the storage but not the list held in it, so what is stored is read
again on the way out and merged rather than overwritten. Without that, a page left open since
breakfast writes the evening edition from what it believed at breakfast and takes the afternoon's
away with it.

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

Two of them: white on near-black, and near-black on white. Change it under ☰ — on a phone it is
the button next to **Refresh all** along the foot; on the TV press ▶ to **Light theme** /
**Dark theme** and OK. It is remembered, and the button says where it will take you rather than
where you are.

One accent either way: Bitcoin orange. On white that orange is too faint to read as text, so the
light theme uses a darker one (`#B45309` against `#F7931A`) that clears 4.5:1 on its background —
the tests check that, both ways up, for the accent and for a price's rise and fall.

Every colour in the page comes from a custom property, so turning the app over is one class on
`<html>` and nothing is redrawn. `ACCENT` is a reference rather than a colour for the same reason:
handed to a style property it resolves to whichever theme is in force, so nothing that draws has
to ask. Every source and every tab used to carry a colour of its own; they all take the accent now.

Which way it is lit is settled in the head of the page, before the first paint, and Kotlin is told
so the window behind the WebView and the home screen widget are painted the same way — otherwise
each start would flash the other colour before the page caught up.

Green and red on a price's move are not part of the theme, only tuned for it. That is the one
place in the app where colour is the only thing carrying the meaning.

## Requirements

Fire OS 5 or newer, or an Android 5.1+ phone or tablet. One APK covers both. Built with Gradle 8.9, Java 17 and AGP 8.5.
