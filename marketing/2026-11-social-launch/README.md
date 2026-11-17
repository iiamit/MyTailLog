# MyTailLog social media package — November 2026

Ready-to-post media for Instagram, Facebook, and similar channels. The photography is illustrative; the product screenshot on carousel card 3 comes from the repository's fictional demo aircraft. The soundtrack is original and was generated for this package. The male voiceover is generated locally with the [Apache-licensed Kokoro model](https://huggingface.co/hexgrad/Kokoro-82M) using its `am_puck` voice.

## Publish these files

| Use | File | Format |
|---|---|---|
| Instagram / Facebook Reel | `reel/mytaillog-launch-reel-1080x1920.mp4` | 1080 × 1920, H.264 MP4, AAC, 35 seconds, music and male narration |
| Reel cover | `reel/cover-1080x1920.jpg` | 1080 × 1920 |
| Instagram carousel | `posts/01.jpg` through `posts/05.jpg`, in order | 1080 × 1350 JPEG |
| Instagram / Facebook Story | `story-1080x1920.jpg` | 1080 × 1920 JPEG |
| Facebook / LinkedIn feed image | `facebook-1200x628.jpg` | 1200 × 628 JPEG |
| Separate audio | `reel/original-music.wav` | Original stereo WAV |
| Narration audio | `reel/voiceover.wav` and `reel/voiceover.mp3` | Separate voiceover for remixing |
| Narration script and captions | `reel/narration.txt` and `reel/narration.srt` | Editable script and timed captions |

The carousel is designed to lead with proof of use, then show capture/search, maintenance visibility, mobile offline access, and the free/open-source call to action. The Reel has on-screen copy throughout and works with sound off. Upload the SRT file if the platform supports external captions.

## Instagram Reel or carousel caption

2,800+ logbook pages scanned and digitized. 3,700+ log entries. Dozens of aircraft. More than 50 active users in the last 30 days.

MyTailLog turns paper aircraft records into a searchable, useful picture of your aircraft. Scan and review logbook pages, search entries, track maintenance and ADs, follow engine trends, and keep your synced records with you offline.

It is available on iPhone, iPad, Android, and the web. MyFlightBook can sync flight hours into your maintenance forecast. Sign in with Google, Apple, or email, and connect a social sign-in to your existing account without losing your aircraft.

Free and open source. Get started through the link in our bio: **mytaillog.com**.

#GeneralAviation #AircraftOwner #AircraftMaintenance #Logbooks #PilotLife #MyFlightBook #AviationApps #OpenSource

## Facebook / LinkedIn caption

Aircraft logbooks are most useful when you can find and act on what is inside them. MyTailLog has now helped digitize **2,800+ logbook pages** into **3,700+ searchable entries** across dozens of aircraft, with **50+ active users in the last 30 days**.

Scan and review records, search every logbook, track upcoming maintenance and ADs, follow engine trends, and take synced scans and PDFs offline on iPhone, iPad, or Android. MyFlightBook flight-hour sync helps keep the forecast current. The website supports Google, Apple, and email sign-in; the mobile apps support their platform's social sign-in too.

MyTailLog is **free and open source**. Explore it at https://mytaillog.com, or download the apps:

- iPhone / iPad: https://apps.apple.com/us/app/mytaillog/id6795396758
- Android: https://play.google.com/store/apps/details?id=com.mytaillog.app
- Source: https://github.com/iiamit/MyTailLog

## Story sticker text

**2,800+ pages → 3,700+ searchable entries**

Link sticker: `https://mytaillog.com`

## Accessibility text

**Reel:** MyTailLog campaign with hangar, logbook, and branded product imagery. On-screen text states: 2,800+ pages, 3,700+ entries, dozens of aircraft, 50+ active users in 30 days. It then highlights scan and search, maintenance forecasts and engine trends, iPhone/iPad/Android offline access, MyFlightBook flight-hour sync, Google/Apple/email sign-in, and free open-source access at mytaillog.com. A friendly male voice narrates these points over original instrumental music. The full narration is in `reel/narration.txt`.

**Carousel 1:** Open aircraft logbook in a hangar beside a plane and phone. Text: 2,800+ pages, 3,700+ entries, dozens of aircraft, and 50+ active users in the last 30 days.

**Carousel 2:** Pilot holding a phone above a paper aircraft logbook. Text: Scan it. Find it. Use it. Scan pages or upload PDFs, review extracted entries, and search logbooks.

**Carousel 3:** Clean dark-blue graphic with a real MyTailLog demo screenshot of the Status screen. Text highlights maintenance forecasts, ADs, squawks, engine trends, oil analysis, and reminders.

**Carousel 4:** Blue MyTailLog graphic. Text: Your records. At the hangar. Synced scans and PDFs can be viewed offline; capture updates offline and sync later. App Store and Google Play.

**Carousel 5:** Aircraft and open logbook in a hangar. Text: Free. Open source. Ready to fly. MyFlightBook flight-hour sync; Google, Apple, or email sign-in; web, iPhone, iPad, and Android.

## Claim and product notes

- Counts are user-supplied campaign figures as of November 2026: **2,800+ pages**, **3,700+ entries**, **dozens of aircraft**, **50+ active users in the last 30 days**. Refresh the graphics and captions if they become stale.
- MyFlightBook claim is specifically **flight-hour sync**. The current integration also has a partner OAuth path, but a simplified single two-way user flow is still being tested; the campaign does not promise it.
- Web supports Google and Apple sign-in. Android supports Google sign-in; iOS supports Apple sign-in. Email remains available. Existing users should sign in with email first and link a provider in Profile.
- MyTailLog is an index and decision-support tool; physical logbooks remain the legal record.

## Editable source

The two AI-generated photographs are in `source/`. `build_media.py` renders the JPG graphics and original music. Run it with Python plus Pillow and NumPy. `generate_voiceover.py` renders the male narration with `kokoro-onnx` and the Kokoro v1.0 model files, which are downloaded separately and are not included in this package. `build_reel.sh` assembles the MP4 using FFmpeg; set `FFMPEG=/path/to/ffmpeg` if it is not on `PATH`. The graphics use MyTailLog's existing brand logo and local fonts from the repository. The corrected lead image has an evenly spaced propeller. An inaccurate cockpit illustration was discarded and is not part of the package.
