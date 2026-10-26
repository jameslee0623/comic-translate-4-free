#!/bin/bash
# Build the deliverable zip: chrome/ + firefox/ builds side by side.
# Usage: ./build.sh  (writes ~/workspace/your_files/comic-translate-4-free-<ver>-<build>.zip)
set -euo pipefail
SRC="$(cd "$(dirname "$0")" && pwd)"
VERSION="$(python3 -c "import json;print(json.load(open('$SRC/manifest.json'))['version'])")"
BUILD="$(grep -o "const BUILD = '[^']*'" "$SRC/src/shared/version.js" | cut -d"'" -f2)"
NAME="comic-translate-4-free-v${VERSION}"
DIST="$SRC/dist"
OUT="$DIST/${NAME}.zip"
# Convenience copy for local dev (ignored by git); CI uploads from $DIST.
LOCAL_OUT="$HOME/workspace/your_files/${NAME}.zip"

rm -rf "$DIST" "$OUT"
mkdir -p "$DIST/chrome" "$DIST/firefox"

# Shared file set (node_modules, build tooling, and the other manifest excluded).
rsync -a --exclude 'node_modules' --exclude 'dist' --exclude '*.zip' \
  --exclude '.DS_Store' --exclude 'build.sh' --exclude 'manifest.firefox.json' --exclude '.git' \
  --exclude 'hidden-audit' --exclude 'package.json' --exclude 'package-lock.json' \
  "$SRC/" "$DIST/chrome/"

rsync -a --exclude 'node_modules' --exclude 'dist' --exclude '*.zip' \
  --exclude '.DS_Store' --exclude 'build.sh' --exclude 'manifest.json' --exclude 'manifest.firefox.json' --exclude '.git' \
  --exclude 'hidden-audit' --exclude 'package.json' --exclude 'package-lock.json' \
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
assert 'alarms' in c['permissions'], 'Chrome manifest must declare alarms (ML timeout backup)'
assert f['browser_specific_settings']['gecko']['id']
print('manifests OK:', c['version'])
EOF
for f in src/background/ml-bridge.js src/background/background.html src/background/background-ff.js src/shared/pixel-bus.js; do
  test -f "$DIST/chrome/$f" || { echo "MISSING chrome/$f"; exit 1; }
  test -f "$DIST/firefox/$f" || { echo "MISSING firefox/$f"; exit 1; }
done
for f in src/background/service-worker.js src/background/translators.js src/background/ml-bridge.js src/background/ml-worker.js src/content/content.js src/ui/options.js src/ui/popup.js src/offscreen/offscreen.js src/offscreen/offscreen-progress.js src/shared/page-cache.js; do
  node --check "$DIST/chrome/$f" >/dev/null || { echo "SYNTAX FAIL chrome/$f"; exit 1; }
done
echo "files OK"

# Locale parity: all 16 _locales must have identical key sets. Fail on drift.
python3 - <<'EOF'
import json, glob, sys
locales = sorted(glob.glob('_locales/*/messages.json'))
assert len(locales) == 16, f'expected 16 locales, found {len(locales)}'
base = set(json.load(open(locales[0])).keys())
ok = True
for loc in locales[1:]:
    keys = set(json.load(open(loc)).keys())
    missing = base - keys
    extra = keys - base
    if missing or extra:
        ok = False
        print(f'DRIFT {loc}: missing={sorted(missing)[:5]} extra={sorted(extra)[:5]}')
if not ok:
    sys.exit(1)
print(f'locales OK: 16 locales, {len(base)} keys each')
EOF

# Zip with chrome/ + firefox/ top-level dirs and the README.
cd "$DIST"
rm -f "$OUT"
zip -qr "$OUT" chrome firefox
cd "$SRC"
zip -q "$OUT" README.md LICENSE
echo "wrote $OUT ($(du -h "$OUT" | cut -f1))"
unzip -l "$OUT" | tail -3
# Per-store zips (manifest at root) for manual store submission.
(cd "$DIST/chrome" && zip -qr "$DIST/${NAME}-chrome.zip" .)
(cd "$DIST/firefox" && zip -qr "$DIST/${NAME}-firefox.zip" .)
echo "store zips: ${NAME}-chrome.zip + ${NAME}-firefox.zip"
# Local convenience copy (same bytes, gitignored).
mkdir -p "$(dirname "$LOCAL_OUT")"
cp "$OUT" "$LOCAL_OUT"
echo "copied to $LOCAL_OUT"
