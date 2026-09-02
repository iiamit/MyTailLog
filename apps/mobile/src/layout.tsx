import { useEffect, useState, type ReactElement, type ReactNode } from "react";
import type { Aircraft } from "./types";
import type { Tab } from "./tabbar";
import type { Urgency } from "@/lib/compliance";

// Layout primitives. See docs/ios-parity/CONTRACT.md §5.
//
// STUB — owned by the iPad-shell stream, which fills in Sidebar and TwoPane.
// useSizeClass is real already because every UI stream branches on it. The
// signatures are the contract and do not change.

export type SizeClass = "compact" | "regular";

/**
 * iPadOS decides by WIDTH, not device: an 11" iPad is regular full-screen and
 * compact as the third of a Split View beside ForeFlight. 700pt keeps a
 * half-split iPad compact (decided), so the phone layout is the beside-
 * ForeFlight layout and nothing built for the phone is wasted.
 */
export function useSizeClass(): SizeClass {
  const query = "(min-width: 700px)";
  const [regular, setRegular] = useState<boolean>(() =>
    typeof window !== "undefined" && window.matchMedia(query).matches,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = (e: MediaQueryListEvent) => setRegular(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return regular ? "regular" : "compact";
}

export function Sidebar(_props: {
  aircraft: Aircraft;
  fleet: Aircraft[];
  worst: Record<string, Urgency>;
  active: Tab;
  onTab: (t: Tab) => void;
  onSwitch: (a: Aircraft) => void;
  onSeeAll: () => void;
  onAccount: () => void;
}): ReactElement | null {
  // Filled in by the iPad shell. Rendering nothing keeps compact behaviour intact.
  return null;
}

/**
 * Regular width: primary and secondary side by side. Compact: `primary` only —
 * the caller presents `secondary` as a sheet or push, which is what the phone
 * does today.
 */
export function TwoPane({
  primary,
}: {
  primary: ReactNode;
  secondary: ReactNode | null;
  ratio?: "50/50" | "55/45" | "40/60";
}): ReactElement {
  return <>{primary}</>;
}
