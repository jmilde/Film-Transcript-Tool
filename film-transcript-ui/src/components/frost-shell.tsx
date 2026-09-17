import type { ReactNode } from "react";

/** Full-screen frosted gradient shell with floating light blobs. */
export function FrostShell({ children }: { children: ReactNode }) {
  return (
    <div className="frost-bg relative min-h-screen w-full overflow-hidden font-sans text-ink">
      <div
        className="frost-blob pointer-events-none absolute -left-24 top-10 size-96 rounded-full bg-frost-accentsoft/50 blur-3xl"
        aria-hidden="true"
      />
      <div
        className="frost-blob pointer-events-none absolute right-0 top-1/3 size-[28rem] rounded-full bg-frost-accent/25 blur-3xl"
        style={{ animationDuration: "14s", animationDirection: "reverse" }}
        aria-hidden="true"
      />
      <div
        className="frost-blob pointer-events-none absolute bottom-0 left-1/3 size-80 rounded-full bg-white/70 blur-3xl dark:bg-white/5"
        style={{ animationDuration: "9s" }}
        aria-hidden="true"
      />
      <div className="relative">{children}</div>
    </div>
  );
}
