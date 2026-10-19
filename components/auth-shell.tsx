import { Brand } from "./brand";

export function AuthShell({ children }: { children: React.ReactNode }) {
  return <main className="auth-shell"><section className="auth-story"><Brand /><div className="story-copy"><p className="eyebrow">Think clearly. Keep it yours.</p><h1>One quiet place for work that matters.</h1><p>Build project libraries, write richly formatted notes, and plan your days—from any trusted machine.</p></div><small style={{ opacity: .58 }}>Private by design · Powered by Supabase</small></section><section className="auth-panel">{children}</section></main>;
}
