#!/bin/sh
# Unpacks the project out of the workflow file so the tests have something to read.
# Prints the directory it used, so:   node tests/logic.test.js "$(tests/unpack.sh)"
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
yml="$root/.github/workflows/build-newsdesk.yml"
out=${1:-$root/.newsdesk-unpacked}
first=$(grep -n "B64END" "$yml" | head -1 | cut -d: -f1)
last=$(grep -n "B64END" "$yml" | tail -1 | cut -d: -f1)
rm -rf "$out"; mkdir -p "$out"
sed -n "$((first + 1)),$((last - 1))p" "$yml" | sed 's/^          //' | base64 -d | tar xz -C "$out"
echo "$out"
