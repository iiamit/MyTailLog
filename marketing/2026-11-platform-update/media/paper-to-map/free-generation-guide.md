# Free generation route — Google Flow

Documentation checked November 2026. Recommendation is based on published features and limits, not a hands-on comparative video-quality benchmark. No video clip has been generated or purchased yet.

## Recommended route

Use https://flow.google.com/ in a desktop Chromium browser. Google currently documents 50 free daily credits. Start with Veo 3.1 Lite: it supports portrait, first/last reference frames and 4/6/8-second clips at 720p, costing 10 credits per generation for non-Ultra users. Theoretical allowance: five attempts per day, not five guaranteed usable clips. Free generation may be unavailable during peak hours (roughly 14:00–17:00 UTC). Confirm the price shown before each request because limits change.

For difficult tracking/physical motion, compare one Omni Flash 1.2 attempt: Google describes it as providing higher quality/consistency; at 720p it costs 3 credits/second, so an 8-second attempt costs 24 credits. Do not spend all free credits on the first shot before checking continuity across shots.

Google supports a visible-watermark toggle, with some regional exceptions; all relevant generated outputs still contain invisible SynthID. Use platform controls only. Download and review the result before planning the final export. Free 720p footage can be placed in a 1080×1920 edit, but that does not create native 1080p detail.

## First shot

1. Start a new project, portrait 9:16, one output per request.
2. Select Veo 3.1 Lite, 8 seconds; check the shown cost.
3. Use `01-field-reference.png` as the start frame.
4. Paste this prompt:

> Photorealistic live-action cinematic shot. Preserve the same open brown aircraft maintenance logbook and yellow wildflower meadow from the supplied frame. The breeze moves the flowers and turns one cream ruled page with natural paper flex and a realistic binding. The camera smoothly rises and pulls backward into an elevated oblique view, revealing more yellow meadow around the book. Toward the end, one loose page lifts slightly above the open book, ready to travel forward. Keep the book appearance, warm natural light and direction of shadows consistent. No people, no added words, no logo, no music or speech. No cartoon, illustration, rubber-like book, abrupt cut or camera reversal.

5. Download the MP4. Save its final frame as the next shot’s reference if it passes review.
6. Continue with clips B–D in `production-brief.md`, matching outgoing and incoming frames. Use separate generations, not one request for the whole film.
7. Send the original MP4s back for assembly with exact map geometry/dates, recorded app interactions, narration and music.

## Comparison notes

- Runway: 125 one-time free credits; free exports have a visible watermark; current free model access is account-dependent. Suitable for a proof-of-concept, less attractive for repeated refinement.
- Pika: current pricing lists zero recurring credits on Free, despite older pages describing free monthly allowances. Do not assume its free account supplies video-generation credits. Pricing and FAQ also differ about which paid tiers include commercial use; check the actual plan before publishing promotional work.
- Luma: Free/Lite output is restricted to personal, noncommercial use; a nonprofit/free product is not by itself proof that promotional distribution qualifies.
- Kling: free-quota descriptions conflict across old announcements and current pages. No dependable current allowance was verified for the intended account, so it is not the primary recommendation.
- OpenAI: current official deprecations list the Videos API and Sora 2 as retired September 24, 2026, with no direct replacement. This Codex session has image generation, editing and rendering capabilities, but no video-generation tool.

## Sources

- https://support.google.com/flow/answer/16526234?hl=en
- https://support.google.com/flow/answer/16352836?hl=en
- https://support.google.com/flow/answer/16353333?hl=en
- https://help.runwayml.com/hc/en-us/articles/50404627334547-Free-plan-details
- https://pika.art/pricing
- https://pika.art/faq
- https://lumalabs.ai/learning-hub/licensing
- https://developers.openai.com/api/docs/deprecations
