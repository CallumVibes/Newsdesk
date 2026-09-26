/*
 * The rules the app runs on, checked without a browser.
 *
 *   node tests/logic.test.js "$(tests/unpack.sh)"
 *
 * The page is booted under jsdom with every source answered by a stub, then the
 * rules are read back through the __ndTestHook seam at the foot of index.html.
 * Nothing here touches the network, and nothing depends on today's date: dates in
 * the fixtures are built relative to now so these still pass in a year's time.
 */
'use strict';
const { boot } = require('./lib/app');
const fs = require('fs');
const path = require('path');
/* Real markup, trimmed from pages the archive actually served. */
function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}
const { suite, run } = require('./lib/check');

const HOUR = 3600e3, DAY = 24 * HOUR;

/* The smallest feed a kitchen can answer with. */
function rss(title) {
  return '<?xml version="1.0"?><rss version="2.0"><channel>'
    + '<item><title>' + title + '</title>'
    + '<link>https://example.com/' + encodeURIComponent(title) + '</link>'
    + '<pubDate>' + new Date(Date.now() - HOUR).toUTCString() + '</pubDate>'
    + '<description>A paragraph about it.</description></item></channel></rss>';
}

/* A story shaped the way the loaders make them. */
function story(o) {
  return Object.assign({
    id: (o.src || 'kg') + ':' + (o.title || ''), src: 'kg', kicker: '', title: '',
    summary: '', link: '', image: '', date: Date.now(), when: 0, html: '',
    order: 0, fetched: Date.now()
  }, o);
}

/* "2026 AUG" for a month N months back, which is how the ONS labels its rows. */
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function monthsAgo(n) {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - n);
  return d.getFullYear() + ' ' + MON[d.getMonth()];
}

