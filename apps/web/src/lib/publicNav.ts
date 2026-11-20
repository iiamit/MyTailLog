import type { Section } from "@/lib/uiV2";

// The public site as the closed binder: five tabs in the app's section hues, each holding a few pages.
export type PublicGroup = "tour" | "guides" | "help" | "share" | "about";
/** `signedIn`: the page needs an account (it redirects to sign-in), so it is listed only to signed-in readers. */
export type PublicPage = { href: string; label: string; signedIn?: true };

export const PUBLIC_GROUPS: { id: PublicGroup; section: Section; label: string; sub: string; pages: PublicPage[] }[] = [
  {
    id: "tour", section: "status", label: "Tour", sub: "What it does",
    pages: [
      { href: "/", label: "Home" },
      { href: "/demo", label: "Product tour" },
      { href: "/compare", label: "How it compares" },
      { href: "/switch/myfbo", label: "From MyFBO" },
    ],
  },
  {
    id: "guides", section: "maint", label: "Guides & ADs", sub: "Owner guides, AD lists",
    pages: [
      { href: "/guides/digitize-aircraft-logbooks", label: "Digitize your logbooks" },
      { href: "/guides/aircraft-maintenance-tracking", label: "Maintenance tracking" },
      { href: "/guides/airworthiness-directive-tracking", label: "AD tracking" },
      { href: "/ads", label: "ADs by model" },
    ],
  },
  {
    id: "help", section: "docs", label: "Help & FAQ", sub: "Every screen explained",
    pages: [
      { href: "/help", label: "Help" },
      { href: "/faq", label: "FAQ" },
      { href: "/help#sharing", label: "Record rooms" },
    ],
  },
  {
    id: "share", section: "share", label: "Developers", sub: "API docs and keys",
    pages: [
      { href: "/developers/docs", label: "API docs" },
      { href: "/developers", label: "API keys", signedIn: true },
    ],
  },
  {
    id: "about", section: "setup", label: "About", sub: "Privacy, what's new",
    pages: [
      { href: "/whats-new", label: "What's new" },
      { href: "/privacy", label: "Privacy" },
      { href: "/account-deletion", label: "Delete account" },
    ],
  },
];

/** A group's pages as a reader sees them: account-only pages drop out when signed out. */
export const visiblePages = (g: (typeof PUBLIC_GROUPS)[number], signedIn: boolean) => g.pages.filter((p) => signedIn || !p.signedIn);

export const groupOf = (id: PublicGroup) => PUBLIC_GROUPS.find((g) => g.id === id)!;

/** The page within its group whose href matches `path` (ignoring any #anchor), for aria-current. */
export const isCurrentPage = (href: string, path: string) => href.split("#")[0] === path && !href.includes("#");
