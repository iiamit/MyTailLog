export type ShareStatusItem = {
  label: string;
  status: string;
  nextDue: string;
  remaining: string;
};

export function maintenanceSummaryText(input: {
  tailNumber: string;
  description: string;
  generated: string;
  meters: string[];
  overdue: number;
  dueSoon: number;
  current: number;
  openSquawks: number;
  adCount: number;
  equipmentCount: number;
  attention: ShareStatusItem[];
  weightBalance?: string;
}): string {
  const lines = [
    `${input.tailNumber} — maintenance summary`,
    input.description,
    `Generated ${input.generated}${input.meters.length ? ` · ${input.meters.join(" · ")}` : ""}`,
    "",
    `Status: ${input.overdue} overdue · ${input.dueSoon} due soon · ${input.current} current · ${input.openSquawks} open squawks`,
    `Tracked: ${input.adCount} AD/SB items · ${input.equipmentCount} installed components`,
  ];
  if (input.weightBalance) lines.push(input.weightBalance);
  if (input.attention.length) {
    lines.push("", "Needs attention:");
    for (const item of input.attention.slice(0, 20)) {
      lines.push(`• ${item.label} — ${item.status}; due ${item.nextDue}; ${item.remaining}`);
    }
    if (input.attention.length > 20) lines.push(`• …and ${input.attention.length - 20} more`);
  }
  lines.push("", "Informational index only. Verify against the physical aircraft records.");
  return lines.join("\n").trim();
}
