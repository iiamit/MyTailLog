"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, type ActionState } from "../equipment/ActionForm";
import { Notice } from "@/ui/Form";

/** The version belongs to these input values, not to a later background refresh. */
export function DetailsForm({ version, action, children }: {
  version: string;
  action: (previous: ActionState, form: FormData) => Promise<{ error?: string; version?: string }>;
  children: React.ReactNode;
}) {
  const [base, setBase] = useState(version);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  return <>
    {saved && <Notice>Details saved.</Notice>}
    <ActionForm submit="Save details" className="flex flex-col gap-2" action={async (previous, form) => {
      form.set("base", base);
      setSaved(false);
      const result = await action(previous, form);
      if (result.error) return { error: result.error };
      if (result.version) setBase(result.version);
      setSaved(true);
      router.refresh();
      return null;
    }}>{children}</ActionForm>
  </>;
}
