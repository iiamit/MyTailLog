"""Render the MyTailLog social launch cards and reel artwork.

Run with a Python environment containing Pillow and NumPy. The final video is
assembled by build.sh using FFmpeg.
"""

from pathlib import Path
import math
import wave

import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps


ROOT = Path(__file__).resolve().parent
REPO = ROOT.parents[1]
POSTS = ROOT / "posts"
REEL = ROOT / "reel"
SOURCE = ROOT / "source"
POSTS.mkdir(exist_ok=True)
REEL.mkdir(exist_ok=True)

BLUE = (105, 176, 255)
WHITE = (247, 250, 255)
MUTED = (195, 209, 226)
NAVY = (5, 14, 31)
FONT = REPO / "apps/web/src/app/fonts/SpaceGrotesk.ttf"
BODY = REPO / "apps/web/src/app/fonts/InstrumentSans.ttf"
LOGO = REPO / "apps/web/public/brand/mytaillog-logo-dark.png"
PHOTOS = [
    SOURCE / "hangar-logbook-corrected.png",
    SOURCE / "scan-in-hangar.png",
]


def f(size, body=False):
    return ImageFont.truetype(str(BODY if body else FONT), size)


def background(path, size, focus=0.5):
    im = Image.open(path).convert("RGB")
    w, h = size
    ratio = max(w / im.width, h / im.height)
    im = im.resize((math.ceil(im.width * ratio), math.ceil(im.height * ratio)), Image.Resampling.LANCZOS)
    left = (im.width - w) // 2
    top = int((im.height - h) * focus)
    im = im.crop((left, top, left + w, top + h)).convert("RGBA")
    veil = Image.new("RGBA", size)
    v = ImageDraw.Draw(veil)
    for y in range(h):
        a = int(90 + 145 * (y / h) ** 1.6)
        if y < h * 0.45:
            a = max(a, 105)
        v.line((0, y, w, y), fill=(*NAVY, a))
    return Image.alpha_composite(im, veil)


def dark(size):
    w, h = size
    im = Image.new("RGBA", size, NAVY + (255,))
    d = ImageDraw.Draw(im)
    for i in range(12):
        x = int(w * (0.55 + i * 0.075))
        d.line((x, 0, x - int(h * 0.5), h), fill=(25, 57, 96, 90), width=2)
    d.ellipse((int(w * 0.64), -int(h * 0.18), int(w * 1.55), int(h * 0.55)), fill=(10, 34, 72, 255))
    return im


def label(d, text, x, y, size=29):
    d.text((x, y), text.upper(), font=f(size), fill=BLUE, stroke_width=0)


def lines(d, items, x, y, size=73, gap=1.06, color=WHITE):
    font = f(size)
    for item in items:
        d.text((x, y), item, font=font, fill=color)
        y += int(size * gap)
    return y


def body_lines(d, items, x, y, size=36, gap=1.28, color=MUTED):
    font = f(size, True)
    for item in items:
        d.text((x, y), item, font=font, fill=color)
        y += int(size * gap)
    return y


def brand(im, x, y, width=360):
    logo = Image.open(LOGO).convert("RGBA")
    logo.thumbnail((width, 120), Image.Resampling.LANCZOS)
    im.alpha_composite(logo, (x, y))


def footer(d, w, h, index=None, text="mytaillog.com"):
    d.line((74, h - 142, w - 74, h - 142), fill=(171, 210, 247, 110), width=2)
    d.text((76, h - 112), text, font=f(33), fill=WHITE)
    if index:
        d.text((w - 130, h - 112), f"{index:02d}/05", font=f(30), fill=MUTED)


def screenshot(im, path, box):
    x0, y0, x1, y1 = box
    sw, sh = x1 - x0, y1 - y0
    shadow = Image.new("RGBA", (sw + 36, sh + 40), (0, 0, 0, 0))
    s = ImageDraw.Draw(shadow)
    s.rounded_rectangle((15, 15, sw + 20, sh + 25), 31, fill=(0, 0, 0, 150))
    im.alpha_composite(shadow, (x0 - 16, y0 - 16))
    shot = Image.open(path).convert("RGB")
    shot = ImageOps.fit(shot, (sw, sh), method=Image.Resampling.LANCZOS)
    mask = Image.new("L", (sw, sh), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, sw, sh), 25, fill=255)
    im.paste(shot, (x0, y0), mask)


def post(index, image, render):
    size = (1080, 1350)
    im = background(image, size) if image else dark(size)
    d = ImageDraw.Draw(im)
    brand(im, 72, 68)
    render(im, d, *size)
    footer(d, *size, index=index)
    im.convert("RGB").save(POSTS / f"{index:02d}.jpg", quality=94, subsampling=0)


