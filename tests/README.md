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

**`logic.test.js`** — needs `jsdom`. It boots the real `index.html` with every
source answered by a stub, then reads the rules back through the `__ndTestHook`
seam at the foot of the file and checks them: the Breaking news gate, where a wire
story lands, event dates, the UK debt figure, the briefing editions, and how a
screen is built. Nothing reaches the network and nothing depends on today's date —
fixtures are built relative to now, so these still pass in a year.

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

## What is not here

The app's behaviour on screen — focus, the D-pad, the reader, the idle screen — is
checked with Playwright against a real Chromium. Those tests need a browser and take
minutes rather than seconds, so they are not in CI and are not committed here.
