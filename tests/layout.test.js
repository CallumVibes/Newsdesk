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
  window.__ndTestHook = (api) => { window.ndApi = api; };
  window.Native = {
    device: () => (__TV__ ? 'tv' : 'touch'), version: () => 'layout test',
    keepAwake() {}, exit() {}, briefDone() {}, briefSave() {},
    share() { return true; }, calendar() { return true; },
    scrape() { setTimeout(() => window.__scrapeDone('[]', '[]'), 1); },
    fetch(id) { setTimeout(() => window.__nativeResolve(id, false, 599, ''), 1); },
    post(id) { setTimeout(() => window.__nativeResolve(id, false, 599, ''), 1); }
  };`;

/* What the sources panel actually offers, once it is open. Nothing had ever opened
   it in a test, which is how a rule meant to hide the remote's key hints came to hide
   every action beside them - on a phone that left the theme unreachable and no way to
   refresh by hand, and both looked perfectly fine in the source. */
function sheet() {
  var foot = document.querySelector('.sheet-foot');
  var acts = document.getElementById('shActs');
  var wrap = document.getElementById('sheetWrap');
  function vis(n) {
    var s = getComputedStyle(n), r = n.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }
  var fr = foot.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
  return {
    footVisible: vis(foot),
    actsVisible: vis(acts),
    labels: [].slice.call(acts.children).filter(vis).map(function (c) { return c.textContent.trim(); }),
    hidden: [].slice.call(acts.children).filter(function (c) { return !vis(c); })
      .map(function (c) { return c.textContent.trim(); }),
    // A foot taller than the room reserved for it sits on top of the list behind it
    overlapsList: fr.top < wr.bottom - 1,
    footRows: (function () {
      var tops = [].slice.call(acts.children).filter(vis)
        .map(function (c) { return Math.round(c.getBoundingClientRect().top); });
      return new Set(tops).size || 1;
    })()
  };
}

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

/* Pull to refresh and the pill both want a list with stories in it and a finger to
   move down it. jsdom has neither: no heights to scroll through, no touches, and
   nothing that would notice a row moving under the thumb. */
async function pullAndPill(browser) {
  const page = await open(browser, { w: 412, h: 915 });
  const out = await page.evaluate(async () => {
    const nd = window.ndApi, S = nd.S;
    const wrap = document.getElementById('listWrap');
    const pill = document.getElementById('newPill');
    const ind = document.getElementById('pullInd');
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const news = (n, from) => Array.from({ length: n }, (_, i) => ({
      id: 'ht:' + (from + i), src: 'ht', kicker: '', title: 'A headline for story ' + (from + i),
      summary: 'Summary.', link: 'https://example.com/' + (from + i), image: '', html: '',
      date: Date.now() - (from + i) * 60000, when: 0, order: from + i, fetched: Date.now()
    }));

    // A finger, since Playwright's touchscreen only taps.
    function drag(el, fromY, toY, steps, acrossTo) {
      const x0 = 200, x1 = acrossTo == null ? 200 : acrossTo;
      const mk = (type, y, x) => {
        const t = new Touch({ identifier: 1, target: el, clientX: x, clientY: y,
                              pageX: x, pageY: y, screenX: x, screenY: y });
        const live = type === 'touchend' ? [] : [t];
        return new TouchEvent(type, { touches: live, targetTouches: live, changedTouches: [t],
                                      bubbles: true, cancelable: true });
      };
      el.dispatchEvent(mk('touchstart', fromY, x0));
      for (let i = 1; i <= steps; i++) {
        el.dispatchEvent(mk('touchmove', fromY + (toY - fromY) * i / steps, x0 + (x1 - x0) * i / steps));
      }
      const shown = { cls: ind.className, y: ind.getBoundingClientRect().top };
      el.dispatchEvent(mk('touchend', toY, x1));
      return shown;
    }
    const vis = (n) => {
      const c = getComputedStyle(n), r = n.getBoundingClientRect();
      return c.display !== 'none' && c.visibility !== 'hidden' && parseFloat(c.opacity) > 0.05
        && r.width > 0 && r.height > 0;
    };

    S.tab = nd.TABS.findIndex((x) => x.id === 'local');
    S.by.ht = { items: news(25, 10) };
    wrap.scrollTop = 0;
    nd.rebuild(null);
    await wait(60);

    const r = { indAtRest: vis(ind), pillAtRest: vis(pill) };

    /* The reader is part way down. Which headline is under the top edge, and how
       far into it, is the thing that must not move. */
    wrap.scrollTop = 700;
    nd.paintPill();
    const edgeBefore = (() => {
      const rows = [...document.querySelectorAll('#list li.row')];
      const y = wrap.getBoundingClientRect().top;
      const hit = rows.find((n) => n.getBoundingClientRect().bottom > y + 1);
      return hit ? { text: hit.querySelector('.ttl').textContent, into: Math.round(y - hit.getBoundingClientRect().top) } : null;
    })();

    // Four newer stories land, the way a refresh lands them.
    S.by.ht.items = news(4, 1).concat(S.by.ht.items);
    nd.rebuild(null);
    await wait(60);
    const edgeAfter = (() => {
      const rows = [...document.querySelectorAll('#list li.row')];
      const y = wrap.getBoundingClientRect().top;
      const hit = rows.find((n) => n.getBoundingClientRect().bottom > y + 1);
      return hit ? { text: hit.querySelector('.ttl').textContent, into: Math.round(y - hit.getBoundingClientRect().top) } : null;
    })();

    r.held = edgeBefore && edgeAfter && edgeBefore.text === edgeAfter.text;
    r.drift = edgeBefore && edgeAfter ? Math.abs(edgeAfter.into - edgeBefore.into) : 999;
    await wait(420);                    // it slides in; measuring it halfway measures nothing
    r.pillText = pill.textContent;
    r.pillVisible = vis(pill);
    const pr = pill.getBoundingClientRect(), wr = wrap.getBoundingClientRect();
    r.pillInView = pr.top >= wr.top - 1 && pr.bottom <= wr.bottom + 1
      && pr.left >= 0 && pr.right <= window.innerWidth + 1;
    r.pillTall = Math.round(pr.height);
    // A pill nothing can be tapped through is a picture of a button
    const hitNode = document.elementFromPoint(pr.left + pr.width / 2, pr.top + pr.height / 2);
    r.pillTappable = !!hitNode && (hitNode === pill || pill.contains(hitNode));
    // It must not sit on the first headline it is announcing
    const first = document.querySelector('#list li.row');
    r.pillOverRow = !!first && pr.bottom > first.getBoundingClientRect().top + 4
      && wrap.scrollTop <= 8;

    /* Scrolling up yourself is the same news as tapping it: you have caught up. The
       pill cannot put itself away on a timer, so the scroll handler is the only
       thing that ever will. */
    wrap.scrollTop = 0;
    wrap.dispatchEvent(new Event('scroll'));
    await wait(420);
    r.afterScrollUp = { pill: vis(pill), anchor: S.top === S.view[0].id };

    // And back down, so there is a pill to tap. Newer than everything already there,
    // or they would land below the mark and rightly not be counted.
    wrap.scrollTop = 700;
    const fresher = Array.from({ length: 2 }, (_, i) => Object.assign(news(1, 0)[0], {
      id: 'ht:fresh' + i, title: 'Just in ' + i, date: Date.now() - i * 1000 }));
    S.by.ht.items = fresher.concat(S.by.ht.items);
    nd.rebuild(null);
    await wait(420);
    r.pillBack = vis(pill);
    pill.click();
    await wait(600);
    r.afterTap = { y: Math.round(wrap.scrollTop), pill: vis(pill) };

    /* Now the pull. A short one is somebody scrolling and must do nothing; a long
       one is the gesture and must start a refresh. */
    wrap.scrollTop = 0;
    await wait(40);
    const was = S.refreshStarted || 0;
    const shortPull = drag(wrap, 300, 300 + 24, 6);
    await wait(80);
    r.shortStarted = (S.refreshStarted || 0) !== was;
    r.shortInd = shortPull.cls;
    r.indAfterShort = vis(ind);

    const was2 = S.refreshStarted || 0;
    const longPull = drag(wrap, 300, 300 + 170, 10);
    r.longShownCls = longPull.cls;
    r.longFollowed = longPull.y;
    await wait(80);
    r.longStarted = (S.refreshStarted || 0) !== was2;
    r.spinning = /spin/.test(ind.className) && vis(ind);
    // And it puts itself away once the sources have answered, however they answered
    await wait(2500);
    r.indAfterRefresh = vis(ind);

    /* A flick across for the next tab, drifting an inch down on the way. The travel
       is past the threshold; the direction is not. */
    wrap.scrollTop = 0;
    await wait(40);
    const was4 = S.refreshStarted || 0;
    const across = drag(wrap, 300, 300 + 90, 10, 20);
    await wait(80);
    r.acrossStarted = (S.refreshStarted || 0) !== was4;
    r.acrossInd = vis(ind);
    r.acrossCls = across.cls;

    // A pull while reading a story is not a pull
    S.mode = 'reader';
    wrap.scrollTop = 0;
    const was3 = S.refreshStarted || 0;
    drag(wrap, 300, 470, 10);
    await wait(80);
    r.readerStarted = (S.refreshStarted || 0) !== was3;
    S.mode = 'home';
    return r;
  });
  await page.close();
  return out;
}

/* A phone shows nine rows and the list is a hundred and twenty long. Drawing the lot
   before the first one appears is most of what a rebuild costs, and only a browser
   with real heights can say whether the rest arrives before anyone reaches it. */
async function rowDrawing(browser) {
  const page = await open(browser, { w: 412, h: 915 });
  const out = await page.evaluate(async () => {
    const nd = window.ndApi, S = nd.S;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const wrap = document.getElementById('listWrap'), ol = document.getElementById('list');
    const rows = () => ol.querySelectorAll('li.row').length;
    const feed = (src, n, kicker) => ({ items: Array.from({ length: n }, (_, i) => ({
      id: src + ':' + i, src, kicker: kicker || '', title: 'A headline for ' + src + ' story ' + i,
      summary: 'Summary.', link: 'https://example.com/' + src + '/' + i, image: '', html: '',
      date: Date.now() - i * 60000, when: 0, order: i, fetched: Date.now() })) });
    S.by.ht = feed('ht', 90);
    // Today draws in sections, and a section needs a source to fill it.
    S.by.kg = feed('kg', 20, 'UK');
    S.by.vf = feed('vf', 12);
    S.by.cw = feed('cw', 12);
    S.tab = nd.TABS.findIndex((x) => x.id === 'local');
    S.mode = 'home';

    // From the top: a screenful now, the rest a tick later.
    wrap.scrollTop = 0;
    nd.rebuild(null);
    const r = { first: rows(), want: nd.FIRST_ROWS, view: S.view.length };
    await wait(40);
    r.afterTick = rows();
    // Everything that was drawn is still in the right order and knows its place.
    const ids = [].map.call(ol.querySelectorAll('li.row'), (n) => n.getAttribute('data-i'));
    r.inOrder = ids.every((v, i) => Number(v) === i);
    r.listTaller = ol.scrollHeight > wrap.clientHeight;

    // Scrolled: nothing is deferred, or the list would lose the height it had.
    wrap.scrollTop = 1200;
    await wait(20);
    nd.rebuild(null);
    r.scrolled = rows();

    /* A refresh that keeps your place deep in the list has to draw that far, or the
       row it means to put the cursor on does not exist. */
    wrap.scrollTop = 0;
    await wait(40);
    const deepId = S.view[60].id;
    nd.rebuild(deepId);
    r.deepIdx = S.idx;
    const deep = ol.querySelectorAll('li.row')[60];
    r.deepRowExists = !!deep;
    r.deepRowIsRight = !!deep && deep.getAttribute('data-id') === deepId;
    // And having drawn that far it has drawn the lot, rather than a ragged middle.
    r.deepDrawn = rows();

    /* Today is the tab with section headers in it, and a header belongs to the row it
       starts at. Resuming part way through has to know which headers are behind it,
       or every one of them is drawn a second time on top of the tail. */
    S.tab = nd.TABS.findIndex((x) => x.id === 'today');
    wrap.scrollTop = 0;
    nd.rebuild(null);
    const headsFirst = ol.querySelectorAll('li.sec').length;
    await wait(40);
    const heads = [].map.call(ol.querySelectorAll('li.sec'), (n) => n.textContent);
    r.sectionStarts = (S.sections || []).map((x) => x.start);
    r.sectionsFirst = headsFirst;
    r.sections = heads.length;
    r.sectionsUnique = new Set(heads).size;
    // Each header still sits immediately above the row it names.
    const kids = [].map.call(ol.children, (n) => n.className.split(' ')[0]);
    r.noTrailingHeader = kids[kids.length - 1] !== 'sec';
    r.rowsAfterTail = rows();
    return r;
  });
  await page.close();
  return out;
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
    await page.evaluate(() => window.nd.key('menu'));
    await page.waitForTimeout(250);
    seen[c.name].sheet = await page.evaluate(sheet);
    await page.close();
  }
  const pp = await pullAndPill(browser);
  const rd = await rowDrawing(browser);
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

  suite('Everything the panel offers can be reached', (t) => {
    // The theme has no other route on either device, so if it is not here it is nowhere.
    ['tv1080', 'tv720', 'pixel', 'small'].forEach((k) => {
      const p = seen[k].sheet;
      t.is(p.footVisible, true, k + ': the panel has a foot');
      t.is(p.actsVisible, true, k + ': with its actions on it');
      t.same(p.hidden, [], k + ': and none of them hidden');
      t.ok(p.labels.some((l) => /theme/i.test(l)), k + ': the theme can be changed from here');
      t.ok(p.labels.some((l) => /refresh/i.test(l)), k + ': and everything refreshed by hand');
      t.is(p.overlapsList, false, k + ': and the foot does not sit on top of the list');
    });
    // A phone has a magnifier in the header already; the remote has nothing.
    t.ok(seen.tv1080.sheet.labels.some((l) => /search/i.test(l)),
      'the remote can start a search from the panel');
    t.not(seen.pixel.sheet.labels.some((l) => /search/i.test(l)),
      'a phone is not offered it twice');
    t.is(seen.pixel.sheet.footRows, 1, 'and its buttons sit on one row');
  });

  suite('Nothing else moved to make room', (t) => {
    Object.keys(seen).forEach((k) => {
      t.is(seen[k].pageOverflow, false, k + ': nothing hangs off the side of the page');
    });
    t.ok(seen.pixel.headerH < 120, 'and the header stays out of the way of the news');
  });

  suite('New stories do not move the page under the thumb', (t) => {
    t.is(pp.held, true, 'the headline under the top edge is still the one under it');
    t.ok(pp.drift <= 2, 'to within a pixel or two (' + pp.drift + 'px)');
  });

  suite('The pill says what arrived, and can be tapped', (t) => {
    t.is(pp.pillAtRest, false, 'nothing is shown while nothing has arrived');
    t.is(pp.pillVisible, true, 'four stories landing brings it up');
    t.is(pp.pillText, '\u2191  4 new stories', 'saying how many');
    t.is(pp.pillInView, true, 'on the screen rather than off the edge of it');
    t.ok(pp.pillTall >= 30, 'big enough for a thumb (' + pp.pillTall + 'px)');
    t.is(pp.pillTappable, true, 'and nothing is sitting on top of it');
    t.is(pp.pillOverRow, false, 'while it is not sitting on the story it is announcing');
    t.is(pp.afterScrollUp.pill, false, 'scrolling up yourself puts it away too');
    t.is(pp.afterScrollUp.anchor, true, 'the top of the list being the new mark');
    t.is(pp.pillBack, true, 'and the next stories to land bring it back');
    t.is(pp.afterTap.y, 0, 'tapping it goes to the top');
    t.is(pp.afterTap.pill, false, 'and puts it away');
  });

  suite('Pull down for the news', (t) => {
    t.is(pp.indAtRest, false, 'nothing is showing until a finger asks');
    t.is(pp.shortStarted, false, 'a short drag is somebody scrolling, and refreshes nothing');
    t.is(pp.indAfterShort, false, 'and leaves nothing behind on the screen');
    t.ok(/\bon\b/.test(pp.longShownCls), 'a long one shows the indicator');
    t.ok(/ready/.test(pp.longShownCls), 'and says it will go when let go');
    t.ok(pp.longFollowed > -10, 'having followed the finger down (' + Math.round(pp.longFollowed) + 'px)');
    t.is(pp.longStarted, true, 'letting go starts a refresh');
    t.is(pp.spinning, true, 'and it spins while the sources answer');
    t.is(pp.indAfterRefresh, false, 'then puts itself away, whatever they answered');
    t.is(pp.acrossStarted, false, 'a flick across for the next tab refreshes nothing');
    t.is(pp.acrossInd, false, 'and shows nothing, however far down it drifts');
    t.is(pp.readerStarted, false, 'and a drag inside an open story is not a pull at all');
  });

  suite('The first screenful goes down first', (t) => {
    t.is(rd.view, 90, 'the list is ninety rows long');
    t.is(rd.first, rd.want, 'from the top, a screenful is drawn at once (' + rd.want + ')');
    t.ok(rd.first < rd.view, 'rather than all ninety of them');
    t.is(rd.afterTick, rd.view, 'and the rest follows a tick later');
    t.is(rd.inOrder, true, 'every row still knowing which row it is');
    t.is(rd.listTaller, true, 'and the list is taller than the screen, so it scrolls');
    t.is(rd.scrolled, rd.view, 'a reader who has scrolled gets the whole list at once');
    t.is(rd.deepIdx, 60, 'a refresh keeps your place deep in the list');
    t.is(rd.deepRowExists, true, 'and draws that far, so the row it points at exists');
    t.is(rd.deepRowIsRight, true, 'and is the story you were on');
    t.is(rd.deepDrawn, rd.view, 'having drawn the rest rather than a ragged middle');
    t.ok(rd.sections > 1, 'Today is drawn in sections (' + rd.sections + ')');
    // With real data every section starts inside the first screenful, so the split
    // lands mid-section. Resuming past a header is checked directly in logic.test.js.
    t.ok(rd.sectionStarts.length >= 2, 'section starts read off the list ('
      + rd.sectionStarts.join(',') + ')');
    t.is(rd.sections, rd.sectionsUnique, 'each of them drawn once, not again on the tail');
    t.ok(rd.sectionsFirst <= rd.sections, 'some of them arriving with the first screenful');
    t.is(rd.noTrailingHeader, true, 'and no header is left with nothing under it');
  });

  return run('Newsdesk layout');
})().catch((e) => { console.error(e && e.stack || e); process.exit(1); });
