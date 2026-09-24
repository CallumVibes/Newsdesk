/*
 * The structural gate. Nothing installed, nothing booted: it reads the unpacked
 * project as text and checks the things a broken build would only tell you about
 * twenty minutes later, plus the handful of facts that live in two files at once
 * and have to agree.
 *
 *   node tests/check-source.js "$(tests/unpack.sh)"
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { suite, run } = require('./lib/check');

const dir = path.resolve(process.argv[2] || process.env.NEWSDESK_DIR || '');
if (!process.argv[2] && !process.env.NEWSDESK_DIR) {
  console.error('Give me the unpacked project directory. Run tests/unpack.sh first.');
  process.exit(2);
}
const read = (p) => fs.readFileSync(path.join(dir, p), 'utf8');
const has = (p) => fs.existsSync(path.join(dir, p));

const KT = 'app/src/main/java/com/callum/newsdesk/';
const PAGE = 'app/src/main/assets/index.html';

suite('Everything the build needs is there', (t) => {
  [ 'settings.gradle.kts', 'build.gradle.kts', 'gradle.properties',
    'app/build.gradle.kts', 'app/newsdesk.keystore',
    'app/src/main/AndroidManifest.xml',
    PAGE, 'app/src/main/assets/config.js', 'app/src/main/assets/extract.js',
    KT + 'MainActivity.kt', KT + 'Net.kt', KT + 'Briefings.kt',
    'app/src/main/res/drawable/icon.png', 'app/src/main/res/drawable/banner.png',
    'app/src/main/res/drawable/notify.png'
  ].forEach((f) => t.ok(has(f), f + ' is in the tarball'));
});

suite('The JavaScript parses', (t) => {
  const page = read(PAGE);
  const blocks = page.match(/<script(?![^>]*\ssrc=)[^>]*>([\s\S]*?)<\/script>/g) || [];
  t.ok(blocks.length >= 1, 'the page carries script of its own');
  blocks.forEach((b, i) => {
    const body = b.replace(/^<script[^>]*>/, '').replace(/<\/script>$/, '');
    let err = null;
    try { new vm.Script(body, { filename: PAGE + ' block ' + (i + 1) }); } catch (e) { err = e.message; }
    t.is(err, null, 'block ' + (i + 1) + ' of the page parses');
  });
  ['app/src/main/assets/config.js', 'app/src/main/assets/extract.js'].forEach((f) => {
    let err = null;
    try { new vm.Script(read(f), { filename: f }); } catch (e) { err = e.message; }
    t.is(err, null, f + ' parses');
  });
});

suite('The test seam stays a door, not a hole', (t) => {
  const page = read(PAGE);
  t.ok(/if \(window\.__ndTestHook\) window\.__ndTestHook\(\{/.test(page),
    'the seam is there for the logic tests to come through');
  // One line of code, and it is that one. Anything else means the tests have started
  // reaching in somewhere the app does not know about.
  const live = page.split('\n').filter((l) => /__ndTestHook/.test(l) && !/^\s*(\/\/|\/\*|\*)/.test(l));
  t.is(live.length, 1, 'and exactly one line of code mentions it');
  const at = page.indexOf('__ndTestHook');
  t.ok(page.slice(at).indexOf('})();') > 0, 'and it sits inside the page\'s own closure');
});

suite('The briefing hours agree in both languages', (t) => {
  // BRIEF_SLOTS drives the app; HOURS drives the job that wakes it. They are the
  // same three times, written twice, in two languages that never see each other.
  const page = read(PAGE);
  const slots = page.slice(page.indexOf('var BRIEF_SLOTS'), page.indexOf('var BRIEF_MAX_PER_DAY'));
  const js = (slots.match(/from:\s*(\d+)/g) || []).map((m) => parseInt(m.split(':')[1], 10));
  const ktLine = read(KT + 'Briefings.kt').match(/val HOURS = intArrayOf\(([^)]*)\)/);
  t.ok(ktLine, 'the job declares the hours it runs at');
  const kt = ktLine ? ktLine[1].split(',').map((x) => parseInt(x.trim(), 10)) : [];
  t.ok(js.length === 3, 'the app has three editions a day');
  t.same(js, kt, 'and the job wakes at exactly those hours');
  t.ok(js.every((h, i) => i === 0 || h > js[i - 1]), 'given in order, as briefSlot assumes');
});

suite('The bridge the page calls is the bridge Kotlin offers', (t) => {
  const page = read(PAGE);
  const used = Array.from(new Set((page.match(/Native\.([a-zA-Z]+)\s*\(/g) || [])
    .map((m) => m.replace(/Native\./, '').replace(/\s*\($/, ''))));
  t.ok(used.length >= 6, 'the page uses a bridge at all');
  const declared = (kt) => new Set((read(KT + kt).match(/fun ([a-zA-Z]+)\s*\(/g) || [])
    .map((m) => m.replace(/^fun /, '').replace(/\s*\($/, '')));
  const job = declared('Briefings.kt');
  used.forEach((n) => t.ok(job.has(n), 'the briefing job answers Native.' + n));
  // The foreground app has no briefDone to give; the page has to ask before calling
  // anything the running build might not have.
  const main = declared('MainActivity.kt');
  used.filter((n) => !main.has(n)).forEach((n) => {
    t.ok(new RegExp('window\\.Native\\.' + n + '\\b\\s*\\)').test(page) ||
         new RegExp('Native\\.' + n + '\\b\\s*&&').test(page),
      'Native.' + n + ' is not in the app\'s own bridge, so the page checks for it first');
  });
});

suite('The manifest says what the app actually does', (t) => {
  const m = read('app/src/main/AndroidManifest.xml');
  ['INTERNET', 'RECEIVE_BOOT_COMPLETED', 'POST_NOTIFICATIONS'].forEach((p) => {
    t.ok(m.indexOf('android.permission.' + p) > 0, 'it asks for ' + p);
  });
  t.ok(/<service[\s\S]{0,200}\.BriefingJob[\s\S]{0,200}BIND_JOB_SERVICE/.test(m),
    'the briefing job is declared, with the permission JobScheduler insists on');
  t.ok(m.indexOf('LEANBACK_LAUNCHER') > 0, 'it still appears on the Fire TV home screen');
  t.ok(m.indexOf('category.LAUNCHER') > 0, 'and in the phone\'s app drawer');
  t.ok(/android:resizeableActivity="true"/.test(m), 'and it resizes, for split screen on a phone');
  t.not(/screenOrientation="(landscape|sensorLandscape)"/.test(m),
    'and is not locked to landscape, which is what broke it on a phone');
  t.ok(/leanback"\s+android:required="false"/.test(m), 'leanback is optional, so phones can install it');
  t.ok(/touchscreen"\s+android:required="false"/.test(m), 'and so is a touchscreen, so TVs can');
});

suite('The build stays the build we can reason about', (t) => {
  const app = read('app/build.gradle.kts'), props = read('gradle.properties');
  t.ok(/android\.useAndroidX=false/.test(props), 'AndroidX stays off');
  // Zero dependencies is a deliberate constraint, not an oversight: it is why the
  // briefings run on JobScheduler rather than WorkManager. Change it on purpose.
  t.not(/^\s*dependencies\s*\{[\s\S]*?implementation/m.test(app),
    'and the app still ships with no dependencies at all');
  t.ok(/minSdk = 22/.test(app), 'it still installs on the old Fire TV sticks');
  t.ok(/compileSdk = 34/.test(app) && /targetSdk = 34/.test(app), 'and targets a current Android');
  t.ok(/jvmTarget = "17"/.test(app), 'on the Java the workflow sets up');
  t.ok(/storeFile = file\("newsdesk\.keystore"\)/.test(app),
    'and signs with the fixed key, so each build installs over the last');
});

suite('No key is committed', (t) => {
  const cfg = read('app/src/main/assets/config.js');
  t.ok(/ppqKey:\s*""/.test(cfg), 'config.js ships with an empty key, filled in from the secret');
  const page = read(PAGE);
  t.not(/sk-[A-Za-z0-9]{16,}/.test(page + cfg), 'and nothing that looks like one is in the source');
});

run('Newsdesk source');
