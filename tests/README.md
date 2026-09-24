# Tests

The whole Android project lives base64'd inside `.github/workflows/build-newsdesk.yml`,
so the tests start by getting it back out:

```sh
tests/unpack.sh                       # writes .newsdesk-unpacked/ and prints the path
node tests/check-source.js "$(tests/unpack.sh)"
npm i --no-save jsdom
node tests/logic.test.js "$(tests/unpack.sh)"
```

Both take the unpacked directory as their one argument (or `NEWSDESK_DIR`), so they
can also be pointed at a working copy you are editing.

## What each one is for

**`check-source.js`** — no dependencies at all. It reads the project as text and
checks the things a broken build would otherwise tell you about twenty minutes
later: that every file the build needs is in the tarball, that the JavaScript
parses, that the manifest still says what the app does, and that the build has not
quietly grown a dependency. It also checks the handful of facts that are written
twice, in two languages that never see each other:

- `BRIEF_SLOTS` in `index.html` and `HOURS` in `Briefings.kt` are the same three
  hours. If they drift, the job wakes at a time the app does not think is an
  edition, and no briefing is ever written.
- every `Native.x()` the page calls exists on the Kotlin side, and anything the
  foreground app does not offer is asked for before it is called.

It also runs the cheap half of a Kotlin compiler: every capitalised name used as a
constructor or a qualifier must be imported, declared in the package, or something
the language gives you for nothing. Kotlin only reports an unresolved name when it
compiles, which happens on a runner twenty minutes and one push away; this catches
it in a second. `KOTLIN_FREE` in `check-source.js` is the list of names that need
no import.

**`logic.test.js`** — needs `jsdom`. It boots the real `index.html` with every
source answered by a stub, then reads the rules back through the `__ndTestHook`
seam at the foot of the file and checks them: the Breaking news gate, where a wire
story lands, event dates, the UK debt figure, the briefing editions, and how a
screen is built. Nothing reaches the network and nothing depends on today's date —
fixtures are built relative to now, so these still pass in a year.

The harness loads the page from `https://newsdesk.test/`, not `file://`: jsdom treats a
file origin as opaque and hands it no `localStorage`, and the app keeps its cache, its
seen list, its briefings, its saved stories and its theme there. Every one of those
writes is wrapped in try/catch, so under a file origin they all silently did nothing
and none of that code was ever exercised. A real WebView loading from assets has
working storage, so the harness has it too.

## The seam

`index.html` ends with:

```js
if (window.__ndTestHook) window.__ndTestHook({ /* the rules */ });
```

The app never sets `__ndTestHook`, so on a device that line does nothing. It exists
so the tests can read the rules without the file having to export them to the page,
where anything could reach them. Better a door than a hole cut by the tests.

## In CI

`check-source.js` and `logic.test.js` both run in the workflow, after the project is
unpacked and before Gradle is asked to build anything, so a bad push fails in
seconds rather than producing an APK that does not work.

**`layout.test.js`** — needs `playwright-core` and a Chromium. jsdom has no layout
engine: every width it reports is zero, so it can say what the page *built* and not
what the page *looks like*. Every layout fault in this app so far has been invisible
to it and obvious in a browser — a fifth figure pushing the price band to three rows
and clipping the others, a widget icon rendering as a black blob, the menu button
dropping onto a row of its own, the tab strip running off a 1080p screen. So this one
draws the page at the sizes a Fire TV and a phone actually are and checks the things
that only have an answer once something is on screen: that the price band holds one
line, that it gives up size before percentages and percentages before the line, that
every tab is on screen, that nothing is clipped or hangs off the page.

Not in CI — it needs a browser and takes seconds rather than milliseconds. Run it when
you touch the header, the tab strip or the price band:

```sh
npm i --no-save playwright-core
node tests/layout.test.js .newsdesk-unpacked
```

Set `CHROME_PATH` if your Chromium is not at `/opt/pw-browsers/chromium-1194/…`.

`check-source.js` also covers the web app: that the manifest is JSON and installable,
that the service worker lets anything that is not ours go straight to the network
uncached, that the page registers its worker only where one can exist, and that the
Pages workflow writes an empty key, refuses to publish anything key-shaped, and is not
wired to push.

## What is not here

The app's behaviour on screen — focus, the D-pad, the reader, the idle screen — is
checked with Playwright against a real Chromium. Those tests need a browser and take
minutes rather than seconds, so they are not in CI and are not committed here.
`layout.test.js` above is the part of that work worth keeping, because it is the part
that keeps catching things.
