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
    KT + 'Widget.kt', KT + 'WidgetFeed.kt', KT + 'WidgetHistory.kt', KT + 'Reading.kt',
    KT + 'Spoken.kt', KT + 'Threads.kt',
    'app/src/main/res/drawable/icon.png', 'app/src/main/res/drawable/banner.png',
    'app/src/main/res/drawable/notify.png', 'app/src/main/res/drawable/widget_bg.xml',
    'app/src/main/res/drawable/widget_refresh.png',
    'app/src/main/res/drawable-v31/widget_bg.xml', 'app/src/main/res/values/strings.xml',
    'app/src/main/res/xml/briefing_widget.xml',
    'app/src/main/res/xml/headlines_widget.xml', 'app/src/main/res/xml/onthisday_widget.xml',
    'app/src/main/res/layout/widget_briefing.xml', 'app/src/main/res/layout/widget_paragraph.xml',
    'app/src/main/res/layout/widget_preview.xml',
    'app/src/main/res/layout/widget_headlines.xml', 'app/src/main/res/layout/widget_headline_row.xml',
    'app/src/main/res/layout/widget_onthisday.xml',
    'app/src/main/res/layout/widget_preview_feed.xml', 'app/src/main/res/layout/widget_preview_hist.xml'
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
  // java.lang too, and so in scope unimported - which this list had wrong until a real
  // Kotlin compiler was put on it and disagreed.
  'InterruptedException', 'NumberFormatException', 'UnsupportedOperationException',
  'Volatile', 'Suppress', 'JvmStatic', 'JvmField', 'JvmOverloads', 'Deprecated', 'Override',
  'StringBuilder', 'CharSequence', 'Number', 'Iterable', 'Sequence', 'Lazy', 'Comparator',
  'Regex', 'RegexOption', 'Charsets', 'Byte', 'UByte', 'Function0', 'Function1'
]);

