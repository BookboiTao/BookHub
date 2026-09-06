"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import {
  Bot,
  Plus,
  Trash2,
  Loader2,
  Activity,
  KeyRound,
  ExternalLink,
  Eye,
  EyeOff,
  AlertTriangle,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { PROVIDER_NOTES, type ProviderKey } from "@/lib/ai/provider-catalog";
import { CONSTITUTION_SEED, FINGERPRINT_SEED, STORY_PROFILE_SEED, type ConstitutionRule, type Fingerprint, type StoryProfile, type CastRole } from "@/lib/ai/constitution-seed";

/* ------------------------------------------------------------------ *
 * AI Studio — the control room.
 *
 * 5 tabs: Fingerprint / Providers / Constitution / Router / Usage
 * - Fingerprint: voice/pacing/tone + samples, saves to /api/ai/settings
 * - Providers: per-user API keys (Gemini etc.) — /api/ai/providers
 * - Constitution: rules from seed, toggle active, add/edit/delete
 * - Router: task→model mapping (z.ai always, Gemini if a key is set)
 * - Usage: fetches from ai_usage table, shows per-provider totals
 *
 * Provider status row on top: hits /api/ai/test on load.
 * ------------------------------------------------------------------ */

type ProviderModel = { id: string; label: string };

type ProviderInfo = {
  key: string;
  label: string;
  requiresApiKey: boolean;
  helpUrl: string | null;
  keyHint: string | null;
  models: ProviderModel[];
  defaultModel: string;
  saved: { hasKey: boolean; last4: string | null; updatedAt: string | null };
};

type ProviderStatus = {
  provider: string;
  label: string;
  ok: boolean;
  latencyMs: number;
  requiresKey: boolean;
  hasKey: boolean;
  error?: string;
};

type UsageRow = {
  provider: string;
  model: string;
  task: string;
  tokens: number;
  created_at: string;
};



const TASKS = ["chat", "brainstorm_tab", "continue_chapter", "expand_card", "generate_summary", "contradiction_check", "extract_entities", "critique_prose", "generate_story_profile"] as const;
type Task = typeof TASKS[number];

type Tab = "fingerprint" | "story" | "providers" | "constitution" | "router" | "usage";

