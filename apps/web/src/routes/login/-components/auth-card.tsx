import type { ReactNode } from "react";
import { useAppMeta, Wordmark } from "@/components/brand";

/** The shared shell of the sign-in steps, so the pages cannot drift apart. */
export function AuthCard({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const meta = useAppMeta();

  return (
    <main className="auth-page">
      <div className="auth-wrap">
        <a className="brand auth-brand" href="/">
          <Wordmark appName={meta.appName} sub="publish" />
        </a>
        <div className="auth-panel">
          <h1 className="auth-title">{title}</h1>
          <p className="auth-description">{description}</p>
          <div className="auth-form">{children}</div>
        </div>
        <p className="auth-note">Publishing needs an account so you can remove a snapshot later. The studio and your key never require one.</p>
      </div>
    </main>
  );
}
