#!/bin/sh
# Runs the spoken-text rules against a list of written-out answers, on this machine,
# without a phone or an emulator anywhere in it.
#
#   tests/spoken.test.sh "$(tests/unpack.sh)"
#
# Spoken.kt is the one file in the app with no Android imports in it, and that is not
# tidiness - it is what makes this possible. Compiled on its own against nothing but the
# Kotlin standard library, it runs here, so every rewriting rule can be checked against
# what it is supposed to produce. A wrong rule in there costs the listener one daft
# sentence and leaves no trace, which is the kind of bug that lives for months.
#
# kotlinc comes from the same tests/.tools cache typecheck.sh fills, so running one after
# the other costs the download once.
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

# The file must stay free of Android, or none of the above works. Checked here as well as
# in check-source.js, because this is where it would fail confusingly.
if grep -q '^import android' "$kt/Spoken.kt"; then
  echo "Spoken.kt has an Android import, so it can no longer be tested off a device." >&2
  echo "Whatever needs Android belongs in the caller, not in the rules." >&2
  exit 1
fi

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

"$tools/kotlinc/bin/kotlinc" -nowarn -include-runtime \
  -d "$work/spoken.jar" "$kt/Spoken.kt" "$root/tests/spoken.test.kt" 2>"$work/err" || {
  echo "Could not compile the rules:" >&2
  grep -v '^warning:' "$work/err" | head -30 >&2
  exit 1
}

echo "The words a voice is given"
# Nothing here goes near a network, and the agent proxy's options print a paragraph of
# themselves over the results otherwise.
JAVA_TOOL_OPTIONS= java -jar "$work/spoken.jar"
