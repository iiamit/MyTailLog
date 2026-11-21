# MyTailLog platform update — social media

A coming-soon / sneak-peek campaign: seven carousel images, an editorial motion reel with professional ElevenLabs narration, a cover and Facebook artwork. The visual language follows the new app: binder ink, colored section boards, white pages and Libre Franklin.

## Publishable files

- `carousel/01.jpg` through `07.jpg`: Instagram/Facebook carousel, **1080 × 1350**, sRGB JPEG. Upload in filename order. `contact-sheet.jpg` is a review aid, not a post.
- `reel/mytaillog-platform-update-captioned-1080x1920.mp4`: preferred social Reel, **1080 × 1920, 30 fps**, H.264/AAC, with narration, original score and burned captions.
- `reel/mytaillog-platform-update-clean-1080x1920.mp4`: same narration and music with no burned captions. Use the supplied `narration.srt` for platform captioning.
- `reel/cover-1080x1920.jpg`: cover. Check the platform's feed/profile crop before publishing.
- `facebook/platform-update-1200x630.jpg`: landscape post/link artwork.
- `reel/voiceover.wav` and `voiceover.mp3`: isolated narration; `original-score.wav`: original instrumental score.

The social captions and announcement copy are in the parent package's `copy/` directory.

## Campaign sequence

1. Your aircraft. A clearer picture — redesigned around the records.
2. Every decade. One map — history across four logbook types.
3. The answer. And the evidence — review alongside the original.
4. At your desk. At your aircraft — iOS/iPadOS and Android previews.
5. Small screen. Big picture — Duo cover/inner layouts.
6. Less digging. More doing — maintenance, hours, oil, squawks, MFB and sharing.
7. Your records. Your choice — free, open source, account choice and CTA.

Campaign posture: **try the new design on the web now; native apps are coming soon.** On a desktop aircraft screen, choose **Try the new design** in Account navigation. Use the mobile slides/reel as a **sneak peek** until native releases are publicly available. The artwork explicitly says “SNEAK PEEK,” “Coming soon” and “simulator preview.” Existing store downloads may still offer the earlier app. Do not crop away those preview labels.

## Sources, privacy and rights

- Web: committed `apps/web/src/screenshots/v2-map.png`, `v2-review.png`, and `v2-status.png`. They show fictional demo aircraft **N734DM**.
- Native: screenshots captured on the Mac build host, in `~/.codex/outputs/mytaillog-store-screenshots-2026-11-21`. The test backend contains an aircraft copied for testing; visible tail identifiers are replaced with **DEMO** for these marketing assets. The app's data and layout are otherwise preserved.
- Duo: actual simulator capture `~/.local/share/mytaillog-screens/duo-map-selected.png`, with the tail and mechanic's name anonymized and the source scan blurred for privacy. It demonstrates the real two-pane interface. The cover-to-inner cut in the reel is editorial animation, **not a recording or promise of an OS fold animation**. No hardware certification is implied.
- `source/native-interaction.mp4`: actual iPhone simulator screen recording from the Mac build host, captured by a passing temporary UI test. It shows scrolling the real logbook map; only the tail label is anonymized. The raw recording, sign-in steps and test credentials are not distributed.
- Native/UI captures and the web demo are genuine product screenshots; no invented screen or generated product UI appears.
- Voice: ElevenLabs **Chris — Charming, Down-to-Earth**, male American English; model `eleven_multilingual_v2`. Friendly, upbeat delivery. Alignment comes directly from ElevenLabs and drives the captions. This is synthetic narration, not a customer testimonial.
- ElevenLabs API key is held outside the repo in a protected global env file. It can synthesize speech and list voices, but lacks `user_read`, so commercial subscription rights cannot be verified with that key. The user confirmed a **free plan** and described this promotion as noncommercial. Free-plan output has **no commercial clearance** and must credit ElevenLabs in the publication **title**: `Coming soon: the new MyTailLog | Voice: elevenlabs.io`. The end card also credits ElevenLabs. Open source or nonprofit status does not itself grant commercial rights; this package follows the user's stated noncommercial use. Use the narrated video only for the stated noncommercial purpose; a paid plan and newly generated audio would be needed for commercial use. See [ElevenLabs commercial use](https://help.elevenlabs.io/hc/en-us/articles/13313564601361-Can-I-use-the-audio-I-generate-for-commercial-purposes).
- Music: newly generated original instrumental composition; no third-party recording, sample, recognizable melody, or commercial track used.
- Typeface: the repository's Libre Franklin, licensed under the SIL Open Font License. See `apps/web/src/app/fonts/LibreFranklin-OFL.txt`.
- No usage totals are used in these new assets, avoiding stale platform counts.
- The physical logbooks remain the record; this campaign does not promise an airworthiness determination.

## Accessibility / alt text

1. A real MyTailLog web screen shows a colorful logbook history map and the original page beside a selected record. Headline: “Your aircraft. A clearer picture.”
2. Aircraft history appears on a map connecting airframe, engine, propeller and avionics entries. Headline: “Every decade. One map.”
3. The entry review screen places AI-read fields beside a scanned page. Headline: “The answer. And the evidence.”
4. Real iOS and Android screens show the logbook map and organized books. Native app preview; identifiers anonymized.
5. Duo simulator screenshots show a compact cover layout and unfolded map with the selected page on the right. The source scan is obscured for privacy.
6. A real maintenance status screen shows upcoming and overdue items with its scanned source. Copy lists hours, oil, squawks, sharing, MyFlightBook and pre-buy records.
7. Text: free and open source; Google, Apple or email; web, iOS and Android; records and exports remain with the owner. Visit mytaillog.com/whats-new.

The complete spoken transcript is `reel/narration.txt`; platform-friendly brand spelling appears in `narration.srt`. Put the transcript in a video description if native captions are unavailable.

## Rebuild

Use Python 3 with `Pillow`, `numpy`, `requests` and `imageio-ffmpeg`. Dependencies are production tooling only; no application dependency was added.

```sh
python generate_voiceover.py  # uses protected ElevenLabs config, reuses cached scene audio
python render_reel.py      # carousel, actual native footage, score, captions and attribution
```

The key is never embedded in an artifact. `generate_voiceover.py` writes real speech timings, then `render_reel.py` fits the picture edit to the voice. `source/` includes the exact sanitized assets used so a new build does not need access to private originals. The native preview supports offline update queuing; this campaign does not promise offline scan downloads in that preview. `prepare_sources.py` copies the archive again; it applies the same redaction if the local selected-page capture exists, otherwise retain the supplied sanitized source.

## Verification

Run `python -B validate_media.py` after rendering. It checks seven 4:5 cards, the 9:16 cover, both playable H.264/AAC 30 fps reels, voice/caption alignment, full decode, integrated loudness and true peak. The results are in `verification.json`; `manifest.json` records file sizes and SHA-256 checksums. Native capture completed on the Mac build host; its temporary test source was restored, the worktree was clean, and the simulator was shut down.
