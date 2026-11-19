import Link from "next/link";
import { daysBetween, type DueItem, type VisitView } from "@/lib/due/engine";
import { leftText } from "@/lib/v2/status";
import { VISIT_WORD, earlyText, monD, mondayOnOrBefore, visitParam, visitTitle } from "@/lib/v2/visits";
import { Button, buttonClass } from "@/ui/Button";
import { ConfirmSubmit, FormLeaf, Notice } from "@/ui/Form";
import { StatusMark } from "@/ui/Marks";
import { dismissVisitSuggestion, setVisitStatus } from "./actions";
import { BookVisitForm, MoveVisitForm, SendVisitForm } from "./VisitForms";

export type VisitContext = {
  aircraftId: string;
  today: string;
  canEdit: boolean;
  items: Map<string, DueItem>;
  squawks: Map<string, string>;
  providers: { id: string; name: string }[];
  /** Where the panel lives (Status or Annual prep); its links and close return here. */
  base: string;
};

const labelOf = (c: VisitContext, key: string) =>
  key.startsWith("squawk:") ? (c.squawks.get(key.slice(7)) ?? "Squawk") : (c.items.get(key)?.label ?? "Item no longer tracked");

/** Where "Mark done" goes for an item in the shop: the item's drawer, or the squawk's resolve panel. */
function doneHref(c: VisitContext, key: string) {
  const a = `/aircraft/${c.aircraftId}`;
  return key.startsWith("squawk:") ? `${a}/maintenance/squawks?squawk=${key.slice(7)}&panel=resolve` : `${a}/status/item/${key}?panel=done`;
}

/**
 * VisitPanel (W-STATUS-03, shown on W-STATUS-01 and W-MAINT-04 with `?visit=`): why the items go together, the
 * items with their early cost, and the actions for the visit's state. `panel=book` swaps in the booking form.
 */
export function VisitPanel({ visit: v, c, panel, booked, err }: { visit: VisitView; c: VisitContext; panel?: string; booked?: boolean; err?: string }) {
  const param = visitParam(v);
  const self = `${c.base}?visit=${encodeURIComponent(param)}`;
  const providerNames = v.providerIds.map((id) => c.providers.find((p) => p.id === id)?.name).filter((n): n is string => !!n);
  const minWeek = mondayOnOrBefore(c.today);

  if (panel === "book" && v.status === "suggested" && c.canEdit) {
    return (
      <FormLeaf title={`Book the visit, week of ${monD(v.weekOf)}`} closeHref={self}>
        <BookVisitForm
          aircraftId={c.aircraftId}
          suggestionKey={v.suggestionKey}
          weekOf={v.weekOf}
          minWeek={minWeek}
          items={v.items.map((i) => ({ key: i.key, label: labelOf(c, i.key), detail: earlyText(i.earlyBy) ?? "" }))}
          providers={c.providers}
          providerId={v.providerIds[0] ?? null}
          cancelHref={self}
        />
      </FormLeaf>
    );
  }

  const dates = v.items.map((i) => c.items.get(i.key)?.firstDate).filter((d): d is string => !!d).sort();
  const spread = dates.length > 1 ? daysBetween(dates[0], dates[dates.length - 1]) : 0;
  const why =
    v.status === "suggested"
      ? `${v.items.length} items fall due within ${spread} ${spread === 1 ? "day" : "days"} of each other at ${v.place}. One visit covers them.`
      : `${VISIT_WORD[v.status]}${v.visitDate ? ` for ${monD(v.visitDate)}` : ""} at ${providerNames[0] ?? v.place}.`;
  const working = v.status === "in_shop" || v.status === "awaiting_records";
  const a = c.aircraftId;
  const back = c.base.endsWith("/annual") ? "annual" : "status";

  return (
    <FormLeaf title={visitTitle(v)} closeHref={c.base}>
      <div className="flex flex-col gap-4">
        {booked && <Notice>Visit booked for the week of {monD(v.weekOf)}.</Notice>}
        {err && <Notice tone="alarm">{err}</Notice>}
        <p className="text-body text-ink-2">{why}</p>
        {v.status === "suggested" && v.clearsBeforeLapse > 0 && (
          <p className="text-small text-ink-3">
            Clears {v.clearsBeforeLapse} {v.clearsBeforeLapse === 1 ? "item" : "items"} before {v.clearsBeforeLapse === 1 ? "it lapses" : "they lapse"}.
          </p>
        )}
        <ul className="divide-y divide-rule border-t-2 border-ink">
          {v.items.map((i) => {
            const item = c.items.get(i.key);
            const early = earlyText(i.earlyBy);
            const detail = [item ? leftText(item) : "open squawk", early, item?.providerId ? c.providers.find((p) => p.id === item.providerId)?.name : null]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={i.key} className="flex min-h-12 items-start gap-3 py-2.5">
                <span className="w-[92px] shrink-0 pt-0.5">
                  {i.done ? (
                    <StatusMark kind="current" compact label="Done" />
                  ) : i.status === "open" ? (
                    <StatusMark kind="neutral" compact label="Squawk" />
                  ) : (
                    <StatusMark kind={i.status} compact />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-body-strong">
                    {item ? <Link href={`/aircraft/${a}/status/item/${i.key}`} className="hover:underline">{item.label}</Link> : labelOf(c, i.key)}
                  </span>
                  <span className="block text-small text-ink-3">{i.done ? "Done at this visit" : detail}</span>
                </span>
                {working && !i.done && c.canEdit && (
                  <Link href={doneHref(c, i.key)} className={buttonClass("secondary", "s")}>
                    Mark done
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        {c.canEdit && v.status === "suggested" && v.suggestionKey && (
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" href={`${self}&panel=book`}>Book this visit</Button>
            <form action={dismissVisitSuggestion.bind(null, a, v.suggestionKey)}>
              <button type="submit" className={buttonClass("quiet", "m")}>Dismiss</button>
            </form>
          </div>
        )}

        {c.canEdit && v.status === "planned" && v.id && (
          <>
            <div className="flex flex-wrap gap-2">
              <form action={setVisitStatus.bind(null, a, v.id, "in_shop", back)}>
                <button type="submit" className={buttonClass("primary", "m")}>It&apos;s in the shop</button>
              </form>
              <form action={setVisitStatus.bind(null, a, v.id, "cancelled", back)}>
                <ConfirmSubmit
                  label="Cancel visit"
                  size="m"
                  question={`Cancel the visit for the week of ${monD(v.weekOf)}? Its items go back to the suggestions.`}
                />
              </form>
            </div>
            <SendVisitForm
              aircraftId={a}
              visitId={v.id}
              recipient={providerNames[0] ?? "My mechanic"}
              providerId={v.providerIds[0] ?? null}
              providerName={providerNames[0] ?? null}
            />
            <MoveVisitForm aircraftId={a} visitId={v.id} weekOf={v.weekOf < minWeek ? minWeek : v.weekOf} minWeek={minWeek} />
          </>
        )}

        {c.canEdit && working && v.id && (
          <div className="flex flex-wrap items-center gap-2">
            <form action={setVisitStatus.bind(null, a, v.id, "done", back)}>
              <ConfirmSubmit
                label="Close this visit"
                size="m"
                variant="secondary"
                danger={false}
                question="Close this visit? Items not marked done go back to the suggestions."
              />
            </form>
            <Link href={`/aircraft/${a}/logbooks`} className={buttonClass("quiet", "m")}>Add its pages</Link>
          </div>
        )}
        {!c.canEdit && <p className="text-small text-ink-3">You can view this visit. Editors book and change visits.</p>}
      </div>
    </FormLeaf>
  );
}
