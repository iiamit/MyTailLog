# MyTailLog — paper to map

Full-motion revision using the four Google Flow clips supplied by Ian.

## Publishable exports

- `mytaillog-paper-to-map-captioned-1080x1920.mp4`: vertical film with narration, music and burned-in captions.
- `mytaillog-paper-to-map-clean-1080x1920.mp4`: the same film and audio without burned-in captions.
- `narration.srt`: aligned subtitles for platforms that support a separate caption upload.
- `voiceover.mp3`: standalone male narration.
- `contact-sheet.jpg`: visual index of the ten scenes.

## Edit

A–D form the first 32 seconds. The added year overlays have been removed; dates within the actual app remain. Near the end of D, the generated interface is replaced with the actual supplied iOS map image. The film then shows source-page review, map selection, maintenance history, native phone interaction, an editorial Duo cover-to-inner transition and the final website call to action. The product section reuses genuine captured interaction and the previously prepared campaign camera movements.

The approved musical theme is retained, looped and ducked beneath new ElevenLabs Chris narration. Generated Flow audio is excluded. Airframe, Engine, Propeller and Avionics have explicit pauses between them. The AD phrase uses ElevenLabs Flash v2 with explicit IPA phonemes /eɪ/ and /diː/; the rest uses the previously approved Multilingual v2 voice. Displayed captions use AD. Native redesign footage is labeled as a coming-soon preview. The Duo transition is an editorial reveal, not evidence of an operating-system fold animation.

## Publication copy

**Title:** Coming soon: MyTailLog — from paper to a clearer picture | Voice: elevenlabs.io

Decades of aircraft history. Airframe, engine, propeller and avionics. One connected view.

Here’s a sneak peek at the new MyTailLog: scan and review your logbooks, follow the original evidence, see what is due, and keep your aircraft’s past, present and next maintenance steps close at hand.

Try the new design on the web today: https://mytaillog.com/

The redesigned native mobile experience is coming soon. Free and open source.

Voice: elevenlabs.io. AI-generated opening footage, supplied through Google Flow; actual app captures follow the map transition.

## Technical notes

Final delivery is H.264/AAC, 1080×1920, 30fps. Flow inputs are 720×1280 at 24fps; scaling/conforming does not add native source detail. See `production.json` for timing/provenance and `verification.json` for decode, motion, audio and subtitle checks. Generated physical continuity is stylized and not perfectly identical across every sheet; no additional video-generation purchase was made.

To rebuild, run `build_film.py` from the parent folder with the existing media Python environment, then `verify_film.py`. ElevenLabs credentials stay in the protected global configuration. Cached narration avoids repeat speech-generation calls. Intermediate work files are generated locally and excluded from the delivery package.

Large MP4 exports, the supplied Flow footage and the uncompressed voice WAV are kept out of Git history. The downloadable delivery ZIP contains both final MP4s, the MP3 narration, subtitles, cover and publication notes. Original Flow clips remain available locally in the adjacent `footage/` folder.
