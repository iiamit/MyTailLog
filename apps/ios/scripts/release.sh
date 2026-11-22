#!/usr/bin/env bash
# Build MyTailLog for iOS and upload it to App Store Connect (TestFlight). See docs/release-ios.md.
# Uses Xcode's signed-in account, or an App Store Connect API key when all three key settings are present.
# Needs Config/Release.local.xcconfig. The first upload from a new Mac may need Xcode Organizer.
set -euo pipefail

export PATH="/opt/homebrew/bin:$PATH"

ios="$(cd "$(dirname "$0")/.." && pwd)"
[[ -f "$ios/Config/Release.local.xcconfig" ]] || { echo "Missing $ios/Config/Release.local.xcconfig (docs/release-ios.md)" >&2; exit 1; }

# The build host uses the same validated manual-signing path as TestFlight uploads.
if [[ -n "${APP_STORE_CONNECT_KEY_ID:-}" && -n "${APP_STORE_CONNECT_ISSUER_ID:-}" && -n "${APP_STORE_CONNECT_KEY_PATH:-}" ]]; then
  exec "$ios/scripts/testflight.sh" "$@"
fi

build="$(date -u +%Y%m%d%H%M)" # CURRENT_PROJECT_VERSION: a UTC timestamp always goes up
out="$ios/build/release-$build"
auth=(-allowProvisioningUpdates)
if [[ -n "${APP_STORE_CONNECT_KEY_ID:-}" && -n "${APP_STORE_CONNECT_ISSUER_ID:-}" && -n "${APP_STORE_CONNECT_KEY_PATH:-}" ]]; then
  auth+=(-authenticationKeyPath "$APP_STORE_CONNECT_KEY_PATH"
    -authenticationKeyID "$APP_STORE_CONNECT_KEY_ID"
    -authenticationKeyIssuerID "$APP_STORE_CONNECT_ISSUER_ID")
fi

(cd "$ios/../core" && ./gradlew :framework:assembleMyTailLogCoreReleaseXCFramework)
(cd "$ios" && xcodegen generate)

xcodebuild archive -project "$ios/MyTailLog.xcodeproj" -scheme MyTailLog -configuration Release \
  -destination 'generic/platform=iOS' -archivePath "$out/MyTailLog.xcarchive" \
  CURRENT_PROJECT_VERSION="$build" "${auth[@]}"

xcodebuild -exportArchive -archivePath "$out/MyTailLog.xcarchive" \
  -exportOptionsPlist "${EXPORT_OPTIONS:-$ios/ExportOptions.example.plist}" -exportPath "$out" "${auth[@]}"

echo "Uploaded build $build. It shows in TestFlight after App Store Connect finishes processing."
