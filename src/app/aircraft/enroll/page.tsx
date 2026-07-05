import { EnrollForm } from "./EnrollForm";
import { Disclaimer } from "@/components/Disclaimer";
import { AccountShell } from "@/components/shell/AccountShell";

export default function EnrollPage() {
  return (
    <AccountShell>
      <main className="mx-auto max-w-2xl px-6 py-8">
        <header className="mb-6">
          <div className="eyebrow mb-2">Fleet</div>
          <h1 className="font-display text-[27px] font-semibold leading-none">Enroll an aircraft</h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-dim">
            This creates the aircraft and its three logbooks (airframe, engine, prop). You can add
            pages and entries next.
          </p>
        </header>

        <EnrollForm />

        <div className="mt-6">
          <Disclaimer variant="inline" />
        </div>
      </main>
    </AccountShell>
  );
}
