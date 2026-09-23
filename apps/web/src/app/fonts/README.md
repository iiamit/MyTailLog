# Bundled fonts

Unmodified variable TrueType fonts from [google/fonts](https://github.com/google/fonts/tree/e44c4b011a820c2cbe2fd2cfa8052037d7edb571/ofl), pinned to commit `e44c4b011a820c2cbe2fd2cfa8052037d7edb571`:

- `SpaceGrotesk.ttf`: `spacegrotesk/SpaceGrotesk[wght].ttf` (weight 300–700).
- `InstrumentSans.ttf`: `instrumentsans/InstrumentSans[wdth,wght].ttf` (weight 400–700; default width).
- `JetBrainsMono.ttf`: `jetbrainsmono/JetBrainsMono[wght].ttf` (weight 100–800).

Each font's SIL Open Font License and copyright notice are included alongside it.
The complete upstream fonts retain their character coverage. `next/font/local`
emits and preloads them from our own origin; no font service is contacted during
builds. Keep the existing CSS variables and `display: swap` when updating them.
