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
    t.ok(nd.TABS.length === 8, 'has its eight tabs');
    t.same(nd.TABS.map((x) => x.id),
      ['breaking', 'today', 'local', 'world', 'tech', 'coin', 'vegan', 'all'],
      'in the order the remote walks them');
    t.same(nd.ORDER, ['cw', 'kg', 'ht', 'yh', 'bb', 'vf', 'lm'], 'knows its seven sources');
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

  suite('Where the chip goes on a television', (t) => {
    const S = nd.S, doc = window.document;
    S.mkt = { at: Date.now(), wx: { t: 14, icon: 'clear', label: 'Clear', c: '#E8C35A',
                                    day: true, at: Date.now(), from: 'open-meteo' } };
    nd.renderMkt();
    const inBand = doc.querySelector('#mkt .wx');
    t.ok(inBand, 'on a TV the weather leads the band of prices');
    t.ok(/14/.test(inBand.textContent), 'carrying the temperature');
    t.ok(inBand.querySelector('svg'), 'and an icon drawn rather than typed');
    t.is(doc.getElementById('wx').children.length, 0,
      'and the phone\'s slot under the name stays empty');
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
  suite('Where the chip goes on a phone', (t) => {
    const doc = phone.window.document;
    phone.nd.S.mkt = { at: Date.now(), wx: { t: 9, icon: 'rain', label: 'Rain', c: '#7FB5E8',
                                             day: true, at: Date.now(), from: 'open-meteo' } };
    phone.nd.renderMkt();
    const under = doc.querySelector('#wx .wx');
    t.ok(under, 'on a phone the weather sits under the name');
    t.ok(/9/.test(under.textContent), 'with the temperature');
    t.ok(under.querySelector('svg'), 'and its icon');
    // Four prices fill the phone's two-by-two block exactly. A fifth pushed it to
    // three rows and clipped the others, which is why the chip lives elsewhere.
    t.not(doc.querySelector('#mkt .wx'), 'and never in the price band, which has no room for it');
  });

  return run('Newsdesk logic').then(() => {
    close();                       // stop the page's clock, or node never gets to exit
    phone.close();
  });
}).catch((e) => {
  console.error(e && e.stack || e);
  process.exit(1);
});
