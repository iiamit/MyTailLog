"use client";

import { useEffect, useState } from "react";
import Image, { type StaticImageData } from "next/image";

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
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }, []);

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
      <div className="relative aspect-[16/10] overflow-hidden rounded-lg border border-slate-200 bg-slate-100 shadow-sm dark:border-slate-800 dark:bg-slate-900">
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
        <figcaption className="text-xs text-slate-500 dark:text-slate-400">
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
                idx === i
                  ? "bg-slate-700 dark:bg-slate-200"
                  : "bg-slate-300 hover:bg-slate-400 dark:bg-slate-700 dark:hover:bg-slate-600"
              }`}
            />
          ))}
        </div>
      </div>
    </figure>
  );
}
