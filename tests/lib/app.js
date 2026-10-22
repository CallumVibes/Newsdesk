/*
 * Boots the app's page the way a device does, but under jsdom, and hands back the
 * rules inside it through the __ndTestHook seam. No browser and no network: every
 * source answers through a stub the test controls.
 */
'use strict';
const fs = require('fs');
const path = require('path');

/** Where the unpacked project lives. CI passes it; locally use tests/unpack.sh. */
function projectDir() {
  const given = process.argv[2] || process.env.NEWSDESK_DIR;
  if (!given) {
    throw new Error('Give me the unpacked project directory. Run tests/unpack.sh first.');
  }
  return path.resolve(given);
}

function pagePath() {
  return path.join(projectDir(), 'app/src/main/assets/index.html');
}

/**
 * @param {object} opts
 *   reply(url)  -> {ok, status, body} | null, answering one native fetch
 *   post(url, headers, body) -> {ok, status, body}
 *   storage     -> object written into localStorage before the page runs
 *   config      -> window.ND_CONFIG
 *   device      -> 'tv' or 'touch'
 *   now         -> pin Date.now and new Date() to this instant
 *   search      -> location search, e.g. '?bg=1'
 * @returns {Promise<{nd, window, errors, calls}>}
 */
async function boot(opts) {
  const o = opts || {};
  const { JSDOM } = require('jsdom');
  let html = fs.readFileSync(pagePath(), 'utf8')
    // the web font is the one thing that would reach the network on its own
    .replace(/<link[^>]*fonts\.(googleapis|gstatic)[^>]*>/g, '');

  const errors = [];
  const calls = { fetched: [], posted: [], notified: [], scraped: [], widget: [], widgetFeed: [], widgetHist: [], shared: [], diaried: [], themed: [], buzzed: [], spoken: [], hushed: 0, voiceSettings: 0, keysSaved: [], runs: (o.runs || []).slice() };
  // What Kotlin is holding on the device's behalf, outside the page's own storage.
  const kept = { ppq: String(o.ppqKey || '') };
  let nd = null;

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    // Not file://, which jsdom treats as an opaque origin and hands no localStorage
    // to. The app keeps its cache, its seen list, its briefings, its saved stories
    // and its theme there, all wrapped in try/catch, so under file:// every one of
    // them silently did nothing and none of it was ever exercised. A real WebView
    // loading from assets has working storage, so the harness should too.
    url: 'https://newsdesk.test/index.html' + (o.search || ''),
    beforeParse(w) {
      /* Pin the clock. Some of what the app shows depends on the date rather than on
         anything it fetched - what fell on this day in bitcoin's history, which
         briefing is due - and a check that only bites on one day of the year is not
         a check. */
      if (o.now != null) {
        const Real = w.Date;
        const Fake = function (...a) { return a.length ? new Real(...a) : new Real(o.now); };
        Fake.now = () => o.now;
        Fake.parse = Real.parse;
        Fake.UTC = Real.UTC;
        Fake.prototype = Real.prototype;
        w.Date = Fake;
      }
      w.__ndTestHook = (api) => { nd = api; };
      // The Citadel relays would otherwise hold a socket open for nine seconds
      try { Object.defineProperty(w, 'WebSocket', { value: undefined, configurable: true }); } catch (e) {}
      try {
        for (const k of Object.keys(o.storage || {})) {
          w.localStorage.setItem(k, JSON.stringify(o.storage[k]));
        }
      } catch (e) {}
      if (o.config) w.ND_CONFIG = o.config;

      w.Native = {
        device: () => o.device || 'tv',
        version: () => 'Newsdesk test',
        keepAwake(on) { calls.awake = !!on; },
        exit() { calls.exited = true; },
        briefDone(wrote, edition, headline, why) {
          calls.notified.push({ wrote, edition, headline, why });
        },
        // Mutable, so a test can change what the store holds and look again without
        // booting a second page for it.
        briefLog: () => JSON.stringify(calls.runs),
        briefNext: () => String(o.booked || 'Next run booked for 12:03. The system is holding it.'),
        briefTest() { calls.tested = (calls.tested || 0) + 1; return true; },
        theme(name) { calls.themed.push(name); },
        haptic(kind) { calls.buzzed.push(kind); },
        share(title, text, url) { calls.shared.push({ title, text, url }); return true; },
        calendar(title, desc, where, start, end) {
          calls.diaried.push({ title, desc, where, start, end });
          return true;
        },
        briefSave(json) {
          // What the home screen widget would be handed, parsed as Kotlin parses it
          try { calls.widget.push(JSON.parse(json)); } catch (e) { calls.widget.push({ bad: json }); }
        },
        /* The other two widgets, pushed the same way when a refresh settles. */
        feedSave(json) {
          try { calls.widgetFeed.push(JSON.parse(json)); } catch (e) { calls.widgetFeed.push({ bad: json }); }
        },
        histSave(json) {
          try { calls.widgetHist.push(JSON.parse(json)); } catch (e) { calls.widgetHist.push({ bad: json }); }
        },
        /* The voice. o.speak decides what the device answers: true is an engine that
           took it, false is a device with none. Nothing is spoken here, so the page's
           window.__spoke has to be called by the test when it wants the end of it. */
        speak(text) {
          calls.spoken.push(text);
          return o.speak === undefined ? true : !!o.speak;
        },
        hush() { calls.hushed++; },
        /* Where a voice is chosen. o.voiceSettings false is a build of Android with no
           such screen, which is the other dead end. */
        voiceSettings() {
          calls.voiceSettings++;
          return o.voiceSettings === undefined ? true : !!o.voiceSettings;
        },
        /* The key, kept where Kotlin keeps it - a store outside this page, which both the
           app and the background job read. o.ppqKey seeds it; the page writes through. */
        ppqKey() { return kept.ppq; },
        setPpqKey(k) {
          if (o.setPpqKey === false) return false;      // a build too old to keep one
          kept.ppq = String(k || '').trim();
          calls.keysSaved.push(kept.ppq);
          return true;
        },
        clip() { return String(o.clip || ''); },
        scrape(url) {
          calls.scraped.push(url);
          setTimeout(() => w.__scrapeDone('[]', '[]'), 1);
        },
        fetch(id, url) {
          calls.fetched.push(url);
          const r = (o.reply && o.reply(url)) || null;
          setTimeout(() => w.__nativeResolve(id, !!(r && r.ok), r ? (r.status || 200) : 404, r ? r.body : ''), 1);
        },
        post(id, url, headers, body) {
          calls.posted.push({ url, body });
          const r = (o.post && o.post(url, headers, body)) || null;
          setTimeout(() => w.__nativeResolve(id, !!(r && r.ok), r ? (r.status || 200) : 500, r ? r.body : ''), 1);
        }
      };
      w.addEventListener('error', (e) => errors.push('page error: ' + (e.message || e)));
    }
  });
  dom.virtualConsole.on('jsdomError', (e) => errors.push('jsdom: ' + e.message));

  await new Promise((r) => setTimeout(r, o.settle || 400));
  if (!nd) throw new Error('the page did not reach its test hook: ' + (errors[0] || 'no error reported'));
  // The page keeps a clock and a refresh timer running, as it should on a TV that is
  // never switched off. close() stops them, so the test process can end on its own.
  const close = () => { try { dom.window.close(); } catch (e) {} };
  return { nd, window: dom.window, dom, errors, calls, close };
}

module.exports = { boot, projectDir, pagePath };
