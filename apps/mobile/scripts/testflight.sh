#!/bin/sh
set -eu

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
WORKSPACE="$ROOT/ios/App/App.xcworkspace"
SCHEME=App
TEAM_ID=${APPLE_TEAM_ID:-38Z53C8X48}
BUNDLE_ID=${APP_BUNDLE_ID:-com.mytaillog.app}
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

# Export with MANUAL signing against a profile that already exists.
#
# `signingStyle: automatic` asks Apple to mint the distribution profile at
# export time ("cloud signing"), which the App Store Connect API key may not be
# allowed to do — a key without the App Manager or Admin role fails with
# "Cloud signing permission error", and the two capability errors that follow
# are just what a profile that was never created cannot contain. That is not a
# signing problem to debug at 2am; it is a permission the key either has or
# hasn't.
#
# Naming the profile removes the question. Xcode already installed one when it
# distributed from the Organizer, and it is the same profile a manual export
# uses. Override PROFILE_NAME if the team ever renames it.
PROFILE_NAME=${PROFILE_NAME:-"iOS Team Store Provisioning Profile: $BUNDLE_ID"}

# automatic | manual. Xcode-managed profiles — the ones Xcode creates itself,
# named "iOS Team Store Provisioning Profile: <bundle>" — can ONLY be used with
# automatic signing; naming one under manual signing fails with "is Xcode
# managed, but signing settings require a manually managed profile". Manual is
# for a profile you created in the portal yourself, so it is the override, not
# the default.
SIGNING_STYLE=${SIGNING_STYLE:-automatic}

# Fail here, with the reason, rather than 400 lines into an xcodebuild log.
PROFILE_DIR="$HOME/Library/Developer/Xcode/UserData/Provisioning Profiles"
[ -d "$PROFILE_DIR" ] || PROFILE_DIR="$HOME/Library/MobileDevice/Provisioning Profiles"
found_aps=""
for f in "$PROFILE_DIR"/*.mobileprovision; do
  [ -f "$f" ] || continue
  plist=$(security cms -D -i "$f" 2>/dev/null) || continue
  case "$plist" in *"<string>$PROFILE_NAME</string>"*) ;; *) continue ;; esac
  case "$plist" in *"<key>aps-environment</key>"*) found_aps=$(printf '%s' "$plist" |
    awk '/aps-environment/{getline; gsub(/.*<string>|<\/string>.*/,""); print; exit}') ;; esac
  found="$f"
  break
done
if [ -z "${found:-}" ]; then
  echo "No installed profile named \"$PROFILE_NAME\"." >&2
  echo "Distribute once from Xcode's Organizer (which installs it), or set PROFILE_NAME." >&2
  exit 1
fi
if [ "$found_aps" != "production" ]; then
  echo "Profile \"$PROFILE_NAME\" has aps-environment=${found_aps:-none}, expected production." >&2
  echo "A TestFlight build signed for the development APNs host registers no device tokens." >&2
  exit 1
fi

if [ "$SIGNING_STYLE" = "manual" ]; then
  PROFILE_BLOCK="  <key>signingCertificate</key><string>Apple Distribution</string>
  <key>provisioningProfiles</key>
  <dict><key>$BUNDLE_ID</key><string>$PROFILE_NAME</string></dict>"
else
  # Automatic reuses the installed Xcode-managed profile. It only needs cloud
  # signing when it has to CREATE one — which is why this failed before the
  # first Organizer distribution installed it, and works after.
  PROFILE_BLOCK=""
fi

cat >"$OPTIONS" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>method</key><string>app-store-connect</string>
  <key>destination</key><string>export</string>
  <key>signingStyle</key><string>$SIGNING_STYLE</string>
  <key>teamID</key><string>$TEAM_ID</string>
$PROFILE_BLOCK
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
