export function LoadError({ message, href }: { message: string; href: string }) {
  return (
    <div role="alert" className="rounded-lg border border-line2 bg-panel p-4 text-sm text-dim">
      <p>{message}</p>
      <a href={href} className="mt-2 inline-block rounded-md px-3 py-2 text-accent underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent">
        Try again
      </a>
    </div>
  );
}
