#!/bin/sh
# Runs the Kotlin that needs no phone against a list of written-out answers, on this
# machine, with no emulator anywhere in it.
#
#   tests/kotlin.test.sh "$(tests/unpack.sh)"
#
# A handful of files in this app have no Android imports at all - the spoken-text rules,
# and the running order of an edition - and that is not tidiness. It is what makes this
# possible: compiled against nothing but the Kotlin standard library, they run here, so
# every rule can be checked against what it is supposed to produce. Both are the kind of
# code that is wrong quietly. A bad rewriting rule costs one daft sentence, out loud, and
# leaves no trace; a bad running order drops a headline nobody notices was missing.
#
# Which files those are is worked out rather than listed, so a new one is picked up by
# having no Android import rather than by being remembered here.
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

# Every file that imports nothing at all, which is what can actually be compiled alone.
# "No Android import" is the tempting rule and the wrong one: org.json carries no android
# prefix and is Android's all the same, so Net.kt sailed through the test and then would
# not compile.
pure=""
for f in "$kt"/*.kt; do
  grep -q '^import ' "$f" || pure="$pure $f"
done
if [ -z "$pure" ]; then
  echo "No Android-free Kotlin found in $kt - something has gone wrong with the unpack." >&2
  exit 1
fi
# Named out loud, so a file quietly dropping out of the set is visible rather than
# silently untested - which would look exactly like everything passing.
echo "Checking:$(echo "$pure" | tr ' ' '\n' | sed 's|.*/||' | tr '\n' ' ')"
for want in Spoken.kt Edition.kt; do
  case "$pure" in
    *"/$want"*) ;;
    *) echo "$want has grown an import, so it can no longer be checked off a device." >&2
       echo "Whatever needs a library belongs in its caller, not in the rules." >&2
       exit 1;;
  esac
done

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

"$tools/kotlinc/bin/kotlinc" -nowarn -include-runtime \
  -d "$work/spoken.jar" $pure "$root/tests/kotlin.test.kt" 2>"$work/err" || {
  echo "Could not compile the rules:" >&2
  grep -v '^warning:' "$work/err" | head -30 >&2
  exit 1
}

echo "The rules that need no phone"
# Nothing here goes near a network, and the agent proxy's options print a paragraph of
# themselves over the results otherwise.
JAVA_TOOL_OPTIONS= java -jar "$work/spoken.jar"
