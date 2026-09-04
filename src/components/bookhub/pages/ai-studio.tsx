"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Bot,
  Plus,
  Trash2,
  Loader2,
  Check,
  X,
  Activity,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * AI Studio — the control room. Now live.
 * 
 * 4 tabs: Fingerprint / Constitution / Router / Usage
 * - Fingerprint: voice/pacing/tone + samples, saves to /api/ai/settings
 * - Constitution: rules from seed, toggle active, add/edit/delete
 * - Router: task→model mapping (currently all z.ai)
 * - Usage: fetches from ai_usage table, shows per-provider totals
 * 
 * Provider status row on top: hits /api/ai/test on load.
 * ------------------------------------------------------------------ */

type ConstitutionRule = {
  id: string;
  text: string;
  enforcement: "prompt" | "code";
  active: boolean;
};

type Fingerprint = {
  voice: string;
  pacing: string;
  tone: string;
  samples: { id: string; label: string; text: string }[];
};

type ProviderStatus = {
  provider: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
};

type UsageRow = {
  provider: string;
  model: string;
  task: string;
  tokens: number;
  created_at: string;
};

const CONSTITUTION_SEED: ConstitutionRule[] = [
  { id: "rule-1", text: "Zero em-dashes anywhere in generated prose.", enforcement: "code", active: true },
  { id: "rule-2", text: "Avoid the Three Mistakes: over-explaining everything, giving life to things unnecessarily, writing the right words in the wrong way.", enforcement: "prompt", active: true },
  { id: "rule-3", text: "No reflexive 'suddenly', no 'seemed to' hedges without real uncertainty, no 'something shifted' vagueness — if something changes, name what.", enforcement: "code", active: true },
  { id: "rule-4", text: "No generic emotion catalog (jaw tightening, eyes narrowing) — reach for the specific, causal detail instead.", enforcement: "prompt", active: true },
  { id: "rule-5", text: "No unearned personification of objects or settings; no stacked metaphors on one image.", enforcement: "prompt", active: true },
  { id: "rule-6", text: "Chapter ends: a small open pull, never an announced hook.", enforcement: "prompt", active: true },
  { id: "rule-7", text: "Let scenes breathe — silence is allowed.", enforcement: "prompt", active: true },
  { id: "rule-8", text: "Don't editorialize causal connections between juxtaposed scenes.", enforcement: "prompt", active: true },
  { id: "rule-9", text: "AI critiques must be proportional (no rewrite for a comma), must not introduce new tells while fixing one, must not invent details absent from the passage.", enforcement: "prompt", active: true },
];

const FINGERPRINT_SEED: Fingerprint = {
  voice: "",
  pacing: "",
  tone: "",
  samples: [],
};

type Tab = "fingerprint" | "constitution" | "router" | "usage";