suite('Every Kotlin name is one the compiler will find', (t) => {
  /* Read off the directory rather than written out. A list kept by hand is a list a
     new file is quietly missing from, and this check passing while saying nothing about
     the newest file in the package is worse than it failing. */
  const files = fs.readdirSync(path.join(dir, KT)).filter((f) => f.endsWith('.kt')).sort();
  t.ok(files.length >= 9, 'every Kotlin file in the package is checked, found ' + files.length);
  ['MainActivity.kt', 'Spoken.kt', 'Threads.kt'].forEach((f) => {
    t.ok(files.indexOf(f) >= 0, 'including ' + f);
  });
  // Anything declared anywhere in the package is reachable from anywhere else in it.
  const inPackage = new Set(['R']);
  const bodies = {};
  files.forEach((f) => {
    const src = read(KT + f);
    bodies[f] = src;
    (src.match(/^\s*(?:private |internal |public |abstract |open |sealed |inner |data )*(?:class|object|interface|enum class) ([A-Z][A-Za-z0-9]*)/gm) || [])
      .forEach((m) => inPackage.add(m.trim().split(/\s+/).pop()));
    /* A constant counts too. A CAPITALISED name followed by a dot looks exactly like a
       class to the pattern below, so a precompiled Regex held in a val - TIME.replace(..) -
       was reported as an unimported class until this line existed. */
    (src.match(/^\s*(?:(?:private|internal|public|const|lateinit|@Volatile)\s+)*va[lr]\s+([A-Z][A-Za-z0-9_]*)/gm) || [])
      .forEach((m) => inPackage.add(m.trim().split(/\s+/).pop()));
  });
  t.ok(inPackage.has('MainActivity') && inPackage.has('BriefStore'),
    'the package\'s own classes are found');
  t.ok(inPackage.has('CHUNK') && inPackage.has('TIME'),
    'and so are its constants, which read the same way to a regex');

  files.forEach((f) => {
    /* Comments and string literals both out of the way first. A capitalised word with a
       dot after it inside a string - "No." in a table of short forms, say - reads to the
       pattern below exactly like a qualified class name. Raw strings before plain ones,
       since a raw one is full of quotes. */
    const src = bodies[f].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
      .replace(/"""[\s\S]*?"""/g, '""')
      .replace(/"(?:\\.|[^"\\\n])*"/g, '""');
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
const WIDGET_LAYOUTS = [
  'widget_briefing', 'widget_paragraph', 'widget_preview',
  'widget_headlines', 'widget_headline_row', 'widget_preview_feed',
  'widget_onthisday', 'widget_preview_hist'
];

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

/* The three of them: the briefing, the headlines, and the archive photograph. Each
   is a provider in the manifest, a description in res/xml, and a layout - and a
   missing one of those is a widget that never appears in the picker, with nothing
   said about why. */
const WIDGETS = [
  { kt: 'Widget.kt', cls: 'BriefingWidget', info: 'briefing_widget', svc: 'BriefingWidgetService' },
  { kt: 'WidgetFeed.kt', cls: 'HeadlinesWidget', info: 'headlines_widget', svc: 'HeadlinesWidgetService' },
  { kt: 'WidgetHistory.kt', cls: 'OnThisDayWidget', info: 'onthisday_widget', svc: null }
];

suite('Every widget is wired up end to end', (t) => {
  const m = read('app/src/main/AndroidManifest.xml');
  const declared = new Set();
  WIDGET_LAYOUTS.forEach((name) => {
    (read('app/src/main/res/layout/' + name + '.xml').match(/@\+id\/([a-z_]+)/g) || [])
      .forEach((x) => declared.add(x.slice(5)));
  });

  WIDGETS.forEach(({ kt, cls, info, svc }) => {
    t.ok(new RegExp('<receiver[\\s\\S]{0,400}\\.' + cls + '[\\s\\S]{0,400}APPWIDGET_UPDATE').test(m),
      cls + ' is declared and listens for the launcher\'s update');
    t.ok(new RegExp('android\\.appwidget\\.provider"[\\s\\S]{0,160}@xml\\/' + info).test(m),
      cls + ' points at its own description');
    t.ok(new RegExp('<receiver[\\s\\S]{0,200}\\.' + cls + '[\\s\\S]{0,200}android:exported="true"').test(m),
      cls + ' is exported, since the launcher is another app');
    if (svc) {
      t.ok(new RegExp('<service[\\s\\S]{0,200}\\.' + svc + '[\\s\\S]{0,200}BIND_REMOTEVIEWS').test(m),
        svc + ' may only be bound by the system');
    }

    const xml = read('app/src/main/res/xml/' + info + '.xml');
    ['initialLayout', 'previewLayout'].forEach((k) => {
      const at = xml.match(new RegExp('android:' + k + '="@layout/([a-z_]+)"'));
      t.ok(at, info + ': ' + k + ' is set');
      if (at) t.ok(has('app/src/main/res/layout/' + at[1] + '.xml'), info + ': ' + k + ' names a layout that exists');
    });
    // Zero on purpose: the page pushes an update when it saves, so polling would only
    // cost battery to find nothing had changed. Changing it should be a decision.
    t.ok(/android:updatePeriodMillis="0"/.test(xml), info + ': the system is not asked to poll');

    // R.id.x compiles whatever layout it came from, so a renamed id fails silently.
    const src = read(KT + kt);
    const ids = Array.from(new Set((src.match(/R\.id\.([a-z_]+)/g) || []).map((x) => x.slice(5))));
    t.ok(ids.length >= 3, cls + ' addresses views by id');
    ids.forEach((id) => t.ok(declared.has(id), kt + ': R.id.' + id + ' is a view in a widget layout'));

    // Every drawable it names has to exist too, by any of the names a build accepts.
    const draws = Array.from(new Set((src.match(/R\.drawable\.([a-z_0-9]+)/g) || []).map((x) => x.slice(11))));
    draws.forEach((d) => {
      const found = ['drawable/' + d + '.xml', 'drawable/' + d + '.png', 'drawable-v31/' + d + '.xml']
        .some((p) => has('app/src/main/res/' + p));
      t.ok(found, kt + ': R.drawable.' + d + ' exists');
    });
  });

  // The empty view has to be a sibling of the list, or it is never shown.
  [['widget_briefing', 'widget_list', 'widget_empty'], ['widget_headlines', 'feed_list', 'feed_empty']]
    .forEach(([name, list, empty]) => {
      const lay = read('app/src/main/res/layout/' + name + '.xml');
      t.ok(lay.indexOf('@+id/' + list) >= 0 && lay.indexOf('@+id/' + empty) >= 0,
        name + ': the list and its empty view share a layout, as setEmptyView needs');
    });
});

/* A widget is drawn from what the page last handed over, so the handing over is the
   part that has to be right - in both directions, and in both Bridges. */
suite('The widgets are fed by the page', (t) => {
  const page = read(PAGE);
  [['briefSave', 'BriefStore'], ['feedSave', 'FeedStore'], ['histSave', 'HistStore']]
    .forEach(([call, store]) => {
      t.ok(new RegExp('window\\.Native\\.' + call + '\\(').test(page), 'the page pushes through ' + call);
      ['MainActivity.kt', 'Briefings.kt'].forEach((f) => {
        const src = read(KT + f);
        t.ok(new RegExp('fun ' + call + '\\(').test(src), f + ' answers ' + call);
        t.ok(new RegExp(store + '\\.save\\(').test(src), f + ' puts it in ' + store);
      });
    });
  // The headlines and the photographs are pushed once a refresh has settled, not on
  // every source landing: nine sources would otherwise write the home screen nine times.
  t.ok(/if \(!anyBusy\(\)\) \{[^}]*widgetPush\(\)/.test(page),
    'and only once every source has landed');
  t.ok(/function widgetPush\s*\(/.test(page) && /function widgetFeed\s*\(/.test(page) &&
       /function widgetHistory\s*\(/.test(page), 'all three pushes are there');
});

/* Tapping a headline on the home screen should open that story, not just the app. */
suite('A tapped headline opens its own story', (t) => {
  const main = read(KT + 'MainActivity.kt');
  const feed = read(KT + 'WidgetFeed.kt');
  const page = read(PAGE);
  t.ok(/const val EXTRA_ITEM/.test(main), 'the activity names the extra it listens for');
  t.ok(/EXTRA_ITEM/.test(feed), 'and the row fills that same extra in');
  t.ok(/override fun onNewIntent/.test(main), 'a tap while the app is open is picked up');
  t.ok(/nd\.open\(/.test(main), 'and handed to the page');
  t.ok(/open:\s*function \(id\)/.test(page), 'which has somewhere to put it');
  // A template that is not mutable cannot be filled in, so every row opens the first story.
  t.ok(/setPendingIntentTemplate\(R\.id\.feed_list/.test(feed), 'the list is given a template');
  t.ok(/FLAG_MUTABLE/.test(read(KT + 'Widget.kt')), 'and a template stays mutable, or rows cannot fill it in');
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
  const kt = ['MainActivity.kt', 'Briefings.kt', 'Widget.kt', 'WidgetFeed.kt', 'WidgetHistory.kt',
               'Reading.kt']
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

/* The Read aloud button did nothing at all - no voice, no error, no message - and the
   reason was four characters of Kotlin. TextToSpeech's constructor takes the callback that
   says the engine is ready, and on a device where the service is already bound it calls it
   before the constructor returns. The field the instance is assigned to is therefore still
   null inside that callback, and the first version of this read the field there and gave up
   where it found nothing. It is not reachable from any test here - there is no engine in
   jsdom and none in Chromium - so what can be checked is the shape: the callback records
   what happened and nothing else, and the work is done after a post, by which time the
   constructor has certainly returned. */
suite('The voice does not read a field its own constructor has not set yet', (t) => {
  // Lives in Reading.kt now, with the service that keeps it talking past the activity.
  const kt = read(KT + 'Reading.kt');
  t.ok(/class Speaker\(/.test(kt), 'the speaker is there');
  const make = kt.slice(kt.indexOf('private fun make()'), kt.indexOf('private fun began('));
  t.ok(make.length > 20, 'and makes its engine in one place');
  t.ok(/TextToSpeech\(/.test(make), 'constructing the engine there');
  t.ok(/main\.post\s*\{/.test(make),
    'and handing the result on through a post, not acting on it in the callback');
  /* The whole of the bug: reading tts inside the listener. Assigning it is what the line
     is for, so only a read counts - anything using it as a receiver or a value. */
  const body = make.slice(make.indexOf('OnInitListener'));
  t.not(/\btts\s*[?.]/.test(body), 'the callback never reads the field through tts. or tts?.');
  t.not(/=\s*tts\b/.test(body), 'nor assigns from it');
  t.not(/\btts\s*\?:/.test(body), 'nor bails out on it being null, which is what it used to do');

  const began = kt.slice(kt.indexOf('private fun began('), kt.indexOf('private fun mine('));
  t.ok(began.length > 20, 'the work happens in began instead');
  t.ok(/val t = tts/.test(began), 'which is where the field is read');
  t.ok(/setOnUtteranceProgressListener/.test(began), 'and where the progress listener is set');
  t.ok(/ready = true/.test(began), 'and where it is marked ready to speak');
  /* And it says which kind of nothing. A phone with no speech engine installed at all -
     which is how a GrapheneOS phone without Google's services arrives - wants a different
     answer from an engine that is there and would not start. */
  t.ok(/anyEngine\(\)/.test(began), 'asking whether there is an engine at all');
  t.ok(/"novoice"/.test(began) && /"noengine"/.test(began),
    'and telling the two apart rather than leaving it silent');
  /* Which way round matters and nothing here can see it run - there is no speech engine in
     jsdom and none in Chromium - so the mapping is pinned: an engine that is installed and
     would not start is novoice, and none installed at all is noengine. Swapped, the phone
     with no engine would be told to go and pick another one. */
  t.ok(/if \(anyEngine\(\)\) "novoice" else "noengine"/.test(began.replace(/\s+/g, ' ')),
    'an installed engine that failed is novoice; none at all is noengine, and not the reverse');
  const any = kt.slice(kt.indexOf('private fun anyEngine'), kt.indexOf('private fun began('));
  t.ok(/INTENT_ACTION_TTS_SERVICE/.test(any), 'by asking what speech services are installed');
  t.ok(/catch \(e: Exception\) \{\s*true/.test(any.replace(/\n\s*/g, ' ')),
    'and where it cannot tell, saying there is one - so the engine is tried, never refused');
  /* From Android 11 an app sees only the packages it declares an interest in, so without
     this the query answers empty however many engines are installed. */
  const man = read('app/src/main/AndroidManifest.xml');
  t.ok(/<queries>/.test(man), 'the manifest says which packages it wants to see');
  t.ok(/android\.intent\.action\.TTS_SERVICE/.test(man), 'naming the speech services');

  // A dead end is no use: there has to be somewhere to go and get a voice. That one
  // opens a screen, so it stayed with the activity when the speaking moved out.
  const act = read(KT + 'MainActivity.kt');
  t.ok(/fun voiceSettings\(\)/.test(act), 'the app can open the speech settings');
  t.ok(/com\.android\.settings\.TTS_SETTINGS/.test(act), 'which is where a voice is chosen');
  const page0 = read(PAGE);
  t.ok(/noengine:/.test(page0), 'and the page has words for a phone with no engine');
  /* Named engines, not a shrug. Both open source and both read without the network,
     which is the point of naming them rather than sending someone searching. */
  t.ok(/RHVoice/.test(page0) && /SherpaTTS/.test(page0),
    'naming two engines that would do the job');
  t.ok(/F-Droid/.test(page0), 'and where to get them');

  /* A voice reading to a muted phone is the same nothing as no voice, and likelier. The
     two are told apart before a word is queued. */
  const say = kt.slice(kt.indexOf('private fun deliver('), kt.indexOf('fun split('));
  t.ok(/muted\(\)/.test(say), 'a muted phone is checked before anything is queued');
  t.ok(/ended\("silent"\)/.test(say), 'and said to be muted rather than voiceless');
  t.ok(/STREAM_MUSIC/.test(kt), 'read off the volume the voice will come out of');

  // Both reasons have words for them on the page, or the page would say nothing useful.
  const page = read(PAGE);
  const why = page.slice(page.indexOf('var SPOKE_WHY'), page.indexOf('window.__spoke'));
  t.ok(/novoice:/.test(why) && /silent:/.test(why), 'the page has words for both');
  t.ok(/volume/i.test(why), 'the muted one mentioning the volume');
});

/* A refresh took sixteen seconds, and most of it was queueing. Every fetch the page makes
   goes through one fixed pool of threads, and a refresh makes fifty-odd of them - so four
   threads meant thirteen waves of round trips. Measured against a simulated pool at four
   hundred milliseconds a fetch: four threads 5.2s, eight 2.8s, twelve 2.0s, unlimited 1.6s.
   The threads wait on sockets rather than work, so another one costs a stack. */
suite('There are enough threads to fetch with', (t) => {
  ['MainActivity.kt', 'Briefings.kt'].forEach((f) => {
    const kt = read(KT + f);
    const m = kt.match(/newFixedThreadPool\((\d+)\)/);
    t.ok(m, f + ' fetches through a pool of its own');
    const n = m ? parseInt(m[1], 10) : 0;
    t.ok(n >= 8, f + ' has enough threads not to queue a refresh behind itself (' + n + ')');
    t.ok(n <= 16, f + ' and not so many that a stick runs out of stacks (' + n + ')');
  });

  /* The prices share that pool with the stories, and the stories are the point. Asking for
     the prices first handed them the threads and left the tab you were looking at behind a
     Bitcoin quote. */
  const page = read(PAGE);
  const fn = page.slice(page.indexOf('function refresh() {'), page.indexOf('function anyBusy()'));
  t.ok(/refreshMarket\(\)/.test(fn), 'a refresh still fetches the prices');
  t.ok(fn.indexOf('refreshOrder()') < fn.indexOf('refreshMarket()'),
    'but after the sources, not before them');
  t.ok(/refreshOrder\(\)\.forEach/.test(fn), 'and the sources in the order the tab wants');

  // The spinner and the status line ask about this tab, not about all nine sources.
  t.ok(/setUpPull\(ind, \$\('listWrap'\),[\s\S]{0,120}refresh, tabBusy\)/.test(page),
    'the list\'s pull waits for the tab it is on, not for everything');
  const st = page.slice(page.indexOf('function updateStatus()'), page.indexOf('function switchTab'));
  t.ok(/tabBusy\(\)/.test(st), 'and so does the status line');
  t.not(/anyBusy\(\)/.test(st), 'rather than for every source in the app');
});

/* A dead router is one problem, not nine. The app has to say so, stop asking, and
   pick itself up again without being told. */
suite('A lost connection is handled as one thing', (t) => {
  const page = read(PAGE);
  t.ok(/function deviceOffline\s*\(/.test(page), 'the device flag is read');
  t.ok(/navigator\.onLine === false/.test(page),
    'and believed only when it says no, which is the half it gets right');
  t.ok(/function allSourcesFailed\s*\(/.test(page),
    'and every source failing is worked out separately, since the flag lies the other way');
  t.ok(/tried >= 2 && tried === failed/.test(page),
    'one source failing is one source failing, not the network');

  // Nine sources timing out in turn costs a phone its battery and tells nobody anything.
  const fn = page.slice(page.indexOf('function refresh()'), page.indexOf('function anyBusy'));
  t.ok(/if \(!BG && deviceOffline\(\)\) \{[\s\S]{0,160}return;/.test(fn),
    'a refresh with no network asks nobody');
  // navigator.onLine is the window's reading of its own connection, and the briefing
  // job's WebView has no window. A false reading there ended the whole run in a second,
  // having fetched nothing, written nothing and said nothing - which is the failure this
  // suite's own flag-believing rule above quietly introduced. The job had already asked
  // the system for a network before it was allowed to start.
  t.not(/if \(deviceOffline\(\)\)/.test(fn),
    'but a background run does not consult a flag that cannot see a window');

  const st = page.slice(page.indexOf('function updateStatus()'), page.indexOf('function switchTab'));
  t.ok(/noConnection\(\)/.test(st), 'the status line says it once');
  t.ok(st.indexOf('noConnection()') < st.indexOf('down.length'),
    'before the list of sources that are all failing for the same reason');

  t.ok(/addEventListener\('online'/.test(page), 'and it picks itself up when the signal returns');
  t.ok(/setTimeout\(function \(\) \{ if \(!deviceOffline\(\)\) refresh\(\); \}, \d+\)/.test(page),
    'after a moment, since the flag flips before the route is usable');
});

/*
 * Four limits govern a briefing written while nobody is looking, and they have to nest:
 * the page's own patience inside Kotlin's backstop, both of them longer than a single
 * PPQ request is allowed to take, and all of it inside what Android gives a job.
 *
 * They did not nest. The page gave up at three minutes; one PPQ request is allowed two
 * on its own; and nine sources have to settle before that request is even made. So a run
 * could give up with the reply that would have written the briefing still in flight,
 * report that it had written nothing - correctly, as far as it knew - and then be
 * destroyed on the way past. No briefing, and no notification either, which from the
 * only seat anyone sits in looks exactly like a briefing that is only ever written when
 * the app is opened.
 *
 * An arithmetic check rather than a comment, because the four numbers live in three
 * different files and nothing else in the project compares them.
 */
suite('A briefing has time to be written in the background', (t) => {
  const ms = (s, re) => {
    const m = s.match(re);
    if (!m) return NaN;
    // 7 * 60 * 1000, or 120_000L - arithmetic as written, with Kotlin's spelling removed
    return Number(new vm.Script(m[1].replace(/[_L]/g, '')).runInNewContext({}));
  };
  const net = read(KT + 'Net.kt');
  const page = ms(read(PAGE), /BG_GIVE_UP_MS = ([\d*\s]+);/);
  const job = ms(read(KT + 'Briefings.kt'), /val GIVE_UP_MS = ([\d*\s_L]+)\n/);
  const post = ms(net.slice(net.indexOf('fun post')), /readTimeout = ([\d_]+)/);

  t.ok(page > 0 && job > 0 && post > 0, 'all three limits were found to compare');
  t.ok(page < job, 'the page gives up before Kotlin does, so Kotlin is the backstop');
  t.ok(page > post * 2,
    'and the page allows a slow PPQ request and a second attempt, not less than one');
  t.ok(job < 10 * 60 * 1000,
    'while Kotlin stays inside the ten minutes Android allows a job');
});

/*
 * Every Android call that needs a permission, against the manifest that has to declare it.
 *
 * The briefing job asked for a network, which needs ACCESS_NETWORK_STATE to *book*, not
 * merely to run. It was never declared, so JobScheduler refused the job outright - not
 * deferred, not run late, refused - every time, on every build since the job was written.
 * Nothing said so: schedule() returns a bare int and the exception went into a catch
 * block that returned false. Weeks of "the briefing only writes when the app is opened"
 * was one undeclared line in the manifest.
 *
 * So: a table, because the next one of these will be some other call with some other
 * permission, and the manifest is the one place that cannot be inferred from the Kotlin.
 */
/*
 * The WebView that carries the bridge may only ever be on the app's own page.
 *
 * Everything safe about that bridge rests on this one fact. It hands out the PPQ key,
 * fetches anything and posts anywhere, and all that is fine while the only page running
 * it comes out of assets. Nothing was enforcing it: the default is to follow whatever
 * navigation it is given, and the page has no anchor, no form and no write to location
 * today - but "today" was the whole of the guarantee.
 */
suite('Only the app\'s own page is ever on the end of the bridge', (t) => {
  const kt = read(KT + 'MainActivity.kt');
  const main = kt.slice(kt.indexOf('web.webViewClient'), kt.indexOf('root.addView(web'));
  t.ok(/override fun shouldOverrideUrlLoading/.test(main), 'navigation is answered, not defaulted');
  t.ok((main.match(/shouldOverrideUrlLoading/g) || []).length >= 2,
    'in both forms, since the old one is what pre-24 calls');
  t.ok(/!isOwnPage\(/.test(main), 'and anything that is not the app\'s own page is refused');
  t.ok(/const val PAGE = "file:\/\/\/android_asset\/index\.html"/.test(kt),
    'with one name for that page rather than a string in two places');
  t.ok(/web\.loadUrl\(PAGE\)/.test(kt), 'which is the one it loads');

  /* The scraper is the opposite WebView: somebody else's page, no bridge. It is only
     ever handed one hard-coded address today, but it is reached through the bridge from
     the page that handles other people's feeds, and allowFileAccess defaults to true
     below API 30 - where shared_prefs is where the PPQ key lives. */
  const scrape = kt.slice(kt.indexOf('private fun startScrape'), kt.indexOf('private fun finishScrape'));
  t.ok(/startsWith\("http:\/\/"\) && !url\.startsWith\("https:\/\/"\)/.test(scrape),
    'the scraper takes the web and nothing else');
  t.ok(scrape.indexOf('return') < scrape.indexOf('WebView(this)'),
    'turning anything else away before a WebView is even made');
  ['allowFileAccess', 'allowContentAccess', 'allowFileAccessFromFileURLs',
   'allowUniversalAccessFromFileURLs'].forEach((s) => {
    t.ok(new RegExp('settings\\.' + s + ' = false').test(scrape),
      s + ' is off for a page the app did not write');
  });
});

/*
 * A kitchen named by a test fixture has to be one the app actually asks for.
 *
 * Replacing three dead kitchens broke the recipes test, because its fixture answered for
 * deliciouslyella - which the app no longer fetches, so the reply was never asked for and
 * the assertion about it could not come true. That is a twenty-minute round trip to find
 * out something readable from here in a second, and it will happen again the next time a
 * kitchen closes.
 */
suite('The kitchens a fixture answers for are kitchens the app asks', (t) => {
  const page = read(PAGE);
  const list = page.slice(page.indexOf('var RC_KITCHENS = ['), page.indexOf('var RC_MAX'));
  const hosts = Array.from(new Set((list.match(/https:\/\/([\w.-]+)/g) || [])
    .map((u) => u.replace('https://', '').replace(/^www\./, ''))));
  t.ok(hosts.length >= 4, 'there are kitchens to compare against');

  const fixture = fs.readFileSync(path.join(__dirname, 'logic.test.js'), 'utf8');
  /* Only the ones the recipe stub answers for - a bare domain mentioned in prose is not a
     claim about anything. These are the lines that hand back a feed. */
  const named = (fixture.match(/if \(\/([\w-]+)\/\.test\(url\)\) return \{ ok: true, body: rss\(/g) || [])
    .map((m) => (m.match(/\/([\w-]+)\//) || [])[1])
    .filter(Boolean);
  t.ok(named.length >= 2, 'and the fixture answers for some of them');
  named.forEach((n) => {
    t.ok(hosts.some((h) => h.indexOf(n) === 0 || h.replace(/\..*$/, '') === n),
      n + ' is a kitchen the app still asks for');
  });
});

/*
 * A library is not a feed, and the difference is the whole of this.
 *
 * BOSH publishes no feed - their llms.txt names an API that would not answer, and
 * robots.txt declares one sitemap and disallows nothing but /admin/. What the sitemap
 * gives is addresses and lastmod dates, and lastmod is when a page was touched rather
 * than when the recipe was written. Hundreds of recipes that do not change: sorted by
 * date they would sit at the bottom for ever, or, dated today, lie about being new.
 */
suite('The recipe library is drawn from rather than sorted', (t) => {
  const page = read(PAGE);
  t.ok(/bo: \{ name: 'BOSH!'/.test(page), 'the library is a source like the rest');
  t.ok(/library: true/.test(page), 'marked as one, since it is handled differently');
  t.ok(/srcs: \['rc', 'bo'\]/.test(page), 'and it is on the Recipes tab');
  t.not(/FEED_SRCS = \[[^\]]*'bo'/.test(page),
    'but not on All, where a row with no date would have nothing to say for itself');
  t.ok(/thread\(thread\(weave\(tNews, RUN_MAX\), tDiary, DIARY_EVERY\), tLib, BOSH_EVERY\)/.test(page),
    'threaded through at a spacing, the way the diary is and for the same reason');
  t.ok(/byOrder/.test(page), 'and kept in the order the day drew it, having no date to sort by');

  /* Only a recipe, only one level down, and never the index itself. */
  const from = page.slice(page.indexOf('function boshFromSitemap'), page.indexOf('function boshHeld'));
  t.ok(/bosh\\\.tv\\\/recipes\\\/\(\[a-z0-9-\]\+\)\\\/\?\$/.test(from),
    'the sitemap gives up recipe addresses and nothing else');

  /*
   * Two bugs lived in this sort, one after the other, and both would have shipped
   * looking like a working feature showing the same handful of recipes for ever.
   *
   * hash() answers with a string, and comparing strings sorts them like words - so the
   * first character decided it. 30 recipes of 200 over four months.
   *
   * Then djb2 multiplies as it goes, so the end of a string counts for far more than the
   * start: with the day on the front it was drowned by the slug behind it and every day
   * drew the same five. 15 of 200. The day goes on the end now and the result is stirred
   * again, which reaches 189 of 200.
   */
  const key = page.slice(page.indexOf('function boshKey'), page.indexOf("/** The day's draw"));
  t.ok(/Number\(hash\(slug \+ ':' \+ day\)\)/.test(key),
    'read as a number, with the day at the end where djb2 can hear it');
  t.ok(/Math\.imul/.test(key), 'and stirred, so a day apart is not a place apart');
  t.ok(/boshKey\(a\.slug, day\) - boshKey\(b\.slug, day\)/.test(page),
    'the draw subtracts numbers rather than comparing strings');

  // The list of addresses barely changes, so it is not fetched every refresh.
  t.ok(/BOSH_LIST_DAYS/.test(page) && /Date\.now\(\) - o\.at > BOSH_LIST_DAYS \* DAY/.test(page),
    'and the addresses are kept for a week rather than fetched again every time');
});

/* Two of the kitchens hand out links ending "?adt_ei={$email}" - a newsletter template
   leaking into their feed. That is not a parameter, it is the hole where one was meant
   to go, and it should not be in a link handed to somebody. Done in abs(), which every
   link and image passes through, and narrow enough to be sure about: a real URL does not
   carry braces in a query value. */
suite('A link is not handed over with the template still in it', (t) => {
  const page = read(PAGE);
  t.ok(/function untemplate\(u\)/.test(page), 'there is something that takes them out');
  /* A source that failed without an HTTP answer read "HTTP 0", which names no problem
     and suggests no fix. Kotlin knows which it was - timed out, waited too long for a
     slot - and that was being dropped on the way back. Only at status 0: on a 403 the
     body is the server's error page. */
  t.ok(/why: \(!ok && !status\) \? String\(body \|\| ''\)\.slice\(0, 80\) : ''/.test(page),
    'and a failure with no status carries the reason back from Kotlin');
  t.ok((page.match(/error: r\.why/g) || []).length >= 4,
    'which every source that records its attempts passes on');
  t.ok(/return untemplate\(new URL\(u, base\)\.href\)/.test(page),
    'and abs runs every link through it, which is all of them');
  const fn = page.slice(page.indexOf('function untemplate(u)'), page.indexOf('function abs(u, base)'));
  t.ok(/if \(u\.indexOf\('\{'\) < 0\) return u;/.test(fn),
    'a link with no braces in it is left exactly alone');
  t.ok(/\[\^\?&=\]\*=\\\{\[\^\}\]\*\\\}/.test(fn.replace(/\s+/g, '')) || /\{\[\^\}\]\*\\?\}/.test(fn),
    'and only a parameter whose value is a placeholder is removed');
});

/*
 * A story being read out carries on when the app does not.
 *
 * The engine used to belong to the activity, so it died with it: leaving the story,
 * opening another, or putting the phone in a pocket each stopped the voice mid sentence.
 * That was deliberate, on the grounds that a voice carrying on from the last article
 * while you read the next is worse than no voice - which is right for somebody reading
 * and exactly wrong for somebody listening, and listening is what the button is for.
 */
suite('A story read out loud outlives the screen', (t) => {
  const kt = read(KT + 'Reading.kt');
  t.ok(/class ReadingService : Service\(\)/.test(kt),
    'the speaking happens in a service, the only way to make noise with nothing on screen');
  t.ok(/startForeground\(ID, build\(\), ServiceInfo\.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK\)/.test(kt),
    'a foreground one, declaring what kind, which Android 14 requires');
  const man = read('app/src/main/AndroidManifest.xml');
  t.ok(/android:foregroundServiceType="mediaPlayback"/.test(man), 'and says so in the manifest');
  ['FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PLAYBACK'].forEach((p) => {
    t.ok(new RegExp('uses-permission android:name="android\\.permission\\.' + p + '"').test(man),
      p + ' is declared, or it cannot start at all');
  });
  // raise() before the command is read: the system kills a process that took a
  // startForegroundService and did not show itself within a few seconds.
  const start = kt.slice(kt.indexOf('override fun onStartCommand'), kt.indexOf('/** Reads whatever'));
  t.ok(start.indexOf('raise()') < start.indexOf('when (intent?.action)'),
    'it shows itself before doing anything, whatever the command turns out to be');

  t.ok(/object Reading \{/.test(kt), 'the queue is kept outside the activity');
  t.ok(/@Volatile var listener/.test(kt), 'which reports to a page while there is one');
  const act = read(KT + 'MainActivity.kt');
  t.ok(/Reading\.listener = null/.test(act) && /spoke = null/.test(act),
    'and is unhooked rather than stopped when the activity goes');
  t.not(/voice\?\.release\(\)/.test(act), 'the activity no longer owns an engine to release');

  /* Queueing rather than interrupting, which is the other half of it. */
  t.ok(/fun speak\(id: String, title: String, text: String\)/.test(act),
    'a story is queued by name, so the notification can say what it is reading');
  t.ok(/Reading\.has\(id\)/.test(kt), 'and the same story is not queued twice over');
  t.ok(/fun skip\(\)/.test(act) && /ACTION_SKIP/.test(kt), 'with a way past the current one');
  t.ok(/Taps\.openAt\(this, 7, p\.id\)/.test(kt),
    'and tapping the notification opens the story being read');

  /* The page stops cutting it off. These three lines are the feature. */
  const page = read(PAGE);
  const closeR = page.slice(page.indexOf('function closeReader()'), page.indexOf('function readerNeighbour'));
  t.not(/\bhush\(\);/.test(closeR), 'leaving the story does not stop it');
  const openR = page.slice(page.indexOf('function openReader(it)'), page.indexOf('function summaryBlocks'));
  t.not(/\bhush\(\);/.test(openR), 'nor does opening another');
  t.ok(/paused: function \(\) \{ stopAmbient\(\); stopTimers\(\); flushSave\(\); \}/.test(page),
    'nor does the app going off screen, which is when it is most wanted');
  // One source of truth for whether anything is being read: the queue itself.
  t.not(/S\.speaking/.test(page), 'and there is no second flag to disagree with the queue');
  t.ok(/function readingNow\(it\)/.test(page) && /function readingNext\(it\)/.test(page),
    'the button asks about the story in front of you, not about speech in general');
});

/*
 * Whether two stories are the same story still going on - which nothing in this app has
 * ever known. The trap is that the obvious method fails in a way that looks like
 * success: half the stories here say Hereford, so counting shared words welds the whole
 * local feed into one thread and presents it as a feature.
 */
suite('One story or two is decided on what is rare, not on what is shared', (t) => {
  const th = read(KT + 'Threads.kt');

  t.ok(/^import /m.test(th) === false,
    'the rules import nothing, so they can be run against written-out answers');
  t.ok(/fun weight\(seen: Int\): Int/.test(th), 'a word is worth something by how rare it has been');
  t.ok(/else -> 0 /.test(th),
    'and a word seen past the top band is worth nothing at all, which is the whole design');
  t.ok(/seen <= 2 -> 4/.test(th), 'while one all but unique is worth the most');

  /* The two bars, and the relationship between them that makes a single coincidence
     impossible. A test in the off-device suite asserts that relationship too. */
  const shared = (th.match(/const val SHARED_MIN = (\d+)/) || [])[1];
  const score = (th.match(/const val SCORE_MIN = (\d+)/) || [])[1];
  t.ok(!!shared && !!score, 'both bars are named rather than buried in the comparison');
  t.ok(Number(score) > 4, 'and one word, worth four at the most, cannot clear the score on its own ('
    + score + ')');

  t.ok(/fun words\(title: String\): List<String>/.test(th), 'a headline is reduced to what is worth comparing');
  t.ok(/if \(w\.length < 3\) continue/.test(th),
    'three letters and up, which keeps a road number and drops the wreckage');
  t.ok(/fun joins\(/.test(th) && /fun place\(/.test(th),
    'and it can answer both whether, and which of several');
  t.ok(/if \(worth == 0\) continue/.test(th),
    'a shared word worth nothing is not counted as shared');
});

/*
 * News prose is written for the eye. "£3.011tn", "A303", "05:04" and "A&E" all read
 * perfectly on a screen and all come out of a speech engine as gibberish or silence. The
 * rules that fix that are the kind of code that is wrong quietly - one daft sentence, out
 * loud, with nothing written down - so what matters structurally is that they cannot be
 * got round, and that they stay testable off a device.
 */
suite('Written news is turned into something a voice can read', (t) => {
  const sp = read(KT + 'Spoken.kt');
  const kt = read(KT + 'Reading.kt');

  t.not(/^import android/m.test(sp),
    'the rules import nothing from Android, which is what lets them run on a JVM');
  t.ok(/^import /m.test(sp) === false,
    'nor anything else: pure Kotlin, or tests/kotlin.test.sh cannot compile it alone');
  t.ok(/object Spoken \{/.test(sp) && /fun forVoice\(text: String\): String/.test(sp),
    'there is one entry point for turning written text into spoken text');
  t.ok(/catch \(e: Exception\) \{\s*text\s*\}/.test(sp),
    'a rule that blows up costs a clumsy sentence, not the article');

  /* The one chokepoint. Everything spoken - article, briefing, anything queued later -
     goes through split(), so normalising there cannot be bypassed by a new caller. */
  t.ok(/for \(raw in Spoken\.forVoice\(text\)\.split\("\\n"\)\)/.test(kt),
    'and it sits in split(), which everything spoken passes through');
  const hand = kt.slice(kt.indexOf('private fun hand('), kt.indexOf('/** A paragraph at a time'));
  t.ok(/t\.speak\(seg\.parts\[i\]/.test(hand) && !/t\.speak\(text/.test(kt),
    'nothing hands the engine text that has not been through it');

  /* Only the engine gets the rewritten words. The screen keeps its pound signs. */
  const others = ['MainActivity.kt', 'Briefings.kt', 'Widget.kt', 'WidgetFeed.kt', 'WidgetHistory.kt'];
  others.forEach((f) => {
    t.not(/Spoken\./.test(read(KT + f)),
      f + ' does not use it, so nothing drawn or stored is ever the spoken version');
  });

  // It must not round. "3.011 trillion" is a mouthful; a bulletin quietly changing a
  // figure to a nicer one is worse than a mouthful.
  t.not(/roundTo|Math\.round|BigDecimal|String\.format/.test(sp),
    'no rounding anywhere in it: a figure is read as written');

  t.ok(/setAudioAttributes\(/.test(kt) && /CONTENT_TYPE_SPEECH/.test(kt),
    'the engine is told to play as the stream the service asked focus for');

  // These live in the repository rather than the tarball, so not through has().
  t.ok(fs.existsSync(path.join(__dirname, 'kotlin.test.kt'))
    && fs.existsSync(path.join(__dirname, 'kotlin.test.sh')),
    'and the rules are checked against written-out answers, not by listening');
});

/*
 * The difference between a queue of articles and something you listen to is the seams. A
 * neural engine takes a moment to synthesise, so handed the next piece only once the last
 * has finished, that moment is silence - every seam, every time. And an interruption used
 * to end the session outright, which is survivable for one article and not for a
 * four-minute programme.
 */
suite('What is read runs on without gaps, and survives being interrupted', (t) => {
  const kt = read(KT + 'Reading.kt');

  /* Both of these need the same missing thing: a record of where the voice has got to. */
  t.ok(/private var atSeg = 0/.test(kt) && /private var atPart = 0/.test(kt),
    'the speaker knows which paragraph of which piece is being spoken');
  t.ok(/@Volatile private var run = 0/.test(kt),
    'and the run is volatile, being written on the main thread and read on the engine\'s');

  const pause = kt.slice(kt.indexOf('fun pause()'), kt.indexOf('fun resume()'));
  t.not(/segs\.clear\(\)/.test(pause), 'pausing keeps what was queued, which is the point of it');
  t.ok(pause.indexOf('run++') < pause.indexOf('tts?.stop()'),
    'and bumps the run before stopping, so the callbacks the stop provokes arrive stale');

  const hush = kt.slice(kt.indexOf('fun hush()'), kt.indexOf('fun release()'));
  t.ok(/segs\.clear\(\)/.test(hush), 'where hush, which is a real stop, throws it away');

  /* Only the first thing handed over may flush; everything after it is added behind. */
  const q = kt.slice(kt.indexOf('fun queue(text: String)'), kt.indexOf('fun pause()'));
  t.not(/QUEUE_FLUSH/.test(q), 'a queued piece never flushes what is already being read');
  t.ok(/hand\(t, segs\.size - 1, 0, false\)/.test(q),
    'and is handed over with the flush explicitly off, not merely without the word in sight');
  t.ok(/!held/.test(q), 'and is not handed over while paused, which would start it talking');
  t.ok(/if \(flush && i == from\) TextToSpeech\.QUEUE_FLUSH else TextToSpeech\.QUEUE_ADD/.test(kt),
    'the flush is spent on the very first paragraph and nothing else');

  /* Kept exactly one piece ahead. Further ahead is work thrown away on a skip. */
  t.ok(/private const val AHEAD = 2/.test(kt), 'the engine holds the one being read and the next');
  const ahead = kt.slice(kt.indexOf('private fun feedAhead()'), kt.indexOf('private fun read()'));
  t.ok(/while \(fed < AHEAD\)/.test(ahead), 'and is topped up to there, never past it');

  const skip = kt.slice(kt.indexOf('ACTION_SKIP ->'), kt.indexOf('ACTION_PAUSE ->'));
  t.ok(/voice\?\.hush\(\)/.test(skip) && /fed = 0/.test(skip),
    'skipping throws away what the engine holds, because part of it is the next piece');

  const after = kt.slice(kt.indexOf('private fun read()'), kt.indexOf('private fun failed('));
  t.ok(/if \(fed == 0\) \{ speakNow\(\); return \}/.test(after),
    'and a piece that was never pre-fed is started rather than waited for for ever');

  /* The behaviour change: a loss holds its place instead of emptying the queue. */
  const focus = kt.slice(kt.indexOf('private fun focusChanged('), kt.indexOf('private fun drop()'));
  t.not(/allDone\(\)/.test(focus), 'losing the audio no longer ends the session');
  t.ok(/AUDIOFOCUS_GAIN -> if \(v\.holding\(\)\) \{ v\.resume\(\)/.test(focus),
    'getting it back carries on from where it stopped');
  ['AUDIOFOCUS_LOSS', 'AUDIOFOCUS_LOSS_TRANSIENT', 'AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK'].forEach((k) => {
    t.ok(new RegExp('AudioManager\\.' + k + '\\b').test(focus), k + ' is handled');
  });
  t.ok(/v\.pause\(\)/.test(focus), 'all three by pausing - speech under another sound is lost, not quieter');

  /* A permanent loss never comes back on its own, so there has to be a way out by hand. */
  const build = kt.slice(kt.indexOf('private fun build()'), kt.indexOf('private fun act('));
  t.ok(/if \(paused\) b\.addAction\(act\("Play", ACTION_PLAY/.test(build),
    'so the notification offers Play once it is paused');
  t.ok(/else b\.addAction\(act\("Pause", ACTION_PAUSE/.test(build), 'and Pause while it is not');
  t.ok(/if \(paused\) "Paused" else "Reading aloud"/.test(build), 'and says which it is');
  const play = kt.slice(kt.indexOf('ACTION_PLAY ->'), kt.indexOf('else -> allDone()'));
  t.ok(/if \(hold\(\)\) voice\?\.resume\(\)/.test(play),
    'asking for the audio again first, since something else took it');
});

/*
 * The whole point of a spoken edition is that it plays from the five o'clock
 * notification with the app shut, which means none of it may need the WebView. A page
 * that has not been opened holds nothing, so what the edition is made of has to be
 * sitting in preferences before it is asked for.
 */
suite('An edition can be read out with the app never opened', (t) => {
  const ed = read(KT + 'Edition.kt');
  const w = read(KT + 'Widget.kt');
  const r = read(KT + 'Reading.kt');
  const page = read(PAGE);

  t.ok(/^import /m.test(ed) === false,
    'the running order imports nothing, so it can be checked off a device');
  t.ok(/fun build\(/.test(ed) && /fun covered\(/.test(ed),
    'and holds both the order of the parts and the did-we-say-this-already rule');
  t.ok(/private const val HEADS = 5/.test(ed) && /private const val SLOTS = 4/.test(ed),
    'a bulletin rather than a list: five headlines and four diary entries');

  /* Three stores, none of them the page. The first two were already there for the home
     screen; the third exists because nothing outside the page had what is on in town. */
  const store = w.slice(w.indexOf('object EditionStore'), w.indexOf('class BriefingWidget'));
  ['BriefStore.read', 'FeedStore.read'].forEach((s) => {
    t.ok(store.indexOf(s) >= 0, 'it assembles from ' + s + ', which is already kept for the widgets');
  });
  t.ok(/getSharedPreferences\(FILE, Context\.MODE_PRIVATE\)\.getString\(KEY, null\)/.test(store),
    'and from what the page handed over for the two parts nothing else keeps');
  t.ok(/\.commit\(\)/.test(store), 'written with commit, since the job can be killed as it reports done');
  t.not(/Net\./.test(store) || /Net\./.test(ed),
    'and nothing in it fetches: the edition is the bulletin as written, not as refetched');

  /* The page hands it over where it hands the other two over, which is also the path the
     background job takes - so this is current on a day the app is never opened. */
  t.ok(/widgetEdition\(\);/.test(page), 'the page pushes it when a refresh settles');
  const push = page.slice(page.indexOf('function widgetPush()'), page.indexOf('function widgetEdition()'));
  t.ok(/widgetEdition\(\)/.test(push), 'from widgetPush, alongside the headlines and the archive');
  t.ok(/Native\.editionSave\(/.test(page), 'through the bridge, like everything else that leaves the page');
  t.ok(/briefPrices\(\)/.test(page.slice(page.indexOf('function widgetEdition()'))),
    'reusing the sentence the briefing prompt has been using all along');

  /* Both bridges. The background one is the one that matters, and the one that would
     have been missed: it is the run at five in the morning that posts the notification. */
  t.ok(/fun editionSave\(json: String\)/.test(read(KT + 'MainActivity.kt')),
    'the activity answers it');
  t.ok(/fun editionSave\(json: String\)/.test(read(KT + 'Briefings.kt')),
    'and so does the background job, which is the path the whole thing is for');

  /* Played from the notification, with no activity in it anywhere. */
  const notify = read(KT + 'Briefings.kt');
  t.ok(/ReadingService\.ACTION_EDITION/.test(notify) && /PendingIntent\.getService/.test(notify),
    'the briefing notification starts the service directly, not an activity');
  t.ok(/if \(EditionStore\.parts\(ctx\)\.isNotEmpty\(\)\)/.test(notify),
    'and only offers it when there is something to play');
  t.ok(/"Play the edition"/.test(notify), 'in those words');

  /* The fault that was reported: it could be listened to before it could be read.
     Two stores hold a briefing, and only one of them was repairable. */
  t.ok(/fun raw\(ctx: Context\): String/.test(w), 'what is stored can be handed back as it was');
  ['MainActivity.kt', 'Briefings.kt'].forEach((f) => {
    t.ok(/fun briefRead\(\): String = BriefStore\.raw\(/.test(read(KT + f)),
      f + ' lets the page read the durable copy back');
  });
  t.ok(/function recoverBrief\(\)/.test(page), 'and the page takes back one it never kept');
  const rec = page.slice(page.indexOf('function recoverBrief()'), page.indexOf('function rememberBrief(b)'));
  t.ok(/Native\.briefRead\(\)/.test(rec), 'from the store that is written with commit');
  t.ok(/if \(\(mine\[i\]\.at \|\| 0\) === b\.at\) return;/.test(rec),
    'only where it has nothing with that timestamp already');
  t.ok(/slotKey: briefSlot\(b\.at\)\.key/.test(rec),
    'and keyed the way the writer keys it, so a rewrite merges rather than doubling up');
  /* Called from loadBrief, which is where storage is read and therefore before
     anything is drawn. Sliced to that function's own body: a call anywhere in the file
     would satisfy a looser test and mean nothing. */
  const lb = page.slice(page.indexOf('function loadBrief()'));
  const body = lb.slice(0, lb.indexOf('\nfunction '));
  t.ok(/\brecoverBrief\(\);/.test(body), 'called from loadBrief, before anything is drawn');

  /* The same asymmetry the other way about: the edition had no age rule at all, so
     there was a day and a half in which a briefing could be heard and not seen. */
  /* Compared rather than both matched against 36, which would fail on a deliberate
     change to both and pass on nothing useful. What matters is that they agree. */
  const edH = (ed.match(/const val SHOW_HOURS = (\d+)/) || [])[1];
  const pgH = (page.match(/var BRIEF_SHOW_H = (\d+);/) || [])[1];
  t.ok(!!edH && !!pgH, 'both halves say how old a briefing may be');
  t.is(edH, pgH, 'and they say the same number of hours (' + edH + ' aloud, ' + pgH + ' on screen)');
  t.ok(/Edition\.stale\(stored\.at, System\.currentTimeMillis\(\)\)/.test(w),
    'and the running order applies it rather than reading whatever is there');

  /* The card that offers it. Kept off a television twice over, in the stylesheet and in
     the guard, because either one alone is enough and neither is where you would look
     for the other - the layout suite has to break both before the card appears. */
  t.ok(/#edCard\{display:none\}/.test(page), 'the play card is off by default');
  t.ok(/html\.touch #edCard\{display:flex/.test(page), 'and on for touch only');
  const card = page.slice(page.indexOf('function renderEdCard()'), page.indexOf('function edCardTap()'));
  t.ok(/TOUCH && TABS\[S\.tab\] && TABS\[S\.tab\]\.id === 'today'/.test(card),
    'drawn only on Today, and only where there is a finger');
  t.ok(/<button type="button" id="edCard" hidden>/.test(page),
    'as a button, so it is tappable and reaches a screen reader as what it is');
  t.ok(page.indexOf('id="edCard"') < page.indexOf('<ol id="list"'),
    'inside the scroller and above the rows, so it scrolls away rather than taking a strip for ever');
  t.ok(/Native\.editionList\(\)/.test(page) && /Native\.playEdition\(\)/.test(page),
    'and both what it says and what it does come from the same assembly as the voice');
  t.ok(/fun editionList\(\): String/.test(read(KT + 'MainActivity.kt'))
    && /fun playEdition\(\): Boolean/.test(read(KT + 'MainActivity.kt')),
    'which Kotlin answers');
  t.ok(/fun seconds\(parts: List<Part>\): Int/.test(ed),
    'how long it runs is worked out where it can be tested, not in the page');

  /* Not said twice, and not started over. Both are the same bookkeeping - what has
     been read today - and it lives in preferences because the case it exists for is the
     service being killed with the phone in a pocket half way through four minutes. */
  const st = w.slice(w.indexOf('object EditionStore'), w.indexOf('class BriefingWidget'));
  ['fun heard(', 'fun begin(', 'fun markHeard(', 'fun toPlay(', 'fun nextUp(', 'fun midway(']
    .forEach((f) => t.ok(st.indexOf(f) >= 0, 'the store offers ' + f.replace('fun ', '')));
  t.ok(/if \(o\.optString\("day", ""\) != today\(\)\) return none/.test(st),
    'the day\'s record is the day\'s, and goes when the day does');
  t.ok(/if \(was == now\) list\(o\.optJSONArray\("done"\)\) else emptyList\(\)/.test(st),
    'but what is done belongs to one edition: the afternoon brief is not the morning read twice');
  t.ok(/while \(titles\.size > KEEP_TITLES\) titles\.removeAt\(0\)/.test(st),
    'and the list of them is capped rather than kept for ever');
  t.ok(/heard\(ctx\)\.titles/.test(st), 'what was read today is handed to the running order');
  t.ok(/begin\(ctx, all\)/.test(st),
    'all the parts are stashed, not only those left, or a finished part cannot be looked up');

  const act = r.slice(r.indexOf('ACTION_EDITION ->'), r.indexOf('ACTION_PAUSE ->'));
  t.ok(/EditionStore\.toPlay\(applicationContext\)/.test(act),
    'playing picks up what is left rather than starting over');
  const after = r.slice(r.indexOf('private fun read()'), r.indexOf('private fun failed('));
  /* Both present and in that order. indexOf alone is a trap here: a markHeard that has
     gone missing scores -1, which is less than anything, so the ordering would pass by
     the call not being there at all. */
  const mh = after.indexOf('EditionStore.markHeard'), dn = after.indexOf('Reading.done()');
  t.ok(mh >= 0 && dn >= 0 && mh < dn,
    'and a finished part is recorded while it is still the one at the front');
  t.ok(/just\.id\.startsWith\("edition:"\)/.test(after), 'only for the edition, not for an article');

  /* Drawing a card must not change anything. nextUp answers the same question without
     stashing a running order, which toPlay does. */
  ['MainActivity.kt', 'Briefings.kt'].forEach((f) => {
    const b = read(KT + f);
    const fn = b.slice(b.indexOf('fun editionList(): String'), b.indexOf('fun playEdition()'));
    t.ok(/EditionStore\.nextUp\(/.test(fn), f + ' draws the card from what is left');
    t.not(/toPlay\(/.test(fn), f + ' does not stash a running order merely to draw one');
  });
  t.ok(/ed\.midway \? 'Carry on with this edition'/.test(page),
    'and the card offers to carry on rather than to play, when that is what it would do');
  t.ok(/if \(!Reading\.has\(id\)\) Reading\.add/.test(act),
    'and pressing play twice does not queue the same bulletin behind itself');
});

/*
 * What the briefing is asked for. It was reporting what had happened and stopping there,
 * in the same shape four times a day, out of fifty-word teasers - and no wording in a
 * prompt gets consequence out of a teaser, so the depth of what goes in matters as much
 * as what is asked of it.
 */
suite('The briefing is asked for consequence, not just for what happened', (t) => {
  const page = read(PAGE);
  const rules = page.slice(page.indexOf('var BRIEF_SYSTEM = ['), page.indexOf("].join('\\n');"));

  /* A lead told properly, then a roundup - which is also what reads aloud best, bullets
     out loud being a list of fragments with nothing joining them. */
  t.ok(/SHAPE\. The first paragraph is the lead/.test(rules), 'the shape is stated, not implied');
  t.ok(/four to six sentences/.test(rules), 'and the lead is given room to say something');
  t.ok(/Choose the lead on consequence, not on category/.test(rules),
    'chosen on what matters rather than by a fixed running order of topics');
  t.ok(/nearer Hereford leads/.test(rules), 'with distance from here as the tie-break');
  t.ok(/roundup is two to four short paragraphs/.test(rules), 'and the rest kept brisk');

  t.ok(/WHY IT MATTERS\./.test(rules), 'significance is a rule of its own');
  t.ok(/earns its place by what follows from the story, not by the story/.test(rules),
    'and a story with nothing following from it is left out');
  t.ok(/"This could have wider implications" says nothing/.test(rules),
    'the empty version of significance is named and forbidden');
  t.ok(/Do not invent consequence/.test(rules),
    'and inventing it is worse than saying what is not yet known');
  t.ok(/no bullet points, no markdown, no headings/.test(rules),
    'said once at the top, because it is read aloud as well as read');

  /* The four editions have to differ, which was the third complaint. Each angle says
     what its lead is for: told only to mention what is new, a writer makes the same
     shape four times with the nouns changed. */
  const slots = page.slice(page.indexOf('var BRIEF_SLOTS = ['), page.indexOf('function slotMins'));
  t.is((slots.match(/angle:/g) || []).length, 4, 'all four editions have an angle');
  /* Each one named rather than counted, because what makes them differ is which story
     leads - and these are the four answers. */
  const leads = ['Lead with the most consequential', 'Lead with what has actually moved since the morning',
    'Lead with the story the day turned on', 'Lead with what the day came to'];
  const where = ['the morning leads on the night', 'the afternoon on what has moved',
    'the evening on the day', 'and the night settles it'];
  leads.forEach((l, i) => t.ok(slots.indexOf(l) >= 0, where[i]));
  t.is(new Set(leads.map((l) => slots.indexOf(l))).size, 4, 'and no two of them are the same words');

  /* The ceiling on how specific the writing can possibly be. */
  t.ok(/var BRIEF_CUT = 340;/.test(page) && /var BRIEF_CUT_TOP = 1200;/.test(page),
    'the top of each section is given room, the rest a line');
  t.ok(/slice\(0, 1200\)/.test(page),
    'and that long cut is the same length the parsers keep, so it trims nothing twice');
  const inp = page.slice(page.indexOf('function briefInput('), page.indexOf('/* A story that has come in since'));
  t.ok(/i < BRIEF_TOP_EACH \? BRIEF_CUT_TOP : BRIEF_CUT/.test(inp),
    'spent on the items a lead is actually chosen from');

  /* Now that the cut is large, this matters more than it did: the writer must not be
     handed its own earlier editions as stories. They are in ALREADY SAID, in full,
     which is where they belong. */
  t.ok(/var t = buildToday\(all, true\);/.test(page),
    'the tray it writes from leaves out the briefings already written');
  t.ok(/ALREADY SAID EARLIER TODAY/.test(page), 'which it is given separately, and told not to repeat');
  t.ok(/keep the lead and cut the roundup to one paragraph or none/.test(rules),
    'and on a day with nothing new it writes less rather than padding');
});

/*
 * Five new sources and a tab to put them in. The thing worth guarding is not that they
 * work - only the running app can say that, and the sources panel is where it says it -
 * but that the wiring agrees with itself: a source in no tab is fetched and never shown,
 * a tab naming a source that does not exist draws nothing, and a loader missing from the
 * table means a source that is simply never asked.
 */
suite('The gaming sources are wired to a tab and to a loader', (t) => {
  const page = read(PAGE);
  const srcs = ['px', 'xw', 'eg', 'vg', 'pg'];

  t.ok(/var GAME_SRCS = \['px', 'xw', 'eg', 'vg', 'pg'\];/.test(page), 'the five are named in one place');
  t.ok(/\{ id: 'gaming',\s+name: 'Gaming',.*srcs: GAME_SRCS/.test(page),
    'and the tab takes that list rather than a second copy of it');

  srcs.forEach((k) => {
    t.ok(new RegExp('\\b' + k + ': \\{ name:').test(page), k + ' is in the source table');
    t.ok(new RegExp("'" + k + "'").test(page.slice(page.indexOf('var ORDER ='), page.indexOf('var GAME_SRCS'))),
      'and in ORDER, or it is never fetched at all');
    t.ok(new RegExp('\\b' + k + ': feedSite\\(').test(page), 'and has a loader in the table');
  });

  /* Out of Today and All on purpose: five more sites in the main feed would drown the
     nine already there, and this is a tab you go to rather than one you are shown. */
  const feed = page.slice(page.indexOf('var FEED_SRCS ='), page.indexOf('/* Kagi files everything'));
  srcs.forEach((k) => {
    t.not(new RegExp("'" + k + "'").test(feed), k + ' is kept out of Today and All');
  });

  /* Several addresses each, because a feed that has moved is how a source dies quietly. */
  ['PX_FEEDS', 'XW_FEEDS', 'EG_FEEDS', 'VG_FEEDS', 'PG_FEEDS'].forEach((v) => {
    const m = page.match(new RegExp('var ' + v + ' = \\[([\\s\\S]*?)\\];'));
    t.ok(!!m && (m[1].match(/https?:/g) || []).length >= 2, v + ' has more than one address to try');
  });
  t.ok(/function feedSite\(key, feeds, api\)/.test(page),
    'and one loader serves all five rather than five near-copies of it');

  /* The briefing sees them, and is told to leave them alone on an ordinary day. */
  t.ok(/function briefGaming\(\)/.test(page), 'the briefing is given the gaming headlines');
  t.ok(/SRC\[it\.src\]\.game/.test(page), 'picked out by the flag on the source, not a second list');
  const rules = page.slice(page.indexOf('var BRIEF_SYSTEM = ['), page.indexOf('].join(\'\\n\');'));
  t.ok(/A GAMING block, where there is one, is there to be ignored on most days/.test(rules),
    'and told plainly that most days it says nothing about games');
  t.ok(/never more than one of them/.test(rules), 'and at most one of them when it does');
  // Not a section of Today: those are Today's list, and gaming is not in Today.
  const today = page.slice(page.indexOf('function buildToday('), page.indexOf('/* Diary entries still to come'));
  t.not(/\.game\b/.test(today), 'gaming is not a section of Today');
});

/*
 * A booked job is not a job that runs. A phone on a bedside table is in Doze by two in
 * the morning, and Doze defers jobs to maintenance windows that grow further apart the
 * longer it lasts - to whitelisted apps as well, which get network and alarms out of
 * being excused battery optimisation and explicitly do not get their jobs run. So the
 * five o'clock booking waited, and the moment the phone was picked up it ran and a
 * notification arrived, which looks exactly like opening the app having caused it.
 */
suite('Something fires at five in the morning, not when the phone is picked up', (t) => {
  const kt = read(KT + 'Briefings.kt');
  t.ok(/fun armAlarm\(ctx: Context, due: Long\)/.test(kt), 'an alarm is set as well as a job');
  t.ok(/setAndAllowWhileIdle\(AlarmManager\.RTC_WAKEUP/.test(kt),
    'with the one call that fires in Doze, and RTC_WAKEUP so it wakes the thing');
  // The exact version wants SCHEDULE_EXACT_ALARM and is meant for alarm clocks. "A few
  // minutes after five" is what the briefing promises anyway.
  t.not(/setExactAndAllowWhileIdle/.test(kt), 'inexact, so it needs no permission to be set');
  const sched = kt.slice(kt.indexOf('fun scheduleNext'), kt.indexOf('private const val LADDER'));
  t.ok(/armAlarm\(ctx, due\)/.test(sched), 'armed whenever the job is booked');
  t.ok(sched.indexOf('armAlarm') < sched.indexOf('for (rung'),
    'and before the booking, so a refused booking still leaves an alarm');

  t.ok(/class BriefingAlarm : BroadcastReceiver\(\)/.test(kt), 'something is there to be woken');
  const recv = kt.slice(kt.indexOf('class BriefingAlarm'), kt.indexOf('class BriefingRun('));
  /* A foreground service, not a job. Asking JobScheduler from here was walking round
     the wall and handing the work back over it: the alarm fires in Doze and the job it
     asked for was deferred by the very Doze it had just got past. An alarm firing while
     idle lets the app out for long enough to start a service, and a service in the
     foreground is not deferred by anything. */
  t.ok(/BriefingWork\.start\(c\)/.test(recv),
    'which starts a foreground service rather than asking for a job that Doze will defer');
  t.not(/Briefings\.runNow\(c\)/.test(recv), 'and not the thing the alarm exists to get past');
  t.ok(/class BriefingWork : Service\(\)/.test(kt), 'that service exists');
  t.ok(/startForeground\(ID, b\.build\(\), ServiceInfo\.FOREGROUND_SERVICE_TYPE_DATA_SYNC\)/.test(kt),
    'and raises itself, saying what kind, which Android 14 requires');
  /*
   * A run must never book the job it is running under.
   *
   * Scheduling a JobScheduler id that is already executing cancels the execution. The
   * run's first instruction used to be scheduleNext(), which books JOB_ID - and the
   * scheduled run IS JOB_ID. So every scheduled briefing stopped itself on its first
   * line: "stopped by the system - 1s", four times a day, for as long as the job has
   * existed. Only the alarm's runs got anywhere, because runNow books a different id,
   * and that one difference is why this took two days and three wrong theories to find.
   */
  // Comments stripped: both of these explain in prose what they must not do.
  const bare = (t2) => t2.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
  const runBody = bare(kt.slice(kt.indexOf('class BriefingRun('), kt.indexOf('class BriefingJob :')));
  t.not(/scheduleNext/.test(runBody), 'the run books nothing while it is the thing running');
  /* One scheduleNext in the receiver and one only: the boot branch, where nothing of
     ours can be running. The branch that fires alongside the job arms the alarm alone. */
  t.ok(/Briefings\.armNext\(c\)/.test(bare(recv)),
    'the alarm arms the next alarm without touching a job it fires alongside');
  t.is((bare(recv).match(/scheduleNext/g) || []).length, 1,
    'and books a job only after a reboot, which is the one time nothing is running');
  const jobHost = kt.slice(kt.indexOf('class BriefingJob :'), kt.indexOf('class BriefingWork :'));
  t.ok(jobHost.indexOf('jobFinished') < jobHost.indexOf('Briefings.scheduleNext'),
    'the job finishes before it books the next, in that order');

  /* The work is the same whichever starts it, so it is written once. */
  t.ok(/class BriefingRun\(private val app: Context, private val onEnd: \(\) -> Unit\)/.test(kt),
    'the run itself belongs to neither of them');
  t.ok(/class BriefingJob : JobService\(\)/.test(kt), 'the scheduler still has its way in');
  t.ok(/ACTION_BOOT_COMPLETED/.test(recv),
    'and re-arms after a reboot, which an alarm does not survive the way a job does');
  t.ok(/logRun\(c, System\.currentTimeMillis\(\), "woken by the alarm"/.test(recv),
    'saying so in the log, or a silent alarm is the old problem again');
});

/* A component the manifest names and the Kotlin does not have is an error nothing
   notices until the system tries to start it, which for a receiver is at five in the
   morning on somebody else's phone. */
suite('Every component the manifest names exists', (t) => {
  const mf = read('app/src/main/AndroidManifest.xml');
  const kt = ['MainActivity.kt', 'Briefings.kt', 'Widget.kt', 'WidgetFeed.kt',
              'WidgetHistory.kt', 'Net.kt', 'Reading.kt'].map((f) => read(KT + f)).join('\n');
  const named = (mf.match(/android:name="\.(\w+)"/g) || [])
    .map((m) => m.replace(/android:name="\./, '').replace(/"$/, ''));
  t.ok(named.length >= 6, 'the manifest names components at all');
  named.forEach((n) => {
    t.ok(new RegExp('(class|object) ' + n + '\\b').test(kt),
      n + ' is declared in the Kotlin as well as in the manifest');
  });
});

suite('What the Kotlin asks for, the manifest declares', (t) => {
  const mf = read('app/src/main/AndroidManifest.xml');
  const kt = ['MainActivity.kt', 'Briefings.kt', 'Widget.kt', 'WidgetFeed.kt',
              'WidgetHistory.kt', 'Net.kt', 'Reading.kt'].map((f) => read(KT + f)).join('\n');
  const declared = (p) =>
    new RegExp('uses-permission android:name="android\\.permission\\.' + p + '"').test(mf);

  [
    ['setRequiredNetworkType', 'ACCESS_NETWORK_STATE',
     'a job with a connectivity constraint cannot even be booked without it'],
    ['setPersisted(true)', 'RECEIVE_BOOT_COMPLETED',
     'a job that outlives a reboot has to say so up front'],
    ['NotificationManager', 'POST_NOTIFICATIONS',
     'nothing can be posted on Android 13 without it'],
    ['URL(', 'INTERNET', 'and nothing can be fetched at all without it']
  ].forEach(([call, perm, why]) => {
    if (kt.indexOf(call) < 0) return;      // not used, so nothing to declare
    t.ok(declared(perm), call + ' is used, so ' + perm + ' is declared - ' + why);
  });

  /* The ladder has to vary the constraint you did not think of. Its first four rungs
     varied persisting, the latency and the deadline and kept the network ask on all
     four - so the one refusal they all hit refused every rung, and four tries bought
     exactly what one would have. */
  const job = read(KT + 'Briefings.kt');
  t.ok(/if \(rung < LADDER - 1\) b\.setRequiredNetworkType/.test(job),
    'and the last rung asks for no network either, the constraint that did this');
});

/*
 * The sources panel answered "why is this one broken" every single time, when the
 * question actually asked is "is everything alright". Nine sources at three lines each,
 * every route that had nothing on it named with its URL, four held editions with their
 * headlines, six background runs - on a phone, in an app whose whole pitch is no
 * clutter. Nothing is removed; the workings are a tap away.
 */
suite('The sources panel answers the question that is usually asked', (t) => {
  const page = read(PAGE);
  t.ok(/\n  deep: false\n/.test(page), 'the panel starts folded');
  t.ok(/function flipDeep\(\)/.test(page), 'and unfolds');

  const sheet = page.slice(page.indexOf('function renderSheet()'),
                           page.indexOf('function sheetScroll'));
  // Count, time and route are one fact about a source; as three lines they were three
  // quarters of the panel.
  t.ok(/said \+= ' · ' \+ b\.method/.test(sheet), 'a working source is one line');
  t.not(/'Read from: ' \+ b\.method/.test(sheet), 'rather than a line each');
  // A shelf answering 503 and a feed with one giveaway on it are not the same news.
  t.ok(/quiet\.filter\(function \(u\) \{ return u && u\.ok === false; \}\)/.test(sheet),
    'a route that failed is named, with what happened to it');
  t.ok(/' other'/.test(sheet), 'and the ones that merely had nothing are counted beside it');
  t.ok(/Last background run/.test(sheet), 'the last run is shown, being the question');
  t.ok(/if \(!S\.deep\) \{[\s\S]{0,200}return;/.test(sheet), 'and the five before it are not');

  /* A phone's foot is already four buttons over three rows, so the way in is a line in
     the panel; a remote has no line to tap, so there it is an action. Same split as
     Search, and the toggle must exist on both or one of them loses the workings. */
  t.ok(/'ln tapln'/.test(sheet), 'a phone taps a line');
  t.ok(/run: flipDeep, remoteOnly: true/.test(page), 'and a remote gets an action');
  t.ok(/\.tapln\{[^}]*cursor:pointer/.test(page), 'which looks like it would do something');
  t.ok(/\.tapln:focus-visible/.test(page), 'and can be found without a mouse');
});

/*
 * A weak signal did not make some sources fail. It made all of them fail, every time,
 * while the same phone on good signal read the lot in four seconds - which is the
 * signature of the fetching making the link worse rather than of the link being bad.
 * Twelve requests over a link that can barely carry one is twelve requests that crawl
 * and then twelve that time out together.
 */
suite('A weak link is not asked for everything at once', (t) => {
  const net = read(KT + 'Net.kt');
  const ms = (s, re) => {
    const m = s.match(re);
    return m ? Number(m[1].replace(/[_L]/g, '')) : NaN;
  };

  t.ok(/private const val WIDE = \d+/.test(net), 'there is a width to the pipe');
  t.ok(/private const val NARROW = \d+/.test(net), 'and a floor it never goes below');
  t.ok(/fun narrow\(\)/.test(net) && /fun widen\(\)/.test(net),
    'which moves, since nobody can see the real one');
  // Halving down and stepping up: quick to get out of trouble, slow to trust again.
  t.ok(/width = Math\.max\(NARROW, width \/ 2\)/.test(net), 'halved when the link complains');
  t.ok(/width\+\+/.test(net), 'and opened one at a time when it answers');

  const get = net.slice(net.indexOf('fun get('), net.indexOf('private fun walk'));
  t.ok(/Gate\.enter\(System\.currentTimeMillis\(\) \+ QUEUE_WAIT_MS\)/.test(get)
       && /Gate\.leave\(\)/.test(get), 'every request goes through it');
  /* Two clocks. Waiting for a slot used to come out of the same budget as the fetching,
     so a request that queued for forty seconds had twenty left to read a feed in, timed
     out, narrowed the gate, and made the queue longer for the next one. */
  t.ok(get.indexOf('Gate.enter') < get.indexOf('val until = System.currentTimeMillis()'),
    'and its budget starts once it is through, not while it is waiting');
  t.ok(/\} finally \{\s*\n\s*Gate\.leave\(\)/.test(get),
    'and leaves in a finally, or the gate wedges shut and the app stops fetching');
  t.ok(/catch \(e: SocketTimeoutException\)[\s\S]{0,120}Gate\.narrow\(\)/.test(get),
    'a timeout narrows it');
  t.ok(get.indexOf('Gate.widen()') > 0, 'while any answer at all opens it up');
  t.ok(/private const val TRIES = \d/.test(net),
    'and a weak signal gets another go, being intermittent rather than absent');

  /* The gate used to give up waiting after twenty seconds and go through anyway, so a
     missed leave() could not wedge it. Narrowed to two, with every request allowed a
     minute, a queue of nine waits well past twenty seconds - so they all barged and the
     link was back to the full pool at once, which is the crowding this exists to stop.
     Measured against a real socket: peak sixteen of a twelve-wide gate, before. */
  const gate = net.slice(net.indexOf('fun enter(until: Long)'), net.indexOf('fun leave()'));
  t.not(/waited < 20_000L/.test(gate), 'a thread does not barge through after a wait');
  t.ok(/if \(left <= 0L\) return false/.test(gate),
    'it fails instead, which relieves the link rather than adding to it');
  t.ok(/return Triple\(false, 0, "waited too long for a free slot"\)/.test(net),
    'and the caller reports that, rather than asking anyway');

  /* Narrowing needs evidence that the width is what hurts. A closed feed times out on a
     perfect link: six of them took the gate from twelve to two over a loopback socket,
     at the end of a refresh, after thirty healthy feeds had been read. */
  const nar = net.slice(net.indexOf('fun narrow()'), net.indexOf('fun widen()'));
  t.ok(/if \(busy < width\) return/.test(nar),
    'with slots to spare, taking the width away cannot help anything');
  t.ok(/QUIET_MS/.test(nar), 'and a link that answered a moment ago is not an overloaded one');
  t.ok(/lastOk = System\.currentTimeMillis\(\)/.test(net.slice(net.indexOf('fun widen()'))),
    'which means noting when something last came back');

  // A width measured on a bad signal half an hour ago is about a link that is gone.
  t.ok(/private const val STALE_MS/.test(net), 'what was learned has a shelf life');
  t.ok(/if \(isStale\(\)\) forget\(\)/.test(gate), 'and is let go of once it is past it');

  /* Nothing here may outlast the page's own deadline on the same request. When it did,
     the page recorded a failure while this thread still held the link open - and the
     abandoned request went on taking the bandwidth the retry needed. */
  const budget = ms(net, /const val BUDGET_MS = ([\d_L]+)/);
  const page = read(PAGE);
  const nf = page.slice(page.indexOf('function nfetch'), page.indexOf('window.__nativeResolve'));
  const deadline = ms(nf, /rej\(new Error\('Timed out'\)\); \}, (\d+)\)/);
  t.ok(budget > 0 && deadline > 0, 'both deadlines were found to compare');
  t.ok(budget < deadline,
    'Kotlin answers before the page stops listening, so the page is the backstop');

  // readTimeout is the wait for one packet, so a trickle never trips it.
  t.ok(/fun readCapped\(input: InputStream, until: Long\)/.test(net),
    'reading the body is on the clock too, not just waiting for it to start');
  t.ok(/throw SocketTimeoutException\("body too slow"\)/.test(net),
    'and half a feed is thrown away rather than handed to a parser as a whole one');
});

/*
 * Tapping a briefing opens that briefing.
 *
 * It used to open the app, which left you on Today hunting for the thing you had just
 * tapped. Nothing had to be built for this: the page already makes every held edition
 * into something the reader can open, and nd.open looks any id up in the pool the
 * search uses. All that was missing was the notification saying which one.
 *
 * Which makes the id a fact written in two languages, like the briefing hours, so it
 * gets the same treatment: the two spellings are compared here rather than discovered
 * to differ by a tap that lands on the Today tab.
 */
suite('A tapped briefing opens that briefing', (t) => {
  const store = read(KT + 'Widget.kt');
  const page = read(PAGE);
  const ktId = (store.match(/fun itemId\(at: Long\): String = "([^"]*)" \+ at/) || [])[1];
  const jsId = (page.match(/id: '([^']*)' \+ b\.at,/) || [])[1];
  t.ok(!!ktId, 'Kotlin names an edition');
  t.ok(!!jsId, 'and so does the page');
  t.is(ktId, jsId, 'in the same words, or the tap lands on nothing');

  const notify = read(KT + 'Briefings.kt');
  const fn = notify.slice(notify.indexOf('fun briefing(ctx: Context'), notify.indexOf('object Briefings'));
  t.ok(/putExtra\(MainActivity\.EXTRA_ITEM, BriefStore\.itemId\(at\)\)/.test(fn),
    'the notification carries the edition it is about');
  t.ok(/BriefStore\.read\(ctx\)\?\.at/.test(fn),
    'read from the store the page had just written, which is why there is one to post about');

  // The paragraphs pass an empty fill-in, so the destination has to be in the template.
  t.ok(/fun openTemplate\(ctx: Context, code: Int, id: String\)/.test(store),
    'and the widget has a template that knows where it goes');
  t.ok(/Taps\.openTemplate\(ctx, 1, mine\)/.test(store), 'which its paragraphs use');
  t.ok(/Taps\.openAt\(ctx, 0, mine\)/.test(store), 'as do its headline and edition line');
});

/* A briefing that fails while nobody is looking used to leave no trace at all, so
   "it never woke up" and "it woke up and ran out of time" were the same observation.
   They want different fixes, so every run now says which it was. */
suite('A background run says what became of it', (t) => {
  const store = read(KT + 'Widget.kt');
  t.ok(/fun logRun\(/.test(store), 'the store keeps a line per run');
  t.ok(/fun runs\(/.test(store), 'and hands the lot back');
  t.ok(/getString\(RUNS, "\[\]"\)/.test(store),
    'defaulting to valid JSON, since the page parses whatever it is given');
  t.ok(/\.commit\(\)/.test(store.slice(store.indexOf('fun logRun'))),
    'written with commit, because a killed job is exactly when the line matters');

  const job = read(KT + 'Briefings.kt');
  t.ok(/fun briefDone\(wrote: Boolean, edition: String, headline: String, why: String\)/.test(job),
    'the page is asked why, since out here every failure is the same silence');
  t.ok(/fun briefLog\(\): String/.test(job), 'the job offers the log');
  t.ok(/fun briefLog\(\): String/.test(read(KT + 'MainActivity.kt')),
    'and so does the app, which is where it is actually read');

  // The interesting runs are the ones that never report. Each way out has to write a line.
  ['could not start', 'no answer from the page'].forEach((w) => {
    t.ok(job.indexOf('log("' + w + '")') > 0, 'a run that ' + w + ' still leaves a line');
  });
  // The hosts say why when they take the run away, rather than it ending in silence.
  t.ok(/cancel\("stopped by the system"\)/.test(job), 'a cancelled job leaves a line');
  t.ok(/cancel\("the service was stopped"\)/.test(job), 'and so does a stopped service');
  // Checking a flag and then setting it is two steps, and the page reports on the
  // bridge's thread while the give-up timer fires on the main one.
  t.ok(/reported\.compareAndSet\(false, true\)/.test(job),
    'and only the first of them wins, in one step, so one run is one line');
  t.ok(/val reported = AtomicBoolean\(false\)/.test(job),
    'which needs something a thread cannot be halfway through');

  const page = read(PAGE);
  t.ok(/function why\(b, wrote, ran\)/.test(page), 'the page works out its own reason');
  t.ok(/if \(ran >= BG_GIVE_UP_MS\) return 'gave up waiting'/.test(page),
    'and says so plainly when it simply ran out of time');
  t.ok(/function renderBriefRuns\(box\)/.test(page), 'the sources panel shows the log');
  // A bare string has a length, so it survives a truthiness check and then throws on
  // forEach - taking the panel down over a log nobody asked to see.
  t.ok(/return Array\.isArray\(runs\) \? runs : \[\];/.test(page),
    'and insists on an array, not merely something with a length');

  /* An empty log and a build too old to keep one both showed nothing, and so did a
     booking the system refused and a booking whose hour had not come round. Four
     states, one blank space - in the one case the log was built to speak up in. */
  const render = page.slice(page.indexOf('function renderBriefRuns'),
                            page.indexOf('function sheetScroll'));
  t.ok(/No background run has happened yet/.test(render),
    'an empty log says it is empty rather than showing nothing at all');
  t.ok(render.indexOf('briefNext()') < render.indexOf('if (!runs.length)'),
    'and what is booked next is said either way, since that is the other half of it');

  const kt = read(KT + 'Briefings.kt');
  t.ok(/fun held\(ctx: Context\): Boolean\?/.test(kt),
    'the system is asked whether it still holds the booking');
  t.ok(/getPendingJob\(JOB_ID\)/.test(kt), 'which is the one fact the app cannot talk itself into');
  t.ok(/"The system refused the booking \(" \+ firstRefusal/.test(kt),
    'and a refused booking is written down rather than dropped');
  const sched = kt.slice(kt.indexOf('fun scheduleNext'), kt.indexOf('private const val LADDER'));
  t.ok((sched.match(/setBooking/g) || []).length >= 3,
    'every way scheduleNext can end leaves a note, or the silence is back');

  /* A refusal does not say which part it objected to, so the only way to find out is
     to take parts away. Whichever rung is accepted is kept and named: a job that does
     not survive a reboot beats the nothing this was getting. */
  t.ok(/private const val LADDER = \d/.test(kt) && /private val RUNGS = arrayOf\(/.test(kt),
    'a refusal is answered by asking for less, not by giving up');
  t.ok(/private fun book\(js: JobScheduler, ctx: Context, wait: Long, rung: Int\): String/.test(kt),
    'and each rung reports why, rather than returning a bare false');
  t.ok(/val m = e\.message/.test(kt),
    'carrying the exception message, which names the rule that was broken');
  t.not(/catch \(e: Exception\) \{\s*\n\s*false\s*\n\s*\}/.test(kt),
    'nothing swallows the one fact worth having');
  t.ok(/fun bucket\(ctx: Context\): String/.test(kt),
    'and the standby bucket is reported, being a phone setting rather than a bug');

  // A button that quietly does nothing is worse than no button.
  t.ok(/fun briefTest\(\): String/.test(read(KT + 'MainActivity.kt')), 'a run can be asked for now');
  t.ok(/fun runNow\(ctx: Context\): String/.test(kt), 'and that ask can be refused out loud');
  t.ok(/S\.testSaid/.test(page), 'with the panel saying so when it is');

  // The question is "does a job ever run on this phone", and it should not take
  // until five tomorrow morning to answer it.
  t.ok(/label: 'Test briefing job'/.test(page), 'from the panel itself');
  t.ok(/!briefRuns\(\)\.length;/.test(page),
    'and the button goes once a run has written the line that answers it');
  t.ok(page.indexOf('renderBriefRuns(box)') < page.indexOf('function renderBriefRuns'),
    'from inside the briefing block, which is where someone would look for it');
});

/* The app is used on a phone with a screen reader as well as on a television with a
   remote, and those want opposite things from the focus. */
suite('It can be used without looking at it', (t) => {
  const page = read(PAGE);
  const markup = page.slice(0, page.indexOf('<script src="config.js">'));

  [['id="tabs"', 'role="tablist"'], ['id="list"', 'aria-label'], ['id="status"', 'aria-live'],
   ['id="reader"', 'aria-modal'], ['id="sheet"', 'aria-modal'], ['id="lens"', 'aria-modal']]
    .forEach(([what, want]) => {
      const line = markup.split('\n').find((l) => l.indexOf(what) >= 0) || '';
      t.ok(line.indexOf(want) >= 0, what + ' carries ' + want);
    });

  // The status line is the one thing that changes under the reader without being asked for.
  t.ok(/id="status" role="status" aria-live="polite"/.test(markup),
    'and the status line is announced rather than waited on');

  // A row is three scraps on screen and should be one sentence spoken.
  t.ok(/function rowLabel\s*\(/.test(page), 'a row has a spoken form of its own');
  t.ok(/function markRow\s*\(/.test(page) && /markRow\(li, it, single\)/.test(page),
    'which is put on the row when it is built');
  t.ok((page.match(/markRow\(li, it, single\)/g) || []).length >= 2,
    'and again when a pooled row is reused for another story');
  // The hour is in the spoken form too, so the minute hand has to move both.
  const from = page.indexOf('function renderListAgesOnly');
  const ages = page.slice(from, page.indexOf('\n}', from));
  t.ok(/setAttribute\('aria-label', rowLabel/.test(ages),
    'and the hour is kept in step in both');

  // A television moves a cursor of its own; a second one from the browser fights it.
  t.ok(/function focusInto\s*\(/.test(page) && /if \(!TOUCH\) return;/.test(page),
    'focus is only moved on a touch device');
  t.ok(/focusInto\('rdTitle'\)/.test(page) && /focusInto\('sheetTitle'\)/.test(page),
    'into the reader and the panel when they open');
  t.ok(/function focusBackToRow\s*\(/.test(page), 'and back to the row they were opened from');
});

/* Somebody who has set large text on their phone has already answered this question. */
suite('The reader\'s own text size is honoured', (t) => {
  const kt = read(KT + 'MainActivity.kt');
  t.ok(/s\.textZoom = textScale\(\)/.test(kt), 'the WebView takes the system scale');
  t.not(/s\.textZoom = 100\b/.test(kt), 'rather than pinning it over the top of their choice');
  t.ok(/configuration\.fontScale/.test(kt), 'read from the configuration, where they set it');
  t.ok(/if \(isTv\) 115 else 130/.test(kt),
    'clamped, since it scales the words and not the boxes, and a TV has less room to give');
});

/* The app loads two kinds of page into a WebView: its own, out of the APK, and
   somebody else's, off the internet. Only one of those may be allowed to call in. */
suite('Nothing on a remote page can call into the app', (t) => {
  // Comments stripped: the code below says in prose why it has no bridge, and the
  // check is about what the compiler sees, not about the word appearing.
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  const kt = strip(read(KT + 'MainActivity.kt'));
  const from = kt.indexOf('private fun startScrape');
  const scrape = kt.slice(from, kt.indexOf('private fun finishScrape'));
  t.ok(from > 0, 'the rendered-page reader is where it was');

  // The whole point. A bridge here is reachable by every script that page runs.
  t.not(/addJavascriptInterface/.test(scrape),
    'the WebView that loads somebody else\'s page is given no bridge');
  t.not(/ScrapeBridge/.test(kt), 'and the class that was one is gone');
  t.not(/Scrape\.done/.test(read('app/src/main/assets/extract.js')),
    'so the script in that page has nothing to call');

  // It is read instead, which is traffic one way only.
  t.ok(/window\.__ndResult/.test(read('app/src/main/assets/extract.js')),
    'the reader leaves its answer on the window');
  t.ok(/evaluateJavascript\("window\.__ndResult/.test(kt), 'and the app comes and takes it');
  t.ok(/private fun pollScrape/.test(kt), 'asking until it is there');
  t.ok(/if \(token != scrapeToken\) return/.test(kt),
    'and a late answer from a run already given up on is dropped');

  // The app's own page, out of the APK, is the one that may call in.
  t.ok(/web\.addJavascriptInterface\(Bridge\(\), "Native"\)/.test(kt),
    'while the app\'s own page keeps its bridge');
});

/* The project lives as one base64 blob inside the workflow file. Git cannot diff
   that, so it cannot conflict on it usefully: two branches that both changed the app
   merge clean and one of them silently wins. app.manifest is the same tree said again
   in a form git can read, so the collision lands there - on the lines for the files
   both sides touched - instead of on nobody's screen. */
suite('The blob has a readable shadow', (t) => {
  const crypto = require('crypto');
  const at = path.join(__dirname, '..', 'app.manifest');
  t.ok(fs.existsSync(at), 'app.manifest is committed beside the workflow');
  if (!fs.existsSync(at)) return;

  const want = new Map();
  fs.readFileSync(at, 'utf8').split('\n').forEach((line) => {
    if (!line || line.charAt(0) === '#') return;
    const sp = line.indexOf('  ');
    if (sp > 0) want.set(line.slice(sp + 2), line.slice(0, sp));
  });
  t.ok(want.size > 20, 'and lists the files in the blob (' + want.size + ')');

  // Every file in the blob, hashed as it actually is now.
  const got = new Map();
  (function walk(rel) {
    fs.readdirSync(path.join(dir, rel) || dir, { withFileTypes: true }).forEach((e) => {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(r);
      else got.set(r, crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, r))).digest('hex'));
    });
  })('');

  const missing = [...want.keys()].filter((f) => !got.has(f));
  const extra = [...got.keys()].filter((f) => !want.has(f));
  const changed = [...got.keys()].filter((f) => want.has(f) && want.get(f) !== got.get(f));

  t.same(missing, [], 'nothing the manifest lists has gone from the blob');
  t.same(extra, [], 'and nothing is in the blob that the manifest does not list');
  t.same(changed, [],
    'and every file matches its hash - if this fails, the app was repacked without ' +
    'running tests/repack.sh, and the manifest no longer describes what ships');
});

suite('No key is committed', (t) => {
  const cfg = read('app/src/main/assets/config.js');
  t.ok(/ppqKey:\s*""/.test(cfg), 'config.js ships with an empty key, filled in from the secret');
  const page = read(PAGE);
  t.not(/sk-[A-Za-z0-9]{16,}/.test(page + cfg), 'and nothing that looks like one is in the source');
});

run('Newsdesk source');
