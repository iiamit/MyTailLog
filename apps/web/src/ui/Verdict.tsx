import type { Verdict as VerdictBody } from "@/lib/due/engine";
import { StatusMark } from "@/ui/Marks";

/** Split the sentence into plain and bold runs by the server's emphasis ranges. */
export function verdictParts(v: Pick<VerdictBody, "text" | "emphasis">): { text: string; strong: boolean }[] {
  const out: { text: string; strong: boolean }[] = [];
  let at = 0;
  for (const [s, e] of [...v.emphasis].sort((a, b) => a[0] - b[0])) {
    if (s < at || e <= s) continue;
    if (s > at) out.push({ text: v.text.slice(at, s), strong: false });
    out.push({ text: v.text.slice(s, e), strong: true });
    at = e;
  }
  if (at < v.text.length) out.push({ text: v.text.slice(at), strong: false });
  return out;
}

/**
 * The opening sentence (02 §5.1). The server composes it; this only renders. When something is overdue the bold
 * runs are alarm ink and a StatusMark sits beside the sentence, so the state is never colour alone (W-STATUS-01).
 */
export function Verdict({ verdict, overdue, as: Tag = "h2" }: { verdict: VerdictBody; overdue?: boolean; as?: "h2" | "p" }) {
  return (
    <div className="mb-2.5">
      {overdue && (
        <p className="mb-2">
          <StatusMark kind="overdue" />
        </p>
      )}
      <Tag className="text-lede text-ink">
        {verdictParts(verdict).map((p, i) =>
          p.strong ? (
            <b key={i} className={`font-extrabold ${overdue ? "text-alarm-text" : ""}`}>
              {p.text}
            </b>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
      </Tag>
      {verdict.lines.map((l) => (
        <p key={l} className="mt-2 text-small text-ink-2">
          {l}
        </p>
      ))}
    </div>
  );
}
