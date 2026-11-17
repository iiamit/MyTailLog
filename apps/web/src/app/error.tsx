"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-6xl p-6">
      <div role="alert" className="panel p-5 text-dim">
        <h1 className="text-lg font-semibold text-ink">This view could not be loaded</h1>
        <p className="mt-2">We couldn’t retrieve the information needed for this view. Try loading it again.</p>
        <button onClick={reset} className="mt-4 rounded-md bg-accent px-4 py-3 font-medium text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
          Try again
        </button>
      </div>
    </main>
  );
}
