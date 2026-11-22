#!/bin/sh
set -eu

# Build and publish the native Android app (apps/android) to Google Play,
# headlessly. Reuses apps/mobile/scripts/play.mjs, which already targets the
# native app via MYTAILLOG_ANDROID_DIR=../android.
#
# Requires:
#   - JDK 21 + Android SDK (JAVA_HOME / ANDROID_HOME).
#   - ~/.config/mytaillog/android/signing.properties (Play upload keystore) and,
#     for FCM, apps/android/app/google-services.json.
#   - ~/.gradle/gradle.properties with mytaillog.supabaseUrl/supabaseKey/apiUrl.
#   - ~/.config/mytaillog/android/play-service-account.json (Play Publisher API).
#
# Usage: scripts/release.sh <check|draft|internal|closed|production>
#   check       inspect Play tracks and the current bundle versions
#   draft       build a signed AAB and upload it as an internal-testing DRAFT (no testers)
#   internal    promote the uploaded draft to the internal-testing track
#   closed      promote the completed internal bundle to the closed (alpha) track
#   production  promote the completed internal bundle to production

MODE=${1:-check}
ANDROID=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)        # apps/android
MOBILE=$(CDPATH= cd -- "$ANDROID/../mobile" && pwd)            # apps/mobile (holds play.mjs)
export MYTAILLOG_ANDROID_DIR="$ANDROID"

case "$MODE" in
  draft)
    echo "Building signed release AAB"
    (cd "$ANDROID" && ./gradlew --console=plain :app:lintRelease :app:bundleRelease)
    python3 "$ANDROID/scripts/verify-release.py" "$ANDROID/app/build/outputs/bundle/release/app-release.aab"
    # Preserve the exact bundle (including mappings) before Gradle overwrites the next build.
    ARCHIVE="$ANDROID/build/releases/$(date -u +%Y%m%dT%H%M%SZ)"
    mkdir -p "$ARCHIVE"
    cp "$ANDROID/app/build/outputs/bundle/release/app-release.aab" "$ARCHIVE/"
    (cd "$MOBILE" && node scripts/play.mjs draft)
    ;;
  check|internal|closed|production)
    (cd "$MOBILE" && node scripts/play.mjs "$MODE")
    ;;
  *)
    echo "Usage: $0 <check|draft|internal|closed|production>" >&2
    exit 1
    ;;
esac