def post_one(im, d, w, h):
    label(d, "The records are adding up", 76, 217)
    lines(d, ["2,800+ pages", "3,700+ entries"], 72, 290, 82, 1.22)
    d.rounded_rectangle((72, 523, 1008, 792), 28, fill=(4, 18, 39, 222), outline=(115, 167, 223, 90), width=2)
    d.text((107, 563), "DOZENS", font=f(68), fill=WHITE)
    d.text((107, 649), "of aircraft", font=f(41, True), fill=MUTED)
    d.text((575, 563), "50+", font=f(76), fill=WHITE)
    d.text((578, 649), "active users*", font=f(40, True), fill=MUTED)
    body_lines(d, ["*In the last 30 days", "Paper logbooks. Searchable history.", "A clearer picture of what is next."], 76, 850, 34)


def post_two(im, d, w, h):
    label(d, "From paper to answers", 76, 220)
    lines(d, ["Scan it.", "Find it.", "Use it."], 72, 284, 96, 1.05)
    d.rounded_rectangle((72, 725, 1008, 1060), 28, fill=(4, 18, 39, 225))
    body_lines(d, ["Scan pages or upload PDFs", "Review extracted entries beside originals", "Search across your aircraft's logbooks"], 108, 775, 40, 1.6, WHITE)


def post_three(im, d, w, h):
    label(d, "More than a digital filing cabinet", 76, 213)
    lines(d, ["Know what", "comes next."], 72, 281, 92, 1.03)
    screenshot(im, REPO / "apps/web/src/screenshots/status.png", (75, 560, 1005, 1030))
    body_lines(d, ["Maintenance forecasts • ADs • Squawks", "Engine trends • Oil analysis • Reminders"], 77, 1062, 31, 1.35, WHITE)


def post_four(im, d, w, h):
    label(d, "iPhone • iPad • Android", 76, 212)
    lines(d, ["Your records.", "At the hangar."], 72, 285, 90, 1.07)
    d.rounded_rectangle((72, 590, 1008, 985), 30, fill=(10, 30, 58, 245), outline=(85, 147, 221, 110), width=2)
    body_lines(d, ["Browse synced scans and PDFs offline.", "Capture pages and updates without signal.", "Sync them when you are back online."], 110, 654, 44, 1.65, WHITE)
    d.rounded_rectangle((74, 1040, 1005, 1136), 24, fill=(98, 172, 252, 255))
    d.text((112, 1060), "APP STORE  +  GOOGLE PLAY", font=f(43), fill=NAVY)


def post_five(im, d, w, h):
    label(d, "One account. A lot more clarity.", 76, 217)
    lines(d, ["Free.", "Open source.", "Ready to fly."], 72, 289, 83, 1.05)
    d.rounded_rectangle((72, 650, 1008, 1048), 29, fill=(4, 18, 39, 230))
    body_lines(d, ["MyFlightBook flight-hour sync", "Google, Apple, or email sign-in", "Web, iPhone, iPad, and Android"], 108, 705, 43, 1.7, WHITE)
    d.text((76, 1090), "Get started at mytaillog.com", font=f(46), fill=BLUE)


def reel_card(index, photo, eyebrow, headline, supporting, extra=None, headline_size=101):
    size = (1080, 1920)
    im = background(photo, size, focus=0.50) if photo else dark(size)
    d = ImageDraw.Draw(im)
    brand(im, 78, 210, 420)
    label(d, eyebrow, 80, 420, 34)
    y = lines(d, headline, 76, 507, headline_size, 1.04)
    if extra:
        d.rounded_rectangle((77, y + 55, 1001, y + 275), 31, fill=(5, 21, 43, 228))
        body_lines(d, extra, 108, y + 87, 45, 1.56, WHITE)
    else:
        body_lines(d, supporting, 80, y + 72, 52, 1.42, WHITE)
    if index == 3:
        screenshot(im, REPO / "apps/web/src/screenshots/status.png", (78, 1080, 1002, 1530))
    if index == 4:
        d.rounded_rectangle((80, 1050, 1000, 1180), 28, fill=BLUE + (255,))
        d.text((122, 1080), "APP STORE  +  GOOGLE PLAY", font=f(52), fill=NAVY)
    if index == 7:
        d.rounded_rectangle((80, 1030, 1000, 1190), 30, fill=BLUE + (255,))
        d.text((141, 1068), "START FREE TODAY", font=f(63), fill=NAVY)
    d.line((80, 1660, 1000, 1660), fill=BLUE, width=3)
    d.text((80, 1693), "MYTAILLOG.COM", font=f(38), fill=WHITE)
    d.text((915, 1693), f"{index:02d}/07", font=f(35), fill=MUTED)
    im.convert("RGB").save(REEL / f"scene-{index:02d}.jpg", quality=93, subsampling=0)


