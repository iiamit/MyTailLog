# MyTailLog coming-soon campaign: the new design

Campaign prepared November 21, 2026. Position the mobile redesign as **coming soon**, using a **sneak peek** to build anticipation. Invite users to try the web redesign now. Lead with the practical change: owners can move from what is due to the record behind it, with fewer detours between tasks.

## Copy ready to paste

| Channel | File | Use |
|---|---|---|
| Admin announcement | [copy/admin-announcement.txt](copy/admin-announcement.txt) | Separate title, message and `/whats-new` link. Message fits the 500-character limit. Publishing is a manual action in Admin. |
| Aviation forums | [copy/forum-post.md](copy/forum-post.md) | First-person post from Ian, ending with a specific request for feedback. |
| Instagram / Facebook | [copy/social-captions.md](copy/social-captions.md) | Carousel/Reel caption, Facebook copy, short post and link destinations. |
| Website | [CHANGELOG.md](../../CHANGELOG.md) | New November groups feed `/whats-new` and RSS at web build time. |
| GitHub | [README.md](../../README.md) | New November update section explains the design and mobile rollout. |

The new **paper-to-map film** uses the four supplied Flow clips, updated narration and genuine app demonstrations. Exports and publication copy are in [media/paper-to-map/film](media/paper-to-map/film/README.md).

Media files and their production notes are in `media/`. The revised 40.8-second Reel brings screenshots closer, adds smooth zooms and pans, and includes real interaction in three scenes. The approved narration and music are unchanged.

## Publish sequence

1. Merge the website/README change and check `/whats-new` after deployment.
2. Publish the admin announcement. End the previous notice if it no longer applies. This is an in-app notice, not an APNs/FCM push or email.
3. Post the carousel, then the Reel one or two days later. Keep rollout details in the caption. Link to What's new so users see the current availability.
4. Post to relevant owner/pilot forums using each forum's self-promotion rules. Adapt the opening to the actual conversation; don't blanket-post identical replies.
5. After the native builds become public, replace preview language with the verified store availability and refresh the captions/media before publishing a second wave.

## Claims checked against the repository

- The new web design is opt-in in the production deployment configuration. On a computer, open an aircraft and choose **Try the new design** in the Account navigation.
- Native SwiftUI iOS/iPadOS 2.0 and Jetpack Compose Android 2.0 are in TestFlight and Play internal testing. Existing public apps remain available. Do not promise that public store downloads already contain every preview feature.
- iPhone Duo support means adaptive cover/unfolded layouts, a compact rail and side-by-side entry/map space when unfolded. Evidence comes from the simulator, not a physical-device certification or Apple endorsement. Do not promise a custom hinge animation.
- Native previews retain synced aircraft details and maintenance records and queue readings, oil, squawks and scans for reconnection. Do not promise offline scan downloads or universal offline Logbooks access; native platforms differ. Existing public apps have a separate managed-download flow. AI reading and Ask require internet.
- Google and Apple sign-in are supported on the web; mobile social sign-in follows its platform. Existing users should link identities from their existing account.
- MyFlightBook exchanges hours/maintenance through supported integration paths. This release does not claim that the proposed single integration migration is complete.
- Free and MIT licensed; shared-key AI reading has a daily allowance. No new usage statistics are included: the earlier 2,800/3,700/50 figures have not been re-queried for this campaign.
- Physical logbooks remain the legal maintenance record. Review extracted entries against the scan. Do not claim automatic airworthiness approval or guaranteed compliance.

The parallel resilience review is delivered separately to the owner. Its findings are recommendations, not shipped fixes. Keep promises about lossless sync or conflict handling out of campaign copy until the identified cases are addressed.

## Narration publishing note

The voiceover is generated with ElevenLabs on the owner's confirmed **free plan**, for the owner's stated noncommercial use. Use the Reel title **Coming soon: the new MyTailLog | Voice: elevenlabs.io** and retain the caption credit. ElevenLabs requires `elevenlabs.io` or `11.ai` in the title when publishing free-plan output. Noncommercial classification of this promotional use has not been confirmed by ElevenLabs; do not treat this package as commercial-use clearance. See [ElevenLabs publishing guidance](https://elevenlabs.io/docs/help-center/legal/can-i-publish-the-content-i-generate-on-the-platform).
