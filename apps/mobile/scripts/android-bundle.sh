#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
signing_properties="${MYTAILLOG_ANDROID_SIGNING_PROPERTIES:-$HOME/.config/mytaillog/android/signing.properties}"
if [[ ! -r "$signing_properties" ]]; then
  echo "Android signing config is missing: $signing_properties" >&2
  exit 1
fi
if [[ ! -s android/app/google-services.json ]]; then
  echo "Android Firebase config is missing: android/app/google-services.json" >&2
  exit 1
fi

npm run typecheck
npm run build
npx cap sync android
gradle_args=()
if [[ "${MYTAILLOG_ANDROID_SKIP_LINT:-0}" == "1" ]]; then
  gradle_args=(-x lintVitalAnalyzeRelease -x lintVitalReportRelease -x lintVitalRelease)
fi
(cd android && ./gradlew :app:bundleRelease --no-daemon --max-workers=1 "${gradle_args[@]}")
