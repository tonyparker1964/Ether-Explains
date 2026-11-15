#!/bin/bash
# Ether Explains for Mac — double-click to build and install the app.
cd "$(dirname "$0")" || exit 1
exec > >(tee build.log) 2>&1
APP="Ether Explains.app"
echo "== Building Ether Explains for Mac ($(date))"

if ! command -v swiftc >/dev/null 2>&1; then
  echo "Swift isn't installed. Install Xcode from the App Store, or run:  xcode-select --install"
  read -r -p "Press Return to close"; exit 1
fi
swiftc --version | head -1

# web studio files: ./web (this folder) or the repo root (when built from GitHub)
if [ -f web/index.html ]; then WEB=web; else WEB=..; fi
rm -rf build && mkdir -p build/web
for f in index.html app.css app.js voice-dsp.js voice.js styles-data.js demo.html cut.html icon.svg manifest.webmanifest; do
  cp "$WEB/$f" build/web/ || { echo "Missing $f"; read -r; exit 1; }
done

# three.js 0.170.0, so scenes play without the internet
VENDOR="$HOME/Library/Caches/EtherExplains/three-0.170.0"
if [ ! -f "$VENDOR/build/three.module.js" ]; then
  echo "Downloading three.js 0.170.0 (once) for offline scenes…"
  mkdir -p "$VENDOR.tmp" && curl -fsSL https://registry.npmjs.org/three/-/three-0.170.0.tgz -o "$VENDOR.tgz" \
    && tar -xzf "$VENDOR.tgz" -C "$VENDOR.tmp" && rm -rf "$VENDOR" && mkdir -p "$VENDOR/examples" \
    && cp -R "$VENDOR.tmp/package/build" "$VENDOR/" && cp -R "$VENDOR.tmp/package/examples/jsm" "$VENDOR/examples/" \
    || echo "(couldn't download three.js — scenes will load it from the internet instead)"
  rm -rf "$VENDOR.tmp" "$VENDOR.tgz"
fi
if [ -f "$VENDOR/build/three.module.js" ]; then mkdir -p build/web/vendor && cp -R "$VENDOR" build/web/vendor/three; echo "three.js bundled for offline use"; fi

echo "Compiling…"
ARCH=$(uname -m)
swiftc -O -parse-as-library -target "$ARCH-apple-macos13.0" Sources/*.swift -o build/EtherExplains \
  -framework SwiftUI -framework AppKit -framework WebKit -framework AVFoundation -framework Network \
  || { echo "BUILD FAILED"; read -r -p "Press Return to close"; exit 1; }

mkdir -p "build/$APP/Contents/MacOS" "build/$APP/Contents/Resources"
cp build/EtherExplains "build/$APP/Contents/MacOS/"
cp Info.plist "build/$APP/Contents/"
mv build/web "build/$APP/Contents/Resources/web"
iconutil -c icns AppIcon.iconset -o "build/$APP/Contents/Resources/AppIcon.icns"
codesign --force --deep -s - "build/$APP" && echo "Signed (local)"

mkdir -p "$HOME/Applications"
pkill -x EtherExplains >/dev/null 2>&1 && sleep 1
rm -rf "$HOME/Applications/$APP" && cp -R "build/$APP" "$HOME/Applications/"
rm -rf build/EtherExplains
echo "Installed: ~/Applications/$APP"
echo "BUILD OK"
open "$HOME/Applications/$APP"
echo "You can close this window."
exit 0
