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
    'app/src/main/assets/manifest.webmanifest', 'app/src/main/assets/sw.js',
    'app/src/main/assets/icon-192.png', 'app/src/main/assets/icon-512.png',
    KT + 'MainActivity.kt', KT + 'Net.kt', KT + 'Briefings.kt',
    KT + 'Widget.kt',
    'app/src/main/res/drawable/icon.png', 'app/src/main/res/drawable/banner.png',
    'app/src/main/res/drawable/notify.png', 'app/src/main/res/drawable/widget_bg.xml',
    'app/src/main/res/drawable-v31/widget_bg.xml', 'app/src/main/res/values/strings.xml',
    'app/src/main/res/xml/briefing_widget.xml',
    'app/src/main/res/layout/widget_briefing.xml', 'app/src/main/res/layout/widget_paragraph.xml',
    'app/src/main/res/layout/widget_preview.xml'
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
  ['app/src/main/assets/config.js', 'app/src/main/assets/extract.js',
   'app/src/main/assets/sw.js'].forEach((f) => {
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

suite('The briefing times agree in both languages', (t) => {
  /* BRIEF_SLOTS drives the app; SLOTS drives the job that wakes it. They are the
     same times, written twice, in two languages that never see each other - and
     since one of them is half past nine, both have to be read to the minute. An
     hour was fine enough until it wasn't. */
  const page = read(PAGE);
  const block = page.slice(page.indexOf('var BRIEF_SLOTS'), page.indexOf('function slotMins'));
  const js = block.split(/\{\s*id:/).slice(1).map((chunk) => {
    const from = (chunk.match(/from:\s*(\d+)/) || [])[1];
    const min = (chunk.match(/min:\s*(\d+)/) || [])[1];
    return from == null ? NaN : parseInt(from, 10) * 60 + parseInt(min || '0', 10);
  });
  const ktLine = read(KT + 'Briefings.kt').match(/val SLOTS = intArrayOf\(([^)]*)\)/);
  t.ok(ktLine, 'the job declares the times it runs at');
  // "5 * 60", "21 * 60 + 30", or a plain number. Nothing else is allowed to appear.
  const kt = ktLine ? ktLine[1].split(',').map((x) => {
    const m = x.trim().match(/^(\d+)(?:\s*\*\s*60)?(?:\s*\+\s*(\d+))?$/);
    if (!m) return NaN;
    return /\*/.test(x) ? parseInt(m[1], 10) * 60 + parseInt(m[2] || '0', 10) : parseInt(m[1], 10);
  }) : [];
  t.ok(js.length >= 3, 'the app has at least the three editions it started with');
  t.not(js.some(isNaN), 'every edition in the app says when it begins');
  t.not(kt.some(isNaN), 'and every time the job wakes at is one this can read');
  t.same(js, kt, 'and they are the same times, to the minute');
  t.ok(js.every((m, i) => i === 0 || m > js[i - 1]), 'given in order, as briefSlot assumes');
  t.ok(js.every((m) => m >= 0 && m < 24 * 60), 'and every one of them is a time of day');
  // The last edition is the one just added; it is the only one on a half hour.
  t.is(js[js.length - 1], 21 * 60 + 30, 'the last of the day is half past nine');
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

/*
 * Kotlin only tells you about an unresolved name when it compiles, which happens on
 * a runner twenty minutes and one push away. Two of them have got that far now - a
 * bridge method missing from one side, and android.content.Intent used in a file
 * that had never needed to import it. This is the cheap half of a compiler: every
 * capitalised name used as a constructor or a qualifier has to be imported, declared
 * here, or something the language hands you for nothing.
 */
const KOTLIN_FREE = new Set([
  // kotlin.* and java.lang.*, in scope without an import
  'String', 'Int', 'Long', 'Short', 'Byte', 'Float', 'Double', 'Boolean', 'Char', 'Unit',
  'Any', 'Nothing', 'Array', 'IntArray', 'LongArray', 'ByteArray', 'CharArray', 'BooleanArray',
  'List', 'MutableList', 'Map', 'MutableMap', 'Set', 'MutableSet', 'ArrayList', 'HashMap',
  'LinkedHashMap', 'HashSet', 'LinkedHashSet', 'Pair', 'Triple', 'Regex', 'Result',
  'Exception', 'RuntimeException', 'IllegalArgumentException', 'IllegalStateException',
  'Throwable', 'Error', 'Thread', 'Runnable', 'Math', 'System', 'Class', 'Comparable',
  'Volatile', 'Suppress', 'JvmStatic', 'JvmField', 'JvmOverloads', 'Deprecated', 'Override',
  'StringBuilder', 'CharSequence', 'Number', 'Iterable', 'Sequence', 'Lazy', 'Comparator',
  'Regex', 'RegexOption', 'Charsets', 'Byte', 'UByte', 'Function0', 'Function1'
]);

suite('Every Kotlin name is one the compiler will find', (t) => {
  const files = ['MainActivity.kt', 'Net.kt', 'Briefings.kt', 'Widget.kt'];
  // Anything declared anywhere in the package is reachable from anywhere else in it.
  const inPackage = new Set(['R']);
  const bodies = {};
  files.forEach((f) => {
    const src = read(KT + f);
    bodies[f] = src;
    (src.match(/^\s*(?:private |internal |public |abstract |open |sealed |inner |data )*(?:class|object|interface|enum class) ([A-Z][A-Za-z0-9]*)/gm) || [])
      .forEach((m) => inPackage.add(m.trim().split(/\s+/).pop()));
  });
  t.ok(inPackage.has('MainActivity') && inPackage.has('BriefStore'),
    'the package\'s own classes are found');

  files.forEach((f) => {
    const src = bodies[f].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
    const imported = new Set((src.match(/^import [\w.]+$/gm) || [])
      .map((line) => line.trim().split('.').pop()));
    // Foo( as a constructor, Foo. as a qualifier, : Foo as a type or supertype
    const used = new Set();
    (src.match(/(?:^|[^\w.])([A-Z][A-Za-z0-9]*)\s*[.(]/g) || [])
      .forEach((m) => used.add(m.replace(/[^A-Za-z0-9]/g, '').replace(/^[a-z0-9]+/, '')));
    (src.match(/:\s*([A-Z][A-Za-z0-9]*)/g) || [])
      .forEach((m) => used.add(m.replace(/[:\s]/g, '')));
    used.forEach((name) => {
      if (!name || KOTLIN_FREE.has(name) || imported.has(name) || inPackage.has(name)) return;
      t.fail(f + ' uses ' + name + ', which is neither imported nor declared in the package'
        + '\n      (Kotlin would only say so on the runner, twenty minutes from here)');
    });
  });
});

/*
 * The same page is an APK and a web app. In the APK the manifest and the worker are
 * dead weight; in a browser they are what makes it installable. Both have to be
 * right, and neither fails loudly if it is not - a bad manifest just means no
 * install prompt, and a worker that will not register just means no offline.
 */
suite('It can be installed as a web app', (t) => {
  let man = null, err = null;
  try { man = JSON.parse(read('app/src/main/assets/manifest.webmanifest')); }
  catch (e) { err = e.message; }
  t.is(err, null, 'the web manifest is JSON');
  if (man) {
    t.ok(man.name && man.short_name, 'it has a name to install under');
    t.is(man.display, 'standalone', 'and opens without browser furniture');
    t.ok(/^\.\//.test(man.start_url), 'its start url is relative, so any path can host it');
    t.ok(/^\.\//.test(man.scope), 'and so is its scope');
    const sizes = (man.icons || []).map((i) => i.sizes);
    t.ok(sizes.indexOf('192x192') >= 0, 'a 192 icon, which Android wants');
    t.ok(sizes.indexOf('512x512') >= 0, 'and a 512, which the install prompt wants');
    t.ok((man.icons || []).some((i) => i.purpose === 'maskable'),
      'and one it may crop to whatever shape the launcher uses');
    (man.icons || []).forEach((i) => {
      t.ok(has('app/src/main/assets/' + i.src.replace('./', '')), i.src + ' exists');
    });
  }

  const page = read(PAGE);
  t.ok(/<link rel="manifest" href="manifest\.webmanifest">/.test(page), 'the page links it');
  t.ok(/name="theme-color"/.test(page), 'and colours the browser bar around itself');
  // A worker registered off http throws; inside the APK the page is on file://.
  t.ok(/\/\^https\?:\$\/\.test\(location\.protocol\)[\s\S]{0,80}serviceWorker/.test(page),
    'and registers its worker only where one can exist, not from inside the APK');

  const sw = read('app/src/main/assets/sw.js');
  t.ok(/self\.location\.origin/.test(sw), 'the worker knows what is its own');
  // Caching a story would show yesterday's news as today's.
  t.ok(/url\.origin !== self\.location\.origin\) return;/.test(sw),
    'and lets everything that is not go straight to the network, uncached');
  t.ok(/fetch\(r\)\.then/.test(sw), 'the shell is network first, so a new build is picked up');
  t.ok(/caches\.delete/.test(sw), 'and an old one is thrown away');
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

/*
 * A widget is inflated by the launcher, in the launcher's process, out of a
 * RemoteViews. Put a view in there that RemoteViews cannot send across and nothing
 * complains until the widget is placed on a home screen, where it shows "Problem
 * loading widget" and says no more about it. So the layouts are checked here.
 */
const REMOTE_VIEWS_OK = [
  // Containers RemoteViews can inflate
  'FrameLayout', 'LinearLayout', 'RelativeLayout', 'GridLayout',
  // Widgets it can inflate
  'AnalogClock', 'Button', 'Chronometer', 'ImageButton', 'ImageView', 'ProgressBar',
  'TextView', 'TextClock', 'ViewFlipper', 'ListView', 'GridView', 'StackView',
  'AdapterViewFlipper', 'ViewStub'
];
const WIDGET_LAYOUTS = ['widget_briefing', 'widget_paragraph', 'widget_preview'];

suite('The widget layouts are ones a launcher can draw', (t) => {
  WIDGET_LAYOUTS.forEach((name) => {
    const xml = read('app/src/main/res/layout/' + name + '.xml').replace(/<!--[\s\S]*?-->/g, '');
    const tags = Array.from(new Set((xml.match(/<([A-Z][A-Za-z0-9.]*)/g) || []).map((m) => m.slice(1))));
    t.ok(tags.length > 0, name + ' has views in it at all');
    tags.forEach((tag) => {
      t.ok(REMOTE_VIEWS_OK.indexOf(tag) >= 0,
        name + ' uses <' + tag + '>, which RemoteViews can send to a launcher');
    });
  });
});

suite('The widget is wired up end to end', (t) => {
  const m = read('app/src/main/AndroidManifest.xml');
  t.ok(/<receiver[\s\S]{0,400}\.BriefingWidget[\s\S]{0,400}APPWIDGET_UPDATE/.test(m),
    'the provider is declared and listens for the launcher\'s update');
  t.ok(/android\.appwidget\.provider"[\s\S]{0,120}@xml\/briefing_widget/.test(m),
    'and points at its own description');
  t.ok(/<receiver[\s\S]{0,200}\.BriefingWidget[\s\S]{0,200}android:exported="true"/.test(m),
    'exported, since the launcher is another app');
  t.ok(/<service[\s\S]{0,200}\.BriefingWidgetService[\s\S]{0,200}BIND_REMOTEVIEWS/.test(m),
    'and the adapter service may only be bound by the system');

  const info = read('app/src/main/res/xml/briefing_widget.xml');
  ['initialLayout', 'previewLayout'].forEach((k) => {
    const at = info.match(new RegExp('android:' + k + '="@layout/([a-z_]+)"'));
    t.ok(at, k + ' is set');
    if (at) t.ok(has('app/src/main/res/layout/' + at[1] + '.xml'), k + ' names a layout that exists');
  });
  // Zero on purpose: the page pushes an update when it saves, so polling would only
  // cost battery to find nothing had changed. Changing it should be a decision.
  t.ok(/android:updatePeriodMillis="0"/.test(info), 'and the system is not asked to poll');

  // R.id.x compiles whatever layout it came from, so a renamed id fails silently.
  const kt = read(KT + 'Widget.kt');
  const ids = Array.from(new Set((kt.match(/R\.id\.([a-z_]+)/g) || []).map((x) => x.slice(5))));
  const declared = new Set();
  WIDGET_LAYOUTS.forEach((name) => {
    (read('app/src/main/res/layout/' + name + '.xml').match(/@\+id\/([a-z_]+)/g) || [])
      .forEach((x) => declared.add(x.slice(5)));
  });
  t.ok(ids.length >= 4, 'the widget addresses views by id');
  ids.forEach((id) => t.ok(declared.has(id), 'R.id.' + id + ' is a view in one of the widget layouts'));

  // The empty view has to be a sibling of the list, or it is never shown.
  const page = read('app/src/main/res/layout/widget_briefing.xml');
  t.ok(/@\+id\/widget_list/.test(page) && /@\+id\/widget_empty/.test(page),
    'and the list and its empty view share a layout, as setEmptyView needs');
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

/* WebView.pauseTimers and resumeTimers are documented as application-wide: they
   reach every WebView in the process, not the one they are called on. The app used
   them for its own page, which meant the reader backgrounding the app froze the
   briefing job's page mid-run, and the job waking up set the app refreshing behind
   the reader's back. Each page now stops its own timers in JavaScript. */
suite('No page freezes another page', (t) => {
  // Comments stripped first: both files say in prose why they no longer call it.
  const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const kt = ['MainActivity.kt', 'Briefings.kt', 'Widget.kt']
    .filter((f) => has(KT + f)).map((f) => ({ f, src: code(read(KT + f)) }));
  t.ok(kt.length >= 2, 'the Kotlin is where it was');
  kt.forEach(({ f, src }) => {
    t.not(/\b(pause|resume)Timers\s*\(/.test(src), f + ' leaves every page\'s timers alone');
  });
  const page = read(PAGE);
  t.ok(/function stopTimers\s*\(/.test(page) && /function startTimers\s*\(/.test(page),
    'and the page stops and starts its own instead');
  t.ok(/paused:\s*function[\s\S]{0,120}stopTimers\(\)/.test(page),
    'going off screen stops them');
  t.ok(/resumed:\s*function[\s\S]{0,160}startTimers\(\)/.test(page),
    'and coming back starts them again');
});

/* The page hands over three things and Kotlin builds the message out of them. The
   page now leans on that: where a story has a link it sends the headline and lets
   Kotlin put the address underneath, so a share that stopped appending the address
   would send a bare headline and nobody would be able to read the story. */
suite('The share the page composes is the share Kotlin sends', (t) => {
  const kt = read(KT + 'MainActivity.kt');
  const fn = kt.slice(kt.indexOf('fun share('), kt.indexOf('fun calendar('));
  t.ok(/fun share\(/.test(kt), 'Kotlin still offers a share');
  t.ok(/EXTRA_TEXT/.test(fn), 'and puts a body on the intent');
  t.ok(/EXTRA_SUBJECT/.test(fn), 'with the headline as the subject');
  // The two halves of the contract the page is written against.
  t.ok(/url\.isEmpty\(\)[^\n]*\\n\\n[^\n]*url|\+\s*url/.test(fn),
    'the address is appended to the body, not just carried as the subject');
  t.ok(/text\.isEmpty\(\)/.test(fn),
    'and an empty body falls back to the headline rather than sending nothing');
  const page = read(PAGE);
  t.ok(/function shareText\(/.test(page), 'the page composes what goes above it');
  t.ok(/Native\.share\(it\.title, shareText\(it\), it\.link/.test(page),
    'and hands over the headline, that body, and the address');
});

/* Reading a rendered page is Kotlin's job and the page waits to be told. Both sides
   have a deadline, and the page's has to be the later of the two: it exists only for
   the case where Kotlin says nothing at all, and a page that gave up first would have
   its source marked busy when the real answer arrived. */
suite('The page waits longer than the app takes', (t) => {
  const kt = read(KT + 'MainActivity.kt'), page = read(PAGE);
  const ktMs = (kt.match(/SCRAPE_TIMEOUT_MS\s*=\s*([\d_]+)L/) || [])[1];
  const jsMs = (page.match(/var SCRAPE_WAIT_MS\s*=\s*(\d+)/) || [])[1];
  t.ok(ktMs, 'the app gives itself a time to answer in (' + ktMs + ')');
  t.ok(jsMs, 'and the page gives itself a time to be answered in (' + jsMs + ')');
  const kn = parseInt(String(ktMs).replace(/_/g, ''), 10), jn = parseInt(jsMs, 10);
  t.ok(jn > kn, 'the page waits the longer of the two (' + jn + ' > ' + kn + ')');
  // And it settles either way, or the source it belongs to stays busy for ever.
  const fn = page.slice(page.indexOf('function scrapeRendered'), page.indexOf('window.__scrapeDone'));
  t.ok(/setTimeout/.test(fn), 'the page arms that deadline rather than waiting for ever');
  t.ok(/w\.rej\(/.test(fn), 'and a read that is replaced is told, not dropped');
});

/* The window behind the page and the bars around it are painted by Kotlin, before a
   line of that page has run. So the two colours are written twice, in two languages,
   and a page that turned white while Kotlin still painted black would open with a
   flash and keep a black status bar for good - which is exactly what it did. */
suite('Both languages are lit the same way', (t) => {
  const kt = read(KT + 'MainActivity.kt'), page = read(PAGE);
  const ktCol = (name) => ((kt.match(new RegExp('const val ' + name + ' = "(#[0-9A-Fa-f]{6})"')) || [])[1] || '').toUpperCase();
  const dark = ktCol('BG'), light = ktCol('BG_LIGHT');
  t.ok(dark && light, 'Kotlin names a colour for each way up (' + dark + ', ' + light + ')');
  // --bg is declared twice in the page: on :root, then again under .light.
  const bgs = (page.match(/--bg:\s*(#[0-9A-Fa-f]{6})/g) || [])
    .map((m) => m.replace(/.*(#[0-9A-Fa-f]{6}).*/, '$1').toUpperCase());
  t.is(bgs.length, 2, 'and the page declares one for each way up too');
  t.is(bgs[0], dark, 'the page dark is the Kotlin dark');
  t.is(bgs[1], light, 'and the page light is the Kotlin light');
  // The browser's own bar, for the installed web app, turns over with them too.
  const meta = (page.match(/<meta name="theme-color"[^>]*content="(#[0-9A-Fa-f]{6})"/) || [])[1];
  t.is((meta || '').toUpperCase(), dark, 'the theme-color meta starts on the dark one');
  const flip = page.slice(page.indexOf('function setTheme('), page.indexOf('function loadTheme('));
  t.ok(/themeColour/.test(flip), 'and setTheme is what turns it over');
  const both = (flip.match(/#[0-9A-Fa-f]{6}/g) || []).map((x) => x.toUpperCase());
  t.same(both.sort(), [dark, light].sort(), 'between the same two colours Kotlin uses');

  /* Which way up is decided before the window is painted, and painting it again is
     what makes the theme toggle reach the bars. */
  const create = kt.slice(kt.indexOf('override fun onCreate'), kt.indexOf('private fun configure'));
  t.ok(create.indexOf('BriefStore.theme(') >= 0, 'the saved theme is read on the way in');
  t.ok(create.indexOf('BriefStore.theme(') < create.indexOf('setUpWindow()'),
    'before the window is set up, not after it');
  const paint = kt.slice(kt.indexOf('private fun paintWindow'), kt.indexOf('/* From Android 13'));
  t.ok(/setBackgroundDrawable/.test(paint), 'the window itself is painted');
  t.ok(/statusBarColor/.test(paint) && /navigationBarColor/.test(paint), 'and both bars with it');
  t.ok(/SYSTEM_UI_FLAG_LIGHT_STATUS_BAR/.test(paint),
    'with dark icons on a light bar, or the clock is white on white');
  t.not(/Color\.parseColor\(BG\)/.test(paint), 'none of it hard-coded to the dark one');
  const theme = kt.slice(kt.indexOf('fun theme(name: String)'), kt.indexOf('fun briefSave'));
  t.ok(/paintWindow\(\)/.test(theme), 'and turning the theme over repaints them');
});

suite('No key is committed', (t) => {
  const cfg = read('app/src/main/assets/config.js');
  t.ok(/ppqKey:\s*""/.test(cfg), 'config.js ships with an empty key, filled in from the secret');
  const page = read(PAGE);
  t.not(/sk-[A-Za-z0-9]{16,}/.test(page + cfg), 'and nothing that looks like one is in the source');
});

run('Newsdesk source');
