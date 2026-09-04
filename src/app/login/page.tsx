"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createSupabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#0c0c0e] px-4">
      <div className="w-full max-w-sm">
        {/* wordmark */}
        <div className="mb-8 flex items-center justify-center gap-2.5">
          <svg viewBox="0 0 32 32" fill="none" className="h-7 w-7 text-[#f4f4f5]" role="img" aria-label="BookHub">
            <path d="M16 7.5C14 6 11 5.5 7 6v15.5c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V6c-4-.5-7 0-9 1.5z" fill="currentColor" opacity="0.12" />
            <path d="M16 7.5C14 6 11 5.5 7 6v15.5c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V6c-4-.5-7 0-9 1.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <line x1="16" y1="8" x2="16" y2="23" stroke="currentColor" strokeWidth="1.6" />
          </svg>
          <span className="font-semibold text-[15px] tracking-tight text-[#f4f4f5]">BookHub</span>
        </div>

        <div className="rounded-lg border border-[#232328] bg-[#141417] p-6">
          <h1 className="mb-1 text-lg font-semibold text-[#f4f4f5]">Sign in</h1>
          <p className="mb-5 text-sm text-[#9b9ba4]">Welcome back to your workspace.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#6b6b75]">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoFocus
                className="h-10 w-full rounded-md border border-[#232328] bg-[#0c0c0e] px-3 text-sm text-[#f4f4f5] placeholder:text-[#6b6b75] focus:border-[#818cf8] focus:outline-none"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-[#6b6b75]">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10 w-full rounded-md border border-[#232328] bg-[#0c0c0e] px-3 text-sm text-[#f4f4f5] placeholder:text-[#6b6b75] focus:border-[#818cf8] focus:outline-none"
                placeholder="••••••••"
              />
            </div>

            {error && (
              <p className="text-sm text-[#ef4444]">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#818cf8] text-sm font-medium text-[#0c0c0e] hover:bg-[#818cf8]/90 disabled:opacity-50"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-[#9b9ba4]">
            No account?{" "}
            <a href="/signup" className="text-[#818cf8] hover:underline">
              Sign up
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
