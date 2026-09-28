#!/bin/bash
# Build the deliverable zip: chrome/ + firefox/ builds side by side.
# Usage: ./build.sh  (writes ~/workspace/your_files/comic-translate-4-free-<ver>-<build>.zip)
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
VERSION="$(python3 -c "import json;print(json.load(open('$SRC/manifest.json'))['version'])")"
BUILD="$(grep -o "const BUILD = '[^']*'" "$SRC/src/ui/options.js" | cut -d"'" -f2)"
NAME="comic-translate-4-free-v${VERSION}-${BUILD}"
DIST="$SRC/dist"
OUT="$DIST/${NAME}.zip"
# Convenience copy for local dev (ignored by git); CI uploads from $DIST.
LOCAL_OUT="$HOME/workspace/your_files/${NAME}.zip"

rm -rf "$DIST" "$OUT"
mkdir -p "$DIST/chrome" "$DIST/firefox"

# Shared file set (node_modules, build tooling, and the other manifest excluded).
rsync -a --exclude 'node_modules' --exclude 'dist' --exclude '*.zip' \
  --exclude 'build.sh' --exclude 'manifest.firefox.json' --exclude '.git' \
  "$SRC/" "$DIST/chrome/"

rsync -a --exclude 'node_modules' --exclude 'dist' --exclude '*.zip' \
  --exclude 'build.sh' --exclude 'manifest.json' --exclude '.git' \
  "$SRC/" "$DIST/firefox/"
cp "$SRC/manifest.firefox.json" "$DIST/firefox/manifest.json"

# Sanity: both manifests parse, versions match, key files present.
python3 - <<EOF
import json
c = json.load(open('$DIST/chrome/manifest.json'))
f = json.load(open('$DIST/firefox/manifest.json'))
assert c['version'] == f['version'] == '$VERSION', (c['version'], f['version'])
assert c['background']['service_worker'] == 'src/background/service-worker.js'
assert f['background']['page'] == 'src/background/background.html'
assert 'offscreen' in c['permissions'] and 'offscreen' not in f['permissions']
assert f['browser_specific_settings']['gecko']['id']
print('manifests OK:', c['version'])
EOF
for f in src/background/ml-bridge.js src/background/background.html src/background/background-ff.js src/shared/pixel-bus.js; do
  test -f "$DIST/chrome/$f" || { echo "MISSING chrome/$f"; exit 1; }
  test -f "$DIST/firefox/$f" || { echo "MISSING firefox/$f"; exit 1; }
done
for f in src/background/service-worker.js src/background/translators.js src/content/content.js src/ui/options.js src/ui/popup.js src/offscreen/offscreen.js; do
  node --check "$DIST/chrome/$f" >/dev/null || { echo "SYNTAX FAIL chrome/$f"; exit 1; }
done
echo "files OK"

# Zip with chrome/ + firefox/ top-level dirs and the README.
cd "$DIST"
rm -f "$OUT"
zip -qr "$OUT" chrome firefox
cd "$SRC"
zip -q "$OUT" README.md
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
unzip -l "$OUT" | tail -3
# Local convenience copy (same bytes, gitignored).
mkdir -p "$(dirname "$LOCAL_OUT")"
cp "$OUT" "$LOCAL_OUT"
echo "copied to $LOCAL_OUT"
