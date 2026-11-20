#!/bin/sh
set -eu

# Build the native SwiftUI app (apps/ios) and upload it to TestFlight / App Store
# Connect, headlessly, with cloud signing. The Capacitor app's
# apps/mobile/scripts/testflight.sh archives ios/App/App.xcworkspace; this one
# archives the XcodeGen project generated from project.yml.
#
# Requires (App Store Connect API key with App Manager or Admin, so cloud signing
# may mint the distribution profile the first time):
#   APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_KEY_PATH
# and, for a Release build, apps/ios/Config/Release.local.xcconfig with
# SUPABASE_HOST, SUPABASE_PUBLISHABLE_KEY and API_HOST (project.yml stops the
# build if they are empty).
#
# Prerequisites in the Apple Developer portal (cloud signing downloads/creates
# the profiles but cannot invent these): the App ID com.mytaillog.app with Sign
# in with Apple, Associated Domains, App Groups and Push; the App Group
# group.com.mytaillog.app; the widget App ID com.mytaillog.app.widgets.

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)          # apps/ios
REPO=$(CDPATH= cd -- "$ROOT/.." && pwd)                       # apps
PROJECT="$ROOT/MyTailLog.xcodeproj"
SCHEME=MyTailLog
TEAM_ID=${APPLE_TEAM_ID:-38Z53C8X48}
BUNDLE_ID=${APP_BUNDLE_ID:-com.mytaillog.app}
VERSION=${1:-2.0.0}
BUILD_NUMBER=${BUILD_NUMBER:-$(date -u +%Y%m%d%H%M)}

required() {
  eval "value=\${$1:-}"
  if [ -z "$value" ]; then echo "Missing $1" >&2; exit 1; fi
}
required APP_STORE_CONNECT_KEY_ID
required APP_STORE_CONNECT_ISSUER_ID
required APP_STORE_CONNECT_KEY_PATH
[ -f "$APP_STORE_CONNECT_KEY_PATH" ] || { echo "Key not found: $APP_STORE_CONNECT_KEY_PATH" >&2; exit 1; }
[ -f "$ROOT/Config/Release.local.xcconfig" ] || {
  echo "Missing $ROOT/Config/Release.local.xcconfig (SUPABASE_HOST, SUPABASE_PUBLISHABLE_KEY, API_HOST)." >&2
  exit 1
}
command -v xcodegen >/dev/null 2>&1 || { echo "xcodegen not installed (brew install xcodegen)." >&2; exit 1; }

OUT=$(mktemp -d "${TMPDIR:-/tmp}/mytaillog-ios-testflight.XXXXXX")
trap 'rm -rf "$OUT"' EXIT HUP INT TERM
ARCHIVE="$OUT/MyTailLog.xcarchive"
EXPORT="$OUT/export"
OPTIONS="$OUT/ExportOptions.plist"

# 1. The KMP core the app links (apps/core -> MyTailLogCore.xcframework, release).
echo "Building MyTailLogCore.xcframework"
(cd "$REPO/core" && ./gradlew --console=plain :framework:assembleMyTailLogCoreXCFramework)

# 2. Generate MyTailLog.xcodeproj and the Info.plist/entitlements from project.yml.
echo "Generating Xcode project"
(cd "$ROOT" && xcodegen generate)

# 3. Export with MANUAL signing. Automatic (cloud) signing needs a cloud-managed
#    distribution certificate, which an App Store Connect API key is NOT allowed
#    to create ("Cloud signing permission error") — so we use the Apple
#    Distribution cert already in the keychain (imported as a .p12) plus App
#    Store profiles that make-profiles.mjs creates via the API and installs.
echo "Ensuring App Store provisioning profiles"
node "$ROOT/scripts/make-profiles.mjs"

cat >"$OPTIONS" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>signingStyle</key><string>manual</string>
  <key>teamID</key><string>$TEAM_ID</string>
  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key>
  <dict>
    <key>$BUNDLE_ID</key><string>MyTailLog App Store</string>
    <key>$BUNDLE_ID.widgets</key><string>MyTailLog Widgets App Store</string>
  </dict>
</dict></plist>
EOF

echo "Archiving MyTailLog $VERSION ($BUILD_NUMBER)"
xcodebuild \
  -project "$PROJECT" \
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

echo "Exporting signed IPA"
xcodebuild \
  -exportArchive \
  -archivePath "$ARCHIVE" \
  -exportPath "$EXPORT" \
  -exportOptionsPlist "$OPTIONS"

IPA=$(find "$EXPORT" -name '*.ipa' -type f -print -quit)
[ -n "$IPA" ] || { echo "Xcode exported no IPA." >&2; exit 1; }

echo "Uploading $(basename "$IPA") to App Store Connect"
xcrun altool --upload-package "$IPA" \
  --api-key "$APP_STORE_CONNECT_KEY_ID" \
  --api-issuer "$APP_STORE_CONNECT_ISSUER_ID" \
  --p8-file-path "$APP_STORE_CONNECT_KEY_PATH" \
  --wait

echo "Uploaded MyTailLog $VERSION ($BUILD_NUMBER). It appears in TestFlight after processing."
