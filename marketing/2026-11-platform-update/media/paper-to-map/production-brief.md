# Paper to map — full-motion film

Status: user supplied the four generated Google Flow clips A–D. The full-motion film is being assembled as a separate revision; the earlier moving-screen Reel remains intact. The shot timings below are the original production targets; the delivered timeline and narration are recorded in `film/timing.json` and `film/narration.txt`.

Latest edit revision: remove added year overlays. Speak “Airframe. Engine. Propeller. Avionics.” with explicit pauses, and pronounce AD as the separate letters /eɪ/ /diː/. The original shot plan below remains the creative reference.

## Deliverables

- A continuous-feeling 65–70 second vertical film, 1080 × 1920, 30 fps, with clean and captioned exports.
- Friendly, upbeat male ElevenLabs narration; retain the approved musical direction and duck music under speech.
- Full motion in the physical world: wind in flowers, a turning page, curling sheets, flight, contact shadows, camera travel and evolving depth of field. A still-image slideshow is not a substitute.
- Real captured MyTailLog interaction after the physical-to-digital transition. No generated app screens or invented controls.
- Keep redesigned mobile apps a sneak peek / coming soon; invite viewers to try the web design now.

## Story and edit

Times are editorial targets; conform to the final voice recording rather than squeezing speech.

| Time | Image and camera | Voice / editorial intent |
| --- | --- | --- |
| 0–6 s | Macro, open worn aircraft maintenance logbook resting in a field of small yellow flowers. Warm daylight; wind shifts flowers and turns one ruled page. Pull up and back into an oblique overhead view. | “Every aircraft has a story. But on paper, that story lives in separate logbooks.” |
| 6–13 s | The page lifts naturally, flexes and joins other sheets in a flowing arc. Follow the lead sheet towards a narrow dark track in the field. As it settles, the track resolves into a smooth indigo line. | “Airframe. Engine. Propeller. Avionics.” |
| 13–22 s | Travel along the first line as pages land and markers appear. Additional books turn pages on either side; more sheets fly onto three parallel paths. Four paths become visible, with real paper, shadows and flower movement throughout. | “Different dates, different tasks—and a lot to keep connected. Maintenance, inspections, A-D tracking.” |
| 22–30 s | Continue down all four paths. Sheets aligned at the same date group into rounded visit markers spanning their lanes. Physical pages remain recognizable until the final graphic transition. | “MyTailLog brings those records together. Scan or upload your pages, then review the extracted details beside the originals.” |
| 30–36 s | Flowers and shadows gradually resolve into the exact yellow of the captured Logbooks screen. Paths and visit markers align with a close crop of the real map. Match movement and scale, cross into the actual map recording, then pull back to reveal the interface. | “…beside the originals.” continues across the reveal; allow a short musical breath. |
| 36–44 s | Actual map interaction: select one visit, show the linked entry and its original scanned page. Move deliberately between source and record; keep the important details large. | “Correlate entries across books. Follow your aircraft’s history, see what’s due, and plan what comes next.” |
| 44–52 s | Actual Status / Maintenance interaction: select an inspection, open its history/source; move into hours, oil or squawks using recorded UI actions. | “Track hours, oil and squawks, with MyFlightBook integration to help keep your records in step.” |
| 52–61 s | Real iPhone / Android interaction, followed by an unfolded Duo side-by-side entry view. Clearly mark native footage as a coming-soon preview. Use an editorial device transition, not an unsupported claim of a native fold animation. | “At your desk or at the aircraft, the new mobile experience is coming soon—including layouts that unfold with iPhone Duo.” |
| 61–68 s | Finish on readable website CTA and brand colors; retain gentle camera/interface motion into the end card. | “Free and open source. Try the new design on the web today. MyTailLog dot com.” |

## Narration master

Every aircraft has a story. But on paper, that story lives in separate logbooks.

Airframe. Engine. Propeller. Avionics. Different dates, different tasks—and a lot to keep connected. Maintenance, inspections, A-D tracking.

MyTailLog brings those records together. Scan or upload your pages, then review the extracted details beside the originals.

Correlate entries across books. Follow your aircraft’s history, see what’s due, and plan what comes next.

Track hours, oil and squawks, with MyFlightBook integration to help keep your records in step.

At your desk or at the aircraft, the new mobile experience is coming soon—including layouts that unfold with iPhone Duo.

Free and open source. Try the new design on the web today. MyTailLog dot com.

### Recording direction

Use the previously approved male voice and conversational energy. Pronounce AD as the two letters “ay dee”; use explicit IPA /eɪ/ and /diː/ on a model supporting phoneme tags, while captions display “AD.” Pronounce MyTailLog as “my tail log,” MyFlightBook as “my flight book,” and Duo as “doo-oh.” Do not rush the four logbook categories. Verify those pronunciations by listening, not only by inspecting text/alignment.

## Generation method

Produce four connected 6–8 second physical-world clips with controlled start/end reference frames, then a separately edited 4–6 second match transition. Generate silent footage to preserve musical and narration continuity. Reuse the outgoing frame as the next clip’s start reference. Maintain book appearance, field lighting, paper stock, direction of travel and four lane colors across shots.

Use image-to-video or first/last-frame conditioning where supported. Avoid one long prompt asking a model to invent the entire map, dates and app: exact UI reproduction is an editing job. Match final lane/visit geometry in editing and preserve the actual app’s dates. Do not add year labels over the physical-world footage. Paper and books stay photorealistic; the geometry intentionally becomes graphical only during the transition into the app.

Map lane order and colors must be sampled from the actual captured screen: Airframe, Engine, Propeller, Avionics. Choose the actual capture’s date order and a matching camera direction before generating the final physical tracking shot. Dates may differ between books; only group records at their true shared visit/date positions. Four lanes alone do not imply every visit contains all four books.

