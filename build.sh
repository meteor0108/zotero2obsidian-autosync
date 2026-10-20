#!/bin/sh
# Packs addon/ into build/zotero2obsidian.xpi (macOS / Linux). On Windows use build.ps1.
set -e
cd "$(dirname "$0")"
mkdir -p build
rm -f build/zotero2obsidian.xpi
(cd addon && zip -qr ../build/zotero2obsidian.xpi .)
echo "Built build/zotero2obsidian.xpi"
