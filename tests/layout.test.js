/*
 * What the page actually measures, in a real browser.
 *
 *   npm i --no-save playwright-core
 *   node tests/layout.test.js "$(tests/unpack.sh)"
 *
 * jsdom has no layout engine: every width it reports is zero, so it can say what the
 * page built and not what the page looks like. Every layout fault in this app so far
 * has been invisible to it and obvious here - a fifth figure pushing the price band
 * to three rows and clipping the others, a widget icon rendering as a black blob, the
 * menu button dropping onto a row of its own, the tab strip running off a 1080p
 * screen. So these run against Chromium, at the sizes a Fire TV and a phone actually
 * are, and check the things that only have an answer once something is drawn.
 *
 * Not in CI: it needs a browser and takes a few seconds rather than a few hundred
 * milliseconds. Run it when you touch the header, the tab strip or the price band.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { suite, run } = require('./lib/check');

const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const DIR = path.resolve(process.argv[2] || process.env.NEWSDESK_DIR || '');
if (!process.argv[2] && !process.env.NEWSDESK_DIR) {
  console.error('Give me the unpacked project directory. Run tests/unpack.sh first.');
  process.exit(2);
}

/** Prices that have actually been on the screen, plus the six figures that are coming. */
function market(btc) {
  const now = Date.now();
  return {
    at: now,
    wx: { t: 19, icon: 'part', label: 'Partly cloudy', c: '#F7931A', day: true, at: now, from: 'x' },
    btc: { gbp: btc, chg: -1.62, at: now, from: 'x' },
    gold: { gbp: 3252, usd: 4000, chg: -0.02, at: now, from: 'x' },
    oil: { gbp: 75.04, usd: 94, chg: 1.5, at: now, from: 'x' },
    debt: { gbp: 2.993e12, rate: 4435, at: now, from: 'x' },
    rate: 0.79, rateFrom: 'x', miss: []
  };
}

/* Every source fails, because this is about the furniture rather than the news. */
const STUB = `
  window.ND_TV = __TV__;
  try {
    localStorage.setItem('nd.mkt.v1', __MKT__);
    localStorage.setItem('nd.theme.v1', __THEME__);
  } catch (e) {}
  window.Native = {
    device: () => (__TV__ ? 'tv' : 'touch'), version: () => 'layout test',
    keepAwake() {}, exit() {}, briefDone() {}, briefSave() {},
    share() { return true; }, calendar() { return true; },
    scrape() { setTimeout(() => window.__scrapeDone('[]', '[]'), 1); },
    fetch(id) { setTimeout(() => window.__nativeResolve(id, false, 599, ''), 1); },
    post(id) { setTimeout(() => window.__nativeResolve(id, false, 599, ''), 1); }
  };`;

async function open(browser, opts) {
  const page = await browser.newPage({
    viewport: { width: opts.w, height: opts.h },
    deviceScaleFactor: 1, hasTouch: !opts.tv, isMobile: !opts.tv
  });
  await page.addInitScript(STUB
    .replace(/__TV__/g, String(!!opts.tv))
    .replace('__MKT__', JSON.stringify(JSON.stringify(market(opts.btc || 63355))))
    .replace('__THEME__', JSON.stringify(opts.theme || 'dark')));
  await page.goto('file://' + path.join(DIR, 'app/src/main/assets/index.html'));
  await page.waitForTimeout(900);
  return page;
}

/** Everything a drawn page can be asked that a built one cannot. */
function look() {
  const box = document.getElementById('mkt');
  const cs = getComputedStyle(box);
  const kids = [...box.children].map((n) => {
    const r = n.getBoundingClientRect();
    return { cls: n.className, w: r.width, mid: r.top + r.height / 2,
             clipped: n.scrollWidth > n.clientWidth + 1 };
  });
  // Cluster by vertical centre: the weather chip is taller than the text beside it,
  // so counting distinct tops calls one row several.
  const mids = kids.map((k) => k.mid).sort((a, b) => a - b);
  let rows = mids.length ? 1 : 0;
  for (let i = 1; i < mids.length; i++) if (mids[i] - mids[i - 1] > 6) rows++;
  const tabs = document.getElementById('tabs');
  const doc = document.documentElement;
  return {
    rows, items: kids.length,
    clipped: kids.filter((k) => k.clipped).map((k) => k.cls),
    font: parseFloat(cs.fontSize),
    tight: box.className === 'tight',
    percentShown: !!box.querySelector('.pc') &&
      getComputedStyle(box.querySelector('.pc')).display !== 'none',
    arrows: box.querySelectorAll('.ar').length,
    light: /\blight\b/.test(document.documentElement.className),
    bg: getComputedStyle(document.body).backgroundColor,
    text: getComputedStyle(document.querySelector('.row .ttl') ||
      document.querySelector('h1') || document.body).color,
    tabsOverflow: tabs.scrollWidth > tabs.clientWidth + 1,
    tabsScrollable: getComputedStyle(tabs).overflowX === 'auto' ||
      getComputedStyle(tabs).overflowX === 'scroll',
    tabsFaded: /gradient/.test(getComputedStyle(tabs).webkitMaskImage || '') ||
      /gradient/.test(getComputedStyle(tabs).maskImage || ''),
    // renderTabs pulls the tab in use towards the middle, so it is never the cut one
    tabOnCut: (() => {
      const on = tabs.querySelector('.tab.on');
      if (!on) return true;
      const t = tabs.getBoundingClientRect(), o = on.getBoundingClientRect();
      return o.left < t.left - 1 || o.right > t.right + 1;
    })(),
    pageOverflow: doc.scrollWidth > doc.clientWidth + 1,
    headerH: Math.round(document.querySelector('header').getBoundingClientRect().height)
  };
}

