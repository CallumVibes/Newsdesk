#!/bin/sh
# Type-checks every Kotlin file without Gradle, Android Studio, or a network that
# will talk to Google.
#
#   tests/typecheck.sh "$(tests/unpack.sh)"
#
# Why this exists: the Kotlin in this project was, for a long time, only ever
# compiled on the runner - twenty minutes and a push away from the change. So an
# unresolved name or a signature that no longer matched its caller was found by
# CI rather than here, and check-source.js grew a hand-rolled half-compiler to
# catch the commonest of those sooner. This is the other half, and it disagrees
# with that one now and then: InterruptedException was being reported as
# unimported when Kotlin hands it to you for nothing.
#
# Two pieces have to be fetched once, into tests/.tools, which is not committed:
#   - kotlinc, from JetBrains' own releases
#   - android.jar, which Google does not serve anywhere reachable from here, so
#     it comes from a third-party mirror of the platform jars. It is used only to
#     resolve names while checking; nothing built here is ever shipped or run.
#
# R.java is generated rather than fetched. aapt makes it from the resources at
# build time, and all that is needed here is a field of the right name per
# reference, so the references themselves are enough to write it from.
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
src=${1:-$root/.newsdesk-unpacked}
[ -d "$src" ] || { echo "No $src - run tests/unpack.sh first." >&2; exit 1; }
kt="$src/app/src/main/java/com/callum/newsdesk"
tools="$root/tests/.tools"
mkdir -p "$tools"

KOTLIN_VERSION=${KOTLIN_VERSION:-2.0.21}
if [ ! -x "$tools/kotlinc/bin/kotlinc" ]; then
  echo "Fetching kotlinc $KOTLIN_VERSION..."
  curl -sSL -o "$tools/kotlinc.zip" \
    "https://github.com/JetBrains/kotlin/releases/download/v$KOTLIN_VERSION/kotlin-compiler-$KOTLIN_VERSION.zip"
  (cd "$tools" && unzip -q -o kotlinc.zip && rm -f kotlinc.zip)
fi

if [ ! -f "$tools/android.jar" ]; then
  echo "Fetching android.jar (API 34)..."
  rm -rf "$tools/platforms"
  git clone -q --depth 1 --filter=blob:none --sparse \
    https://github.com/Sable/android-platforms "$tools/platforms"
  (cd "$tools/platforms" && git sparse-checkout set android-34)
  cp "$tools/platforms/android-34/android.jar" "$tools/android.jar"
  rm -rf "$tools/platforms"
fi

# One int per R reference the Kotlin actually makes. The values are arbitrary:
# nothing here is run, and a name that resolves is the whole point.
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/r/com/callum/newsdesk"
python3 - "$kt" "$work/r/com/callum/newsdesk/R.java" <<'PY'
import collections, os, re, sys
kt, out = sys.argv[1], sys.argv[2]
found = collections.defaultdict(set)
for f in sorted(os.listdir(kt)):
    if f.endswith('.kt'):
        for kind, name in re.findall(r'\bR\.(\w+)\.(\w+)', open(os.path.join(kt, f)).read()):
            found[kind].add(name)
lines = ['package com.callum.newsdesk;',
         '/** Stands in for the class aapt generates, so the Kotlin can be type-checked. */',
         'public final class R {']
n = 0x7f010000
for kind in sorted(found):
    lines.append('  public static final class %s {' % kind)
    for name in sorted(found[kind]):
        n += 1
        lines.append('    public static final int %s = 0x%x;' % (name, n))
    lines.append('  }')
lines.append('}')
open(out, 'w').write('\n'.join(lines) + '\n')
print('R: ' + ', '.join('%s(%d)' % (k, len(v)) for k, v in sorted(found.items())))
PY

javac -nowarn -d "$work/rout" "$work/r/com/callum/newsdesk/R.java"
"$tools/kotlinc/bin/kotlinc" -nowarn \
  -cp "$tools/android.jar:$work/rout" -d "$work/out" "$kt"/*.kt 2>"$work/err" || {
    grep -v '^Picked up' "$work/err" >&2 || true
    echo "KOTLIN DOES NOT COMPILE" >&2
    exit 1
  }
grep -v '^Picked up' "$work/err" | grep '^.*error:' >&2 && { echo "KOTLIN DOES NOT COMPILE" >&2; exit 1; }
echo "Kotlin type-checks: $(ls "$kt"/*.kt | wc -l | tr -d ' ') files, $(find "$work/out" -name '*.class' | wc -l | tr -d ' ') classes"
