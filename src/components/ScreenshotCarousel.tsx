"use client";

import { useEffect, useState } from "react";
import Image, { type StaticImageData } from "next/image";
import { usePrefersReducedMotion } from "@/lib/browserState";

export type Slide = { src: StaticImageData; alt: string; caption: string };

/**
 * Auto-rotating screenshot frame — all slides stacked in one fixed-aspect box,
 * crossfading. Pauses on hover and honors prefers-reduced-motion; dots let you
 * step manually. Object-contain so no screenshot gets cropped.
 */
export function ScreenshotCarousel({
  slides,
  intervalMs = 4500,
}: {
  slides: Slide[];
  intervalMs?: number;
}) {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    if (paused || reduced || slides.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % slides.length), intervalMs);
    return () => clearInterval(t);
  }, [paused, reduced, slides.length, intervalMs]);

  return (
    <figure
      className="flex flex-col gap-2"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative aspect-16/10 overflow-hidden rounded-lg border border-line bg-panel2">
        {slides.map((s, idx) => (
          <Image
            key={idx}
            src={s.src}
            alt={s.alt}
            fill
            sizes="(max-width: 768px) 100vw, 700px"
            placeholder="blur"
            priority={idx === 0}
            className={`object-contain transition-opacity duration-700 ${
              idx === i ? "opacity-100" : "opacity-0"
            }`}
          />
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <figcaption className="text-xs text-faint">
          {slides[i].caption}
        </figcaption>
        <div className="flex shrink-0 gap-1.5">
          {slides.map((s, idx) => (
            <button
              key={idx}
              onClick={() => setI(idx)}
              aria-label={`Show screenshot ${idx + 1}: ${s.alt}`}
              aria-current={idx === i}
              className={`h-1.5 w-1.5 rounded-full transition ${
                idx === i ? "bg-accent" : "bg-line2 hover:bg-dim"
              }`}
            />
          ))}
        </div>
      </div>
    </figure>
  );
}