## Clip prompts

### A — field and page turn

Photorealistic cinematic live-action macro shot, vertical 9:16. An open, worn brown aircraft maintenance logbook rests naturally among small yellow wildflowers in a sunlit meadow. Cream ruled pages with indistinct handwritten maintenance notes, visible paper fibers, realistic binding and shadows. A gentle breeze moves the flowers and slowly lifts and turns a single page. The camera rises and dollies backward into a slightly elevated oblique view, keeping the book anchored in the lower-center field. Natural warm daylight, subtle lens breathing, physically plausible paper motion. No people, no readable generated words, no logos, no graphic overlays, no cartoon or illustrated appearance. End with one loose sheet just lifting above the open book, camera moving forward along the field.

### B — paper finds its path

Continue from the supplied reference frame with exactly the same brown aircraft logbook, yellow flower field, daylight and paper stock. Track a loose cream logbook page as it lifts, curls gently and flies forward above the flowers. Several other pages follow in a smooth flowing arc. Ahead, a narrow dark track runs through the meadow and simplifies into one smooth indigo path. The lead page settles onto it with convincing contact shadow and slight paper flex. Camera travels forward with the page and rises enough to reveal the path continuing into the distance. Photorealistic live-action materials and camera, surreal choreography with grounded lighting. No readable text, no invented application interface, no railway train, no cartoon animation.

### C — four books, connected history

Continue the same forward camera movement through the yellow flower field from the supplied last frame. Reveal three additional open aircraft maintenance logbooks at staggered distances beside the first path. Their pages turn and individual cream sheets lift and travel onto three parallel paths. Four smooth paths now run into the distance, indigo, muted magenta, charcoal and teal, with realistic pages landing at staggered positions. Keep the paths parallel and the pages distinct. Camera continues forward and rises, with visible flower movement, paper flex and sunlight. Do not add written labels or dates. No cartoon styling, no generated software screens, no extra paths.

### D — group, flatten and reveal

**Supply these two images in Google Flow before using the prompt:**

1. **Start frame:** the final frame exported from your approved sequence C video. This is the four-path field scene; it is not a separate image included in this package.
2. **End frame:** [`04-real-map-reference.png`](04-real-map-reference.png), the actual iOS Logbooks → Map screenshot included alongside this brief. Use the portrait native map for this vertical film. Preview Flow’s portrait framing and keep all four map lanes visible; the original phone screenshot is taller than 9:16, so do not stretch it.

[`04-web-map-reference.png`](04-web-map-reference.png) is the full desktop screenshot for the later web reveal or a landscape variant. **Do not attach it as D’s end frame:** its timeline is horizontal, whereas the phone map’s lanes are vertical.

**Paste this revised prompt:**

> Continue from the supplied START FRAME: the four-path scene in the yellow wildflower field. Use the supplied END FRAME as the destination composition: the actual MyTailLog phone Logbooks map. Keep the camera moving forward and rising smoothly toward an overhead view. Bring the four paths into four vertical lanes, left to right indigo Airframe, magenta Engine, charcoal Propeller and teal Avionics, matching the target image. Real paper pages at aligned dates gather into rounded visit groupings across their respective lanes. Preserve natural paper texture, wind, sunlight and contact shadows during the field portion. As the camera rises, the meadow’s yellow resolves into the app’s yellow surround and a white map panel emerges beneath the lanes, matching the supplied target. Finish with the same camera direction, lane positions and group shapes as the end frame. No extra lanes, invented buttons or added text. No cartoon styling, camera reversal or abrupt cut. No music or narration.

**Editing handoff:** Any generated lettering or altered interface is temporary. Replace the final matching frames with the supplied original screenshot / real map recording in the edit, then pull back into the actual app. This is where the exact dates, labels and pixel-accurate interface are preserved. A Flow render alone is not the final app reveal.


## App footage and final transition

Existing sources: `../source/web-map-interaction.mp4`, `../source/web-status-interaction.mp4`, `../source/native-interaction.mp4`, and current device screenshots. Use recordings at their native proportions. Additional captures must use fictional test records and the Mac build host; remove account identifiers and personal source-page details. New interactions should include an entry selection followed by its scan and an inspection/history selection. Any reused static device shot is supporting material, not the primary motion in a scene.

Use the real map as the final 2–3 seconds of the transformation, enlarged beyond the screen edges; then ease back to the complete screen. Match lane spacing, marker scale and position before the dissolve. Do not generate or fabricate an MTL screenshot.

## Finish and acceptance

- Watch every generated shot at full speed and frame-by-frame around page contact and clip joins. Reject rubber-like bindings, detached pages passing through books, warped sheet motion, inconsistent lane counts, abrupt camera jumps and unreadable generated text.
- Listen to the complete narration for “ay dee,” names, natural pacing and music balance; generate aligned captions from the approved speech.
- Verify the paper-to-real-map handoff against the actual app screenshot, with no invented dates or misleading auto-verification.
- Verify audio loudness, true peak, full video decode, dimensions and frame rate. Existing image-difference checks alone cannot establish realistic motion quality.
- Keep captions and important details within social-platform safe areas; review the film on a phone-sized preview.
- Preserve the existing released kit. Export this film as a separate revision after footage and audio pass review.

## Access gate

ElevenLabs documentation checked during preparation states that video generation requires a paid account and API generation requires Pro or above plus Image & Video / Flows key permission. No video-generation purchase was made: the user generated and supplied A–D through Google Flow. Do not label reference stills or an animatic as the finished full-motion film.

References:
- https://elevenlabs.io/docs/eleven-api/guides/cookbooks/image-and-video
- https://elevenlabs.io/docs/overview/capabilities/image-video
