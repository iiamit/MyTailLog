"""Generate a scene-synced male voiceover with the open Kokoro model."""

import os
from pathlib import Path
import subprocess

import imageio_ffmpeg
import numpy as np
import onnxruntime as ort
import soundfile as sf
from kokoro_onnx import Kokoro


ROOT = Path(__file__).resolve().parent
REEL = ROOT / "reel"
PARTS = REEL / "voice-parts"
PARTS.mkdir(exist_ok=True)
MODEL_DIR = Path(os.environ.get("KOKORO_MODEL_DIR", Path.home() / ".cache/mytaillog/kokoro"))
MODEL = MODEL_DIR / "kokoro-v1.0.fp16.onnx"
VOICES = MODEL_DIR / "voices-v1.0.bin"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
VOICE = "am_puck"
SPEED = 1.15

# Keep these durations in step with build_reel.sh.
SCENES = [
    (7, "Over twenty-eight hundred pages scanned. Over thirty-seven hundred entries. Dozens of aircraft. Fifty-plus active users."),
    (5, "Meet My Tail Log. Turn paper logbooks into searchable history, one page at a time."),
    (5, "See what's due next with maintenance forecasts, A D's, and engine trends."),
    (5, "Your records, available offline on iPhone, iPad, and Android."),
    (4, "Sync My Flight Book hours into your maintenance forecast."),
    (4, "Already have an account? Link Google or Apple. Email works too."),
    (5, "Free and open source, with your records in your hands. Start at My Tail Log dot com."),
]

ort.set_default_logger_severity(3)
engine = Kokoro(str(MODEL), str(VOICES))
timeline = None
offset = 0
for index, (seconds, text) in enumerate(SCENES, 1):
    audio, rate = engine.create(text, voice=VOICE, speed=SPEED, lang="en-us")
    audio = np.asarray(audio, dtype=np.float32).reshape(-1)
    raw = PARTS / f"{index:02d}-raw.wav"
    sf.write(raw, audio, rate)
    max_length = seconds - 0.22
    original_length = len(audio) / rate
    if original_length > max_length:
        adjusted = PARTS / f"{index:02d}-fit.wav"
        ratio = original_length / max_length
        subprocess.run(
            [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(raw),
             "-af", f"atempo={ratio:.4f}", "-ac", "1", str(adjusted)],
            check=True,
        )
        audio, adjusted_rate = sf.read(adjusted, dtype="float32")
        assert adjusted_rate == rate
    if timeline is None:
        timeline = np.zeros(int(sum(s for s, _ in SCENES) * rate), np.float32)
    start = int((offset + .10) * rate)
    end = min(start + len(audio), len(timeline))
    segment = audio[:end-start]
    fade = min(len(segment) // 2, int(.035 * rate))
    if fade:
        segment[:fade] *= np.linspace(0, 1, fade)
        segment[-fade:] *= np.linspace(1, 0, fade)
    timeline[start:end] += segment
    print(f"Scene {index}: {original_length:.2f}s → {(end-start)/rate:.2f}s in {seconds}s slot")
    offset += seconds

timeline = np.clip(timeline * .90, -1, 1)
sf.write(REEL / "voiceover.wav", timeline, rate)
subprocess.run(
    [FFMPEG, "-y", "-hide_banner", "-loglevel", "error", "-i", str(REEL / "voiceover.wav"),
     "-codec:a", "libmp3lame", "-q:a", "2", str(REEL / "voiceover.mp3")],
    check=True,
)
print("Created voiceover.wav and voiceover.mp3")
