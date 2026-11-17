import Image from "next/image";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/lib/appStore";

export function StoreBadges() {
  return (
    <div role="group" aria-label="Mobile apps" className="flex min-w-0 flex-wrap items-center">
      <a href={APP_STORE_URL} className="inline-flex min-h-[60px] items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <Image src="/brand/app-store-badge.svg" alt="Download on the App Store" width={120} height={40} unoptimized />
      </a>
      <a href={PLAY_STORE_URL} className="inline-flex min-h-[60px] items-center rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        <Image src="/brand/google-play-badge.png" alt="Get it on Google Play" width={155} height={60} unoptimized />
      </a>
    </div>
  );
}
