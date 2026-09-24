#!/bin/sh
# Packs .newsdesk-unpacked back into the workflow file, then proves the round trip.
# The project lives as base64 inside the workflow, so an edit to the unpacked copy
# is invisible to git until this has run. Always run it before committing.
set -e
root=$(cd "$(dirname "$0")/.." && pwd)
src=${1:-$root/.newsdesk-unpacked}
[ -d "$src" ] || { echo "No $src - run tests/unpack.sh first." >&2; exit 1; }
python3 - "$src" "$root/.github/workflows/build-newsdesk.yml" <<'PY'
import base64, io, os, sys, tarfile
src, yml = sys.argv[1], sys.argv[2]
paths = []
for dp, dn, fn in os.walk(src):
    dn.sort()
    for f in sorted(fn):
        paths.append(os.path.relpath(os.path.join(dp, f), src))
paths.sort()
buf = io.BytesIO()
with tarfile.open(fileobj=buf, mode='w:gz', compresslevel=9) as tf:
    for rel in paths:
        ti = tarfile.TarInfo('./' + rel)
        data = open(os.path.join(src, rel), 'rb').read()
        ti.size = len(data)
        ti.uid = ti.gid = 0
        ti.uname = ti.gname = 'root'
        ti.mtime = 0
        ti.mode = 0o644
        tf.addfile(ti, io.BytesIO(data))
blob = base64.b64encode(buf.getvalue()).decode()
body = ''.join('          ' + blob[i:i + 76] + '\n' for i in range(0, len(blob), 76))
s = open(yml).read()
start, end = "          base64 -d > src.tgz <<'B64END'\n", "          B64END\n"
a = s.index(start) + len(start)
z = s.index(end, a)
open(yml, 'w').write(s[:a] + body + s[z:])
print('packed %d files' % len(paths))
PY
tmp=$(mktemp -d)
"$root/tests/unpack.sh" "$tmp/out" > /dev/null
if diff -rq "$src" "$tmp/out" > /dev/null; then
  echo "round trip verified"
  rm -rf "$tmp"
else
  echo "ROUND TRIP FAILED - what unpacks is not what was packed:" >&2
  diff -rq "$src" "$tmp/out" >&2 || true
  rm -rf "$tmp"
  exit 1
fi
