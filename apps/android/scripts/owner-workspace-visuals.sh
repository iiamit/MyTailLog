#!/bin/bash
set -euo pipefail
# Run on the build Mac against an installed debug APK. Fixture activity never calls a live API.
serial=${1:?Usage: owner-workspace-visuals.sh emulator-5554 /absolute/output/directory}
output=${2:?Choose an output directory outside the repository}
mkdir -p "$output"
original_auto=$(adb -s "$serial" shell settings get system accelerometer_rotation | tr -d '\r')
original_rotation=$(adb -s "$serial" shell settings get system user_rotation | tr -d '\r')
original_font=$(adb -s "$serial" shell settings get system font_scale | tr -d '\r')
original_night=$(adb -s "$serial" shell cmd uimode night | tr -d '\r')
restore() {
    adb -s "$serial" shell settings put system accelerometer_rotation "$original_auto" >/dev/null || true
    adb -s "$serial" shell settings put system user_rotation "$original_rotation" >/dev/null || true
    adb -s "$serial" shell settings put system font_scale "$original_font" >/dev/null || true
    case "$original_night" in *yes*) adb -s "$serial" shell cmd uimode night yes >/dev/null || true ;; *no*) adb -s "$serial" shell cmd uimode night no >/dev/null || true ;; *) adb -s "$serial" shell cmd uimode night auto >/dev/null || true ;; esac
    adb -s "$serial" shell am force-stop com.mytaillog.app >/dev/null || true
}
trap restore EXIT
capture() {
    local name=$1 screen=$2
    shift 2
    adb -s "$serial" shell am force-stop com.mytaillog.app
    adb -s "$serial" shell am start -W -n com.mytaillog.app/.OwnerWorkspacePreviewActivity --es screen "$screen" "$@" >/dev/null
    sleep 2
    local ready=false
    for attempt in 1 2 3; do
        if adb -s "$serial" shell uiautomator dump /sdcard/owner-workspace-window.xml >/dev/null && adb -s "$serial" pull /sdcard/owner-workspace-window.xml "$output/$name.xml" >/dev/null; then
            ready=true
            break
        fi
        sleep 1
    done
    if [ "$ready" != true ]; then
        printf 'Could not capture the accessibility tree for %s\n' "$name" >&2
        return 1
    fi
    adb -s "$serial" exec-out screencap -p > "$output/$name.png"
    adb -s "$serial" shell rm /sdcard/owner-workspace-window.xml
}
adb -s "$serial" shell settings put system accelerometer_rotation 0
for orientation in 0 1 3; do
    adb -s "$serial" shell settings put system user_rotation "$orientation"
    for screen in engine inbox expenses annual; do
        capture "$screen-rotation-$orientation" "$screen"
    done
done
adb -s "$serial" shell settings put system user_rotation 0
capture engine-offline engine --ez offline true
capture inbox-error inbox --ez error true
capture expenses-viewer expenses --ez viewer true
adb -s "$serial" shell cmd uimode night yes
capture engine-dark engine
adb -s "$serial" shell settings put system font_scale 1.3
capture expenses-large-type expenses
printf 'Native captures saved in %s\n' "$output"
