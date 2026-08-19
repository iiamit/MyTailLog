#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
WORKSPACE="$ROOT/ios/App/App.xcworkspace"
SCHEME=App
TEAM_ID=${APPLE_TEAM_ID:-38Z53C8X48}
VERSION=${1:-}
BUILD_NUMBER=${BUILD_NUMBER:-$(date -u +%Y%m%d%H%M)}

required() {
  eval "value=\${$1:-}"
  if [ -z "$value" ]; then
    echo "Missing $1" >&2
    exit 1
  fi
}

required APP_STORE_CONNECT_KEY_ID
required APP_STORE_CONNECT_ISSUER_ID
required APP_STORE_CONNECT_KEY_PATH

if [ ! -f "$APP_STORE_CONNECT_KEY_PATH" ]; then
  echo "Key not found: $APP_STORE_CONNECT_KEY_PATH" >&2
  exit 1
fi
if [ ! -d "$WORKSPACE" ]; then
  echo "Missing $WORKSPACE; run 'npm run cap:sync' once first." >&2
  exit 1
fi

if [ -z "$VERSION" ]; then
  VERSION=$(xcodebuild -workspace "$WORKSPACE" -scheme "$SCHEME" -showBuildSettings 2>/dev/null |
    awk '/MARKETING_VERSION =/{print $3; exit}')
fi
if [ -z "$VERSION" ]; then
  echo "Could not determine the marketing version; pass it as the first argument." >&2
  exit 1
fi

OUT=$(mktemp -d "${TMPDIR:-/tmp}/mytaillog-testflight.XXXXXX")
trap 'rm -rf "$OUT"' EXIT HUP INT TERM
ARCHIVE="$OUT/MyTailLog.xcarchive"
EXPORT="$OUT/export"
OPTIONS="$OUT/ExportOptions.plist"

cat >"$OPTIONS" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>signingStyle</key><string>automatic</string>
  <key>teamID</key><string>$TEAM_ID</string>
</dict></plist>
EOF

echo "Building MyTailLog $VERSION ($BUILD_NUMBER)"
cd "$ROOT"
npm run cap:sync

xcodebuild \
  -workspace "$WORKSPACE" \
  -scheme "$SCHEME" \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$APP_STORE_CONNECT_KEY_PATH" \
  -authenticationKeyID "$APP_STORE_CONNECT_KEY_ID" \
  -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID" \
  MARKETING_VERSION="$VERSION" \
  CURRENT_PROJECT_VERSION="$BUILD_NUMBER" \
  clean archive

xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT" \
  -exportOptionsPlist "$OPTIONS" \
  -allowProvisioningUpdates \
  -authenticationKeyPath "$APP_STORE_CONNECT_KEY_PATH" \
  -authenticationKeyID "$APP_STORE_CONNECT_KEY_ID" \
  -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID"

IPA=$(find "$EXPORT" -name '*.ipa' -type f -print -quit)
if [ -z "$IPA" ]; then
  echo "Xcode exported no IPA." >&2
  exit 1
fi

echo "Uploading $(basename "$IPA") to TestFlight"
xcrun altool --upload-package "$IPA" \
  --api-key "$APP_STORE_CONNECT_KEY_ID" \
  --api-issuer "$APP_STORE_CONNECT_ISSUER_ID" \
  --p8-file-path "$APP_STORE_CONNECT_KEY_PATH" \
  --wait

echo "Uploaded MyTailLog $VERSION ($BUILD_NUMBER)."