export function AIStudioPage({ bookId }: { bookId: string }) {
  const [tab, setTab] = useState<Tab>("fingerprint");
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [testing, setTesting] = useState(false);
  const [constitution, setConstitution] = useState<ConstitutionRule[]>(CONSTITUTION_SEED);
  const [fingerprint, setFingerprint] = useState<Fingerprint>(FINGERPRINT_SEED);
  const [router, setRouter] = useState<Record<string, string>>({});
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load settings + test providers on mount
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [settingsRes, testRes] = await Promise.all([
          fetch(`/api/ai/settings?bookId=${bookId}`),
          fetch("/api/ai/test"),
        ]);
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          if (data.constitution) setConstitution(data.constitution);
          if (data.fingerprint) setFingerprint(data.fingerprint);
          if (data.router) setRouter(data.router);
        }
        if (testRes.ok) {
          const data = await testRes.json();
          setProviders(data.providers ?? []);
        }
      } catch {
        // silent fail — settings fall back to seed
      } finally {
        setLoading(false);
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
    try {
      await fetch("/api/ai/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookId, constitution, fingerprint, router }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }, [bookId, constitution, fingerprint, router]);

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
      <div className="mb-6 flex items-center gap-3 rounded-lg border border-border bg-card p-3">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-[var(--text-3)]" />
          <span className="text-xs font-medium text-[var(--text-2)]">Providers</span>
        </div>
        {providers.map((p) => (
          <div key={p.provider} className="flex items-center gap-1.5">
            <span className={cn("h-2 w-2 rounded-full", p.ok ? "bg-emerald-500" : "bg-rose-500")} />
            <span className="text-xs text-[var(--text-2)]">{p.provider}</span>
            {p.ok && <span className="text-[10px] text-[var(--text-3)]">{p.latencyMs}ms</span>}
            {!p.ok && <span className="text-[10px] text-rose-400">error</span>}
          </div>
        ))}
        <button
          onClick={retestProviders}
          disabled={testing}
          className="ml-auto text-xs text-[var(--text-3)] hover:text-foreground"
        >
          {testing ? "Testing…" : "Retest"}
        </button>
      </div>

      {/* tabs */}
      <div className="mb-6 flex items-center gap-1 border-b border-border">
        {(["fingerprint", "constitution", "router", "usage"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "relative px-3 py-2.5 text-[13px] font-medium capitalize transition-colors",
              tab === t ? "text-accent" : "text-[var(--text-2)] hover:text-foreground",
            )}
          >
            {t}
            {tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 bg-accent" />}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          {saved && <span className="text-xs text-emerald-400">✓ Saved</span>}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground hover:bg-accent/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

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
                    className="w-1/3 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
                  />
                  <input
                    value={s.text}
                    onChange={(e) => setFingerprint({
                      ...fingerprint,
                      samples: fingerprint.samples.map((x, j) => j === i ? { ...x, text: e.target.value } : x),
                    })}
                    placeholder="Sample text…"
                    className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-xs text-foreground focus:border-accent focus:outline-none"
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

      {/* CONSTITUTION TAB */}
      {tab === "constitution" && (
        <div className="space-y-2">
          {constitution.map((rule, i) => (
            <div key={rule.id} className="flex items-start gap-3 rounded-lg border border-border bg-card p-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-mono text-[var(--text-2)]">
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <input
                  value={rule.text}
                  onChange={(e) => setConstitution(constitution.map((r, j) => j === i ? { ...r, text: e.target.value } : r))}
                  className="w-full bg-transparent text-sm text-foreground focus:outline-none"
                />
                <div className="mt-1 flex items-center gap-2">
                  <span className={cn(
                    "rounded px-1.5 py-0.5 text-[10px] font-medium",
                    rule.enforcement === "code" ? "bg-accent/15 text-accent" : "bg-muted text-[var(--text-2)]",
                  )}>
                    {rule.enforcement === "code" ? "code-checkable" : "prompt"}
                  </span>
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
            onClick={() => setConstitution([...constitution, { id: `rule-${Date.now()}`, text: "New rule", enforcement: "prompt", active: true }])}
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
            <p className="mb-3 text-xs text-[var(--text-3)]">
              All tasks currently route to z.ai GLM-4-Flash (free tier, fast). When more providers are added, you can route different tasks to different models.
            </p>
            {["chat", "brainstorm_tab", "continue_chapter", "expand_card", "generate_summary", "contradiction_check"].map((task) => (
              <div key={task} className="flex items-center gap-3 border-b border-border py-2 last:border-0">
                <span className="flex-1 text-sm text-foreground">{task.replace(/_/g, " ")}</span>
                <select
                  value={router[task] ?? "glm-4-flash"}
                  onChange={(e) => setRouter({ ...router, [task]: e.target.value })}
                  className="h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground focus:border-accent focus:outline-none"
                >
                  <option value="glm-4-flash">GLM-4-Flash (z.ai)</option>
                  <option value="glm-4-plus">GLM-4-Plus (z.ai, higher quality)</option>
                </select>
              </div>
            ))}
          </div>
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
