import type { ReactNode } from "react";
import { useAppMeta, Wordmark } from "@/components/brand";

/** The shared shell of the sign-in steps, so the pages cannot drift apart. */
export function AuthCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const meta = useAppMeta();

  return (
    <main className="mx-auto flex min-h-svh max-w-md flex-col justify-center px-6 py-16">
      <a className="brand mb-8 self-start" href="/">
        <Wordmark appName={meta.appName} sub="sign in to publish" />
      </a>
      <div className="border border-[var(--line)] bg-[var(--card)] p-6 shadow-[6px_6px_0_var(--ink)] sm:p-8">
        <span className="eyebrow">Passwordless / email</span>
        <h1 className="display mt-2 text-4xl leading-[0.95]">{title}</h1>
        <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">{description}</p>
        <div className="mt-6">{children}</div>
      </div>
      <p className="mt-6 max-w-[38ch] font-mono text-[9px] uppercase leading-relaxed tracking-[0.12em] text-[var(--muted)]">
        Why an account? Only public snapshots need an owner. The studio itself never asks.
      </p>
    </main>
  );
}
