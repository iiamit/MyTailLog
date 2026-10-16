#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
PLIST="$ROOT/ios/App/App/Info.plist"
if [ ! -f "$PLIST" ]; then
  echo "Missing $PLIST; run npx cap add ios first." >&2
  exit 1
fi

# The native iOS project is generated and gitignored. Keep the OAuth return
# scheme reproducible on every Mac without overwriting other registered URLs.
PLISTBUDDY=/usr/libexec/PlistBuddy
if "$PLISTBUDDY" -c 'Print :CFBundleURLTypes' "$PLIST" 2>/dev/null | grep -q 'com.mytaillog.app'; then
  exit 0
fi
"$PLISTBUDDY" -c 'Add :CFBundleURLTypes array' "$PLIST" 2>/dev/null || true
COUNT=$("$PLISTBUDDY" -c 'Print :CFBundleURLTypes' "$PLIST" | grep -c 'Dict {' || true)
"$PLISTBUDDY" -c "Add :CFBundleURLTypes:$COUNT dict" "$PLIST"
"$PLISTBUDDY" -c "Add :CFBundleURLTypes:$COUNT:CFBundleURLName string com.mytaillog.auth" "$PLIST"
"$PLISTBUDDY" -c "Add :CFBundleURLTypes:$COUNT:CFBundleURLSchemes array" "$PLIST"
"$PLISTBUDDY" -c "Add :CFBundleURLTypes:$COUNT:CFBundleURLSchemes:0 string com.mytaillog.app" "$PLIST"
echo "Registered MyTailLog sign-in return URL in Info.plist"