boot({ settle: 500 }).then(async ({ nd, window, errors, close, calls }) => {

  suite('The page itself', (t) => {
    t.same(errors, [], 'boots with no error on the console');
    t.same(nd.TABS.map((x) => x.id),
      ['breaking', 'today', 'local', 'world', 'tech', 'coin', 'vegan', 'recipes', 'hist', 'all', 'saved'],
      'has its tabs, in the order the remote walks them');
    t.same(nd.ORDER, ['cw', 'kg', 'ht', 'yh', 'bb', 'vf', 'lm', 'hh', 'rc'], 'knows its sources');
    nd.TABS.forEach((tab) => {
      t.ok(tab.srcs.every((s) => nd.ORDER.indexOf(s) >= 0),
        tab.id + ' draws only from sources that exist');
    });
  });

  /* ---------------------------------------------------------------- Breaking */
  suite('Breaking news: local papers', (t) => {
    const bar = 0;
    const yes = (title) => nd.important(story({ src: 'ht', title }), bar);
    // The complaint that started this: a house for sale is not breaking news.
    t.is(yes('Four-bedroom home for sale in the county'), false, 'a house for sale stays out');
    t.is(yes('In pictures: the best of this year\'s carnival'), false, 'a picture gallery stays out');
    t.is(yes('Top 10 things to do this weekend'), false, 'a listicle stays out');
    t.is(yes('Win a meal for two at a new restaurant'), false, 'a competition stays out');
    t.is(yes('Man arrested after crash on the A49'), true, 'an arrest after a crash gets in');
    t.is(yes('Police close road after major incident'), true, 'a road closed by police gets in');
    t.is(yes('Firefighters tackle blaze at industrial unit'), true, 'a blaze gets in');
    t.is(yes('Flood warning issued for the river'), true, 'a flood warning gets in');
    // One urgent word is not enough when the story is plainly a soft one.
    t.is(yes('In pictures: fire station open day'), false,
      'an open day at a fire station is not a fire');
    t.is(nd.important(story({ src: 'bb', title: 'Two died in collision, police say' }), bar), true,
      'the BBC topic page is judged the same way');
  });

  suite('Breaking news: Kagi and the rest', (t) => {
    const all = [story({ src: 'kg', weight: 10 }), story({ src: 'kg', weight: 4 })];
    t.is(nd.kagiBar(all), 5, 'the bar is 45% of the day\'s most-covered story');
    t.is(nd.kagiBar([story({ src: 'kg', weight: 4 })]), 3, 'but never below three outlets');
    t.is(nd.kagiBar([story({ src: 'kg' })]), 0, 'and zero when no counts came through at all');

    t.is(nd.important(story({ src: 'kg', weight: 6 }), 5), true, 'a widely covered story gets in');
    t.is(nd.important(story({ src: 'kg', weight: 2 }), 5), false, 'a thinly covered one does not');
    t.is(nd.important(story({ src: 'kg', order: 1 }), 0), true,
      'with no counts, Kagi\'s own top three get in');
    t.is(nd.important(story({ src: 'kg', order: 7 }), 0), false, 'and the rest do not');

    t.is(nd.important(story({ src: 'cw', title: 'Fed holds rates steady' }), 5), false,
      'the wire only gets in when it says so itself');
    t.is(nd.important(story({ src: 'cw', kicker: 'BREAKING', title: 'Fed cuts rates' }), 5), true,
      'a wire flagged breaking gets in');
    t.is(nd.important(story({ src: 'vf', title: 'A new oat milk arrives' }), 5), false,
      'the vegan feed stays out unless flagged');
    t.is(nd.important(story({ src: 'lm', title: 'Fire station open day' }), 5), false,
      'and the events diary never breaks news');
  });

  suite('Breaking news: the list', (t) => {
    const now = Date.now();
    const hot = (n, mins) => story({
      src: 'ht', id: 'ht:' + n, title: 'Police arrest man number ' + n, date: now - mins * 60e3
    });
    const list = nd.breakingList([
      hot(1, 10), hot(2, 20), hot(3, 30), hot(4, 40), hot(5, 50),
      story({ src: 'ht', id: 'old', title: 'Police arrest man last week', date: now - 5 * DAY }),
      story({ src: 'ht', id: 'ahead', title: 'Police arrest man tomorrow', date: now + HOUR }),
      story({ src: 'lm', id: 'ev', title: 'Emergency services open day', date: now, when: now + DAY })
    ]);
    t.is(list.length, nd.BREAKING_PER_SOURCE, 'one paper contributes at most three stories');
    t.same(list.map((x) => x.id), ['ht:1', 'ht:2', 'ht:3'], 'and they are its newest three');
    t.not(list.some((x) => x.id === 'old'), 'a story from last week has stopped breaking');
    t.not(list.some((x) => x.id === 'ahead'), 'a story dated ahead of us is not news that just broke');
    t.not(list.some((x) => x.id === 'ev'), 'a diary entry is never breaking news');

    const wires = nd.breakingList([
      story({ src: 'cw', id: 'w1', kicker: 'BREAKING', title: 'Fed cuts rates', date: now - 10 * 60e3 }),
      story({ src: 'cw', id: 'w0', kicker: 'BREAKING', title: 'Fed held rates', date: now - 3 * HOUR })
    ]);
    t.same(wires.map((x) => x.id), ['w1'], 'only the latest wire of the hour counts');
  });

  /* ---------------------------------------------------- Where the wire lands */
  suite('Wire stories reach the right tab', (t) => {
    const at = (title, summary) => nd.topicOf(story({ src: 'cw', title, summary: summary || '' }));
    t.is(at('Bitcoin breaks $100,000 for the first time'), 'coin', 'bitcoin is bitcoin');
    t.is(at('MicroStrategy buys another 5,000 BTC'), 'coin', 'so is BTC');
    t.is(at('Hashrate hits a record after the halving'), 'coin', 'so is the network itself');
    // The narrowing the user asked for: money in general is not bitcoin.
    t.is(at('Gold hits a record high as the dollar slips'), 'world', 'gold is not bitcoin');
    t.is(at('Oil falls after OPEC raises output'), 'world', 'oil is not bitcoin');
    t.is(at('Treasury yields climb after a weak auction'), 'world', 'bonds are not bitcoin');
    t.is(at('Regional bank shares fall on loan losses'), 'world', 'banks are not bitcoin');
    t.is(at('Fed holds rates steady for a third meeting'), 'world', 'the Fed is not bitcoin');
    t.is(at('Nvidia unveils its next generation of AI chips'), 'tech', 'chips are tech');
    // The one that sent a council story to the Tech tab.
    t.is(at('Council awarded a surveillance contract', 'CCTV across the town centre'), 'world',
      'a story that happens to involve a computer is not a tech story');
    t.is(nd.topicOf(story({ src: 'cw', digest: true, title: 'Citadel Wire digest' })), 'world',
      'a wire we could not split is general news, not a bitcoin story');
    t.is(nd.topicOf(story({ src: 'kg', title: 'Bitcoin breaks $100,000' })), '',
      'and nothing but the wire is placed this way');
  });

  suite('Tabs take what belongs to them', (t) => {
    const tab = (id) => nd.TABS[nd.TABS.findIndex((x) => x.id === id)];
    t.is(nd.inTab(story({ src: 'kg', kicker: 'Tech' }), tab('tech')), true, 'Kagi tech goes to Tech');
    t.is(nd.inTab(story({ src: 'kg', kicker: 'UK' }), tab('tech')), false, 'Kagi UK does not');
    t.is(nd.inTab(story({ src: 'kg', kicker: 'UK' }), tab('world')), true, 'it goes to UK & World');
    t.is(nd.inTab(story({ src: 'cw', title: 'Bitcoin tops $100,000' }), tab('coin')), true,
      'a bitcoin wire goes to Bitcoin');
    t.is(nd.inTab(story({ src: 'cw', title: 'Oil falls after OPEC raises output' }), tab('coin')), false,
      'an oil wire does not');
    t.is(nd.inTab(story({ src: 'cw', title: 'Oil falls after OPEC raises output' }), tab('world')), true,
      'it goes to UK & World instead, where it reads perfectly well');
    t.is(nd.inTab(story({ src: 'lm' }), tab('local')), true, 'events sit under Local');
    t.is(nd.inTab(story({ src: 'lm' }), tab('breaking')), false, 'and never under Breaking');
    t.is(nd.inTab(story({ src: 'vf' }), tab('vegan')), true, 'the vegan feed has its own tab');
  });

  /* ------------------------------------------------------------ Event dates */
  suite('Reading an event date', (t) => {
    const y = new Date().getFullYear();
    const on = (s) => new Date(nd.parseWhen(s));
    t.is(nd.parseWhen('Christmas Fayre, 5 December ' + y), new Date(y, 11, 5).getTime(),
      'day, month and year');
    t.is(nd.parseWhen('Market Day on December 5, ' + y), new Date(y, 11, 5).getTime(),
      'and the American way round');
    t.is(nd.parseWhen('Sat 12th June ' + y + ' at 4:30pm'), new Date(y, 5, 12, 16, 30).getTime(),
      'with a time in the afternoon');
    t.is(nd.parseWhen('Fayre on 1 Jan ' + y + ' at 9am'), new Date(y, 0, 1, 9, 0).getTime(),
      'and one in the morning');
    t.is(nd.parseWhen('31 February ' + y), 0, 'a date that does not exist reads as none');
    t.is(nd.parseWhen('Come along to the town hall'), 0, 'and so does no date at all');
    t.is(nd.parseWhen(''), 0, 'and empty text');
    // With no year, the next time that date comes round.
    const jan = on('Wassail on 17 January');
    t.ok(jan.getTime() > Date.now() - 8 * DAY, 'with no year given, it looks forward');
    t.is(jan.getMonth(), 0, 'to the right month');
    t.is(jan.getDate(), 17, 'and the right day');
  });

  suite('Saying when an event is', (t) => {
    const noon = (offsetDays) => {
      const d = new Date();
      d.setDate(d.getDate() + offsetDays);
      d.setHours(16, 30, 0, 0);
      return d.getTime();
    };
    t.is(nd.until(noon(0)), 'Today, 16:30', 'today says today');
    t.is(nd.until(noon(1)), 'Tomorrow, 16:30', 'tomorrow says tomorrow');
    t.ok(/^[A-Z][a-z]+day, 16:30$/.test(nd.until(noon(3))), 'this week is named by its day');
    t.ok(/^[A-Z][a-z]{2} \d{1,2} [A-Z][a-z]{2}, 16:30$/.test(nd.until(noon(20))),
      'further out gets a date');
    t.is(nd.until(0), '', 'an entry with no date we could read says nothing');
    // News reads backwards, a diary forwards. That is the whole point of the flag.
    t.is(nd.timeLabel(story({ src: 'lm', when: noon(1), date: Date.now() })), 'Tomorrow, 16:30',
      'a diary entry shows when it is on');
    t.is(nd.timeLabel(story({ src: 'ht', date: Date.now() - 20 * 60e3 })), '20m ago',
      'a news story shows how long ago it ran');
  });

  suite('The events section', (t) => {
    const now = Date.now();
    const ev = (id, when) => story({ src: 'lm', id, when, date: now - DAY });
    const soon = nd.upcoming([
      ev('far', now + 300 * DAY), ev('next', now + 2 * DAY), ev('soon', now + DAY),
      ev('gone', now - 30 * DAY), story({ src: 'lm', id: 'undated', when: 0, date: now }),
      story({ src: 'ht', id: 'news', date: now })
    ]);
    t.same(soon.map((x) => x.id), ['soon', 'next', 'undated'],
      'the next thing on comes first, what is over is dropped, and news is left alone');
    t.ok(nd.upcoming([ev('far', now + 300 * DAY)]).length === 1,
      'but if nothing is close, the soonest is shown anyway rather than an empty section');
  });

  /* ------------------------------------------------------------- UK debt */
  suite('The UK debt figure', (t) => {
    const expect = nd.debtExpected();
    t.ok(expect > 2.9e12 && expect < 5e12, 'the compiled-in reading extrapolates to a sane total');
    t.is(nd.plausibleDebt(expect), true, 'which is, by definition, plausible');
    t.is(nd.plausibleDebt(95.064e12), false, 'a figure out by a factor of thirty is not');
    t.is(nd.plausibleDebt(95), false, 'nor is a percentage of GDP');
    t.is(nd.plausibleDebt(2.94e9), false, 'nor billions read as pounds');
    t.is(nd.plausibleDebt(0), false, 'nor nothing at all');
    t.is(nd.monthEnd('2026 AUG'), Date.UTC(2026, 8, 0), 'a month reads as the day it ends');
    t.is(nd.monthEnd('not a month'), 0, 'and anything else as none');
    t.is(nd.trillions(2.94e12), '£2.940tn', 'and it is shown in trillions');
  });

  suite('Reading the ONS series', (t) => {
    const expect = nd.debtExpected();
    // The real series is published in millions, newest last, one row a month.
    const months = [];
    for (let i = 14; i >= 1; i--) {
      months.push({ date: monthsAgo(i), value: String(Math.round((expect - i * 11.5e9) / 1e6)) });
    }
    const ons = nd.parseOnsDebt(JSON.stringify({ months }));
    t.ok(ons, 'a series in millions is read');
    t.near(ons.gbp, expect - 11.5e9, 1e9, 'and scaled up to pounds');
    t.is(ons.measured, true, 'the rate is measured over the year, not assumed');
    t.near(ons.rate, 138e9 / 365.25 / 86400, 400, 'and works out at roughly what we borrow');
    t.is(ons.from, 'the ONS', 'and it says where it came from');

    // HF6X is the same debt as a percentage of GDP. It must not be taken for pounds.
    const pct = months.map((m) => ({ date: m.date, value: '95.1' }));
    t.is(nd.parseOnsDebt(JSON.stringify({ months: pct })), null,
      'a percentage of GDP lands nowhere a debt could be, so it is turned away');

    // A discontinued series still reads plausibly, which is the trap.
    const stale = months.map((m, i) => ({ date: (new Date().getFullYear() - 4) + ' ' + MON[i % 12], value: m.value }));
    t.is(nd.parseOnsDebt(JSON.stringify({ months: stale })), null,
      'a series that stopped publishing years ago is no use');
    t.is(nd.parseOnsDebt('not json at all'), null, 'and neither is a page that is not the data');
    t.is(nd.parseOnsDebt(JSON.stringify({ months: [] })), null, 'nor an empty one');
  });

  suite('Reading the counter site', (t) => {
    const expect = Math.round(nd.debtExpected());
    const withCommas = String(expect).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const page = '<html><body><div id="c">£' + withCommas + '</div>' +
                 '<p>rising by 4,435 per second</p></body></html>';
    const d = nd.parseDebt(page);
    t.ok(d, 'the total is found on the page');
    t.near(d.gbp, expect, 1, 'and read exactly');
    t.is(d.rate, 4435, 'along with the rate it counts at');
    t.is(nd.parseDebt('<p>£95,064,000,000,000</p>'), null,
      'a number thirty times too big is refused rather than shown');
    t.is(nd.parseDebt('<p>nothing here</p>'), null, 'and a page with no total reads as none');
  });

  suite('The debt counter', (t) => {
    const S = nd.S;
    S.mkt = { debt: { gbp: 2.94e12, rate: 4435, at: Date.now() - 1000 } };
    t.near(nd.debtNow(), 2.94e12 + 4435, 100, 'counts up from the reading');
    // A clock behind the reading must not wind the total backwards.
    S.mkt = { debt: { gbp: 2.94e12, rate: 4435, at: Date.now() + DAY } };
    t.is(nd.debtNow(), 2.94e12, 'and never counts down, whatever the clock says');
    // A total cached by an older build may be one this build would never accept.
    S.mkt = { debt: { gbp: 95.064e12, rate: 0, at: Date.now() } };
    nd.sanitiseDebt();
    t.is(S.mkt.debt, null, 'a cached figure that is out by miles is thrown away on load');
    S.mkt = { debt: { gbp: nd.debtExpected(), rate: 4435, at: Date.now() } };
    nd.sanitiseDebt();
    t.ok(S.mkt.debt, 'a sound one is kept');
    S.mkt = {};
  });

  /* --------------------------------------------------------------- Prices */
  suite('Reading a price', (t) => {
    const row = nd.stooqRow('Date,Open,High,Low,Close,Volume\n2026-09-24,2600,2700,2590,2653,0\n');
    t.is(row.usd, 2653, 'the close is the price');
    t.near(row.chg, (2653 - 2600) / 2600 * 100, 0.001, 'and the day\'s move comes off the open');
    t.is(nd.stooqRow('Date,Open,Close\n2026-09-24,0,2653\n').chg, null,
      'with no open, no move is claimed rather than a wrong one');
    let threw = false;
    try { nd.stooqRow('Date,Open,Close\n'); } catch (e) { threw = true; }
    t.is(threw, true, 'an empty answer is an error, so the next provider is tried');
    t.is(nd.money(2653.4), '£2,653', 'a big number is rounded and given commas');
    t.is(nd.money(63.42), '£63.42', 'a small one keeps its pence');
  });

  /* ------------------------------------------------------------ Briefings */
  suite('Which briefing is due', (t) => {
    const at = (h, m) => { const d = new Date(); d.setHours(h, m || 0, 0, 0); return d.getTime(); };
    t.same(nd.BRIEF_SLOTS.map((s) => nd.slotMins(s)), [5 * 60, 12 * 60, 17 * 60, 21 * 60 + 30],
      'four editions a day, at the times the background job also uses');
    t.is(nd.briefSlot(at(7)).slot.id, 'morning', 'the morning edition covers the morning');
    t.is(nd.briefSlot(at(13)).slot.id, 'afternoon', 'the afternoon one the afternoon');
    t.is(nd.briefSlot(at(19)).slot.id, 'evening', 'and the evening one the evening');
    t.is(nd.briefSlot(at(23)).slot.id, 'night', 'and the night one the end of it');
    t.is(nd.briefSlot(at(2)).slot.id, 'night', 'the small hours still belong to last night\'s last');
    t.not(nd.briefSlot(at(2)).key === nd.briefSlot(at(23)).key,
      'but under the previous day, so 2am does not count as tonight\'s');
    t.is(nd.briefSlot(at(7)).key, nd.briefSlot(at(11)).key,
      'and one edition is written once, however often the app refreshes');

    /* The half hour is the whole reason the times are kept in minutes. Nine is still
       the evening; half past nine is the last edition; a minute either side of the
       turn lands on the right one. */
    t.is(nd.briefSlot(at(21, 0)).slot.id, 'evening', 'nine o\'clock is still the evening');
    t.is(nd.briefSlot(at(21, 29)).slot.id, 'evening', 'and so is a minute before half past');
    t.is(nd.briefSlot(at(21, 30)).slot.id, 'night', 'half past nine is the night edition');
    t.is(nd.briefSlot(at(21, 31)).slot.id, 'night', 'and a minute after it');
    t.is(nd.briefSlot(at(4, 59)).slot.id, 'night', 'a minute before the morning is still last night');
    t.is(nd.briefSlot(at(5, 0)).slot.id, 'morning', 'and five is the morning');

    // Every edition has to be reachable, or one of them never gets written at all.
    const ids = nd.BRIEF_SLOTS.map((s) => s.id);
    const reached = {};
    for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 5) reached[nd.briefSlot(at(h, m)).slot.id] = 1;
    t.same(Object.keys(reached).sort(), ids.slice().sort(), 'every edition has a part of the day');
    t.ok(ids.every((id) => nd.BRIEF_SLOTS.filter((s) => s.id === id).length === 1),
      'and no two share a name');

    const next = nd.nextSlotName();
    t.ok(ids.some((id) => next.indexOf(id) >= 0), 'the app can say which is next');
    t.not(next === nd.briefSlot(Date.now()).slot.name.toLowerCase(),
      'and it is the one after this, not this one');

    // Two paid calls per edition, as it was when there were three of them.
    t.is(nd.BRIEF_MAX_PER_DAY, nd.BRIEF_SLOTS.length * 2,
      'the day\'s allowance of paid calls grew with the editions rather than being shared out');
  });

  suite('Reading PPQ\'s reply', (t) => {
    const clean = nd.parseBrief('{"headline":"A quiet day","paragraphs":["One.","Two."]}');
    t.same(clean.paragraphs, ['One.', 'Two.'], 'plain JSON comes through');
    t.is(clean.headline, 'A quiet day', 'headline and all');
    t.same(nd.parseBrief('```json\n{"headline":"H","paragraphs":["One."]}\n```').paragraphs, ['One.'],
      'and so does JSON wrapped in a code fence');
    // The bug the user saw: a reply cut off mid-sentence showed as raw JSON.
    const cut = nd.parseBrief('{"headline":"Markets wobble","paragraphs":["Finished one.","Cut off half way thr');
    t.ok(cut, 'a reply cut off part way is still read');
    t.same(cut.paragraphs, ['Finished one.'], 'keeping what finished and leaving what did not');
    t.is(cut.headline, 'Markets wobble', 'with its headline intact');
    t.same(nd.salvageBrief('{"paragraphs":["One.","Two…"]}').paragraphs, ['One.', 'Two…'],
      'an ellipsis counts as a finished sentence');
    t.same(nd.parseBrief('First para.\n\nSecond para.').paragraphs, ['First para.', 'Second para.'],
      'a reply that is prose rather than JSON is taken as prose');
    t.is(nd.parseBrief(''), null, 'an empty reply is nothing');
    t.is(nd.parseBrief('{'), null, 'and so is a reply with nothing salvageable in it');
  });

  suite('What the briefing is told', (t) => {
    const S = nd.S;
    S.mkt = {
      btc: { gbp: 74210.5, chg: 1.23 }, gold: { gbp: 2110.4, chg: -0.4 },
      oil: { gbp: 63.42, chg: 0.0 }, debt: { gbp: 2.94e12, rate: 0, at: Date.now() }
    };
    const p = nd.briefPrices();
    t.ok(/Bitcoin £74,211, up 1\.2% today/.test(p), 'bitcoin, in pounds, with its move');
    t.ok(/gold £2,110 an ounce, down 0\.4% today/.test(p), 'gold by the ounce');
    t.ok(/oil £63\.42 a barrel/.test(p), 'oil by the barrel, keeping its pence');
    t.ok(/UK national debt £2\.940tn/.test(p), 'and the debt in trillions');
    t.not(/\$/.test(p), 'and never a dollar, which is the whole reason this block exists');

    const today = {
      items: [story({ src: 'ht', title: 'Road closed after crash', summary: 'The A49 is shut.' }),
              story({ src: 'lm', title: 'Christmas Fayre', when: Date.now() + DAY, summary: 'In the square.' })],
      sections: [{ start: 0, title: 'Herefordshire', note: 'Last 24 hours' },
                 { start: 1, title: 'On in town', note: 'Leominster' }]
    };
    const input = nd.briefInput(today, nd.BRIEF_SLOTS[0]);
    t.ok(/HEREFORDSHIRE/.test(input), 'the sections are named');
    t.ok(/morning edition/.test(input), 'the edition says which one it is');
    t.ok(/PRICES \(in pounds\)/.test(input), 'the prices are handed over');
    t.ok(/Christmas Fayre \(Tomorrow/.test(input),
      'and an event carries when it is on, so the briefing does not report it as news');
    S.mkt = {};
    t.is(nd.briefPrices(), '', 'with no prices read, nothing is claimed');
  });

  /* ------------------------------------------------------------- Haptics */
  suite('A television has nothing to buzz', (t) => {
    calls.buzzed.length = 0;
    nd.buzz('tap');
    nd.buzz('tick');
    t.same(calls.buzzed, [], 'so it is never asked to, whatever is pressed');
    calls.buzzed.length = 0;
  });

  /* ------------------------------------------------------------- The theme */
  suite('One accent, not nine', (t) => {
    // A reference rather than a colour, because there are two of them: orange on
    // black, and a darker orange on white. Handed to a style property it resolves
    // to whichever is in force, so nothing that draws has to ask which.
    t.is(nd.ACCENT, 'var(--accent)', 'the accent is a reference, not a fixed colour');
    // Every source and every tab used to carry a colour of its own. The theme asked
    // for is white and orange, so there is one accent and everything takes it.
    Object.keys(nd.SRC).forEach((k) => {
      t.is(nd.SRC[k].color, nd.ACCENT, nd.SRC[k].name + ' takes the accent');
    });
    nd.TABS.forEach((tab) => t.is(tab.color, nd.ACCENT, 'the ' + tab.name + ' tab takes the accent'));

    const style = window.getComputedStyle(window.document.documentElement);
    const v = (n) => style.getPropertyValue(n).trim().toUpperCase();
    t.is(v('--text'), '#FFFFFF', 'the text is white in the dark');
    t.is(v('--accent'), '#F7931A', 'the accent is on the palette');
    t.is(v('--c'), '#F7931A', 'and is what anything uncoloured falls back to');
    // The greys were teal-tinted, which competed with an orange. They are neutral now.
    ['--bg', '--bg2', '--bg3', '--line', '--soft', '--muted', '--dim'].forEach((n) => {
      const hex = v(n);
      const r = parseInt(hex.slice(1, 3), 16);
      const g = parseInt(hex.slice(3, 5), 16);
      const b = parseInt(hex.slice(5, 7), 16);
      t.ok(Math.max(r, g, b) - Math.min(r, g, b) <= 6,
        n + ' is a neutral grey rather than a tinted one (' + hex + ')');
    });
  });

  suite('Light and dark', (t) => {
    const doc = window.document, root = doc.documentElement;
    const lum = (hex) => {
      const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    const ratio = (a, b) => {
      const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
      return (hi + 0.05) / (lo + 0.05);
    };
    const v = (n) => window.getComputedStyle(root).getPropertyValue(n).trim().toUpperCase();

    calls.themed.length = 0;
    nd.setTheme('dark');
    t.is(nd.theme(), 'dark', 'it starts dark');
    t.not(/\blight\b/.test(root.className), 'with no light class on the page');
    t.ok(root.className.indexOf(nd.S.mode === 'x' ? '' : 'tv') >= 0,
      'and whatever the device put there is left alone');

    nd.setTheme('light');
    t.is(nd.theme(), 'light', 'it turns over');
    t.ok(/\blight\b/.test(root.className), 'by one class on the page');
    t.ok(root.className.indexOf('tv') >= 0, 'still leaving the device class alone');
    t.ok(lum(v('--bg')) > 0.8, 'the background goes light');
    t.ok(lum(v('--text')) < 0.1, 'and the text goes dark');
    // #F7931A on white is too faint to read, so the light accent is a darker orange.
    t.ok(ratio(v('--accent'), v('--bg')) >= 4.5,
      'the light accent can be read on the light background (' + v('--accent') + ')');
    t.ok(ratio(v('--up'), v('--bg')) >= 4.5, 'and so can a rise');
    t.ok(ratio(v('--dn'), v('--bg')) >= 4.5, 'and a fall');

    nd.flipTheme();
    t.is(nd.theme(), 'dark', 'flipping turns it back');
    t.ok(ratio(v('--accent'), v('--bg')) >= 4.5, 'and the dark accent reads on black too');
    t.ok(ratio(v('--text'), v('--bg')) >= 4.5, 'as does the text');

    // Kotlin paints the window before this page runs, so it has to be told.
    t.same(calls.themed, ['dark', 'light', 'dark'], 'Kotlin is told each time it changes');
    let kept = '';
    try { kept = JSON.parse(window.localStorage.getItem('nd.theme.v1')) || ''; } catch (e) {
      kept = window.localStorage.getItem('nd.theme.v1');
    }
    t.is(kept, 'dark', 'and it is remembered for next time');

    // The panel is where you change it, on either device. Found by what it says
    // rather than where it sits, since the foot has gained a button since.
    const flip = nd.SHEET_ACTS.filter((a) => typeof a.label === 'function'
      && /theme/i.test(a.label()))[0];
    t.ok(flip, 'the theme is one of the panel\'s actions');
    t.is(typeof flip.label, 'function', 'the label changes with the state');
    t.is(flip.label(), 'Light theme', 'and offers where it will take you, not where you are');
    nd.setTheme('light');
    t.is(flip.label(), 'Dark theme', 'both ways round');
    nd.setTheme('dark');
    calls.themed.length = 0;
  });

  /* ----------------------------------------------------- Briefing history */
  suite('Keeping the day\'s briefings', (t) => {
    const S = nd.S, now = Date.now();
    const ed = (slot, ago, head) => ({
      headline: head, paragraphs: ['A paragraph.'], at: now - ago,
      slotName: slot, slotKey: 'k:' + slot + ':' + Math.floor((now - ago) / DAY)
    });
    S.briefs = [];
    nd.rememberBrief(ed('Morning briefing', 6 * HOUR, 'First'));
    nd.rememberBrief(ed('Afternoon briefing', 2 * HOUR, 'Second'));
    t.is(S.briefs.length, 2, 'each edition is kept');
    t.same(S.briefs.map((b) => b.headline), ['Second', 'First'], 'newest first');

    // The Refresh button rewrites the edition that is current. That is the same
    // edition, not a fourth one.
    const again = ed('Afternoon briefing', 2 * HOUR, 'Second, rewritten');
    nd.rememberBrief(again);
    t.is(S.briefs.length, 2, 'rewriting an edition replaces it rather than adding one');
    t.is(S.briefs[0].headline, 'Second, rewritten', 'and the rewrite is the one kept');

    nd.rememberBrief({ headline: 'Empty', paragraphs: [], at: now, slotKey: 'x' });
    t.is(S.briefs.length, 2, 'a briefing with nothing in it is not kept at all');

    // Four days, no more: the tab is for catching up, not an archive.
    S.briefs = [];
    for (let i = 0; i < 20; i++) nd.rememberBrief(ed('E' + i, i * HOUR, 'H' + i));
    t.is(S.briefs.length, nd.BRIEF_KEEP, 'no more than the cap are held');
    t.is(S.briefs[0].headline, 'H0', 'and they are the newest');
    t.same(nd.trimBriefs([{ at: now - 9 * DAY, paragraphs: ['x'] }]), [],
      'anything older than a few days is dropped');
    t.same(nd.trimBriefs(null), [], 'and nothing at all is not an error');
  });

  suite('Reading an earlier briefing', (t) => {
    const S = nd.S;
    // Wall-clock hours-ago would land on today or yesterday depending on when the
    // suite ran, so the day is named rather than counted backwards from now.
    const at = (daysAgo, hour) => {
      const d = new Date();
      d.setDate(d.getDate() - daysAgo);
      d.setHours(hour, 0, 0, 0);
      return d.getTime();
    };
    const ed = (slot, when, head) => ({
      headline: head, paragraphs: ['One.', 'Two.'], at: when,
      slotName: slot, slotKey: slot + when, model: 'claude-sonnet-5'
    });
    // Two of today's, written at hours that have certainly passed.
    S.briefs = [ed('Afternoon briefing', at(0, 12), 'This afternoon'),
                ed('Morning briefing', at(0, 5), 'This morning')];
    S.brief = S.briefs[0];
    const items = nd.briefItems();
    t.is(items.length, 2, 'both of today\'s editions can be opened');
    t.is(items[0].title, 'This afternoon', 'newest first');
    t.is(items[0].kicker, 'Afternoon briefing', 'each says which edition it is');
    t.is(items[1].kicker, 'Morning briefing', 'so two in a row do not read as the same thing twice');
    t.not(items[0].id === items[1].id, 'and they are separate stories, not one');
    t.is(items[0].src, 'ai', 'filed under the briefing source');

    // Today's section should carry both, under one heading.
    const today = nd.buildToday(nd.getAll());
    t.is(today.sections[0].title, 'Briefings', 'Today leads with them');
    t.is(today.items[0].title, 'This afternoon', 'the latest at the top');
    t.is(today.items[1].title, 'This morning', 'this morning still there at teatime');

    // Before the first of a new day is written there is nothing from today, and then
    // the last day's stay - all of them. At seven in the morning the evening briefing
    // is still the freshest news anyone has.
    S.briefs = [ed('Evening briefing', at(1, 17), 'Last night'),
                ed('Afternoon briefing', at(1, 12), 'Yesterday afternoon'),
                ed('Evening briefing', at(2, 17), 'The night before')];
    S.brief = S.briefs[0];
    const over = nd.briefItems();
    t.is(over.length, 2, 'the whole of the last day that has any, not just its newest');
    t.same(over.map((x) => x.title), ['Last night', 'Yesterday afternoon'],
      'and the day before that is left out of it');

    // But not for ever: a briefing old enough to mislead is worse than none.
    S.briefs = [ed('Evening briefing', Date.now() - (nd.BRIEF_SHOW_H + 2) * HOUR, 'Days ago')];
    S.brief = S.briefs[0];
    t.is(nd.briefItems().length, 0, 'past that, Today stops offering it at all');
    S.briefs = []; S.brief = null;
  });

  suite('Two pages write briefings, and neither wins', (t) => {
    const S = nd.S, now = Date.now(), store = window.localStorage;
    const ed = (slot, ago, head) => ({
      headline: head, paragraphs: ['One.', 'Two.'], at: now - ago,
      slotName: slot + ' briefing', slotKey: 'k:' + slot
    });
    // The background job runs in a WebView of its own, with its own memory. It reads
    // the storage, writes to it, and this page never hears about it.
    S.briefs = [ed('morning', 12 * HOUR, 'Morning')];
    store.setItem(nd.BRIEFS_KEY, JSON.stringify([
      ed('afternoon', 6 * HOUR, 'Afternoon written by the job'),
      ed('morning', 12 * HOUR, 'Morning')
    ]));
    // Now this page writes the evening from what it believed at breakfast.
    nd.rememberBrief(ed('evening', 1 * HOUR, 'Evening'));
    const heads = S.briefs.map((b) => b.headline);
    t.is(S.briefs.length, 3, 'all three editions survive');
    t.same(heads, ['Evening', 'Afternoon written by the job', 'Morning'],
      'the one this page never saw is still there, and they are newest first');
    const back = JSON.parse(store.getItem(nd.BRIEFS_KEY));
    t.is(back.length, 3, 'and that is what was written back');

    // A rewrite of an edition beats the copy already held, whoever wrote it.
    nd.rememberBrief(Object.assign(ed('afternoon', 5 * HOUR, 'Afternoon, rewritten'), {}));
    t.is(S.briefs.length, 3, 'a rewrite is still the same edition');
    t.ok(S.briefs.some((b) => b.headline === 'Afternoon, rewritten'), 'and it is the one kept');
    t.not(S.briefs.some((b) => b.headline === 'Afternoon written by the job'),
      'not both of them');

    // The reader's copy of a briefing is rebuilt on demand; storing it doubles
    // everything held for nothing, and a quota reached quietly loses a briefing.
    nd.briefItems();
    t.ok(S.briefs.some((b) => b._item), 'the reader\'s version is cached in memory');
    nd.rememberBrief(ed('evening', 1 * HOUR, 'Evening'));
    const written = JSON.parse(store.getItem(nd.BRIEFS_KEY));
    t.not(written.some((b) => b._item), 'but never written to storage');
    t.ok(written.every((b) => b.paragraphs && b.headline), 'while everything needed is');

    store.removeItem(nd.BRIEFS_KEY);
    S.briefs = []; S.brief = null;
  });

  /* --------------------------------------------------- The home screen widget */
  suite('What the widget is handed', (t) => {
    const S = nd.S;
    calls.widget.length = 0;
    const was = S.brief;

    S.brief = { error: 'PPQ said no', count: 1 };
    nd.widgetBrief();
    t.is(calls.widget.length, 0, 'a failed briefing is not sent to the home screen');
    S.brief = { headline: 'H', paragraphs: [], at: Date.now() };
    nd.widgetBrief();
    t.is(calls.widget.length, 0, 'and neither is an empty one');

    const at = Date.now();
    S.brief = {
      headline: 'A quiet start, with rain on the way',
      paragraphs: ['First paragraph.', 'Second paragraph.', 'Third paragraph.'],
      at: at, slotName: 'Morning briefing', slotKey: 'x'
    };
    // saveBrief is the one place a briefing is written, in the app and in the job
    // alike, so the widget is fed from there rather than from either caller.
    nd.saveBrief();
    t.is(calls.widget.length, 1, 'saving a briefing hands it to the widget');
    const w = calls.widget[0];
    t.is(w.edition, 'Morning briefing', 'the edition comes through as its own line');
    t.is(w.headline, 'A quiet start, with rain on the way', 'and the headline');
    t.same(w.paragraphs, ['First paragraph.', 'Second paragraph.', 'Third paragraph.'],
      'and every paragraph, since the widget scrolls them');
    t.is(w.at, at, 'with the time it was written, for the header');
    t.same(Object.keys(w).sort(), ['at', 'edition', 'headline', 'paragraphs'],
      'and nothing else: the widget is sent what it draws, not the whole state');

    S.brief = { headline: 'No edition', paragraphs: ['One.'], at: at };
    nd.widgetBrief();
    t.is(calls.widget[calls.widget.length - 1].edition, 'Briefing',
      'a briefing from before the editions existed still has something to call itself');

    S.brief = was;
    calls.widget.length = 0;
  });

  /* ------------------------------------------------------ One line of prices */
  suite('Fitting the band on one line', (t) => {
    const S = nd.S, doc = window.document, now = Date.now();
    const box = doc.getElementById('mkt');
    S.mkt = { at: now,
      wx: { t: 14, icon: 'clear', label: 'Clear', c: '#F7931A', day: true, at: now, from: 'x' },
      btc: { gbp: 74211, chg: 1.23, at: now, from: 'x' },
      gold: { gbp: 2110, usd: 2653, chg: -0.42, at: now, from: 'x' },
      oil: { gbp: 63.42, usd: 79, chg: 0.3, at: now, from: 'x' },
      debt: { gbp: 2.94e12, rate: 4435, at: now }, rate: 0.79 };
    nd.renderMkt();
    t.is(box.children.length, 5, 'the weather and four figures');
    // A move is two pieces so one can go without the other.
    const b = box.querySelector('.mk b');
    t.ok(b.querySelector('.ar'), 'a move carries its arrow separately');
    t.ok(b.querySelector('.pc'), 'from its percentage');
    t.ok(/[\u25B2\u25BC]/.test(b.querySelector('.ar').textContent), 'the arrow is an arrow');
    t.is(b.querySelector('.pc').textContent, '1.2%', 'and the percentage a percentage');

    // This boot is a television, which has room for all of it at full size.
    t.is(box.className, '', 'a TV shows everything, full size');
    t.is(box.style.fontSize, '', 'and is never shrunk');
    t.is(nd.tickerFits(box), true, 'because it fits');

    // The ladder gives up size first, then the percentages, then the line itself.
    t.ok(nd.MKT_COMFY_REM > nd.MKT_MIN_REM,
      'there is room to shrink before anything is dropped');
    t.ok(nd.MKT_MIN_REM >= 0.5, 'and a floor below which it stops rather than becoming unreadable');
    S.mkt = {};
  });

  /* --------------------------------------------------------------- Weather */
  suite('Reading the weather', (t) => {
    const at = (c) => { const w = nd.wmoIcon(c); return w && w.icon; };
    t.is(at(0), 'clear', 'a clear sky');
    t.is(at(1), 'part', 'mainly clear is partly cloudy, near enough to draw');
    t.is(at(2), 'part', 'and so is partly cloudy');
    t.is(at(3), 'cloud', 'overcast is a cloud');
    t.is(at(48), 'fog', 'fog');
    t.is(at(53), 'drizzle', 'drizzle');
    t.is(at(65), 'rain', 'heavy rain');
    t.is(at(66), 'rain', 'and freezing rain is still rain to look at');
    t.is(at(75), 'snow', 'snow');
    t.is(at(82), 'showers', 'violent showers are showers');
    t.is(at(86), 'snow', 'but snow showers are snow');
    t.is(at(99), 'thunder', 'thunderstorm with hail');
    t.is(nd.wmoIcon(4), null, 'a code we do not know draws nothing rather than a guess');
    t.is(nd.wmoIcon(NaN), null, 'and neither does no code at all');
    // Every icon the table names has to be one we can actually draw.
    nd.WMO.forEach((w) => t.ok(nd.WX_PATHS[w.icon], w.label + ' has an icon drawn for it'));
    t.ok(nd.WX_PATHS.moon && nd.WX_PATHS.moonpart, 'and there is a night version of the two that need one');
  });

  suite('met.no names its symbols, and the names overlap', (t) => {
    const at = (sym) => { const w = nd.metnoIcon(sym); return w && w.icon; };
    // Each of these contains an earlier rule's word, which is why the order matters.
    t.is(at('lightrainshowersandthunder_day'), 'thunder', 'thunder wins over rain and showers');
    t.is(at('rainshowers_day'), 'showers', 'showers win over rain');
    t.is(at('partlycloudy_night'), 'part', 'partly cloudy is not cloudy');
    t.is(at('lightsleetshowers_day'), 'snow', 'sleet is drawn as snow');
    t.is(at('cloudy'), 'cloud', 'cloudy on its own is a cloud');
    t.is(at('fair_day'), 'part', 'fair is a sun behind a cloud');
    t.is(at('clearsky_day'), 'clear', 'and a clear sky is a clear sky');
    t.is(at('fog'), 'fog', 'fog');
    t.is(at(''), null, 'a symbol we cannot place draws nothing');
    t.is(at('something_new_they_added'), null, 'and so does one they invent after this was written');
  });

  suite('The two providers agree on what they hand back', (t) => {
    const om = nd.parseOpenMeteo(JSON.stringify({
      current: { temperature_2m: 13.6, weather_code: 3, is_day: 1 }
    }));
    t.ok(om, 'Open-Meteo is read');
    t.is(om.t, 13.6, 'with the temperature');
    t.is(om.icon, 'cloud', 'and the condition');
    t.is(om.day, true, 'and whether it is daylight');
    t.is(nd.parseOpenMeteo(JSON.stringify({
      current: { temperature_2m: 5, weather_code: 0, is_day: 0 } })).day, false,
      'which it says plainly when it is not');
    t.is(nd.parseOpenMeteo('{"current":{"temperature_2m":"x","weather_code":0}}'), null,
      'a reading with no temperature is no use');
    t.is(nd.parseOpenMeteo('{}'), null, 'and neither is an answer with nothing in it');
    t.is(nd.parseOpenMeteo('<html>error</html>'), null, 'or one that is not JSON at all');

    const mn = nd.parseMetNo(JSON.stringify({ properties: { timeseries: [{ data: {
      instant: { details: { air_temperature: 8.2 } },
      next_1_hours: { summary: { symbol_code: 'lightrain_night' } }
    } }] } }));
    t.ok(mn, 'met.no is read the same way');
    t.is(mn.t, 8.2, 'same temperature field');
    t.is(mn.icon, 'rain', 'same icon names');
    t.is(mn.day, false, 'and it says night in the symbol rather than a field of its own');
    t.is(nd.parseMetNo(JSON.stringify({ properties: { timeseries: [{ data: {
      instant: { details: { air_temperature: 8.2 } } } }] } })), null,
      'with no symbol there is nothing to draw, so the chain moves on');
    t.is(nd.parseMetNo('{}'), null, 'and a shape we did not expect is not forced');
  });

  suite('Showing the weather', (t) => {
    const now = Date.now();
    t.is(nd.wxShape({ icon: 'clear', day: false }), 'moon', 'at night a clear sky is a moon');
    t.is(nd.wxShape({ icon: 'part', day: false }), 'moonpart', 'and so is a sun behind a cloud');
    t.is(nd.wxShape({ icon: 'rain', day: false }), 'rain', 'but rain at night is still rain');
    t.is(nd.wxShape({ icon: 'clear', day: true }), 'clear', 'and by day a sun is a sun');

    t.is(nd.wxTemp({ t: 13.6 }), '14\u00B0', 'the temperature is rounded to a whole degree');
    t.is(nd.wxTemp({ t: -0.4 }), '0\u00B0', 'and never reads as minus nothing');
    t.is(nd.wxTemp({ t: -2.6 }), '-3\u00B0', 'a frost still reads as one');

    t.is(nd.wxFresh({ t: 10, icon: 'clear', at: now }), true, 'a reading just taken is shown');
    t.is(nd.wxFresh({ t: 10, icon: 'clear', at: now - 4 * HOUR }), false,
      'one from four hours ago is not: a sun left over from this morning is a lie by teatime');
    t.is(nd.wxFresh({ t: 10, icon: 'clear', at: now - HOUR }), true, 'an hour is fine');
    t.is(nd.wxFresh({ icon: 'clear', at: now }), false, 'a reading with no temperature is not shown');
    t.is(nd.wxFresh({ t: 10, at: now }), false, 'nor one with no condition');
    t.is(nd.wxFresh(null), false, 'nor nothing at all');
  });

  suite('The price band on a television', (t) => {
    const S = nd.S, doc = window.document;
    S.mkt = { at: Date.now(), wx: { t: 14, icon: 'clear', label: 'Clear', c: '#E8C35A',
                                    day: true, at: Date.now(), from: 'open-meteo' } };
    nd.renderMkt();
    const inBand = doc.querySelector('#mkt .wx');
    t.ok(inBand, 'on a TV the weather leads the band of prices');
    t.ok(/14/.test(inBand.textContent), 'carrying the temperature');
    t.ok(inBand.querySelector('svg'), 'and an icon drawn rather than typed');
    t.is(inBand.parentNode.id, 'mkt', 'in the band itself, ahead of the prices');
    S.mkt.wx.at = Date.now() - 5 * HOUR;
    nd.renderMkt();
    t.not(doc.querySelector('#mkt .wx'), 'a stale reading is dropped rather than shown');
    S.mkt = {};
  });

  /* ------------------------------------------------------------- The wire */
  suite('Splitting the wire', (t) => {
    t.is(nd.isWireHeader('BLOCK 968306'), true, 'a block height is the wire\'s own header');
    t.is(nd.isWireHeader('19:29 UTC'), true, 'and so is a clock reading');
    t.is(nd.isWireHeader('Bitcoin $100,000 breached'), false,
      'but a ticker price alone is a real headline');
    t.is(nd.isWireHeader(''), false, 'and nothing is nothing');

    const bundle = story({ src: 'cw', id: 'cw:1', title: 'BLOCK 968306', html: '' });
    const un = nd.splitDigest(bundle);
    t.is(un.length, 1, 'a wire with no body stays in one piece');
    t.is(un[0].title, 'Citadel Wire digest', 'and is given a name that reads in a list');
    t.is(un[0].digest, true, 'marked as the bundle it is');

    const split = nd.splitDigest(story({
      src: 'cw', id: 'cw:2', date: Date.now(), order: 1,
      html: '<ul>' +
        '<li>Fed holds rates steady<ul><li>Third meeting running.</li></ul></li>' +
        '<li>Oil falls after OPEC raises output<ul><li>Brent down 2%.</li></ul></li>' +
        '</ul>'
    }));
    t.is(split.length, 2, 'a wire that lists its stories is broken into them');
    t.is(split[0].title, 'Fed holds rates steady', 'each with its own headline');
    t.is(split[0].summary, 'Third meeting running.', 'and its own summary');
    t.not(split[0].id === split[1].id, 'and its own id, so neither hides the other');

    const now = Date.now();
    const kept = nd.dropOldBundles([
      story({ src: 'cw', id: 'b1', digest: true, date: now }),
      story({ src: 'cw', id: 'b0', digest: true, date: now - HOUR }),
      story({ src: 'cw', id: 'real', date: now - 2 * HOUR })
    ]);
    t.same(kept.map((x) => x.id), ['b1', 'real'],
      'every bundle carries the same headline, so only the newest is kept');
  });

  /* -------------------------------------------------------- Reading a page */
  /* The paper's section menu arrived at the top of every story it fetched in full -
     featured, News, Sport, Letters, Hereford FC, E-editions - as though the article
     began with a list of the rest of the website. */
  suite('A menu is not the start of the article', (t) => {
    // The shape it came in: headings that are links, outside any <nav>.
    /* The menu sits inside the same container as the story, which is the whole
       reason it got through: the container holding the paragraphs is the one that
       wins, and the menu was in it. A menu in a box of its own was never a problem,
       because a box with no paragraphs in it never wins. */
    const page = `<html><body><div class="article-content">
        <div class="menu-wrap">
          ${['featured','News','Sport','Letters','Hereford FC','E-editions',
             "What's On",'Notices','Awards','Young Reporter']
            .map((x) => `<h3><a href="/${x}">${x}</a></h3>`).join('')}
        </div>
        <h1>Hay-on-Wye to become UK's first Fungi Town</h1>
        <p>Hay-on-Wye is set to transform into the UK's first Fungi Town with a
           three-day celebration dedicated to the wonders of the mushroom kingdom.</p>
        <h2>What is on</h2>
        <p>The festival will run across three days in the town's castle grounds, with
           foraging walks and talks from mycologists through the weekend.</p>
      </div></body></html>`;
    const got = nd.extractArticle(page);
    const text = got.blocks.map((b) => b.t);
    t.not(text.some((x) => /^(News|Sport|Letters|Notices|Awards|featured)$/.test(x)),
      'not one of the section names is in the article');
    t.not(text.some((x) => /Hereford FC|E-editions|Young Reporter/.test(x)),
      'nor any of the rest of the menu');
    t.ok(text.some((x) => /mushroom kingdom/.test(x)), 'while the story itself is there');
    t.ok(text.some((x) => /foraging walks/.test(x)), 'all of it');
    t.is(got.blocks[0].t.slice(0, 20), 'Hay-on-Wye is set to', 'and it starts at the start');

    // A real subheading stays, because it is words rather than somewhere to go.
    t.ok(text.indexOf('What is on') >= 0, 'a heading in the article is kept');
    t.is(got.blocks.filter((b) => b.k === 'h').length, 1, 'and it is the only heading');

    /* The shape it is actually in. On a card the heading is inside the link, not the
       other way round, and the first version of this looked straight past it -
       querySelector only ever looks downwards. Every shape the menu could be in is
       checked here, because guessing one of them right is not the same as knowing. */
    const menu = ['featured', 'News', 'Sport', 'Letters', 'Hereford FC', 'E-editions',
                  "What's On", 'Notices', 'Awards', 'Young Reporter'];
    const story = `<h1>Hay-on-Wye to become UK's first Fungi Town</h1>
      <p>Hay-on-Wye is set to transform into the UK's first Fungi Town with a three-day
         celebration dedicated to the wonders of the mushroom kingdom.</p>
      <p>The festival will run across three days in the castle grounds, with foraging
         walks and talks from mycologists through the weekend.</p>`;
    const shapes = {
      'the link inside the heading': menu.map((x) => `<h3><a href="/x">${x}</a></h3>`).join(''),
      'the heading inside the link': menu.map((x) => `<a href="/x"><h3>${x}</h3></a>`).join(''),
      'the heading inside a card':   menu.map((x) => `<a href="/x" class="card"><div><h3>${x}</h3></div></a>`).join(''),
      'no link at all':              menu.map((x) => `<h3>${x}</h3>`).join(''),
      'h2 rather than h3':           menu.map((x) => `<a href="/x"><h2>${x}</h2></a>`).join('')
    };
    Object.keys(shapes).forEach((k) => {
      const out = nd.extractArticle(
        `<html><body><div class="article-content">${shapes[k]}${story}</div></body></html>`);
      const txt = out.blocks.map((b) => b.t);
      t.same(txt.filter((x) => menu.indexOf(x) >= 0), [], k + ': none of the menu gets through');
      t.ok(txt.some((x) => /mushroom kingdom/.test(x)), k + ': and the story still does');
    });

    /* A short menu - three links, not ten - is under the run rule's line, so only
       the heading-is-a-link rule catches it. Both rules earn their place. */
    ['<a href="/x"><h3>{}</h3></a>', '<h3><a href="/x">{}</a></h3>'].forEach((shape, i) => {
      const three = ['News', 'Sport', 'Letters']
        .map((x) => shape.replace('{}', x)).join('');
      const out = nd.extractArticle(
        `<html><body><div class="article-content">${three}${story}</div></body></html>`);
      const txt = out.blocks.map((b) => b.t);
      t.same(txt.filter((x) => ['News', 'Sport', 'Letters'].indexOf(x) >= 0), [],
        'a menu of three is caught too, shape ' + (i + 1));
      t.ok(txt.some((x) => /mushroom kingdom/.test(x)), 'and the story is untouched, shape ' + (i + 1));
    });

    // A heading that merely contains a link is still a heading.
    const withLink = nd.extractArticle(`<html><body><div class="article-content">
      <h2>The <a href="/x">mushroom festival</a> in full</h2>
      <p>A paragraph long enough to be counted as the body of the article, which this
         one certainly is, with room to spare.</p></div></body></html>`);
    t.ok(withLink.blocks.some((b) => b.k === 'h' && /in full/.test(b.t)),
      'a heading with a link inside it is not a menu item');

    // And a menu marked up properly was already going; it still is.
    const inNav = nd.extractArticle(`<html><body><div class="article-content">
      <nav><h3><a href="/sport">Sport</a></h3></nav>
      <p>A paragraph long enough to be counted as the body of the article, which this
         one certainly is, with room to spare.</p></div></body></html>`);
    t.not(inNav.blocks.some((b) => /Sport/.test(b.t)), 'a menu inside a nav is still dropped');
  });

  /* The rule that needs no link at all: a row of short headings with nothing to read
     between them is a menu, whatever it is marked up as. An article's headings have
     the article in between them - that is what they are for. */
  suite('A row of headings with nothing under them is a menu', (t) => {
    const h = (x) => ({ k: 'h', t: x });
    const p = (x) => ({ k: 'p', t: x });
    const txt = (b) => b.map((x) => x.t);

    t.same(txt(nd.dropMenus([h('News'), h('Sport'), h('Letters'), h('Awards'), p('The story.')])),
      ['The story.'], 'four short headings in a row go, and the story stays');
    t.same(txt(nd.dropMenus([h('News'), h('Sport'), h('Letters'), p('The story.')])),
      ['News', 'Sport', 'Letters', 'The story.'], 'three do not: that could be an article');
    t.same(txt(nd.dropMenus([
      h('Ingredients'), p('Flour, water.'), h('Method'), p('Mix them.'),
      h('To serve'), p('On a plate.'), h('Notes'), p('Keeps a week.')])),
      ['Ingredients', 'Flour, water.', 'Method', 'Mix them.', 'To serve', 'On a plate.',
       'Notes', 'Keeps a week.'],
      'and headings with the article in between them are what headings are for');

    // A long heading is a sentence, not a menu item, however many are in a row.
    const longRun = [1, 2, 3, 4, 5].map((i) =>
      h('A heading long enough to be a line of the article rather than a word ' + i));
    t.is(nd.dropMenus(longRun).length, 5, 'five long headings are five headings');
    t.is(nd.MENU_RUN, 4, 'four in a row is the line');
    t.ok(nd.MENU_LEN >= 24 && nd.MENU_LEN <= 48, 'and a menu item is a word or two');

    // The menu at the end of the page goes the same way as the one at the start.
    t.same(txt(nd.dropMenus([p('The story.'), h('News'), h('Sport'), h('Letters'), h('Awards')])),
      ['The story.'], 'wherever in the page it sits');
    t.same(nd.dropMenus([]), [], 'and nothing is nothing');
  });

  suite('Reading a page the publisher meant for search engines', (t) => {
    const out = [];
    nd.ldItems({
      '@graph': [{
        '@type': 'ItemList',
        itemListElement: [
          { item: { url: '/news/articles/abc', name: 'A headline long enough to keep',
                    description: 'What happened.', datePublished: '2026-09-24T09:00:00Z',
                    image: { url: 'https://img/1.jpg' } } },
          { item: { url: '/news/articles/def', name: 'Too short' } }
        ]
      }]
    }, out, 'https://www.bbc.co.uk/news/topics/czm9g11zrylt');
    t.is(out.length, 1, 'a headline too short to be one is left out');
    t.is(out[0].title, 'A headline long enough to keep', 'the rest come through');
    t.is(out[0].link, 'https://www.bbc.co.uk/news/articles/abc', 'with their links made absolute');
    t.is(out[0].image, 'https://img/1.jpg', 'and their pictures unwrapped');
    t.is(nd.ldBlocks('<html><head><script type="application/ld+json">{"a":1}</script></head></html>')[0].a, 1,
      'and the block is found in the page');
    t.same(nd.ldBlocks('<html><script type="application/ld+json">not json</script></html>'), [],
      'while a block that will not parse is simply skipped');
  });

  suite('Reading a page that meant nothing of the sort', (t) => {
    const links = nd.bbcLinks(
      '<a href="/news/articles/c0abc123def"><h3>A headline long enough to keep</h3>' +
      '<img src="/img/1.jpg"></a>' +
      '<a href="/news/articles/c0abc123def"><h3>The very same story again</h3></a>' +
      '<a href="/news/topics/czm9g11zrylt"><h3>Another topic page entirely</h3></a>' +
      '<a href="/sport/football/c0xyz987654"><h3>Football is not the local news</h3></a>' +
      '<a href="/news/articles/c0ghi456jkl"><h3>Short</h3></a>');
    t.is(links.length, 1, 'one story, once, and nothing that is not a story');
    t.is(links[0].title, 'A headline long enough to keep', 'read from the heading inside the link');
    t.is(links[0].link, 'https://www.bbc.co.uk/news/articles/c0abc123def', 'with an absolute link');
    t.ok(/\/img\/1\.jpg$/.test(links[0].image), 'and the card\'s picture');
  });

  /* ------------------------------------------------------- Making a story */
  suite('Making a story out of a feed entry', (t) => {
    const it = nd.mk('vf', {
      title: 'FOOD | Ten things to cook this week',
      summary: 'Some recipes. The post Ten things to cook this week appeared first on Vegan Food &amp; Living.',
      link: 'https://example.com/a', date: '2026-09-24T09:00:00Z'
    }, 3);
    t.is(it.kicker, 'Food', 'a shouted kicker is taken off the front and tidied');
    t.is(it.title, 'Ten things to cook this week', 'leaving the headline itself');
    t.is(it.summary, 'Some recipes.', 'and the feed\'s own advert is cut off the summary');
    t.is(it.id, 'vf:https://example.com/a', 'the link is the identity');
    t.is(it.order, 3, 'and the feed\'s order is kept, for stories with no date');
    t.is(nd.mk('ht', { title: 'No date here' }, 0).date, 0, 'an unreadable date reads as none');
  });

  /* ------------------------------------------------ Saving, sharing, calendar */
  suite('Saving a story', (t) => {
    const S = nd.S;
    S.saved = [];
    const it = story({ src: 'ht', id: 'ht:9', title: 'Road closed after crash' });
    t.is(nd.isSaved(it), false, 'nothing is saved to begin with');
    t.is(nd.toggleSave(it), true, 'saving says so');
    t.is(nd.isSaved(it), true, 'and it is saved');
    t.is(S.saved.length, 1, 'once');
    // The one button says Save or Saved, so pressing it again is letting go.
    t.is(nd.toggleSave(it), false, 'pressing it again lets the story go');
    t.is(S.saved.length, 0, 'and it leaves the list');
    nd.toggleSave(it);
    t.is(S.saved.length, 1, 'saved once more');
    // The live item is rebuilt and thrown away on every refresh. A saved story that
    // changed under you would not be the one you saved.
    t.not(S.saved[0] === it, 'what is kept is a copy, not the item itself');
    t.is(S.saved[0].title, it.title, 'with the same words');
    t.ok(S.saved[0].savedAt > 0, 'and when it was saved');
    it.title = 'Rewritten by a refresh';
    t.is(S.saved[0].title, 'Road closed after crash', 'so a later refresh cannot rewrite it');
    t.is(nd.toggleSave(it), false, 'letting go says so');
    t.is(nd.isSaved(it), false, 'and it is gone');
    t.is(S.saved.length, 0, 'from the list too');
    S.saved = [];
  });

  suite('The Saved tab', (t) => {
    const S = nd.S;
    const saved = nd.TABS.findIndex((x) => x.id === 'saved');
    S.saved = [];
    t.is(nd.tabShown(nd.TABS[saved]), false, 'is not on the strip while nothing is saved');
    t.is(nd.tabShown(nd.TABS[0]), true, 'unlike every other tab');
    // The remote must not stop on a tab that is not there.
    S.tab = nd.TABS.findIndex((x) => x.id === 'all');
    nd.switchTab(1);
    t.is(nd.TABS[S.tab].id, 'breaking', 'so the remote walks past it, round to the first');
    nd.toggleSave(story({ src: 'ht', id: 'ht:9', title: 'Road closed', date: Date.now() }));
    t.is(nd.tabShown(nd.TABS[saved]), true, 'once something is saved it appears');
    S.tab = nd.TABS.findIndex((x) => x.id === 'all');
    nd.switchTab(1);
    t.is(nd.TABS[S.tab].id, 'saved', 'and the remote stops on it');
    t.same(S.view.map((x) => x.id), ['ht:9'], 'showing what was saved');
    S.saved = []; S.tab = 1;
  });

  suite('What you can do with a story', (t) => {
    const S = nd.S;
    S.saved = [];
    const ev = story({ src: 'lm', id: 'lm:1', title: 'Christmas Fayre',
                       when: Date.now() + DAY, link: 'https://example.com/e' });
    const news = story({ src: 'ht', id: 'ht:2', title: 'Road closed',
                         link: 'https://example.com/a' });
    const ids = (it) => { S.reader = { item: it, full: false, loading: false, y: 0, act: -1, acts: [] };
                          return nd.readerActions(it).map((a) => a.id); };
    // This boot is a television: it has nothing to share to and no calendar.
    t.same(ids(news), ['full', 'save'], 'a TV is offered the full story and saving, and no more');
    t.same(ids(ev), ['full', 'save'], 'an event too');
    S.reader = { item: news, full: true, loading: false, y: 0, act: -1, acts: [] };
    t.same(nd.readerActions(news).map((a) => a.id), ['save'],
      'and the full story drops off the strip once it has been loaded');
    const brief = { src: 'ai', id: 'brief:1', title: 'H', link: '', summary: 'x' };
    S.reader = { item: brief, full: true, loading: false, y: 0, act: -1, acts: [] };
    t.same(nd.readerActions(brief).map((a) => a.id), ['save'],
      'a briefing has no page to fetch, so it is only ever saved');
    S.reader = null; S.saved = [];
  });

  /* -------------------------------------------------------- On this day here */
  suite('Reading what Wikidata sends back', (t) => {
    const row = (o) => {
      const b = {};
      Object.keys(o).forEach((k) => { b[k] = { value: o[k] }; });
      return b;
    };
    const body = (rows) => JSON.stringify({ results: { bindings: rows.map(row) } });

    const got = nd.parseHhSparql(body([
      { itemLabel: 'David Garrick', itemDescription: 'english actor and playwright',
        year: '1717', kind: 'Born', article: 'https://en.wikipedia.org/wiki/David_Garrick' },
      { itemLabel: 'Nell Gwyn', itemDescription: 'english actress', year: '1650', kind: 'Died' }
    ]));
    t.is(got.length, 2, 'both rows are read');
    t.is(got[0].title, 'David Garrick', 'the name');
    t.is(got[0].year, 1717, 'the year, as a number');
    t.is(got[0].kicker, 'Born', 'and whether they were born or died here');
    t.is(got[0].summary, 'English actor and playwright',
      'the description gets its capital letter, since it is a sentence on the row');
    t.is(got[0].link, 'https://en.wikipedia.org/wiki/David_Garrick', 'and a page to open');

    // A thing with no English name comes back as its own id, which is no use to read.
    t.is(nd.parseHhSparql(body([{ itemLabel: 'Q12345', year: '1800', kind: 'Born' }])).length, 0,
      'a row with no English name is dropped rather than shown as a Q-number');
    t.is(nd.parseHhSparql(body([{ itemLabel: 'Someone', year: 'not a year', kind: 'Born' }])).length, 0,
      'and so is one whose year is not a year');
    t.is(nd.parseHhSparql(body([{ itemLabel: 'Someone', year: '20260', kind: 'Born' }])).length, 0,
      'or is a year nobody was born in');
    t.same(nd.parseHhSparql('<html>service unavailable</html>'), [],
      'an answer that is not the data empties the tab rather than filling it with nonsense');
    t.same(nd.parseHhSparql(JSON.stringify({ results: { bindings: [] } })), [],
      'and so does an answer with nothing in it');
    // The same person can come back twice, once for each place inside the county.
    t.is(nd.parseHhSparql(body([
      { itemLabel: 'Twice Over', year: '1900', kind: 'Born' },
      { itemLabel: 'Twice Over', year: '1900', kind: 'Born' }
    ])).length, 1, 'a row that repeats is shown once');
  });

  suite('Sifting Wikipedia\'s national list', (t) => {
    const day = (o) => JSON.stringify(o);
    const local = nd.parseHhDay(day({
      births: [{ text: 'John Masefield, English poet, born in Ledbury', year: 1878,
                 pages: [{ extract: 'A poet.', content_urls: { desktop: { page: 'https://x/1' } } }] }],
      events: [{ text: 'A battle somewhere else entirely', year: 1485, pages: [{ extract: 'Elsewhere.' }] }]
    }));
    t.is(local.length, 1, 'only the line that names somewhere here is kept');
    t.is(local[0].year, 1878, 'with its year');
    t.is(local[0].kicker, 'Born', 'and which list it came from');
    t.is(local[0].link, 'https://x/1', 'and its page');

    // The line itself may not name the place; the page it points at often does.
    t.is(nd.parseHhDay(day({ events: [{ text: 'A cathedral was consecrated', year: 1079,
      pages: [{ extract: 'Hereford Cathedral, in the county town.' }] }] })).length, 1,
      'a line is kept when the page it points at names the place');
    t.is(nd.parseHhDay(day({ events: [{ text: 'Something national', year: 1900, pages: [] }] })).length, 0,
      'and dropped when neither does');
    t.same(nd.parseHhDay('not json'), [], 'a broken answer is no entries, not an error');
    t.is(nd.HH_PLACES.test('a street in Hereford'), true, 'the county town counts');
    t.is(nd.HH_PLACES.test('Leominster'), true, 'and the market towns');
    t.is(nd.HH_PLACES.test('Herefordshire'), true, 'and the county itself');
    t.is(nd.HH_PLACES.test('Hertfordshire'), false,
      'but not the other county whose name is one letter away');
  });

  suite('History rows read as history', (t) => {
    const items = nd.hhItems([{ title: 'David Garrick', year: 1717, kicker: 'Born',
                                summary: 'An actor.', link: 'https://x/g' }]);
    t.is(items.length, 1, 'a row becomes a story');
    t.is(items[0].src, 'hh', 'filed under the history source');
    t.is(items[0].year, 1717, 'carrying its year');
    t.is(nd.timeLabel(items[0]), '1717',
      'which is what the row shows, rather than how long ago it was fetched');
    t.is(nd.isHistory(items[0]), true, 'it knows it is history');
    t.is(nd.isHistory(story({ src: 'ht' })), false, 'and the news knows it is not');
    // Centuries old and never breaking, whatever words are in it.
    t.same(nd.breakingList([Object.assign(items[0], { date: Date.now(),
      title: 'Fire destroys the market hall' })]), [],
      'history never reaches Breaking, however urgent the words in it');
    const hist = nd.TABS[nd.TABS.findIndex((x) => x.id === 'hist')];
    t.same(hist.srcs, ['hh'], 'the History tab draws from it alone');
    const all = nd.TABS[nd.TABS.findIndex((x) => x.id === 'all')];
    t.is(all.srcs.indexOf('hh'), -1, 'and All leaves it out, being today\'s news');
    const today = nd.TABS[nd.TABS.findIndex((x) => x.id === 'today')];
    t.is(today.srcs.indexOf('hh'), -1, 'as does Today');
  });

  /* --------------------------------------------------------------- Recipes */
  suite('What counts as a recipe', (t) => {
    const now = Date.now();
    const ok = (title, ago) => nd.rcKeep({ title: title, date: now - (ago || 0) });
    t.is(ok('One-pot red lentil dal'), true, 'dinner gets in');
    t.is(ok('Vegan chocolate cake'), true, 'so does pudding: healthy is the kitchen, not the dish');
    // A recipe site still posts about itself, and none of that is dinner.
    t.is(ok('Win a giveaway from our friends'), false, 'a giveaway is not a recipe');
    t.is(ok('Our new podcast is out'), false, 'nor is a podcast');
    t.is(ok('Black Friday gift guide'), false, 'nor a gift guide');
    t.is(ok('Subscribe to the newsletter'), false, 'nor a plea to subscribe');
    // A feed that stopped years ago is a kitchen that closed.
    t.is(ok('A fine old soup', 400 * DAY), false, 'and a recipe from years back is a dead feed');
    t.is(ok('A fine recent soup', 30 * DAY), true, 'while one from last month keeps');
    t.is(nd.rcKeep(null), false, 'nothing is not a recipe');
    t.is(nd.rcKeep({ title: '' }), false, 'and neither is a post with no title');

    t.ok(nd.RC_KITCHENS.length >= 4, 'it pools several kitchens, not one');
    nd.RC_KITCHENS.forEach((k) => {
      t.ok(/^https:\/\//.test(k.url), k.name + ' is fetched over https');
      t.ok(k.name && k.name.length > 2, 'and is named, since the row shows the kitchen');
    });
    const urls = nd.RC_KITCHENS.map((k) => k.url);
    t.is(new Set(urls).size, urls.length, 'and none is listed twice');
  });

  suite('A recipe row reads as a recipe', (t) => {
    const now = Date.now();
    const dish = story({ src: 'rc', id: 'rc:1', title: 'One-pot red lentil dal',
                         date: now - 2 * DAY, kitchen: 'Minimalist Baker' });
    // A recipe from last week is as good as one from this morning, so the row says
    // where it came from rather than how long ago it was posted.
    t.is(nd.timeLabel(dish), 'Minimalist Baker', 'the row names the kitchen, not the hour');
    t.is(nd.isKitchen(dish), true, 'it knows it is a recipe');
    t.is(nd.isKitchen(story({ src: 'ht' })), false, 'and the news knows it is not');
    t.same(nd.breakingList([Object.assign({}, dish, { date: now,
      title: 'Fire roasted red pepper soup' })]), [],
      'a recipe never reaches Breaking, however the words read');
    const tab = nd.TABS[nd.TABS.findIndex((x) => x.id === 'recipes')];
    t.same(tab.srcs, ['rc'], 'the Recipes tab draws from the kitchens alone');
    const all = nd.TABS[nd.TABS.findIndex((x) => x.id === 'all')];
    t.is(all.srcs.indexOf('rc'), -1, 'and All leaves them out, being today\'s news');
    const today = nd.TABS[nd.TABS.findIndex((x) => x.id === 'today')];
    t.is(today.srcs.indexOf('rc'), -1, 'as does Today');
  });

  /* ---------------------------------------------------------------- Search */
  suite('Finding a story again', (t) => {
    const S = nd.S, now = Date.now();
    const pool = [
      story({ src: 'ht', id: 'a', title: 'Road closed after crash on the A49',
              summary: 'Police say the road is shut.', date: now }),
      story({ src: 'ht', id: 'b', title: 'Council approves new homes',
              summary: 'Near the A49 junction.', date: now - HOUR }),
      story({ src: 'kg', id: 'c', kicker: 'UK', title: 'Something else entirely',
              summary: 'Nothing to do with it.', date: now - 2 * HOUR }),
      story({ src: 'vf', id: 'd', title: 'A crash course in tofu',
              summary: 'Cooking.', date: now - 3 * HOUR })
    ];
    const ids = (q) => nd.searchHits(q, pool).map((x) => x.id);
    t.same(ids('a49'), ['a', 'b'], 'a word in the headline beats one buried in the summary');
    t.same(ids('crash'), ['a', 'd'], 'and both headlines carrying it come back');
    // Two words narrow. This is the whole reason for typing a second one.
    t.same(ids('crash a49'), ['a'], 'every word has to appear, so two words narrow');
    t.same(ids('crash tofu'), ['d'], 'even when they are in different parts of the story');
    t.same(ids('zebra'), [], 'a word in nothing finds nothing');
    t.same(ids(''), [], 'and an empty box finds nothing rather than everything');
    t.same(ids('  '), [], 'nor does a box of spaces');
    t.same(ids('a'), [], 'a single letter is not a search');
    t.is(nd.searchHits('ROAD', pool)[0].id, 'a', 'case does not matter');

    // It searches what the app has: the feeds, what was saved, and the briefings.
    S.saved = []; S.briefs = [];
    nd.toggleSave(story({ src: 'ht', id: 'kept', title: 'A story I kept about badgers' }));
    nd.rememberBrief({ headline: 'Badgers lead the news', paragraphs: ['A paragraph.'],
                       at: now, slotName: 'Morning briefing', slotKey: 'b1' });
    const found = nd.searchHits('badgers').map((x) => x.title);
    t.ok(found.indexOf('A story I kept about badgers') >= 0, 'a saved story is searchable');
    t.ok(found.indexOf('Badgers lead the news') >= 0, 'and so is a briefing');
    S.saved = []; S.briefs = [];
  });

  suite('The search bar', (t) => {
    const S = nd.S, doc = window.document, now = Date.now();
    S.by = { cw: { items: [] }, kg: { items: [] }, yh: { items: [] }, bb: { items: [] },
             vf: { items: [] }, lm: { items: [] },
             ht: { items: [story({ src: 'ht', id: 'a', title: 'Road closed after a crash', date: now })] } };
    nd.openSearch();
    t.is(S.mode, 'search', 'opening search changes what the buttons do');
    t.is(doc.getElementById('searchBar').hidden, false, 'and puts the box on screen');
    nd.runSearch('road');
    t.same(S.view.map((x) => x.id), ['a'], 'typing narrows the list itself, not a second one');
    t.ok(/1 found/.test(doc.getElementById('sqCount').textContent), 'and says how many');
    nd.runSearch('zebra');
    t.is(S.view.length, 0, 'a word in nothing empties it');
    t.ok(/nothing found/.test(doc.getElementById('sqCount').textContent), 'and says so plainly');
    nd.closeSearch();
    t.is(S.mode, 'home', 'Back leaves search');
    t.is(doc.getElementById('searchBar').hidden, true, 'and takes the box away');
    t.ok(S.view.length >= 0, 'putting the tab back as it was');
  });

  /* Everything the app keeps shares one origin quota. Every write was wrapped in a
     silent try/catch, so a full quota meant a briefing quietly not kept - and a
     briefing quietly not kept is exactly the complaint that started all this. */
  suite('A full quota costs the cache, not the briefing', (t) => {
    // Storage is a proxy: assigning to localStorage.setItem stores a key called
    // "setItem" and leaves the method alone. The prototype is the way in.
    const ls = window.localStorage, proto = window.Storage.prototype;
    const real = proto.setItem, realRm = proto.removeItem;
    const tried = [];
    let full = true;
    // A browser with no room left: every write throws until something is let go.
    proto.setItem = function (k, v) {
      tried.push(k);
      if (full) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      return real.call(this, k, v);
    };
    proto.removeItem = function (k) { if (k === nd.CACHE_KEY) full = false; return realRm.call(this, k); };

    t.is(nd.put('nd.briefs.v1', '["a briefing"]'), true, 'a briefing gets in by dropping the cache');
    t.same(tried, ['nd.briefs.v1', 'nd.briefs.v1'], 'having asked twice, once either side of it');
    t.is(ls.getItem('nd.briefs.v1'), '["a briefing"]', 'and it is really there afterwards');

    // The cache is the thing being dropped. It does not get to drop itself.
    tried.length = 0; full = true;
    t.is(nd.put(nd.CACHE_KEY, '{"by":{}}'), false, 'the cache itself goes without');
    t.same(tried, [nd.CACHE_KEY], 'asking once and not again');

    proto.setItem = real; proto.removeItem = realRm;
  });

  /* ------------------------------------------- The county's own archive */
  /* The archive publishes no feed, so the tab reads its listing pages - and reads
     them by the shape of an item's address rather than by any markup, because the
     markup is the part that gets rebuilt. These fixtures are the same three items
     laid out four different ways; all four have to come back the same. */
  /* The archive is a PastView site, and these fixtures are its own markup, trimmed
     from pages it actually served. The first version of this route was written from
     search-result snippets and looked for /view/<id>-<slug>; the live site writes the
     full path instead, so it matched nothing at all, every day, silently. */
  suite('Reading the archive as it is actually written', (t) => {
    const leaf = readFixture('hha-leaf.html');
    const shelf = readFixture('hha-shelf.html');
    const leafAt = 'https://herefordshirehistory.org.uk/archive/images-by-subject/richard-jenkins-collection/transport';
    const shelfAt = 'https://herefordshirehistory.org.uk/archive/hereford-images';

    const items = nd.hhaLinks(leaf, leafAt);
    t.is(items.length, 6, 'every picture on the page is found');
    t.is(items[0].title, 'Man in a cap posing with a bicycle', 'named by its caption');
    t.is(items[0].ref, '1658012', 'keeping its catalogue number');
    t.is(items[0].link,
      'https://herefordshirehistory.org.uk/archive/images-by-subject/richard-jenkins-collection/transport/1658012-man-in-a-cap-posing-with-a-bicycle',
      'and its address, without the question mark the site hangs off every link');
    t.ok(/^https:\/\/herefordshirehistory\.org\.uk\/img\//.test(items[0].image),
      'with the picture that goes on the row');
    t.is(items[0].kicker, 'Archive', 'and where it came from');

    // A catalogued year sorts the row in among the rest.
    const dated = items.filter((x) => /Abbey Dore, devils acre/.test(x.title))[0];
    t.ok(dated, 'the Watkins photograph is there');
    t.is(dated.year, 1926, 'with the year read off its caption');

    // The old shape is still an address the site answers, so it is still read.
    t.is(nd.hhaItemRef('https://herefordshirehistory.org.uk/view/4313231-withington-station'),
      '4313231', '/view/<number>-<name> is the same item by a shorter name');
    t.is(nd.hhaItemRef('https://herefordshirehistory.org.uk/archive/a/b/4313231-x'), '4313231',
      'as is the long one');

    /* A shelf of shelves. The page holds no pictures and says so by the class it puts
       on every link, and one of these is called "1960-floods-hereford" - which is a
       year and a name, indistinguishable from a catalogue number and a name if you
       only look at the address. */
    t.same(nd.hhaLinks(shelf, shelfAt), [], 'a page of shelves offers no pictures');
    const folders = nd.hhaFolders(shelf, shelfAt);
    t.is(folders.length, 3, 'it offers shelves instead');
    t.ok(folders.some((u) => /1960-floods-hereford$/.test(u)),
      'the one named after a year among them, as a shelf');
    t.ok(folders.every((u) => u.indexOf(shelfAt + '/') === 0), 'each one step below this page');
    t.not(folders.some((u) => /\?$/.test(u)), 'and none carrying the trailing question mark');

    // Which way round it reads is the site's own word, then the number.
    t.is(nd.hhaItemRef('https://herefordshirehistory.org.uk/archive/hereford-images/1960-floods-hereford',
      'archive-collection-link archive-list-item-link'), '',
      'a link the site calls a collection is never a picture');
    t.is(nd.hhaItemRef('https://herefordshirehistory.org.uk/archive/hereford-images/1960-floods-hereford'), '',
      'and with no class to go on, four figures is a year rather than a catalogue number');
    t.is(nd.hhaItemRef('https://herefordshirehistory.org.uk/archive/x/1658012-a-picture'), '1658012',
      'while seven figures is a catalogue number');
    t.is(nd.hhaItemRef('https://herefordshirehistory.org.uk/archive/x/1960-floods',
      'archive-item-link'), '1960',
      'unless the site says outright that it is a picture');
    /* And the other way round: a shelf whose name happens to begin with something as
       long as a catalogue number is still a shelf, because the site said so. The
       number alone cannot save us there. */
    t.is(nd.hhaItemRef('https://herefordshirehistory.org.uk/archive/x/1658012-flood-photographs',
      'archive-collection-link archive-list-item-link'), '',
      'a shelf numbered like a picture is still a shelf when the site says so');
    t.is(nd.hhaFolders(
      '<a class="archive-collection-link" href="/archive/x/1658012-flood-photographs">Floods</a>',
      'https://herefordshirehistory.org.uk/archive/x').length, 1,
      'and it is offered as a shelf to go down');
    // Only one step down: a shelf's own shelves are not this page's.
    t.same(nd.hhaFolders(
      '<a class="archive-collection-link" href="/archive/x/a">A</a>'
      + '<a class="archive-collection-link" href="/archive/x/a/deeper">Deeper</a>'
      + '<a class="archive-collection-link" href="/archive">Up</a>',
      'https://herefordshirehistory.org.uk/archive/x'),
      ['https://herefordshirehistory.org.uk/archive/x/a'],
      'one step down only, and never back up the way you came');

    // Nothing from anywhere else, whatever it is called.
    t.is(nd.hhaItemRef('https://evil.example/archive/x/1658012-a-picture'), '',
      'and nothing on another site is an item here');
    t.same(nd.hhaFolders(shelf, ''), [], 'shelves are only shelves relative to a page');
    t.same(nd.hhaLinks('', leafAt), [], 'an empty page gives nothing');

    // A caption catalogued as a file name is a caption with an extension on it.
    t.is(nd.hhaLinks(
      '<a class="archive-item-link" href="/archive/x/1658099-bayliss-postcard-001">'
      + 'Bayliss postcard 001.jpg</a>', nd.HHA_HOME)[0].title,
      'Bayliss postcard 001', 'a file extension is not part of the caption');
  });


  suite('Everything else on the page is not an item', (t) => {
    const page = `<nav><a href="/">Home</a><a href="/about">About</a><a href="/links">Links</a>
      <a href="/archive">Browse Our Collection</a><a href="/collection/transport">Transport</a>
      <a href="/search?q=minett&sort_field=_date">Search</a>
      <a href="mailto:herefordshirehistory@herefordshire.gov.uk">Contact</a></nav>
      <a href="https://example.com/view/123-somewhere-else">Another site entirely</a>
      <a href="/view/4313231-withington-station">Withington Station</a>
      <a href="/view/4313231-withington-station">The very same thing, linked twice</a>`;
    const got = nd.hhaLinks(page, 'https://herefordshirehistory.org.uk/archive');
    t.is(got.length, 1, 'only the one that is an item comes back');
    t.is(got[0].ref, '4313231', 'and it is the right one');
    t.same(nd.hhaLinks('', 'x'), [], 'an empty page gives nothing');
    t.same(nd.hhaLinks('<p>The archive is down for maintenance.</p>', 'x'), [],
      'and so does a page that is not a listing at all');
    // Plenty of sites have a /view/123-something. Only this one has this county's.
    t.is(nd.HHA_HOST, 'herefordshirehistory.org.uk', 'the host is read off the home address');
    t.same(nd.hhaLinks('<a href="https://evil.example/view/9-hereford-cathedral">Hereford Cathedral</a>',
      nd.HHA_HOME), [], 'and a matching address somewhere else is not an item');
  });

  suite('An item is named, or it is not shown', (t) => {
    // The archive names some things and shelf-marks others.
    t.is(nd.hhaFromSlug('withington-station'), 'Withington Station', 'a slug that reads as words is a name');
    t.is(nd.hhaFromSlug('broad-street-hereford-1904'), 'Broad Street Hereford 1904', 'numbers in it are left alone');
    t.is(nd.hhaFromSlug('ca11003'), '', 'a shelf mark is not a name');
    t.is(nd.hhaFromSlug('a1'), '', 'nor is a short code');
    t.is(nd.hhaFromSlug(''), '', 'and nothing is not a name');
    t.is(nd.hhaFromSlug('cathedral'), 'Cathedral', 'but one plain word is');
    // Which means an item the page says nothing about is dropped rather than shown as a code.
    const got = nd.hhaLinks('<a href="/view/7548873-ca11003"><img src="/t.jpg" alt=""></a>'
      + '<a href="/view/7548874-the-old-house"><img src="/t.jpg" alt=""></a>', nd.HHA_HOME);
    t.same(got.map((x) => x.title), ['The Old House'],
      'an item with nothing but a shelf mark is left out rather than shown as CA11003');
    /* A listing is free to link the bare number, and some do. The number is the item;
       the slug is a courtesy. */
    const bare = nd.hhaLinks('<a href="/view/7548873">Broad Street, Hereford, 1904</a>', nd.HHA_HOME);
    t.is(bare.length, 1, 'an address with no slug at all is still an item');
    t.is(bare[0].ref, '7548873', 'keeping its catalogue number');
    t.is(bare[0].title, 'Broad Street, Hereford, 1904', 'named by the link, since there is no slug to ask');
    t.is(bare[0].year, 1904, 'and dated from it');
    t.same(nd.hhaLinks('<a href="/view/7548873"><img src="/t.jpg" alt=""></a>', nd.HHA_HOME), [],
      'but a bare number with nothing said about it is not worth a row');
  });

  suite('A year in the title is a year on the row', (t) => {
    t.is(nd.hhaYear('Broad Street, Hereford, 1904'), 1904, 'a catalogued year is read off the title');
    t.is(nd.hhaYear('High Town, c.1880'), 1880, 'even hedged with a circa');
    t.is(nd.hhaYear('Withington Station'), 0, 'a title with no year has none');
    t.is(nd.hhaYear('Catalogue 40000 items'), 0, 'and a number that is not a year is not one');
    t.is(nd.hhaYear(''), 0, 'nor is nothing');
  });

  suite('The day picks its own window into forty thousand things', (t) => {
    const list = Array.from({ length: 20 }, (_, i) => ({ ref: String(i) }));
    const day = (y, m, d) => nd.hhaSeed(new Date(y, m - 1, d));
    const ids = (seed, n) => nd.hhaPick(list, seed, n).map((x) => x.ref);
    t.is(nd.hhaPick(list, day(2026, 5, 1), 10).length, 10, 'ten of them reach the tab');
    t.same(ids(day(2026, 5, 1), 10), ids(day(2026, 5, 1), 10),
      'the same day gives the same pictures, however often the app is opened');
    t.not(ids(day(2026, 5, 1), 10).join() === ids(day(2026, 5, 2), 10).join(),
      'and tomorrow gives others');
    t.not(ids(day(2026, 5, 1), 10).join() === ids(day(2027, 5, 1), 10).join(),
      'as does the same day next year');
    // It wraps rather than running off the end of the list.
    t.is(new Set(nd.hhaPick(list, 19, 10).map((x) => x.ref)).size, 10,
      'a window starting at the end wraps round to the start');
    t.same(nd.hhaPick([{ ref: 'a' }, { ref: 'b' }], 7, 10).map((x) => x.ref), ['a', 'b'],
      'a short list is shown whole rather than padded');
    t.same(nd.hhaPick([], 7, 10), [], 'and an empty one stays empty');
    t.same(nd.hhaPick(list, 7, 0), [], 'asking for none gives none');
  });

  /* A refresh lands a source every few seconds after a cold start and every ten
     minutes after that, and each landing rebuilds the list. It used to rebuild it
     as the tab, throwing away results the reader was still looking at. */
  suite('A refresh does not take the search away', (t) => {
    const S = nd.S, now = Date.now();
    const empty = { cw: { items: [] }, kg: { items: [] }, yh: { items: [] },
                    bb: { items: [] }, vf: { items: [] }, lm: { items: [] } };
    S.by = Object.assign({}, empty, { ht: { items: [
      story({ src: 'ht', id: 'a', title: 'Road closed after a crash', date: now }) ] } });
    nd.openSearch();
    nd.runSearch('road');
    t.same(S.view.map((x) => x.id), ['a'], 'a search finds the one story');

    // A source lands. Nothing in it matches, so the results should not move.
    S.by.ht.items.push(story({ src: 'ht', id: 'b', title: 'Council approves new homes', date: now }));
    nd.rebuild();
    t.is(S.mode, 'search', 'the box is still open after a source lands');
    t.same(S.view.map((x) => x.id), ['a'], 'and still holds the results, not the tab');

    // One that does match joins them, because the pool is bigger than it was.
    S.by.ht.items.push(story({ src: 'ht', id: 'c', title: 'Another road shut', date: now - 60e3 }));
    nd.rebuild();
    t.same(S.view.map((x) => x.id).sort(), ['a', 'c'], 'a story that matches joins the results');

    // The row being read stays under the cursor rather than jumping to the top.
    S.idx = S.view.map((x) => x.id).indexOf('c');
    const was = S.view[S.idx].id;
    S.by.ht.items.push(story({ src: 'ht', id: 'd', title: 'Road works begin', date: now }));
    nd.rebuild();
    t.is(S.view[S.idx] && S.view[S.idx].id, was, 'and the row being read stays put');
    nd.closeSearch();
    S.by = empty;
  });

  /* WebView.pauseTimers is application-wide. Using it would have frozen the
     background job's page mid-briefing, and the job's resumeTimers would have set
     this page refreshing behind the reader's back. Each page stops its own. */
  suite('A page off screen stops its own timers', (t) => {
    const page = window.nd;
    t.ok(nd.timers() > 0, 'a page on screen is running timers');
    page.paused();
    t.is(nd.timers(), 0, 'going off screen stops every one of them');
    page.paused();
    t.is(nd.timers(), 0, 'and being told twice leaves none behind');
    page.resumed();
    const n = nd.timers();
    t.ok(n > 0, 'coming back starts them again');
    page.resumed();
    t.is(nd.timers(), n, 'and coming back twice does not start a second set');
  });

  /* ------------------------------------------------- The order of a list */
  /* The sources used to take strict turns, so where a story landed depended on how
     far down its own pile it was rather than when it happened. */
  suite('A list reads newest first', (t) => {
    const pile = (src, ...ages) => ages.map((h, i) => {
      const it = story({ src, id: src + ':' + i, title: src + ' ' + h + 'h', date: Date.now() - h * HOUR });
      it.sort = it.date;
      return it;
    });
    const ages = (out) => out.map((x) => x.title);

    // Two piles, one fresh and one stale. Turn-taking put the stale pile's head second.
    t.same(ages(nd.weave([pile('ht', 0.35, 0.43), pile('yh', 22, 80)], 3)),
      ['ht 0.35h', 'ht 0.43h', 'yh 22h', 'yh 80h'],
      'the two fresh ones lead and the day-old ones follow');

    // Interleaved ages come out in order regardless of which pile they are in.
    t.same(ages(nd.weave([pile('ht', 1, 5), pile('yh', 3, 7), pile('bb', 2, 6)], 3)),
      ['ht 1h', 'bb 2h', 'yh 3h', 'ht 5h', 'bb 6h', 'yh 7h'],
      'and three piles merge strictly by age');

    // What the turns were for: one source must not fill the screen.
    const flood = nd.weave([pile('ht', 1, 2, 3, 4, 5, 6), pile('yh', 20, 30)], 3);
    t.same(ages(flood),
      ['ht 1h', 'ht 2h', 'ht 3h', 'yh 20h', 'ht 4h', 'ht 5h', 'ht 6h', 'yh 30h'],
      'a pile gets three in a row, lets another in, and may then have three more');
    t.is(flood.length, 8, 'and nothing is dropped to keep the rhythm');

    t.same(ages(nd.weave([pile('ht', 1, 2, 3, 4, 5)], 3)), ['ht 1h', 'ht 2h', 'ht 3h', 'ht 4h', 'ht 5h'],
      'one pile on its own is not broken up over nothing');
    t.same(nd.weave([], 3), [], 'no piles is no list');
    t.same(nd.weave([[], []], 3), [], 'and empty piles are no list either');
    t.same(nd.weave(null, 3), [], 'nor is nothing at all');
    t.is(nd.RUN_MAX, 3, 'three in a row is the cap');
  });

  suite('A diary is threaded through, not sunk', (t) => {
    const news = Array.from({ length: 14 }, (_, i) => ({ id: 'n' + i, src: 'ht' }));
    const diary = Array.from({ length: 3 }, (_, i) => ({ id: 'd' + i, src: 'lm' }));
    const out = nd.thread(news, diary, 6);
    t.is(out.length, 17, 'every row is still there');
    t.same([out[6].id, out[13].id], ['d0', 'd1'], 'an event every sixth row');
    t.same(out.slice(0, 6).map((x) => x.id), ['n0', 'n1', 'n2', 'n3', 'n4', 'n5'],
      'with the news reading on in between');
    t.same(out.map((x) => x.id).filter((id) => /^n/.test(id)), news.map((x) => x.id),
      'and the news in the order it was given');
    t.same(out.map((x) => x.id).filter((id) => /^d/.test(id)), diary.map((x) => x.id),
      'the diary reading forwards, as a diary does');

    // Whatever will not fit at that spacing follows rather than being left out.
    const many = nd.thread(news.slice(0, 4), diary, 6);
    t.is(many.length, 7, 'a short list still shows every event');
    t.same(many.slice(4).map((x) => x.id), ['d0', 'd1', 'd2'], 'the rest following the news');

    t.same(nd.thread(news, [], 6).map((x) => x.id), news.map((x) => x.id),
      'no diary changes nothing');
    t.same(nd.thread([], diary, 6).map((x) => x.id), ['d0', 'd1', 'd2'],
      'and a diary with no news around it is still shown');
    t.is(nd.DIARY_EVERY, 6, 'one event every six stories');
  });

  /* The screenshot, as it came off the phone: Local read 21m, 22h, 6h, an event,
     26m, three days, 20h. Every one of those ages is real; only the order was not. */
  suite('The Local tab, in the order it came off the phone', (t) => {
    const S = nd.S, now = Date.now();
    const at = (src, id, mins, extra) => story(Object.assign(
      { src, id, title: id, date: now - mins * 60e3 }, extra || {}));
    S.by = {
      cw: { items: [] }, kg: { items: [] }, vf: { items: [] },
      ht: { items: [at('ht', 'crash on the A49', 21), at('ht', 'SAS commander', 26)] },
      yh: { items: [at('yh', 'Asda offer', 22 * 60), at('yh', 'bereavement rights', 3 * 24 * 60)] },
      bb: { items: [at('bb', 'weekly quiz', 6 * 60), at('bb', 'military history festival', 20 * 60)] },
      lm: { items: [at('lm', 'Victorian Women', 2 * 24 * 60, { when: now + 5 * DAY })] }
    };
    S.tab = nd.TABS.findIndex((x) => x.id === 'local');
    S.mode = 'home';
    nd.rebuild(null);
    const ids = S.view.map((x) => x.id);
    t.same(ids.slice(0, 6),
      ['crash on the A49', 'SAS commander', 'weekly quiz', 'military history festival',
       'Asda offer', 'bereavement rights'],
      'twenty minutes old leads, and three days old is last of the news');
    t.ok(ids.indexOf('crash on the A49') < ids.indexOf('Asda offer'),
      'a story from this hour is never under one from yesterday');
    t.ok(ids.indexOf('SAS commander') < ids.indexOf('military history festival'),
      'nor is the second story of a busy source under an older one from a quiet source');
    t.is(ids.length, 7, 'and every story is still on the list, the event included');
    t.ok(ids.indexOf('Victorian Women') >= 0, 'with what is on in town still there');
    S.by = { cw: { items: [] }, kg: { items: [] }, ht: { items: [] }, yh: { items: [] },
             bb: { items: [] }, vf: { items: [] }, lm: { items: [] } };
  });

  /* ------------------------------------------------------ All of it at once */
  suite('Building a screen', (t) => {
    const S = nd.S, now = Date.now();
    S.by = {
      cw: { items: [story({ src: 'cw', id: 'cw:1', title: 'Bitcoin tops $100,000', date: now - 5 * 60e3 })] },
      kg: { items: [story({ src: 'kg', id: 'kg:1', kicker: 'UK', title: 'Something large happens', weight: 9, date: now - HOUR }),
                    story({ src: 'kg', id: 'kg:2', kicker: 'Tech', title: 'A chip is announced', weight: 2, date: now - 2 * HOUR })] },
      ht: { items: [story({ src: 'ht', id: 'ht:1', title: 'Police close the A49 after a crash', date: now - 30 * 60e3 })] },
      yh: { items: [] }, bb: { items: [] },
      vf: { items: [story({ src: 'vf', id: 'vf:1', title: 'A new oat milk arrives', date: now - 3 * HOUR })] },
      lm: { items: [story({ src: 'lm', id: 'lm:1', title: 'Christmas Fayre', when: now + 3 * DAY, date: now - DAY })] }
    };
    t.is(nd.getAll().length, 6, 'every source contributes to the pool');

    const today = nd.buildToday(nd.getAll(), true);
    const titles = today.sections.map((s) => s.title);
    t.same(titles, ['Top stories', 'Herefordshire', 'Vegan food and living', 'On in town', 'Bitcoin and markets'],
      'Today is built in sections, in the order they are read');
    t.is(today.items.length, 6, 'and every story lands in one of them');
    t.is(today.items[0].id, 'kg:1', 'the most widely covered story leads');

    S.tab = nd.TABS.findIndex((x) => x.id === 'coin');
    nd.rebuild();
    t.same(S.view.map((x) => x.id), ['cw:1'], 'the Bitcoin tab shows the bitcoin wire');
    S.tab = nd.TABS.findIndex((x) => x.id === 'local');
    nd.rebuild();
    t.same(S.view.map((x) => x.id).sort(), ['ht:1', 'lm:1'], 'Local shows the paper and the diary');
    S.tab = nd.TABS.findIndex((x) => x.id === 'breaking');
    nd.rebuild();
    t.same(S.view.map((x) => x.id), ['ht:1', 'kg:1'],
      'and Breaking shows only what actually broke: the closed road and the big story, '
      + 'not the chip announcement or the oat milk');
    t.ok(window.document.querySelectorAll('#list .row').length >= 1, 'and it reaches the screen');
  });

  // The chip has two homes and the phone one is the one that went wrong, so the page
  // is booted a second time as a phone rather than trusted to behave.
  const phone = await boot({ settle: 500, device: 'touch' });
  suite('The price band on a phone', (t) => {
    const doc = phone.window.document;
    phone.nd.S.mkt = { at: Date.now(), wx: { t: 9, icon: 'rain', label: 'Rain', c: '#7FB5E8',
                                             day: true, at: Date.now(), from: 'open-meteo' } };
    phone.nd.renderMkt();
    const chip = doc.querySelector('#mkt .wx');
    t.ok(chip, 'the weather leads the band on a phone, the same as on a television');
    t.ok(/9/.test(chip.textContent), 'with the temperature');
    t.ok(chip.querySelector('svg'), 'and its icon');
    t.not(doc.getElementById('wx'), 'and the slot it used to need under the name is gone');
    // It was in the header, two across and two down. Now it is where the TV has it.
    const mkt = doc.getElementById('mkt');
    t.not(mkt.closest('header'), 'the band is no longer inside the header');
    t.is(mkt.parentNode.id, 'app', 'it is a band of its own between the header and the list');
    const kids = [...mkt.parentNode.children].map((n) => n.id || n.tagName.toLowerCase());
    t.ok(kids.indexOf('mkt') < kids.indexOf('searchBar'),
      'above the search box, so opening search does not push the prices into the results');
    t.ok(kids.indexOf('mkt') < kids.indexOf('main'), 'and above the headlines');

    // The whole point: five figures across a phone, on one line. It gets there by
    // shrinking, and then by dropping the percentages while keeping the arrows.
    const box = doc.getElementById('mkt');
    const now = Date.now();
    phone.nd.S.mkt = { at: now,
      wx: { t: 14, icon: 'clear', label: 'Clear', c: '#F7931A', day: true, at: now, from: 'x' },
      btc: { gbp: 74211, chg: 1.23, at: now, from: 'x' },
      gold: { gbp: 2110, usd: 2653, chg: -0.42, at: now, from: 'x' },
      oil: { gbp: 63.42, usd: 79, chg: 0.3, at: now, from: 'x' },
      debt: { gbp: 2.94e12, rate: 4435, at: now }, rate: 0.79 };
    phone.nd.renderMkt();
    t.is(box.children.length, 5, 'all five are drawn');
    t.ok(box.querySelector('.mk b .ar'), 'and each move keeps its arrow');
    t.is(phone.nd.tickerFits(box), true, 'and they fit across one line');
    phone.nd.S.mkt = {};
  });

  suite('A phone buzzes under the thumb', (t) => {
    const c = phone.calls, doc = phone.window.document;
    c.buzzed.length = 0;
    phone.nd.buzz();
    t.same(c.buzzed, ['tap'], 'a press is the default');
    phone.nd.buzz('tick');
    t.same(c.buzzed, ['tap', 'tick'], 'and moving between things is lighter');

    // Everything a thumb can press goes through one place, so nothing is silent
    // and - just as important - nothing buzzes twice for one press.
    c.buzzed.length = 0;
    const tab = doc.querySelector('#tabs .tab');
    t.ok(tab, 'there are tabs to press');
    tab.dispatchEvent(new phone.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    t.is(c.buzzed.length, 1, 'tapping a tab buzzes once');
    t.is(c.buzzed[0], 'tap', 'as a press');

    c.buzzed.length = 0;
    const btn = doc.getElementById('menuBtn');
    btn.dispatchEvent(new phone.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    t.is(c.buzzed.length, 1, 'and so does a button, once');

    // Saving is the one place a different feel earns its keep.
    const save = phone.nd.readerActions({ src: 'ht', id: 'x', title: 'A story',
      summary: '', link: 'https://x/1', date: Date.now() }).filter((a) => a.id === 'save')[0];
    t.ok(save, 'saving is offered');
    t.is(save.buzz, 'confirm', 'and confirms with its own feel, since something changed');
    c.buzzed.length = 0;
  });

  /* The pill counts from the story that was at the top the last time the reader was
     at the top, so the count is read off the list rather than tallied up and kept in
     step with it. */
  suite('The pill counts what arrived above you', (t) => {
    const nd = phone.nd, S = nd.S, doc = phone.window.document, now = Date.now();
    const wrap = doc.getElementById('listWrap');
    const empty = { cw: { items: [] }, kg: { items: [] }, yh: { items: [] },
                    bb: { items: [] }, vf: { items: [] }, lm: { items: [] }, ht: { items: [] } };
    const news = (n, from) => Array.from({ length: n }, (_, i) => story({
      src: 'ht', id: 'ht:' + (from + i), title: 'Story ' + (from + i), date: now - (from + i) * 60e3 }));

    S.mode = 'home';
    S.tab = nd.TABS.findIndex((x) => x.id === 'local');
    S.by = Object.assign({}, empty, { ht: { items: news(6, 10) } });
    wrap.scrollTop = 0;
    nd.rebuild(null);
    t.is(S.top, 'ht:10', 'at the top of the list, the top story is the mark');
    t.is(nd.newAbove(), 0, 'and nothing has arrived above it');

    // The reader goes down the page, and a refresh lands three newer stories.
    wrap.scrollTop = 400;
    S.by.ht.items = news(3, 1).concat(S.by.ht.items);
    nd.rebuild(null);
    t.is(S.top, 'ht:10', 'reading further down, the mark stays where it was');
    t.is(nd.newAbove(), 3, 'and the three that landed above it are counted');
    nd.paintPill();
    t.is(doc.getElementById('newPill').textContent, '\u2191  3 new stories', 'the pill says so');
    t.ok(/\bon\b/.test(doc.getElementById('newPill').className), 'and is on screen');

    // One more lands while the pill is already up.
    S.by.ht.items = news(1, 0).concat(S.by.ht.items);
    nd.rebuild(null);
    t.is(nd.newAbove(), 4, 'another one joins the count rather than replacing it');

    // Tapping it goes to the top, which is what puts it away.
    nd.showNew();
    t.is(wrap.scrollTop, 0, 'tapping the pill goes back to the top');
    t.is(S.top, 'ht:0', 'the newest story is the mark now');
    t.is(nd.newAbove(), 0, 'so nothing is above it');
    nd.paintPill();
    t.is(doc.getElementById('newPill').className, '', 'and the pill is gone');

    // One story, not "1 new stories".
    wrap.scrollTop = 400;
    S.by.ht.items = [story({ src: 'ht', id: 'ht:x', title: 'One more', date: now + 60e3 })].concat(S.by.ht.items);
    nd.rebuild(null);
    nd.paintPill();
    t.is(doc.getElementById('newPill').textContent, '\u2191  1 new story', 'one story reads as one story');

    // A story that leaves the list takes the count with it rather than guessing.
    S.top = 'ht:gone';
    t.is(nd.newAbove(), 0, 'a mark that has dropped out of the list counts nothing');

    // Saving something is not news arriving.
    S.top = 'ht:0';
    S.tab = nd.TABS.findIndex((x) => x.id === 'saved');
    t.is(nd.newAbove(), 0, 'and the Saved tab never shows it');

    // Reading a story is not the moment to shout about four more.
    S.tab = nd.TABS.findIndex((x) => x.id === 'local');
    S.mode = 'reader';
    nd.paintPill();
    t.is(doc.getElementById('newPill').className, '', 'the pill stays down while a story is open');
    S.mode = 'home';
    wrap.scrollTop = 0;
    S.by = empty; S.top = null;
  });

  /* A rebuild drew a hundred and twenty rows and hung a tap handler on every one,
     then threw them all away when the next source landed - nine times over a
     refresh. The list outlives the rows, so the listener lives there instead. */
  suite('One listener for the list, not one per row', (t) => {
    const nd = phone.nd, S = nd.S, doc = phone.window.document, now = Date.now();
    const empty = { cw:{items:[]}, kg:{items:[]}, yh:{items:[]}, bb:{items:[]},
                    vf:{items:[]}, lm:{items:[]} };
    S.mode = 'home';
    S.tab = nd.TABS.findIndex((x) => x.id === 'local');
    S.by = Object.assign({}, empty, { ht: { items: [
      story({ src:'ht', id:'a', title:'The first story', date: now }),
      story({ src:'ht', id:'b', title:'The second story', date: now - 60e3 }),
      story({ src:'ht', id:'c', title:'The third story', date: now - 120e3 }) ] } });
    nd.rebuild(null);

    const rows = doc.querySelectorAll('#list li.row');
    t.is(rows.length, 3, 'three rows are drawn');
    t.same([].map.call(rows, (r) => r.getAttribute('data-i')), ['0', '1', '2'],
      'each says which row of the list it is');

    // A tap lands on the words inside a row, not the row itself.
    const title = rows[1].querySelector('.ttl');
    title.dispatchEvent(new phone.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    t.is(S.mode, 'reader', 'tapping a headline opens the reader');
    t.is(S.reader && S.reader.item.id, 'b', 'on the story that was tapped, not another');
    t.is(S.idx, 1, 'and the list remembers where you were');
    nd.closeReader();

    // rowOf is what finds the row from whatever was actually touched.
    t.is(nd.rowOf(title), rows[1], 'the row is found from the words inside it');
    t.is(nd.rowOf(rows[2]), rows[2], 'and from the row itself');
    t.is(nd.rowOf(doc.getElementById('list')), null, 'the list is not a row');
    t.is(nd.rowOf(null), null, 'and nothing is not a row');

    // A tap on the list but not on a story must not open the last thing tapped.
    S.mode = 'home';
    doc.getElementById('list').dispatchEvent(
      new phone.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    t.is(S.mode, 'home', 'tapping the list itself opens nothing');

    // A row left over from a longer list must not open a story that is no longer there.
    S.by.ht.items = S.by.ht.items.slice(0, 1);
    nd.rebuild(null);
    const stale = doc.createElement('li');
    stale.className = 'row';
    stale.setAttribute('data-i', '9');
    doc.getElementById('list').appendChild(stale);
    S.idx = 0;
    stale.dispatchEvent(new phone.window.MouseEvent('click', { bubbles: true, cancelable: true }));
    t.is(S.mode, 'home', 'a row pointing past the end of the list opens nothing');
    // openReader would refuse the story anyway; what it would not undo is the cursor
    // being moved to a row that is not there, which every later redraw reads.
    t.is(S.idx, 0, 'and does not leave the cursor pointing past the end either');
    S.by = empty;
  });

  /* Nine sources land within a few seconds of each other, and each landing rebuilt
     and redrew the whole list. */
  suite('A refresh redraws the list a few times, not nine', (t) => {
    const nd = phone.nd, doc = phone.window.document;
    const list = doc.getElementById('list');
    // The first landing has to reach the screen at once: the reader is looking at an
    // empty list and wants something on it. rebuild is synchronous, so this is too.
    nd.S.by.ht = { items: [story({ src: 'ht', id: 'first', title: 'The first to land' })] };
    list.innerHTML = '';
    nd.rebuildSoon(null);
    t.is(list.querySelectorAll('li.row').length, 1, 'the first landing draws at once');

    let draws = 0;
    const obs = new phone.window.MutationObserver(() => { draws++; });
    obs.observe(list, { childList: true });
    // Eight more landings inside the same gap, the way a cold start delivers them.
    for (let i = 0; i < 8; i++) nd.rebuildSoon(null);
    t.is(list.querySelectorAll('li.row').length, 1,
      'and the eight behind it do not each redraw on the spot');

    return new Promise((done) => {
      setTimeout(() => {
        obs.disconnect();
        /* innerHTML = '' plus the rows appended is a couple of batches per redraw, so
           this counts redraws generously and still has to be far short of nine. */
        t.ok(draws > 0, 'the gathered ones do land, rather than being lost');
        t.ok(draws <= 6, 'as one redraw rather than eight (' + draws + ' batches)');
        t.is(nd.REBUILD_GAP, 300, 'gathered over three tenths of a second');
        done();
      }, nd.REBUILD_GAP + 220);
    });
  });

  /* Everything the app keeps shares one origin quota, and the page text was four
     fifths of the cache. It is also the one thing in there that can be had again for
     the asking, which a briefing cannot. */
  suite('The cache keeps what cannot be fetched again', (t) => {
    const nd = phone.nd, S = nd.S, ls = phone.window.localStorage;
    const big = '<p>' + 'Recipe step text. '.repeat(900) + '</p>';
    S.by = {
      rc: { items: [story({ src: 'rc', id: 'r1', title: 'A dhal', html: big, image: 'https://x/i.jpg' })],
            method: '2 of 6 kitchens', at: 123, error: '', requests: [{ url: 'u', ok: true, got: 1 }] },
      ht: { items: [story({ src: 'ht', id: 'h1', title: 'A story with no page text' })] }
    };
    const kept = nd.forCache(S.by);
    t.is('html' in kept.rc.items[0], false, 'the page text is not written down');
    t.is(kept.rc.items[0].title, 'A dhal', 'everything else about the story is');
    t.is(kept.rc.items[0].image, 'https://x/i.jpg', 'the picture included, which the list needs');
    t.is(kept.rc.method, '2 of 6 kitchens', 'and what the panel says about the source');
    t.same(kept.rc.requests, [{ url: 'u', ok: true, got: 1 }], 'and what it tried');
    t.is(kept.rc.at, 123, 'and when it answered');
    t.is(kept.ht.items[0].id, 'h1', 'a story that never had page text is untouched');

    // The original is not damaged: the reader is still holding it in memory.
    t.is(S.by.rc.items[0].html, big, 'and the story in hand keeps its text to read');

    // A story without page text is not a dead end: it offers to go and get it.
    t.is(nd.canLoadFull(kept.rc.items[0].link ? kept.rc.items[0] : { link: 'https://example.com/x' }), true,
      'a story with no text still offers the full story');

    // What actually reaches storage.
    nd.saveNow();
    let raw = '';
    try { raw = ls.getItem(nd.CACHE_KEY) || ''; } catch (e) {}
    t.ok(raw.length > 0, 'the cache is written');
    t.not(/Recipe step text/.test(raw), 'with none of the page text in it');
    t.ok(/A dhal/.test(raw), 'and the headlines still there');
    t.ok(raw.length < big.length, 'so the whole cache is smaller than the one recipe was');

    t.same(nd.forCache(null), {}, 'nothing to keep is nothing written');
    t.same(nd.forCache({ ht: null }), { ht: null }, 'and a source that has never answered is left alone');
    S.by = { cw:{items:[]}, kg:{items:[]}, ht:{items:[]}, yh:{items:[]},
             bb:{items:[]}, vf:{items:[]}, lm:{items:[]} };
  });

  /* A story shares as a headline, a taste and a link to the rest. A briefing has no
     link and no rest - it is the whole thing - so four hundred characters of it
     arrived halfway through a sentence with nowhere to go and read the end. */
  suite('A briefing shares whole', (t) => {
    const nd = phone.nd, S = nd.S, c = phone.calls;
    const paras = Array.from({ length: 5 }, (_, i) =>
      'Paragraph ' + (i + 1) + ' of the briefing, which runs to a couple of sentences. '.repeat(3));
    const b = { headline: 'A quiet start, with rain on the way', at: Date.now(),
                slotName: 'Morning briefing', slotKey: 'k', paragraphs: paras };
    const item = nd.briefAsItem(b, 0);
    t.ok(paras.join(' ').length > 400, 'the briefing is longer than a story summary is allowed to be');
    t.is(nd.shareText(item), paras.join('\n\n'), 'all of it goes, in the paragraphs it was written in');

    c.shared.length = 0;
    S.reader = { item, full: false, loading: false, y: 0, act: -1, acts: [] };
    nd.readerActions(item).filter((a) => a.id === 'share')[0].run();
    t.is(c.shared.length, 1, 'sharing it hands it over once');
    t.is(c.shared[0].title, b.headline, 'with the headline as the subject');
    t.is(c.shared[0].text, paras.join('\n\n'), 'and every paragraph of it');
    t.ok(c.shared[0].text.length > 400, 'rather than the first four hundred characters');
    t.ok(/Paragraph 5 /.test(c.shared[0].text), 'the last paragraph included');

    t.is(nd.shareText(null), '', 'nothing shares as nothing');
    t.is(nd.shareText({ brief: { paragraphs: [] }, title: 'A story', summary: 'fallback' }),
      'A story\n\nfallback', 'and a briefing with no paragraphs falls back to what it has');
    S.reader = null; c.shared.length = 0;
  });

  /* What Kotlin makes of the three things it is handed, copied from MainActivity so
     the message a person actually receives is what is being checked here rather than
     the arguments on the way to it. */
  function shareBody(title, text, url) {
    return ((text === '' ? title : text) + (url === '' ? '' : '\n\n' + url)).trim();
  }

  suite('A news article shares as the article', (t) => {
    const nd = phone.nd, S = nd.S, c = phone.calls;
    const send = (it) => {
      c.shared.length = 0;
      S.reader = { item: it, full: false, loading: false, y: 0, act: -1, acts: [] };
      nd.readerActions(it).filter((a) => a.id === 'share')[0].run();
      const s = c.shared[0];
      return { subject: s.title, url: s.url, body: shareBody(s.title, s.text, s.url) };
    };

    const it = story({ src: 'ht', id: 'a',
      title: 'Woman taken to hospital after car crashes into bridge on A49',
      summary: 'Police say the road was shut for several hours. '.repeat(12),
      link: 'https://www.herefordtimes.com/news/12345.a49-crash/' });
    t.ok(it.summary.length > 400, 'the summary is longer than the message used to be');

    const sent = send(it);
    t.is(sent.body, it.title + '\n\n' + it.link,
      'the headline, a blank line, and the address - and nothing else');
    t.ok(sent.body.indexOf(it.link) < 70,
      'so the link is near the top rather than past four hundred characters');
    t.not(/Police say the road/.test(sent.body),
      'the app\'s copy of the opening of somebody else\'s article does not go');
    t.is(sent.subject, it.title, 'the headline is still the subject line as well');
    t.is(sent.url, it.link, 'and the address is handed over as the address');

    // A diary entry is a story with a link like any other.
    const ev = story({ src: 'lm', id: 'e', title: 'Christmas Fayre',
      summary: 'In the square.', when: Date.now() + DAY, link: 'https://example.com/e' });
    t.is(send(ev).body, 'Christmas Fayre\n\nhttps://example.com/e',
      'and so does an event');

    // Nothing to link to: the words are all there is, so they go.
    const noLink = story({ src: 'hh', id: 'h', title: 'A picture of Broad Street, 1904',
      summary: 'From the county archive.', link: '' });
    t.is(send(noLink).body, 'A picture of Broad Street, 1904\n\nFrom the county archive.',
      'a story with nowhere to send you sends what it has');
    t.is(send(story({ src: 'hh', id: 'h2', title: 'Only a headline', summary: '', link: '' })).body,
      'Only a headline', 'and one with only a headline sends that');

    // The briefing is the exception, and stays the exception.
    const paras = ['First paragraph of it.', 'Second paragraph of it.'];
    const brief = nd.briefAsItem({ headline: 'A quiet start', at: Date.now(),
      slotName: 'Morning briefing', slotKey: 'k', paragraphs: paras }, 0);
    t.is(send(brief).body, paras.join('\n\n'),
      'a briefing has no link and no rest, so all of it still goes');

    S.reader = null; c.shared.length = 0;
  });

  /* Breaking had the whole machinery - a seen list, a New tag, a tab that pulses -
     and it was the only tab that used any of it. */
  suite('Every tab counts what you have not read', (t) => {
    const nd = phone.nd, S = nd.S, doc = phone.window.document, now = Date.now();
    const news = (src, n, from) => Array.from({ length: n }, (_, i) => story({
      src, id: src + ':' + (from + i), title: src + ' story ' + (from + i),
      date: now - (from + i) * 60e3 }));
    const base = { cw:{items:[]}, kg:{items:[]}, yh:{items:[]}, bb:{items:[]},
                   vf:{items:[]}, lm:{items:[]}, hh:{items:[]}, rc:{items:[]} };
    const idx = (id) => nd.TABS.findIndex((x) => x.id === id);

    // Everything already read, so the counts start from nothing.
    S.mode = 'home';
    S.by = Object.assign({}, base, { ht: { items: news('ht', 4, 0) }, vf: { items: news('vf', 3, 0) } });
    S.tab = idx('local');
    nd.rebuild(null);
    nd.markAllRead();
    t.is(nd.unseenTotal(), 0, 'with everything read, nothing is counted');

    // Four local stories and two vegan ones arrive.
    S.by.ht.items = news('ht', 4, 100).concat(S.by.ht.items);
    S.by.vf.items = news('vf', 2, 100).concat(S.by.vf.items);
    S.tab = idx('vegan');                      // looking at Vegan, so Vegan is read
    nd.rebuild(null);
    t.is((S.unseen || {}).local, 4, 'Local counts the four that landed on it');
    t.is((S.unseen || {}).vegan, undefined, 'the tab being looked at counts nothing');
    t.ok(nd.unseenTotal() >= 4, 'and the total has them in it');

    // The strip says so, on the tabs you are not on. rebuild has just drawn it.
    const strip = [].map.call(doc.querySelectorAll('#tabs .tab'), (n) => n.textContent).join(' | ');
    t.ok(/Local\s*4/.test(strip), 'the Local tab carries a 4');
    t.ok(doc.querySelectorAll('#tabs .tab .cnt').length >= 1, 'drawn as a count beside the name');
    const onTab = doc.querySelector('#tabs .tab.on');
    t.is(onTab && onTab.querySelector('.cnt'), null, 'and the tab in use carries no number');

    // Going to Local reads it.
    S.tab = idx('local');
    nd.rebuild(null);
    t.is((S.unseen || {}).local, undefined, 'looking at a tab is reading it');
    t.is(doc.querySelectorAll('#list .newtag').length, 4,
      'and the four that were new say so on the row, on a tab that is not Breaking');

    // Moving on clears the New tags, which belonged to the tab you were on.
    nd.switchTab(1);
    t.same(S.fresh, {}, 'the New tags belong to the tab you were on');

    // Mark all read answers the lot.
    S.by.ht.items = news('ht', 5, 200).concat(S.by.ht.items);
    S.tab = idx('vegan');
    nd.rebuild(null);
    t.ok(nd.unseenTotal() > 0, 'more arrives and is counted');
    nd.markAllRead();
    t.is(nd.unseenTotal(), 0, 'and one button answers all of it');
    t.same(S.fresh, {}, 'taking the New tags with it');

    // The button is only offered when there is something to answer.
    const has = () => nd.sheetActs().some((a) => /mark all read/i.test(
      typeof a.label === 'function' ? a.label() : a.label));
    t.not(has(), 'with nothing unread, the panel does not offer to mark it');
    S.by.ht.items = news('ht', 3, 300).concat(S.by.ht.items);
    S.tab = idx('vegan');
    nd.rebuild(null);
    t.ok(has(), 'and offers it as soon as there is something');
    nd.markAllRead();

    /* A tab draws 120 rows but may match more than that, so its count can be more
       than nothing even while you are looking at it. It still does not badge the tab
       you are looking at. */
    S.by.ht.items = news('ht', 400, 1000);
    S.tab = idx('local');
    nd.rebuild(null);
    const localTab = [].filter.call(doc.querySelectorAll('#tabs .tab'),
      (n) => /Local/.test(n.textContent))[0];
    t.ok(localTab && /\bon\b/.test(localTab.className), 'Local is the tab in use');
    t.is((S.unseen || {}).local, undefined,
      'looking at a tab reads all of it, not just the rows it drew');
    t.is(localTab.querySelector('.cnt'), null, 'so it carries no count');
    nd.markAllRead();
    S.by = base;
  });

  /* The prune kept only the list it had just marked, so one long tab wiped the
     record of every other one and stories you had read came back as unread. */
  suite('Reading one long tab does not forget the others', (t) => {
    const nd = phone.nd, S = nd.S, now = Date.now();
    const many = (src, n) => Array.from({ length: n }, (_, i) => story({
      src, id: src + ':p' + i, title: src + ' ' + i, date: now - i * 60e3 }));
    S.by = { cw:{items:[]}, kg:{items:many('kg', 400)}, ht:{items:many('ht', 400)},
             yh:{items:[]}, bb:{items:[]}, vf:{items:[]}, lm:{items:[]}, hh:{items:[]}, rc:{items:[]} };
    S.seen = {};
    nd.markSeen(nd.getAll());
    t.ok(Object.keys(S.seen).length > nd.SEEN_MAX, 'more has been read than the cap holds');

    // Now read one tab's worth, which is what used to trigger the prune.
    nd.markSeen(S.by.ht.items);
    t.ok(Object.keys(S.seen).length <= nd.SEEN_MAX + S.by.ht.items.length,
      'the record is pruned rather than growing for ever');
    const keptOther = S.by.kg.items.filter((it) => S.seen[it.id]).length;
    t.ok(keptOther > 0, 'and the other tab keeps its record (' + keptOther + ' of 400)');
    t.is(S.by.ht.items.filter((it) => !S.seen[it.id]).length, 0,
      'while everything just read stays read');
    S.by = { cw:{items:[]}, kg:{items:[]}, ht:{items:[]}, yh:{items:[]},
             bb:{items:[]}, vf:{items:[]}, lm:{items:[]}, hh:{items:[]}, rc:{items:[]} };
    S.seen = {};
  });

  /* The list is drawn in two goes - a screenful now, the rest a tick later - and a
     section header belongs to the row it starts at. Resuming part way has to know
     which headers are already behind it, or every one of them lands again on top of
     the tail. Today's sections all start inside the first screenful, so the only way
     to prove the resume is to ask for it. */
  suite('Drawing a list in two goes puts each header once', (t) => {
    const nd = phone.nd, S = nd.S, doc = phone.window.document;
    const ol = doc.getElementById('list');
    S.mode = 'home';
    S.tab = nd.TABS.findIndex((x) => x.id === 'today');
    S.view = Array.from({ length: 12 }, (_, i) => story({ src: 'ht', id: 'v' + i, title: 'Story ' + i }));
    S.sections = [{ start: 0, title: 'First' }, { start: 4, title: 'Second' },
                  { start: 9, title: 'Third', note: 'a note' }];

    const draw = (splits) => {
      ol.innerHTML = '';
      let from = 0;
      splits.concat([S.view.length]).forEach((to) => { nd.drawRows(ol, from, to); from = to; });
      return [].map.call(ol.children, (n) => n.className.split(' ')[0] + ':' +
        (/\bsec\b/.test(n.className) ? n.querySelector('.sec-t').textContent : n.getAttribute('data-i')));
    };

    const whole = draw([]);
    t.same(whole.filter((x) => /^sec:/.test(x)), ['sec:First', 'sec:Second', 'sec:Third'],
      'drawn in one go, each header appears once');

    // The same list drawn in two goes, split in the middle of a section.
    t.same(draw([6]), whole, 'split part way through a section, it comes out identical');
    // And split exactly on a header, which is the case that could draw it twice.
    t.same(draw([4]), whole, 'split exactly where a header starts, still identical');
    t.same(draw([9]), whole, 'and on the last header too');
    // Split more than once, since a slow list could be filled in several passes.
    t.same(draw([3, 7, 10]), whole, 'and in four goes it is still the same list');

    // The headers really are where they belong: immediately above their row.
    const at = whole.indexOf('sec:Second');
    t.is(whole[at + 1], 'row:4', 'a header sits directly above the row it names');
    t.is(whole.filter((x) => /^row:/.test(x)).length, 12, 'and every row is drawn once');

    S.sections = [];
    S.view = [];
    ol.innerHTML = '';
  });

  suite('What you can do with a story, on a phone', (t) => {
    const S = phone.nd.S;
    S.saved = [];
    const ev = { src: 'lm', id: 'lm:1', title: 'Christmas Fayre', summary: 'In the square.',
                 when: Date.now() + DAY, link: 'https://example.com/e', date: Date.now() };
    const news = { src: 'ht', id: 'ht:2', title: 'Road closed', summary: 'The A49.',
                   link: 'https://example.com/a', date: Date.now() };
    const ids = (it, full) => {
      S.reader = { item: it, full: !!full, loading: false, y: 0, act: -1, acts: [] };
      return phone.nd.readerActions(it).map((a) => a.id);
    };
    t.same(ids(news), ['full', 'save', 'share'], 'a phone can share a story');
    t.same(ids(ev), ['full', 'save', 'share', 'cal'],
      'and put an event in the calendar, since it knows when it is');
    const undated = Object.assign({}, ev, { when: 0 });
    t.same(ids(undated), ['full', 'save', 'share'],
      'but not one whose date could not be read, which would only guess');
    S.reader = null; S.saved = [];
  });

  /* All three routes at once, through the real loader: the county archive is a third
     source of history, not a replacement for the other two, and the tab has to end up
     holding all of it in a sensible order. */
  const hist = await boot({
    settle: 1400,
    reply(url) {
      if (/wbsearchentities/.test(url)) {
        // What the search actually answers: the historic county leads.
        return { ok: true, body: JSON.stringify({ search: [
          { id: 'Q67531905', description: 'historic county of England' },
          { id: 'Q23129', description: 'ceremonial county and unitary authority area in England' },
          { id: 'Q8508759', description: 'Wikimedia category' }] }) };
      }
      if (/query\.wikidata\.org/.test(url)) {
        return { ok: true, body: JSON.stringify({ results: { bindings: [{
          itemLabel: { value: 'Nell Gwyn' }, year: { value: '1650' },
          kind: { value: 'Born' }, itemDescription: { value: 'English actress' },
          item: { value: 'http://www.wikidata.org/entity/Q235719' } }] } }) };
      }
      if (/onthisday/.test(url)) {
        return { ok: true, body: JSON.stringify({ events: [{
          text: 'The Wye Valley railway opened in Herefordshire.', year: 1876,
          pages: [{ extract: 'A line through the Wye Valley.',
                    content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Wye_Valley_Railway' } } }] }] }) };
      }
      if (/herefordshirehistory\.org\.uk/.test(url)) {
        /* Whichever collection the day picks, it answers with pictures on its own
           page, so there is no shelf to follow and these checks do not depend on
           which day they are run. Four is under HHA_KEEP, so the day's window takes
           the lot. Catalogue numbers are seven figures, as the archive's are. */
        const at = url.replace(/\?$/, '');
        return { ok: true, body: [1, 2, 3].map((i) =>
          `<a class="archive-item-link" href="${at}/165801${i}-a-picture-of-${i}">`
          + `<img src="/img/t${i}" alt="">`
          + `<div class="archive-item-title">A picture of ${i}${i === 1 ? ', 1904' : ''}</div></a>`).join('')
          + `<a class="archive-item-link" href="${at}/1658099-the-old-house">The Old House, 1621</a>`
          /* The archive catalogues twenty-four photographs of Church Street as
             twenty-four photographs of Church Street. As rows they read as the same
             row over and over. */
          + [7, 8, 9].map((i) =>
            `<a class="archive-item-link" href="${at}/165802${i}-church-street-hereford">`
            + `Church Street, Hereford</a>`).join('') };
      }
      return null;
    }
  });

  suite('The county archive joins the other two', (t) => {
    const hh = hist.nd.S.by.hh || {};
    const items = hh.items || [];
    t.ok(items.length > 0, 'the History tab has something in it');
    t.ok(/Wikidata/.test(hh.method || ''), 'and says Wikidata is one of its sources');
    t.ok(/Wikipedia/.test(hh.method || ''), 'and Wikipedia another');
    t.ok(/county archive/.test(hh.method || ''), 'and the county archive the third');

    const titles = items.map((x) => x.title);
    t.ok(titles.indexOf('Nell Gwyn') >= 0, 'somebody Wikidata knows was born here');
    t.ok(titles.some((x) => /Wye Valley railway/.test(x)), 'something Wikipedia has for the day');
    t.ok(titles.some((x) => /A picture of/.test(x)), 'and pictures from the archive');

    /* One collection, chosen by the day, and it had pictures on it - so that is the
       only thing asked for. The archive is a county library's, not a newsroom's. */
    const asked = hist.calls.fetched.filter((u) => /herefordshirehistory/.test(u));
    t.is(asked.length, 1, 'one page is asked for, not all of them');
    t.ok(hist.nd.HHA_ROOTS.indexOf(asked[0]) >= 0, 'and it is one of the collections it knows');

    // Four distinct pictures, each once.
    t.is(titles.filter((x) => /The Old House/.test(x)).length, 1, 'each picture lands once');
    t.is(titles.filter((x) => /A picture of|The Old House/.test(x)).length, 4,
      'and all four of them are there');
    t.is(titles.filter((x) => /Church Street/.test(x)).length, 1,
      'and three photographs catalogued under one caption read as one row, not three');

    // Dated things read in order; the archive's undated pictures follow rather than
    // leading the tab from the year nought.
    const years = items.map((x) => x.year || 0);
    const dated = years.filter((y) => y);
    t.same(dated.slice(), dated.slice().sort((a, b) => a - b), 'the dated rows read oldest first');
    const firstBlank = years.indexOf(0);
    t.ok(firstBlank === -1 || years.slice(firstBlank).every((y) => !y),
      'and nothing dated comes after something undated');
    t.is(items[0].year, 1621, 'so the oldest thing here leads');

    // A row has to be readable: a year on it if there is one, and a picture where there is one.
    const pic = items.filter((x) => /A picture of 1,/.test(x.title))[0];
    t.ok(pic, 'the catalogued picture is there');
    t.is(pic.year, 1904, 'with the year off its title');
    t.is(hist.nd.timeLabel(pic), '1904', 'which is what the row shows where a story shows its age');
    const undated = items.filter((x) => /A picture of 2$/.test(x.title))[0];
    t.is(hist.nd.timeLabel(undated), '', 'and an undated picture shows nothing rather than a guess');
  });

  /* A county library's server is not a newsroom's. One listing page being down, or
     slow enough to time out, must cost that page's items and nothing else - not the
     other two, and not the two national routes beside them. A reply that throws is
     how a timed-out fetch reaches the loader. */
  const halfDown = await boot({
    settle: 1400,
    reply(url) {
      if (/wbsearchentities/.test(url)) {
        return { ok: true, body: JSON.stringify({ search: [
          { id: 'Q23124', description: 'ceremonial county of England' }] }) };
      }
      if (/query\.wikidata\.org/.test(url)) {
        return { ok: true, body: JSON.stringify({ results: { bindings: [{
          itemLabel: { value: 'Nell Gwyn' }, year: { value: '1650' },
          kind: { value: 'Born' }, item: { value: 'http://www.wikidata.org/entity/Q235719' } }] } }) };
      }
      if (/onthisday/.test(url)) return { ok: true, body: '{}' };
      /* The collection the day picks turns out to be a shelf of shelves, and the
         shelf taken down from it is the thing that is broken. The collection itself
         answered perfectly: it held the way on rather than the pictures. */
      if (/herefordshirehistory\.org\.uk/.test(url)) {
        if (/\/a-shelf-of-pictures/.test(url)) return { ok: false, status: 503, body: '' };
        const at = url.replace(/\?$/, '');
        return { ok: true, body:
          `<a class="archive-collection-link" href="${at}/a-shelf-of-pictures">A shelf of pictures</a>` };
      }
      /* Two kitchens: one serving dinner, one whose feed is working perfectly and has
         nothing on it but a giveaway. The second is the case that used to be
         invisible - it answered, so it was not a failure, and it gave nothing, so it
         was not a source either. */
      if (/minimalistbaker/.test(url)) return { ok: true, body: rss('A one-pot lentil dhal') };
      if (/deliciouslyella/.test(url)) return { ok: true, body: rss('Win a blender in our giveaway') };
      if (/transport/.test(url)) {
        return { ok: true, body: [1, 2, 3].map((i) =>
          `<a href="/view/30${i}-a-transport-picture-${i}">A transport picture ${i}</a>`).join('') };
      }
      return null;
    }
  });

  suite('A shelf being down costs the archive and nothing else', (t) => {
    const hh = halfDown.nd.S.by.hh || {};
    const titles = (hh.items || []).map((x) => x.title);
    t.ok(titles.indexOf('Nell Gwyn') >= 0, 'the national routes beside it are untouched');
    t.not(hh.error, 'and the tab is not in error over it');
    t.not(/county archive/.test(hh.method || ''),
      'the archive is not named as a source, since it gave nothing');

    // Two requests: the collection, then the shelf taken down from it.
    const asked = (hh.requests || []).filter((r) => /herefordshirehistory/.test(r.url));
    t.is(asked.length, 2, 'the collection was asked for, and then one shelf of it');
    const top = asked[0], shelf = asked[1];
    t.is(top.ok, true, 'the collection answered');
    t.is(top.got, 0, 'with no pictures of its own');
    t.ok(/a-shelf-of-pictures$/.test(shelf.url), 'so a shelf was taken down from it');
    t.is(shelf.ok, false, 'and that is the thing that was broken');

    /* A collection holding no pictures is what a collection of collections looks
       like, not a page that failed. Having led somewhere, it is not something the
       panel should be reporting. */
    const quiet = halfDown.nd.quietReqs(hh).map((x) => x.url);
    t.not(quiet.some((u) => u === top.url),
      'the collection is not listed as having gone quiet - it led the way on');
    t.ok(quiet.some((u) => /a-shelf-of-pictures$/.test(u)),
      'while the shelf that would not answer is');
    t.ok(halfDown.nd.quietReqs(hh).some((r) => /503|HTTP/.test(halfDown.nd.reqLine(r))),
      'with what went wrong beside it');
  });

  /* Wikidata has more than one Herefordshire and only one of them is any use. The
     tab was asking the historic county what it contained - nothing records itself as
     being in a county that has stopped existing - and had written that choice down,
     so it answered nothing every day until somebody looked at the panel. */
  suite('Which Herefordshire is asked', (t) => {
    const pick = (hits) => nd.hhQidFrom(hits);
    // The order the search really answers in
    t.is(pick([{ id: 'Q67531905', description: 'historic county of England' },
               { id: 'Q23129', description: 'ceremonial county and unitary authority area in England' }]),
      'Q23129', 'the county as it is now, not the one that used to be');
    t.is(pick([{ id: 'Q67531905', description: 'historic county of England' }]), '',
      'and nothing at all rather than the historic one on its own');
    ['former county', 'traditional county of England', 'ancient county',
     'proposed county', 'abolished county'].forEach((d) => {
      t.is(pick([{ id: 'Q1', description: d }]), '', 'nor a county described as ' + d);
    });
    t.is(pick([{ id: 'Q1', description: 'county of England' }]), 'Q1',
      'a plain county will do if nothing better is offered');
    t.is(pick([{ id: 'Q1', description: 'county of England' },
               { id: 'Q2', description: 'unitary authority area in England' }]), 'Q2',
      'but what it is today is taken first, whatever the order');
    t.is(pick([{ id: 'Q8508759', description: 'Wikimedia category' },
               { id: 'Q51402437', description: 'Wikimedia module' }]), '',
      'a category is not a place');
    t.is(pick([{ id: 'not-a-qid', description: 'ceremonial county' }]), '',
      'and an id that is not one is not followed');
    t.is(pick([]), '', 'an answer with nothing in it picks nothing');
    t.is(pick(null), '', 'as does no answer at all');

    // The two constants this went wrong on.
    t.is(nd.HH_QID_DEFAULT, 'Q23129', 'the fallback is Herefordshire, not the West Midlands');
    t.is(nd.HH_QID_KEY, 'nd.hhqid.v2',
      'and the key moved on, so a phone that wrote down the wrong one forgets it');
  });

  suite('The county it actually asks about', (t) => {
    // End to end: the search answers historic-first and the query still goes to the
    // right county, which is the whole of what went wrong.
    const asked = hist.calls.fetched.filter((u) => /query\.wikidata\.org/.test(u));
    t.is(asked.length, 1, 'the county is asked once');
    t.ok(/Q23129/.test(asked[0]), 'about the county as it is now');
    t.not(/Q67531905/.test(asked[0]), 'and never about the one that stopped existing');
    const line = ((hist.nd.S.by.hh || {}).requests || [])
      .filter((r) => /wikidata/.test(r.url))[0];
    t.ok(line && /Q23129/.test(line.url), 'and the panel names the one it asked');
  });

  /* A source with three routes behind it can lose two and still look well: the tab
     has stories in it and the line above says where they came from. Which is how the
     archive could answer with nothing for a week without the panel ever saying so. */
  suite('The panel says what answered with nothing', (t) => {
    t.is(nd.reqLine({ url: 'https://herefordshirehistory.org.uk/archive', ok: true, status: 200, got: 0 }),
      'herefordshirehistory.org.uk/archive - answered with nothing',
      'a page that worked and gave nothing says so');
    t.is(nd.reqLine({ url: 'https://herefordshirehistory.org.uk/archive', ok: false, status: 404 }),
      'herefordshirehistory.org.uk/archive - HTTP 404', 'a page that was not there says that instead');
    t.is(nd.reqLine({ url: 'https://www.example.com/x', ok: false, status: 0, error: 'Timed out' }),
      'example.com/x - Timed out', 'and one that never answered says what went wrong');
    t.is(nd.reqLine('a plain string the coin source uses'), 'a plain string the coin source uses',
      'the one source that lists every address it asks for is left as it was');

    const quiet = nd.quietReqs({ requests: [
      { url: 'a', ok: true, status: 200, got: 3 },
      { url: 'b', ok: true, status: 200, got: 0 },
      { url: 'c', ok: false, status: 500 },
      { url: 'd', ok: true, status: 200 },
      'a plain string'
    ] });
    t.same(quiet.map((x) => x.url), ['b', 'c'],
      'only the ones that failed or came back empty are worth the room');
    t.same(nd.quietReqs({}), [], 'a source that has not been asked yet lists nothing');
    t.same(nd.quietReqs({ requests: [{ url: 'a', ok: true, got: 2 }] }), [],
      'and one where everything worked says nothing at all');
  });

  suite('Every route of the History tab reports its tally', (t) => {
    // Without a count, a route that answered with nothing is indistinguishable from
    // one that was never asked - which is exactly the state this went out in.
    const reqs = (hist.nd.S.by.hh || {}).requests || [];
    t.ok(reqs.length >= 3, 'every route it asked is accounted for');
    t.ok(reqs.every((r) => typeof r.got === 'number'), 'and every one of them counted what it got');
    t.same(hist.nd.quietReqs(hist.nd.S.by.hh), [],
      'on a day when all three answer, the panel has nothing to report');

    // The day the archive answers with nothing, the panel names what did not answer.
    const halfReqs = (halfDown.nd.S.by.hh || {}).requests || [];
    const named = halfDown.nd.quietReqs(halfDown.nd.S.by.hh).map((x) => x.url);
    t.ok(named.some((u) => /a-shelf-of-pictures$/.test(u)), 'the shelf that would not answer is named');
    t.not(named.some((u) => /a-shelf-of-pictures$/.test(u) === false && /herefordshirehistory/.test(u)),
      'and the collection that led to it is not, having led somewhere');
    t.ok(halfReqs.some((r) => /onthisday/.test(r.url) && r.got === 0),
      'a national route that simply had a quiet day is counted too');

    // And it has to reach the panel, not just the state behind it.
    halfDown.window.nd.key('menu');
    const panel = halfDown.window.document.getElementById('sheetBody').textContent;
    t.ok(/Nothing came from:/.test(panel), 'the panel says so in as many words');
    t.ok(/a-shelf-of-pictures - HTTP 503/.test(panel),
      'naming the shelf and what happened to it');

    /* A kitchen whose feed works and has nothing on it but a giveaway answered, so it
       was not a failure, and gave nothing, so it was not a source. It used to be
       invisible in both directions. */
    const rc = halfDown.nd.S.by.rc || {};
    t.ok(/1 of 6 kitchens/.test(rc.method || ''), 'one kitchen served dinner');
    const rcQuiet = halfDown.nd.quietReqs(rc).map((x) => halfDown.nd.reqLine(x));
    t.ok(rcQuiet.some((l) => /deliciouslyella\.com\/feed\/ - answered with nothing/.test(l)),
      'and the one with nothing but a giveaway on it says so');
    t.not(rcQuiet.some((l) => /minimalistbaker/.test(l)), 'while the one that worked does not');
    t.ok(/deliciouslyella\.com\/feed\/ - answered with nothing/.test(panel),
      'which reaches the panel as well as the state behind it');
    halfDown.window.nd.key('menu');
  });

  return run('Newsdesk logic').then(() => {
    close();                       // stop the page's clock, or node never gets to exit
    phone.close();
    hist.close();
    halfDown.close();
  });
}).catch((e) => {
  console.error(e && e.stack || e);
  process.exit(1);
});