export function AIStudioPage({ bookId }: { bookId: string }) {
  const [tab, setTab] = useState<Tab>("fingerprint");
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [providerInfo, setProviderInfo] = useState<ProviderInfo[]>([]);
  const [testing, setTesting] = useState(false);
  const [constitution, setConstitution] = useState<ConstitutionRule[]>(CONSTITUTION_SEED);
  const [fingerprint, setFingerprint] = useState<Fingerprint>(FINGERPRINT_SEED);
  const [storyProfile, setStoryProfile] = useState<StoryProfile>(STORY_PROFILE_SEED);
  const [generatingProfile, setGeneratingProfile] = useState(false);
  const [generateProfileError, setGenerateProfileError] = useState<string | null>(null);
  const [router, setRouter] = useState<Record<string, string>>({});
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [showSaveErrorPanel, setShowSaveErrorPanel] = useState(false);
  // Auto-open the error panel whenever a NEW error arrives.
  // (adjust-state-during-render pattern instead of a setState-in-effect)
  const [lastSeenError, setLastSeenError] = useState<string | null>(null);
  if (saveError !== lastSeenError) {
    setLastSeenError(saveError);
    if (saveError) setShowSaveErrorPanel(true);
  }
  // Track whether the initial load from the server has completed —
  // prevents the router auto-save from firing with empty data on mount.
  const loadedRef = useRef(false);
  // Track the last router JSON we saved, so we don't re-save unchanged.
  const lastSavedRouterRef = useRef<string>("");

  // Load settings + provider info + test providers on mount
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [settingsRes, providersRes, testRes] = await Promise.all([
          fetch(`/api/ai/settings?bookId=${bookId}`),
          fetch("/api/ai/providers"),
          fetch("/api/ai/test"),
        ]);
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          if (data.constitution) setConstitution(data.constitution);
          if (data.fingerprint) setFingerprint(data.fingerprint);
          if (data.storyProfile) setStoryProfile(data.storyProfile);
          if (data.router) {
            setRouter(data.router);
            lastSavedRouterRef.current = JSON.stringify(data.router);
          }
        }
        if (providersRes.ok) {
          const data = await providersRes.json();
          if (data.providers) setProviderInfo(data.providers);
        }
        if (testRes.ok) {
          const data = await testRes.json();
          setProviders(data.providers ?? []);
        }
      } catch {
        // silent fail — settings fall back to seed
      } finally {
        setLoading(false);
        loadedRef.current = true;
      }
    }
    load();
  }, [bookId]);

  // Load usage
  useEffect(() => {
    if (tab !== "usage") return;
    async function loadUsage() {
      try {
        const res = await fetch(`/api/books/${bookId}/ai-usage`);
        if (res.ok) {
          const data = await res.json();
          setUsage(data.usage ?? []);
        }
      } catch {
        // table might not exist
      }
    }
    loadUsage();
  }, [tab, bookId]);

  const save = useCallback(async () => {
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      const res = await fetch("/api/ai/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, constitution, fingerprint, storyProfile, router }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      // Track what we just saved so the auto-save effect doesn't re-fire.
      if (data.router) lastSavedRouterRef.current = JSON.stringify(data.router);
      setSaved(true);
      setSaveError(null);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [bookId, constitution, fingerprint, storyProfile, router]);

  // AUTO-SAVE the router on change (debounced 1.5s).
  // This prevents the "I picked Gemini for brainstorm, navigated to
  // Workshop, and my router settings were gone" problem — the user
  // no longer needs to remember to press Save for router changes.
  // Only fires AFTER the initial load completes, and only when the
  // router JSON actually changed from what was last saved.
  useEffect(() => {
    if (!loadedRef.current) return;
    const routerJson = JSON.stringify(router);
    if (routerJson === lastSavedRouterRef.current) return;

    const timer = setTimeout(async () => {
      try {
        const res = await fetch("/api/ai/settings", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bookId, router }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
        lastSavedRouterRef.current = routerJson;
        setSaveError(null);
        // Brief "saved" flash so the user sees it auto-saved.
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : "Router auto-save failed");
      }
    }, 1500);

    return () => clearTimeout(timer);
  }, [router, bookId]);

  async function retestProviders() {
    setTesting(true);
    try {
      const res = await fetch("/api/ai/test");
      if (res.ok) {
        const data = await res.json();
        setProviders(data.providers ?? []);
      }
    } catch {
      // silent
    } finally {
      setTesting(false);
    }
  }

  // After a key is saved/removed in the Providers tab, refresh both
  // the provider info list and re-run the smoke test.
  const onProviderKeysChanged = useCallback(async () => {
    try {
      const [providersRes, testRes] = await Promise.all([
        fetch("/api/ai/providers"),
        fetch("/api/ai/test"),
      ]);
      if (providersRes.ok) {
        const data = await providersRes.json();
        if (data.providers) setProviderInfo(data.providers);
      }
      if (testRes.ok) {
        const data = await testRes.json();
        setProviders(data.providers ?? []);
      }
    } catch {
      // silent
    }
  }, []);

  // Helper: does the user have a saved key for a given provider?
  const hasKeyFor = useCallback(
    (providerKey: string) =>
      providerInfo.find((p) => p.key === providerKey)?.saved.hasKey ?? false,
    [providerInfo],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-[var(--text-3)]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-6 sm:p-8">
      {/* header */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground">AI Studio</h1>
        <p className="mt-1 text-sm text-[var(--text-2)]">
          The brain behind your writing assistant.
        </p>
      </div>

      {/* provider status */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-[var(--text-3)]" />
          <span className="text-xs font-medium text-[var(--text-2)]">Providers</span>
        </div>
        {providers.map((p) => (
          <div key={p.provider} className="flex items-center gap-1.5">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                p.ok
                  ? "bg-emerald-500"
                  : p.requiresKey && !p.hasKey
                    ? "bg-[var(--text-3)]"
                    : "bg-rose-500",
              )}
            />
            <span className="text-xs text-[var(--text-2)]">{p.label}</span>
            {p.ok && <span className="text-[10px] text-[var(--text-3)]">{p.latencyMs}ms</span>}
            {!p.ok && p.requiresKey && !p.hasKey && (
              <span className="text-[10px] text-[var(--text-3)]">no key</span>
            )}
            {!p.ok && p.hasKey && (
              <span className="text-[10px] text-rose-400" title={p.error}>error</span>
            )}
          </div>
        ))}
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => setTab("providers")}
            className="flex items-center gap-1 text-xs text-accent hover:underline"
          >
            <KeyRound className="h-3 w-3" /> Manage keys
          </button>
          <button
            onClick={retestProviders}
            disabled={testing}
            className="text-xs text-[var(--text-3)] hover:text-foreground"
          >
            {testing ? "Testing…" : "Retest"}
          </button>
        </div>
      </div>

      {/* tabs */}
      <div className="mb-6 flex items-center gap-1 border-b border-border">
        {(["fingerprint", "story", "providers", "constitution", "router", "usage"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "relative px-3 py-2.5 text-[13px] font-medium capitalize transition-colors",
              tab === t ? "text-accent" : "text-[var(--text-2)] hover:text-foreground",
            )}
          >
            {t}
            {t === "providers" && providerInfo.some((p) => p.requiresApiKey && !p.saved.hasKey) && (
              <span className="ml-1 inline-flex h-1.5 w-1.5 rounded-full bg-accent align-middle" />
            )}
            {tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {saved && <span className="text-xs text-emerald-400">✓ Saved</span>}
          {saveError && (
            <button
              onClick={() => setShowSaveErrorPanel((s) => !s)}
              className="text-xs text-rose-400 hover:text-rose-300"
              title={saveError}
            >
              ⚠ Save failed ▾
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* Save error detail panel (shown when saveError is set) */}
      {saveError && showSaveErrorPanel && (
        <div className="mb-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold text-rose-300">
                {saveError.toLowerCase().includes("ai_settings") || saveError.toLowerCase().includes("does not exist") || saveError.toLowerCase().includes("could not find")
                  ? "Database table missing"
                  : "Save failed"}
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-rose-200/90">
                {saveError.toLowerCase().includes("ai_settings") || saveError.toLowerCase().includes("does not exist") || saveError.toLowerCase().includes("could not find")
                  ? "The ai_settings table doesn't exist in your Supabase project yet. Run the SQL migration in your Supabase SQL Editor:"
                  : "The settings couldn't be saved to the database. The backend returned:"}
              </p>
              {saveError.toLowerCase().includes("ai_settings") || saveError.toLowerCase().includes("does not exist") || saveError.toLowerCase().includes("could not find") ? (
                <div className="mt-2 rounded-md border border-rose-400/30 bg-rose-500/5 p-2">
                  <p className="text-[10px] font-mono text-rose-200/80">
                    File: <span className="text-rose-100">supabase/ai-tables.sql</span>
                  </p>
                  <p className="mt-1 text-[10px] text-rose-200/70">
                    Copy the contents of that file into Supabase SQL Editor → Run.
                    This creates the ai_settings, ai_usage, and ai_cut_log tables.
                  </p>
                </div>
              ) : (
                <pre className="mt-2 max-h-32 overflow-auto whitespace-pre-wrap break-words rounded bg-rose-500/10 p-2 text-[11px] text-rose-200/80">
                  {saveError}
                </pre>
              )}
              <div className="mt-2 flex items-center gap-2">
                <button
                  onClick={() => setShowSaveErrorPanel(false)}
                  className="rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-200 hover:bg-rose-500/20"
                >
                  Dismiss
                </button>
                <button
                  onClick={() => { setSaveError(null); setShowSaveErrorPanel(false); save(); }}
                  className="rounded-md border border-rose-400/40 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-200 hover:bg-rose-500/20"
                >
                  Retry save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FINGERPRINT TAB */}
      {tab === "fingerprint" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <label className="mb-1 block text-xs uppercase tracking-wide text-[var(--text-3)]">Voice</label>
            <textarea
              value={fingerprint.voice}
              onChange={(e) => setFingerprint({ ...fingerprint, voice: e.target.value })}
              placeholder="How does your prose sound? Terse, lyrical, direct…"
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
            />
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <label className="mb-1 block text-xs uppercase tracking-wide text-[var(--text-3)]">Pacing</label>
            <textarea
              value={fingerprint.pacing}
              onChange={(e) => setFingerprint({ ...fingerprint, pacing: e.target.value })}
              placeholder="Short paragraphs in tension, long in reflection…"
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
            />
          </div>
          <div className="rounded-lg border border-border bg-card p-5">
            <label className="mb-1 block text-xs uppercase tracking-wide text-[var(--text-3)]">Tone</label>
            <textarea
              value={fingerprint.tone}
              onChange={(e) => setFingerprint({ ...fingerprint, tone: e.target.value })}
              placeholder="Melancholic wonder, hardboiled, hopeful…"
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
            />
          </div>
          {/* samples */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-xs uppercase tracking-wide text-[var(--text-3)]">Few-shot samples</label>
              <button
                onClick={() => setFingerprint({
                  ...fingerprint,
                  samples: [...fingerprint.samples, { id: `fs-${Date.now()}`, label: "", text: "" }],
                })}
                className="flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <Plus className="h-3 w-3" /> Add sample
              </button>
            </div>
            <div className="space-y-2">
              {fingerprint.samples.length === 0 && (
                <p className="text-xs text-[var(--text-3)]">No samples yet. Add a passage that represents your style.</p>
              )}
              {fingerprint.samples.map((s, i) => (
                <div key={s.id} className="flex items-start gap-2">
                  <input
                    value={s.label}
                    onChange={(e) => setFingerprint({
                      ...fingerprint,
                      samples: fingerprint.samples.map((x, j) => j === i ? { ...x, label: e.target.value } : x),
                    })}
                    placeholder="Label"
                    className="w-1/3 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
                  />
                  <input
                    value={s.text}
                    onChange={(e) => setFingerprint({
                      ...fingerprint,
                      samples: fingerprint.samples.map((x, j) => j === i ? { ...x, text: e.target.value } : x),
                    })}
                    placeholder="Sample text…"
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
                  />
                  <button
                    onClick={() => setFingerprint({ ...fingerprint, samples: fingerprint.samples.filter((_, j) => j !== i) })}
                    className="p-1 text-[var(--text-3)] hover:text-rose-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Cut log */}
          <CutLogSection bookId={bookId} />
        </div>
      )}

      {tab === "story" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-foreground">Story Profile</p>
                <p className="mt-1 text-xs text-[var(--text-2)]">
                  The shape of this story — structure, cast roles, foundations, narration. Threaded into every AI call, same as Fingerprint, so you never have to re-explain your story to it.
                </p>
              </div>
              <button
                onClick={async () => {
                  setGeneratingProfile(true);
                  setGenerateProfileError(null);
                  try {
                    const res = await fetch("/api/ai/propose", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        bookId,
                        action: "generate_story_profile",
                        scope: { type: "story_profile", bookId },
                      }),
                    });
                    if (!res.ok) {
                      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                      throw new Error(data.error ?? `HTTP ${res.status}`);
                    }
                    const data = await res.json();
                    if (data.structured) {
                      setStoryProfile({ ...STORY_PROFILE_SEED, ...data.structured });
                    } else {
                      throw new Error("The AI didn't return a usable profile. Try again, or fill it in by hand below.");
                    }
                  } catch (err) {
                    setGenerateProfileError(err instanceof Error ? err.message : "Generation failed");
                  } finally {
                    setGeneratingProfile(false);
                  }
                }}
                disabled={generatingProfile}
                className="flex shrink-0 items-center gap-1.5 rounded-md border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/15 disabled:opacity-50"
              >
                {generatingProfile ? <Loader2 className="h-3 w-3 animate-spin" /> : <Bot className="h-3 w-3" />}
                {generatingProfile ? "Reading your story…" : "Generate from my story"}
              </button>
            </div>
            {generateProfileError && (
              <p className="mb-3 rounded-md border border-rose-500/30 bg-rose-500/5 p-2 text-xs text-rose-400">{generateProfileError}</p>
            )}
            <p className="text-[11px] text-[var(--text-3)]">
              This reads your chapters and World Bible to draft a first pass. Review and correct anything below — you know your story better than any inference. Nothing saves until you hit Save.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-border bg-card p-5">
              <label className="mb-2 block text-xs uppercase tracking-wide text-[var(--text-3)]">Structure</label>
              <input
                value={storyProfile.structure}
                onChange={(e) => setStoryProfile({ ...storyProfile, structure: e.target.value })}
                placeholder="Three-act, Episodic, Nonlinear…"
                className="mb-2 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
              />
              <textarea
                value={storyProfile.structureNote}
                onChange={(e) => setStoryProfile({ ...storyProfile, structureNote: e.target.value })}
                placeholder="Roughly where the story is right now within that shape…"
                rows={2}
                className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
              />
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <label className="mb-2 block text-xs uppercase tracking-wide text-[var(--text-3)]">Cast configuration</label>
              <input
                value={storyProfile.castConfig}
                onChange={(e) => setStoryProfile({ ...storyProfile, castConfig: e.target.value })}
                placeholder="Single protagonist, Ensemble, Reciprocal…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
              />
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <label className="mb-2 block text-xs uppercase tracking-wide text-[var(--text-3)]">Change</label>
              <input
                value={storyProfile.changeMode}
                onChange={(e) => setStoryProfile({ ...storyProfile, changeMode: e.target.value })}
                placeholder="External, Internal, or Both"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
              />
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <label className="mb-2 block text-xs uppercase tracking-wide text-[var(--text-3)]">Resolution mode</label>
              <input
                value={storyProfile.resolutionMode}
                onChange={(e) => setStoryProfile({ ...storyProfile, resolutionMode: e.target.value })}
                placeholder="Resolved, Unresolved, Near-static, Incomplete/ongoing"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
              />
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <label className="mb-2 block text-xs uppercase tracking-wide text-[var(--text-3)]">Narration</label>
              <input
                value={storyProfile.narrationMode}
                onChange={(e) => setStoryProfile({ ...storyProfile, narrationMode: e.target.value })}
                placeholder="Close third, single POV…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
              />
            </div>

            <div className="rounded-lg border border-border bg-card p-5">
              <label className="mb-2 block text-xs uppercase tracking-wide text-[var(--text-3)]">Currently withheld from the reader</label>
              <input
                value={storyProfile.infoWithheld}
                onChange={(e) => setStoryProfile({ ...storyProfile, infoWithheld: e.target.value })}
                placeholder="What the reader doesn't know yet…"
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
              />
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-5">
            <label className="mb-2 block text-xs uppercase tracking-wide text-[var(--text-3)]">Central conflict</label>
            <textarea
              value={storyProfile.centralConflict}
              onChange={(e) => setStoryProfile({ ...storyProfile, centralConflict: e.target.value })}
              placeholder="One line — what makes the change non-trivial…"
              rows={2}
              className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
            />
          </div>

          {/* Cast roles */}
          <div className="rounded-lg border border-border bg-card p-5">
            <div className="mb-3 flex items-center justify-between">
              <label className="text-xs uppercase tracking-wide text-[var(--text-3)]">Cast roles</label>
              <button
                onClick={() => setStoryProfile({
                  ...storyProfile,
                  castRoles: [...storyProfile.castRoles, { role: "subject", name: "" }],
                })}
                className="flex items-center gap-1 text-xs text-accent hover:underline"
              >
                <Plus className="h-3 w-3" /> Add role
              </button>
            </div>
            <div className="space-y-2">
              {storyProfile.castRoles.length === 0 && (
                <p className="text-xs text-[var(--text-3)]">No cast roles mapped yet — who's pursuing what, and who's resisting it?</p>
              )}
              {storyProfile.castRoles.map((r, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select
                    value={r.role}
                    onChange={(e) => setStoryProfile({
                      ...storyProfile,
                      castRoles: storyProfile.castRoles.map((x, j) => j === i ? { ...x, role: e.target.value as CastRole["role"] } : x),
                    })}
                    className="w-32 shrink-0 rounded-md border border-border bg-background px-2 py-1.5 text-xs capitalize text-foreground focus:border-accent focus:outline-none"
                  >
                    {(["subject", "object", "opponent", "helper", "sender", "receiver"] as const).map((role) => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                  <input
                    value={r.name}
                    onChange={(e) => setStoryProfile({
                      ...storyProfile,
                      castRoles: storyProfile.castRoles.map((x, j) => j === i ? { ...x, name: e.target.value } : x),
                    })}
                    placeholder="Character name (from your Cast)…"
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none"
                  />
                  <button
                    onClick={() => setStoryProfile({ ...storyProfile, castRoles: storyProfile.castRoles.filter((_, j) => j !== i) })}
                    className="p-1 text-[var(--text-3)] hover:text-rose-400"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PROVIDERS TAB */}
      {tab === "providers" && (
        <ProvidersTab
          providerInfo={providerInfo}
          onKeysChanged={onProviderKeysChanged}
        />
      )}

      {/* CONSTITUTION TAB */}
      {tab === "constitution" && (
        <div className="space-y-2">
          {constitution.map((rule, i) => (
            <div key={rule.id} className="group flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-mono text-[var(--text-2)]">
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <input
                  value={rule.text}
                  onChange={(e) => setConstitution(constitution.map((r, j) => j === i ? { ...r, text: e.target.value } : r))}
                  placeholder="Type your rule here…"
                  className="w-full rounded-sm border border-transparent bg-transparent px-1.5 py-1 text-sm text-foreground placeholder:text-[var(--text-3)] hover:border-[var(--edge)] focus:border-accent focus:bg-background focus:outline-none"
                />
                <div className="mt-1 flex items-center gap-2 px-1.5">
                  <select
                    value={rule.enforcement}
                    onChange={(e) => setConstitution(constitution.map((r, j) => j === i ? { ...r, enforcement: e.target.value as "prompt" | "code" } : r))}
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px] font-medium bg-transparent focus:outline-none cursor-pointer",
                      rule.enforcement === "code" ? "text-accent" : "text-[var(--text-2)]",
                    )}
                  >
                    <option value="prompt">prompt</option>
                    <option value="code">code-checkable</option>
                  </select>
                </div>
              </div>
              <Switch
                checked={rule.active}
                onCheckedChange={(checked) => setConstitution(constitution.map((r, j) => j === i ? { ...r, active: checked } : r))}
              />
              <button
                onClick={() => setConstitution(constitution.filter((_, j) => j !== i))}
                className="p-1 text-[var(--text-3)] hover:text-rose-400"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={() => setConstitution([...constitution, { id: `rule-${Date.now()}`, text: "", enforcement: "prompt", active: true }])}
            className="flex items-center gap-1.5 text-xs text-accent hover:underline"
          >
            <Plus className="h-3 w-3" /> Add rule
          </button>
        </div>
      )}

      {/* ROUTER TAB */}
      {tab === "router" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <p className="mb-1 text-xs text-[var(--text-3)]">
              Route each task to a specific model. Every provider here needs its own free API key —
              add one in the <button onClick={() => setTab("providers")} className="text-accent hover:underline">Providers tab</button> before routing tasks to it.
            </p>
            <p className="mb-3 text-[11px] text-emerald-400/70">
              ✓ Router changes auto-save after 1.5s — you can navigate away without pressing Save.
            </p>
            {TASKS.map((task) => (
              <RouterRow
                key={task}
                task={task}
                value={router[task] ?? ""}
                providerInfo={providerInfo}
                onChange={(v) => setRouter({ ...router, [task]: v })}
              />
            ))}
          </div>
          <p className="text-xs text-[var(--text-3)]">
            Tasks without a chosen model fall back to whichever provider you have a key
            for. The <span className="text-[var(--text-2)]">chat</span> task covers the AI dock in the editor and the Workshop.
          </p>
        </div>
      )}

      {/* USAGE TAB */}
      {tab === "usage" && (
        <div className="space-y-3">
          {usage.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <Bot className="mx-auto mb-3 h-6 w-6 text-[var(--text-3)]" />
              <p className="text-sm text-[var(--text-2)]">No AI calls yet</p>
              <p className="mt-1 text-xs text-[var(--text-3)]">
                Usage will appear here after your first AI interaction.
              </p>
            </div>
          ) : (
            <>
              {/* per-provider totals */}
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(
                  usage.reduce((acc, u) => {
                    acc[u.provider] = (acc[u.provider] ?? 0) + u.tokens;
                    return acc;
                  }, {} as Record<string, number>)
                ).map(([provider, tokens]) => (
                  <div key={provider} className="rounded-lg border border-border bg-card p-4">
                    <div className="text-xs uppercase tracking-wide text-[var(--text-3)]">{provider}</div>
                    <div className="mt-1 text-xl font-semibold text-foreground">{tokens.toLocaleString()}</div>
                    <div className="text-xs text-[var(--text-3)]">tokens</div>
                  </div>
                ))}
              </div>
              {/* recent calls */}
              <div className="overflow-hidden rounded-lg border border-border bg-card">
                {usage.slice(0, 20).map((u, i) => (
                  <div key={i} className={cn("flex items-center gap-3 px-4 py-2 text-xs", i > 0 && "border-t border-border")}>
                    <span className="font-mono text-[var(--text-3)]">{u.model}</span>
                    <span className="flex-1 text-[var(--text-2)]">{u.task.replace(/_/g, " ")}</span>
                    <span className="text-[var(--text-3)]">{u.tokens} tokens</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * RouterRow — model dropdown for one task. Shows all models from the
 * catalog PLUS a "Custom model id" input so the user can type any
 * model id (for future Gemini models like gemini-3.6-flash, or any
 * other model we haven't added to the catalog yet).
 * ------------------------------------------------------------------ */
function RouterRow({
  task,
  value,
  providerInfo,
  onChange,
}: {
  task: string;
  value: string;
  providerInfo: ProviderInfo[];
  onChange: (v: string) => void;
}) {
  const [showCustom, setShowCustom] = useState(false);
  const [customDraft, setCustomDraft] = useState("");

  // Is the current value a "custom" id (not in the catalog)?
  const isCustom = Boolean(value) && !providerInfo.some((p) =>
    p.models.some((m) => m.id === value),
  );

  // Detect: chosen model belongs to a provider that needs a key + key missing
  const chosenInfo = providerInfo.find((p) =>
    p.models.some((m) => m.id === value),
  );
  // For custom ids, infer provider from the model name prefix
  const inferredProvider: ProviderKey | undefined = isCustom
    ? (value.startsWith("gemini") ? "gemini" : value.startsWith("glm") ? "zai" : undefined)
    : chosenInfo?.key as ProviderKey | undefined;
  const inferredInfo = inferredProvider ? providerInfo.find((p) => p.key === inferredProvider) : undefined;
  const needsKeyButMissing =
    Boolean(value) &&
    ((chosenInfo?.requiresApiKey && !chosenInfo?.saved.hasKey) ||
     (isCustom && inferredInfo?.requiresApiKey && !inferredInfo?.saved.hasKey));

  function commitCustom() {
    const v = customDraft.trim();
    if (!v) return;
    onChange(v);
    setShowCustom(false);
  }

  return (
    <div className="flex flex-col gap-1 border-b border-border py-2 last:border-0">
      <div className="flex items-center gap-3">
        <span className="flex-1 text-sm text-foreground">{task.replace(/_/g, " ")}</span>
        {showCustom ? (
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={customDraft}
              onChange={(e) => setCustomDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitCustom();
                if (e.key === "Escape") setShowCustom(false);
              }}
              placeholder="e.g. gemini-3.6-flash"
              autoFocus
              className="h-8 w-56 rounded-md border border-border bg-background px-2 text-xs text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none font-mono"
            />
            <button
              onClick={commitCustom}
              className="h-8 rounded-md bg-accent px-2 text-[10px] font-medium text-accent-foreground hover:bg-accent/90"
            >
              Set
            </button>
            <button
              onClick={() => setShowCustom(false)}
              className="h-8 rounded-md border border-border px-2 text-[10px] text-[var(--text-2)] hover:bg-[var(--surface-2)]"
            >
              Cancel
            </button>
          </div>
        ) : (
          <select
            value={isCustom ? "__custom__" : value}
            onChange={(e) => {
              if (e.target.value === "__custom__") {
                setCustomDraft(value && isCustom ? value : "");
                setShowCustom(true);
              } else {
                onChange(e.target.value);
              }
            }}
            className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-accent focus:outline-none"
          >
            <option value="">Default (GLM-4-Flash)</option>
            {providerInfo.map((p) => (
              <optgroup key={p.key} label={p.label}>
                {p.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}{p.requiresApiKey && !p.saved.hasKey ? " — key needed" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
            <optgroup label="Custom">
              <option value="__custom__">Custom model id…</option>
            </optgroup>
          </select>
        )}
      </div>
      {/* Show the resolved custom id as a pill */}
      {isCustom && !showCustom && (
        <div className="flex items-center gap-1.5 pl-1 text-[11px]">
          <span className="rounded-full bg-muted px-1.5 py-0.5 font-mono text-[10px] text-[var(--text-2)]">
            custom: {value}
          </span>
          {inferredProvider && (
            <span className="text-[var(--text-3)]">
              → inferred provider: {inferredInfo?.label ?? inferredProvider}
            </span>
          )}
        </div>
      )}
      {needsKeyButMissing && (
        <div className="flex items-center gap-1 pl-1 text-[11px] text-amber-400">
          <AlertTriangle className="h-3 w-3" />
          No {(inferredInfo ?? chosenInfo)?.label} API key saved — this task will fail until you add one.
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * ProvidersTab — manage per-user API keys for each provider.
 * ------------------------------------------------------------------ */
function ProvidersTab({
  providerInfo,
  onKeysChanged,
}: {
  providerInfo: ProviderInfo[];
  onKeysChanged: () => Promise<void>;
}) {
  if (providerInfo.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-8 text-center">
        <KeyRound className="mx-auto mb-3 h-6 w-6 text-[var(--text-3)]" />
        <p className="text-sm text-[var(--text-2)]">No providers configured.</p>
        <p className="mt-1 text-xs text-[var(--text-3)]">Reload the page to fetch provider list.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-[var(--surface-2)] p-3">
        <p className="text-xs text-[var(--text-2)]">
          Keys are stored in your Supabase project, isolated to your account via Row-Level Security.
          They never leave your browser except to save them.
        </p>
      </div>
      {providerInfo.map((p) => {
        const note = PROVIDER_NOTES[p.key as ProviderKey];
        return (
          <div key={p.key} className="space-y-2">
            <ProviderKeyCard info={p} onKeysChanged={onKeysChanged} />
            {note && (
              <div className="rounded-md border border-border bg-background px-3 py-2 text-[11px] leading-relaxed text-[var(--text-3)]">
                <span className="font-medium text-[var(--text-2)]">How it works: </span>
                {note}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ProviderKeyCard({
  info,
  onKeysChanged,
}: {
  info: ProviderInfo;
  onKeysChanged: () => Promise<void>;
}) {
  const [draftKey, setDraftKey] = useState("");
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!draftKey.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ai/providers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: info.key, apiKey: draftKey.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      setDraftKey("");
      setShow(false);
      await onKeysChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/providers?provider=${info.key}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? `HTTP ${res.status}`);
      }
      await onKeysChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">{info.label}</h3>
            {info.requiresApiKey ? (
              info.saved.hasKey ? (
                <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-400">
                  key saved{info.saved.last4 ? ` · ··${info.saved.last4}` : ""}
                </span>
              ) : (
                <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-[var(--text-2)]">
                  no key
                </span>
              )
            ) : (
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-[var(--text-2)]">
                built-in · no key needed
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-[var(--text-3)]">
            {info.models.length} model{info.models.length === 1 ? "" : "s"} available
            {info.saved.updatedAt ? ` · last updated ${new Date(info.saved.updatedAt).toLocaleString()}` : ""}
          </p>
        </div>
        {info.helpUrl && (
          <a
            href={info.helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-accent hover:underline"
          >
            Get key <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>

      {/* models list */}
      <div className="mb-3 flex flex-wrap gap-1.5">
        {info.models.map((m) => (
          <span
            key={m.id}
            className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-[var(--text-2)]"
          >
            {m.label}
          </span>
        ))}
      </div>

      {info.requiresApiKey ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <input
                type={show ? "text" : "password"}
                value={draftKey}
                onChange={(e) => setDraftKey(e.target.value)}
                placeholder={info.keyHint ? `Paste your key (${info.keyHint})` : "Paste your API key"}
                className="w-full rounded-md border border-border bg-background px-3 py-2 pr-9 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-3)] hover:text-foreground"
                tabIndex={-1}
              >
                {show ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <button
              onClick={handleSave}
              disabled={saving || !draftKey.trim()}
              className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {info.saved.hasKey && (
              <button
                onClick={handleRemove}
                disabled={removing}
                className="rounded-md border border-border px-3 py-2 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground disabled:opacity-40"
              >
                {removing ? "Removing…" : "Remove"}
              </button>
            )}
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <p className="text-[11px] text-[var(--text-3)]">
            Save replaces any existing key for this provider.
          </p>
        </div>
      ) : (
        <p className="text-xs text-[var(--text-3)]">
          This provider is configured at the platform level — no key needed from you.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * CutLogSection — shows recent cut log entries + distill button
 * ------------------------------------------------------------------ */
function CutLogSection({ bookId }: { bookId: string }) {
  const [cutLog, setCutLog] = useState<{ kind: string; before_text: string | null; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [distilling, setDistilling] = useState(false);
  const [distillResults, setDistillResults] = useState<string[] | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/books/${bookId}/ai-cut-log`);
        if (res.ok) {
          const data = await res.json();
          setCutLog(data.cutLog ?? []);
        }
      } catch {
        // table might not exist
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [bookId]);

  async function handleDistill() {
    setDistilling(true);
    setDistillResults(null);
    try {
      const res = await fetch("/api/ai/propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          action: "generate_summary",
          scope: { type: "overview", bookId },
          extra: `Distill writing rules from these cut log entries (discarded/edited AI proposals). Suggest 2-3 new constitution rules based on what was rejected. Cut log entries: ${JSON.stringify(cutLog.slice(0, 20))}`,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setDistillResults([data.text]);
      }
    } catch {
      // silent
    } finally {
      setDistilling(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between">
        <label className="text-xs uppercase tracking-wide text-[var(--text-3)]">Cut log</label>
        <button
          onClick={handleDistill}
          disabled={distilling || cutLog.length === 0}
          className="flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-[10px] font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground disabled:opacity-40"
        >
          {distilling ? "Distilling…" : "Distill into rules"}
        </button>
      </div>
      {loading ? (
        <p className="text-xs text-[var(--text-3)]">Loading…</p>
      ) : cutLog.length === 0 ? (
        <p className="text-xs text-[var(--text-3)]">
          No cut log entries yet. When you discard AI proposals, they appear here.
        </p>
      ) : (
        <div className="space-y-1.5">
          {cutLog.slice(0, 10).map((entry, i) => (
            <div key={i} className="flex items-start gap-2 text-xs">
              <span className={cn(
                "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium",
                entry.kind === "discarded" ? "bg-rose-500/10 text-rose-400" : "bg-emerald-500/10 text-emerald-400",
              )}>
                {entry.kind}
              </span>
              <span className="min-w-0 flex-1 truncate text-[var(--text-2)]">
                {entry.before_text?.slice(0, 80) ?? "(empty)"}…
              </span>
            </div>
          ))}
        </div>
      )}
      {distillResults && (
        <div className="mt-3 rounded-md border border-accent/30 bg-accent/5 p-3">
          <p className="mb-1 text-[10px] font-medium uppercase tracking-wide text-accent">Suggested rules</p>
          {distillResults.map((r, i) => (
            <p key={i} className="text-xs text-[var(--text-2)]">{r}</p>
          ))}
        </div>
      )}
    </div>
  );
}
