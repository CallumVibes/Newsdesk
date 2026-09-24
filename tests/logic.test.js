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
const { suite, run } = require('./lib/check');

const HOUR = 3600e3, DAY = 24 * HOUR;

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
    const at = (h) => { const d = new Date(); d.setHours(h, 0, 0, 0); return d.getTime(); };
    t.same(nd.BRIEF_SLOTS.map((s) => s.from), [5, 12, 17],
      'three editions a day, at the hours the background job also uses');
    t.is(nd.briefSlot(at(7)).slot.id, 'morning', 'the morning edition covers the morning');
    t.is(nd.briefSlot(at(13)).slot.id, 'afternoon', 'the afternoon one the afternoon');
    t.is(nd.briefSlot(at(19)).slot.id, 'evening', 'and the evening one the evening');
    t.is(nd.briefSlot(at(2)).slot.id, 'evening', 'the small hours still belong to last night\'s');
    t.not(nd.briefSlot(at(2)).key === nd.briefSlot(at(19)).key,
      'but under the previous day, so 2am does not count as tonight\'s');
    t.is(nd.briefSlot(at(7)).key, nd.briefSlot(at(11)).key,
      'and one edition is written once, however often the app refreshes');
    t.ok(/morning|afternoon|evening/.test(nd.nextSlotName()), 'the app can say which is next');
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

    // The panel is where you change it, on either device.
    const flip = nd.SHEET_ACTS[nd.SHEET_ACTS.length - 1];
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

  return run('Newsdesk logic').then(() => {
    close();                       // stop the page's clock, or node never gets to exit
    phone.close();
  });
}).catch((e) => {
  console.error(e && e.stack || e);
  process.exit(1);
});
