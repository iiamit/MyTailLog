#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
FFMPEG="${FFMPEG:-$(command -v ffmpeg || true)}"
if [[ -z "$FFMPEG" ]]; then
  FFMPEG="$("${PYTHON:-python3}" -c 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())')"
fi
mkdir -p reel/clips
durations=(7 5 5 5 4 4 5)

for n in {1..7}; do
  index=$(printf '%02d' "$n")
  duration=${durations[$((n-1))]}
  fade_start=$(awk "BEGIN {print $duration - 0.28}")
  "$FFMPEG" -y -hide_banner -loglevel error -threads 2 \
    -loop 1 -framerate 24 -i "reel/scene-$index.jpg" -t "$duration" \
    -vf "zoompan=z='min(zoom+0.00010,1.04)':d=1:s=1080x1920:fps=24,fade=t=in:st=0:d=0.28,fade=t=out:st=$fade_start:d=0.28,format=yuv420p" \
    -an -c:v libx264 -preset veryfast -crf 22 -pix_fmt yuv420p \
    "reel/clips/$index.mp4"
done

for n in {1..7}; do printf "file 'clips/%02d.mp4'\n" "$n"; done > reel/concat.txt
"$FFMPEG" -y -hide_banner -loglevel error -f concat -safe 0 -i reel/concat.txt \
  -c copy reel/silent-reel.mp4

"$FFMPEG" -y -hide_banner -loglevel error \
  -i reel/silent-reel.mp4 -i reel/voiceover.wav -i reel/original-music.wav \
  -filter_complex '[1:a]highpass=f=90,acompressor=threshold=-20dB:ratio=2.5:attack=5:release=80,volume=1.15,pan=stereo|c0=c0|c1=c0[voice];[2:a]volume=0.35[music];[voice][music]amix=inputs=2:duration=first:dropout_transition=0,loudnorm=I=-16:TP=-1.5:LRA=10[a]' \
  -map 0:v -map '[a]' -c:v copy -c:a aac -b:a 192k -ar 48000 -movflags +faststart \
  -shortest reel/mytaillog-launch-reel-1080x1920.mp4

echo "Created reel/mytaillog-launch-reel-1080x1920.mp4"
