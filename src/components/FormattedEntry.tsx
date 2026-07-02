import { formatEntryText } from "@/lib/formatEntry";

/**
 * Render a raw logbook entry text field as readable blocks — paragraphs and
 * ordered/bulleted lists — instead of a single collapsed line. Used wherever an
 * entry's narrative is shown (timeline, review, etc.).
 */
export function FormattedEntry({
  text,
  className,
}: {
  text: string | null | undefined;
  className?: string;
}) {
  const blocks = formatEntryText(text);
  if (blocks.length === 0) return null;

  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      {blocks.map((b, i) =>
        b.type === "p" ? (
          <p key={i} className="text-sm leading-relaxed text-slate-700 dark:text-slate-200">
            {b.text}
          </p>
        ) : b.ordered ? (
          <ol
            key={i}
            className="ml-5 list-decimal space-y-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200"
          >
            {b.items.map((lines, j) => (
              <li key={j} className="pl-1">
                {lines.map((ln, k) => (
                  <span key={k} className={k === 0 ? "" : "block text-slate-600 dark:text-slate-300"}>
                    {ln}
                  </span>
                ))}
              </li>
            ))}
          </ol>
        ) : (
          <ul
            key={i}
            className="ml-5 list-disc space-y-1 text-sm leading-relaxed text-slate-700 dark:text-slate-200"
          >
            {b.items.map((lines, j) => (
              <li key={j} className="pl-1">
                {lines.map((ln, k) => (
                  <span key={k} className={k === 0 ? "" : "block text-slate-600 dark:text-slate-300"}>
                    {ln}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
