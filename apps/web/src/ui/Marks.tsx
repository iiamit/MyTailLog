import type { DueStatus, Trust } from "@/lib/due/engine";
import { STATUS_WORD, TRUST_WORD } from "@/lib/v2/status";

export type MarkKind = DueStatus | "advisory" | "neutral";

const MARK: Record<MarkKind, string> = {
  current: "bg-ink",
  due_soon: "border-[3px] border-alarm",
  overdue: "bg-on-alarm size-2!",
  no_record: "border-2 border-dashed border-ink-3",
  advisory: "hidden",
  neutral: "border-2 border-ink",
};
const TEXT: Record<MarkKind, string> = {
  current: "text-ink",
  due_soon: "text-alarm-text",
  overdue: "bg-alarm text-on-alarm rounded-[3px] pr-[9px] pl-[7px] py-0.5",
  no_record: "text-ink-3",
  advisory: "font-medium text-ink-2",
  neutral: "text-ink",
};

/** Mark plus word, never colour alone (02 §5.2). The word carries the meaning; the mark is decoration. */
export function StatusMark({ kind, label, compact }: { kind: MarkKind; label?: string; compact?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-[7px] font-bold whitespace-nowrap ${compact ? "text-caption" : "text-small"} ${TEXT[kind]}`}
    >
      <span aria-hidden className={`inline-block shrink-0 rounded-full ${compact ? "size-2.5" : "size-3"} ${MARK[kind]}`} />
      {label ?? (kind === "advisory" ? "Advisory" : kind === "neutral" ? "" : STATUS_WORD[kind])}
    </span>
  );
}

const TRUST_MARK: Record<Trust, [string, string]> = {
  ai_read: ["rounded-full border-2 border-dotted border-ink-3", "rounded-full border-2 border-dotted border-on-cover"],
  confirmed: ["rounded-full bg-ink", "rounded-full bg-on-cover"],
  signed: ["rotate-45 rounded-[1px] bg-ink", "rotate-45 rounded-[1px] bg-on-cover"],
};

/** How much to trust a value (02 §5.3). */
export function TrustMark({ level, label, onMat }: { level: Trust; label?: string; onMat?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-[5px] text-caption whitespace-nowrap ${onMat ? "text-on-cover" : "text-ink-2"}`}>
      <span aria-hidden className={`inline-block size-[9px] shrink-0 ${TRUST_MARK[level][onMat ? 1 : 0]}`} />
      {label ?? TRUST_WORD[level]}
    </span>
  );
}

/** "first" on the limit that bites first (02 §5.6). */
export function FirstBadge() {
  return (
    <span className="ml-1.5 rounded-[var(--radius-s)] border border-ink px-1 align-[1px] text-label text-ink">
      first<span className="sr-only"> comes first</span>
    </span>
  );
}

/** "your note": a value with no scanned page behind it (02 §5.4 Page missing). */
export function YourNote() {
  return <span className="text-caption text-ink-3">your note</span>;
}