(async () => {
  let chromium;
  try { chromium = require('playwright-core').chromium; } catch (e) {
    console.error('Needs playwright-core:  npm i --no-save playwright-core');
    process.exit(2);
  }
  if (!fs.existsSync(CHROME)) {
    console.error('No Chromium at ' + CHROME + ' - set CHROME_PATH.');
    process.exit(2);
  }
  const browser = await chromium.launch({ executablePath: CHROME });
  const seen = {};
  for (const c of [
    { name: 'tv1080', w: 1920, h: 1080, tv: true },
    { name: 'tv720', w: 1280, h: 720, tv: true },
    { name: 'pixel', w: 412, h: 915 },
    { name: 'small', w: 360, h: 780 },
    { name: 'pixelBig', w: 412, h: 915, btc: 123456 },
    { name: 'smallBig', w: 360, h: 780, btc: 123456 },
    { name: 'pixelLight', w: 412, h: 915, theme: 'light' },
    { name: 'tvLight', w: 1920, h: 1080, tv: true, theme: 'light' }
  ]) {
    const page = await open(browser, c);
    seen[c.name] = await page.evaluate(look);
    await page.close();
  }
  await browser.close();

  suite('The price band holds one line', (t) => {
    Object.keys(seen).forEach((k) => {
      const m = seen[k];
      t.is(m.items, 5, k + ': the weather and four figures are all drawn');
      t.is(m.rows, 1, k + ': on one line');
      t.same(m.clipped, [], k + ': with nothing clipped');
      t.is(m.arrows, 3, k + ': every move keeps its arrow');
      t.ok(m.font >= 9, k + ': at a size that can still be read (' + m.font.toFixed(1) + 'px)');
    });
  });

  suite('It gives up the cheapest thing first', (t) => {
    t.is(seen.tv1080.tight, false, 'a television has room for everything');
    t.is(seen.tv1080.percentShown, true, 'percentages and all');
    t.is(seen.tv720.tight, false, 'at 720p too');
    t.ok(seen.tv1080.font > 20, 'and is never shrunk to make it fit');
    // A phone cannot hold five figures and three percentages across, so the
    // percentages go and the arrows stay.
    t.is(seen.pixel.tight, true, 'a phone drops the percentages');
    t.is(seen.pixel.percentShown, false, 'so they are not drawn');
    t.is(seen.pixel.arrows, 3, 'while the arrows stay, which is most of what a glance wants');
    t.ok(seen.small.font <= seen.pixel.font, 'and a narrower phone shrinks further');
    // The one that is coming: a six-figure price is wider than a five-figure one.
    t.is(seen.pixelBig.rows, 1, 'a six-figure bitcoin price still holds the line');
    t.is(seen.smallBig.rows, 1, 'even on the narrowest phone');
  });

  suite('Light turns the page over, and nothing else', (t) => {
    const rgb = (s) => (s.match(/\d+/g) || []).map(Number);
    const lum = (c) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    t.is(seen.pixel.light, false, 'dark is dark');
    t.ok(lum(rgb(seen.pixel.bg)) < 40, 'with a near-black page');
    t.is(seen.pixelLight.light, true, 'and light is light');
    t.ok(lum(rgb(seen.pixelLight.bg)) > 215, 'with a white one');
    t.ok(lum(rgb(seen.tvLight.bg)) > 215, 'on a television too');
    // The layout must not care which way the page is lit.
    ['rows', 'items', 'tight'].forEach((k) => {
      t.is(seen.pixelLight[k], seen.pixel[k], 'a phone lays out the same either way (' + k + ')');
      t.is(seen.tvLight[k], seen.tv1080[k], 'and so does a television (' + k + ')');
    });
    t.same(seen.pixelLight.clipped, [], 'nothing is clipped in the light either');
    t.is(seen.tvLight.tabOnCut, false, 'and the tab in use is still whole');
  });

  suite('The tab strip carries more than fits', (t) => {
    // Eleven tabs will not fit a television at a size a television is read at, so
    // the strip scrolls rather than the tabs shrinking past legibility.
    ['tv1080', 'tv720', 'pixel', 'small'].forEach((k) => {
      t.is(seen[k].tabsScrollable, true, k + ': the strip scrolls');
      t.is(seen[k].tabsFaded, true, k + ': and its ends are faded, so a cut tab reads as more');
      t.is(seen[k].tabOnCut, false, k + ': with the tab in use kept whole and in view');
    });
  });

  suite('Nothing else moved to make room', (t) => {
    Object.keys(seen).forEach((k) => {
      t.is(seen[k].pageOverflow, false, k + ': nothing hangs off the side of the page');
    });
    t.ok(seen.pixel.headerH < 120, 'and the header stays out of the way of the news');
  });

  return run('Newsdesk layout');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