def music(duration=35.0, rate=32000):
    """An original, low-key electronic pulse with pad and plucked notes."""
    n = int(duration * rate)
    t = np.arange(n, dtype=np.float32) / rate
    out = np.zeros((n, 2), np.float32)
    beat = 60 / 106
    notes = [110.0, 138.59, 164.81, 146.83]
    for bar in range(math.ceil(duration / (beat * 4))):
        start = bar * beat * 4
        root = notes[bar % len(notes)]
        ix = int(start * rate)
        end = min(n, int((start + beat * 4) * rate))
        if ix >= n:
            break
        local = t[ix:end] - start
        fade = np.minimum(1, local / .3) * np.minimum(1, (beat * 4 - local) / .5)
        chord = (np.sin(2 * np.pi * root * local) + .45 * np.sin(2 * np.pi * root * 1.5 * local) + .32 * np.sin(2 * np.pi * root * 2 * local))
        out[ix:end, 0] += .075 * chord * fade
        out[ix:end, 1] += .073 * chord * fade
        for step in range(8):
            at = start + step * beat / 2
            si = int(at * rate)
            ei = min(n, si + int(.46 * rate))
            if si >= n:
                continue
            u = t[si:ei] - at
            pitch = root * [2, 2.5, 3, 4, 3, 2.5, 2, 1.5][step]
            pluck = (np.sin(2 * np.pi * pitch * u) + .25 * np.sin(2 * np.pi * pitch * 2 * u)) * np.exp(-8 * u)
            out[si:ei, step % 2] += .028 * pluck
            out[si:ei, 1 - step % 2] += .016 * pluck
    for k in range(math.ceil(duration / beat)):
        start = k * beat
        ix = int(start * rate)
        end = min(n, ix + int(.22 * rate))
        if ix >= n:
            break
        local = t[ix:end] - start
        kick = np.sin(2 * np.pi * (61 - 32 * local) * local) * np.exp(-23 * local)
        out[ix:end] += ((.17 if k % 4 == 0 else .07) * kick)[:, None]
    rng = np.random.default_rng(42)
    for k in range(math.ceil(duration / (beat / 2))):
        at = k * beat / 2
        si = int(at * rate)
        ei = min(n, si + int(.045 * rate))
        if si >= n:
            break
        u = t[si:ei] - at
        hat = rng.standard_normal(len(u)).astype(np.float32) * np.exp(-85 * u) * .009
        out[si:ei] += hat[:, None]
    out *= (np.minimum(1, t / .7) * np.minimum(1, (duration - t) / 1.2))[:, None]
    pcm = np.clip(out * 32767, -32768, 32767).astype("<i2")
    with wave.open(str(REEL / "original-music.wav"), "wb") as wav:
        wav.setnchannels(2)
        wav.setsampwidth(2)
        wav.setframerate(rate)
        wav.writeframes(pcm.tobytes())


post(1, PHOTOS[0], post_one)
post(2, PHOTOS[1], post_two)
post(3, None, post_three)
post(4, None, post_four)
post(5, PHOTOS[0], post_five)

reel_card(1, PHOTOS[0], "The numbers", ["2,800+ pages", "3,700+ entries"], [], ["Dozens of aircraft", "50+ active users in 30 days"], headline_size=84)
reel_card(2, PHOTOS[1], "Capture + search", ["Paper logs.", "Searchable", "history."], ["Scan. Review. Find."])
reel_card(3, None, "Stay ahead", ["Maintenance", "without the", "guesswork."], ["Forecasts • ADs • engine trends"])
reel_card(4, None, "At the hangar", ["iPhone.", "iPad.", "Android."], ["Synced records available offline."])
reel_card(5, PHOTOS[0], "Connected hours", ["MyFlightBook", "sync."], ["Hobbs and tach in your forecast."])
reel_card(6, PHOTOS[1], "Easy access", ["Google.", "Apple.", "Email."], ["Sign in across web and apps."])
reel_card(7, None, "Get started", ["Free.", "Open source.", "MyTailLog."], ["mytaillog.com"])
music()

# Reuse the lead reel frame as a Story and reel cover; add a native link-preview
# size for Facebook and other platforms that prefer horizontal media.
Image.open(REEL / "scene-01.jpg").save(ROOT / "story-1080x1920.jpg", quality=94)
Image.open(REEL / "scene-01.jpg").save(REEL / "cover-1080x1920.jpg", quality=94)
fb = background(PHOTOS[0], (1200, 628), focus=.58)
fd = ImageDraw.Draw(fb)
brand(fb, 60, 42, 305)
label(fd, "Aircraft records, ready for the hangar", 62, 172, 27)
lines(fd, ["2,800+ pages scanned", "3,700+ log entries"], 58, 225, 62, 1.18)
fd.text((62, 515), "iPhone • iPad • Android  |  mytaillog.com", font=f(31), fill=WHITE)
fb.convert("RGB").save(ROOT / "facebook-1200x628.jpg", quality=94, subsampling=0)
