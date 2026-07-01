import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Disclaimer } from "@/components/Disclaimer";

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div>
        <h1 className="text-4xl font-bold tracking-tight">MyTailLog</h1>
        <p className="mt-3 text-lg text-slate-600 dark:text-slate-300">
          Turn 50 years of paper airframe, engine, and prop logbooks into a
          searchable, gap-auditable maintenance index — sized for a single
          piston GA owner.
        </p>
      </div>

      <Disclaimer />

      <div className="flex gap-3">
        {user ? (
          <Link
            href="/dashboard"
            className="rounded-md bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Go to dashboard
          </Link>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-slate-900 px-5 py-2.5 font-medium text-white hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
          >
            Sign in
          </Link>
        )}
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Pre-alpha · Phase 1 (capture → extract → review → search) ·{" "}
        <a
          href="https://github.com"
          className="underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-200"
        >
          source
        </a>
      </p>
    </main>
  );
}
