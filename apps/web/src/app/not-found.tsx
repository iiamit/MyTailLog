import type { Metadata } from "next";
import Link from "next/link";
import { PublicTheme } from "@/components/PublicTheme";
import { ReadLeaf } from "@/components/public/Read";

export const metadata: Metadata = { title: "No page here", robots: { index: false } };

const LINKS: [string, string][] = [
  ["/", "Home"],
  ["/ads", "ADs by model"],
  ["/help", "Help"],
];

/** Any unknown address, and any notFound() without a closer boundary (a missing AD model, an aircraft you can't open). */
export default function NotFound() {
  return (
    <PublicTheme group="help" path="" title="No page at this address">
      <ReadLeaf>
        <div className="read-prose max-w-[54ch]">
          <p>The link may be old or mistyped, or the page may have moved. Nothing on your account has changed.</p>
        </div>
        <ul className="mt-4 flex flex-wrap gap-x-6">
          {LINKS.map(([href, label]) => (
            <li key={href}>
              <Link href={href} className="inline-flex min-h-11 items-center text-[15px] font-semibold text-board-ink underline underline-offset-4">{label}</Link>
            </li>
          ))}
        </ul>
      </ReadLeaf>
    </PublicTheme>
  );
}
