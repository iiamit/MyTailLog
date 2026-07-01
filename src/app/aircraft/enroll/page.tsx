import Link from "next/link";
import { EnrollForm } from "./EnrollForm";
import { Disclaimer } from "@/components/Disclaimer";

export default function EnrollPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
      >
        ← Back to dashboard
      </Link>
      <h1 className="mt-2 text-2xl font-bold">Enroll an aircraft</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600 dark:text-slate-300">
        This creates the aircraft and its three logbooks (airframe, engine,
        prop). You can add pages and entries next.
      </p>

      <EnrollForm />

      <div className="mt-6">
        <Disclaimer variant="inline" />
      </div>
    </main>
  );
}
