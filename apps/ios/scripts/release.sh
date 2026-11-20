#!/usr/bin/env bash
# Build MyTailLog for iOS and upload it to App Store Connect (TestFlight). See docs/release-ios.md.
# Needs APP_STORE_CONNECT_KEY_ID, APP_STORE_CONNECT_ISSUER_ID, APP_STORE_CONNECT_KEY_PATH (the .p8)
# and Config/Release.local.xcconfig. The first upload from a new Mac goes through Xcode Organizer instead.
set -euo pipefail

: "${APP_STORE_CONNECT_KEY_ID:?set APP_STORE_CONNECT_KEY_ID}"
: "${APP_STORE_CONNECT_ISSUER_ID:?set APP_STORE_CONNECT_ISSUER_ID}"
: "${APP_STORE_CONNECT_KEY_PATH:?set APP_STORE_CONNECT_KEY_PATH to the .p8 file}"

ios="$(cd "$(dirname "$0")/.." && pwd)"
[[ -f "$ios/Config/Release.local.xcconfig" ]] || { echo "Missing $ios/Config/Release.local.xcconfig (docs/release-ios.md)" >&2; exit 1; }

build="$(date -u +%Y%m%d%H%M)" # CURRENT_PROJECT_VERSION: a UTC timestamp always goes up
out="$ios/build/release-$build"
auth=(-allowProvisioningUpdates
  -authenticationKeyPath "$APP_STORE_CONNECT_KEY_PATH"
  -authenticationKeyID "$APP_STORE_CONNECT_KEY_ID"
  -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID")

(cd "$ios/../core" && ./gradlew :framework:assembleMyTailLogCoreReleaseXCFramework)
(cd "$ios" && xcodegen generate)

xcodebuild archive -project "$ios/MyTailLog.xcodeproj" -scheme MyTailLog -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$out/MyTailLog.xcarchive" \
  CURRENT_PROJECT_VERSION="$build" "${auth[@]}"

xcodebuild -exportArchive -archivePath "$out/MyTailLog.xcarchive" \
  -exportOptionsPlist "${EXPORT_OPTIONS:-$ios/ExportOptions.example.plist}" -exportPath "$out" "${auth[@]}"

echo "Uploaded build $build. It shows in TestFlight after App Store Connect finishes processing."
