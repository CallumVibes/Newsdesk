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
  const calls = { fetched: [], posted: [], notified: [], scraped: [], widget: [], shared: [], diaried: [] };
  let nd = null;

  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'file:///newsdesk/index.html' + (o.search || ''),
    beforeParse(w) {
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
        briefDone(wrote, edition, headline) { calls.notified.push({ wrote, edition, headline }); },
        share(title, text, url) { calls.shared.push({ title, text, url }); return true; },
        calendar(title, desc, where, start, end) {
          calls.diaried.push({ title, desc, where, start, end });
          return true;
        },
        briefSave(json) {
          // What the home screen widget would be handed, parsed as Kotlin parses it
          try { calls.widget.push(JSON.parse(json)); } catch (e) { calls.widget.push({ bad: json }); }
        },
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
