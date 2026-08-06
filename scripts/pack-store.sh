#!/usr/bin/env bash
# Package the extension for Chrome Web Store upload.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -e "console.log(JSON.parse(require('fs').readFileSync('manifest.json','utf8')).version)")"
OUT_DIR="$ROOT/dist"
ZIP_NAME="bookmark-wall-${VERSION}.zip"
ZIP_PATH="$OUT_DIR/$ZIP_NAME"

mkdir -p "$OUT_DIR"
rm -f "$ZIP_PATH"

# manifest.json must be at the ZIP root (not inside a subfolder).
zip -r "$ZIP_PATH" \
  manifest.json \
  background.js \
  bookmarks.html \
  bookmarks.css \
  bookmarks.js \
  lib \
  icons \
  -x "*.DS_Store" "*__MACOSX*" "*.map"

echo "Packed: $ZIP_PATH"
unzip -l "$ZIP_PATH"
