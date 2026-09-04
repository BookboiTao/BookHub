"use client";

import { useState } from "react";
import { Download, Upload, Check, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { createSupabaseBrowser } from "@/lib/supabase-browser";

/* ------------------------------------------------------------------ *
 * Settings — global app settings.
 * Account, appearance, writing preferences, data, API key status.
 * ------------------------------------------------------------------ */

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">
      {children}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent",
        props.className,
      )}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-[var(--text-3)] focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent",
        props.className,
      )}
    />
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description && (
          <p className="text-xs text-[var(--text-2)]">{description}</p>
        )}
      </div>
      <div className="space-y-4 rounded-lg border border-border bg-card p-5">
        {children}
      </div>
    </section>
  );
}

function KeyStatus({ name, configured }: { name: string; configured: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2">
      <span className="text-sm text-foreground">{name}</span>
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "h-2 w-2 rounded-full",
            configured ? "bg-emerald-500" : "bg-[var(--text-3)]",
          )}
        />
        <span className="text-xs text-[var(--text-3)]">
          {configured ? "Connected" : "Not configured"}
        </span>
      </div>
    </div>
  );
}

export function SettingsPage() {
  const [username, setUsername] = useState("BookboTao");
  const [email, setEmail] = useState("book@bookhub.dev");
  const [bio, setBio] = useState("Solo novelist writing in the dark.");

  // appearance
  const [fontScale, setFontScale] = useState<"comfortable" | "compact" | "spacious">("comfortable");

  // writing
  const [autosave, setAutosave] = useState("30");
  const [wordGoal, setWordGoal] = useState("1000");

  return (
    <div className="mx-auto max-w-2xl p-6 sm:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Settings</h1>
        <p className="mt-1 text-sm text-[var(--text-2)]">
          Manage your account, writing environment, and integrations.
        </p>
      </div>

      <div className="space-y-6">
        {/* account */}
        <Section
          title="Account"
          description="Your writer profile. Shown on shared manuscripts."
        >
          <div className="space-y-1.5">
            <FieldLabel>Username</FieldLabel>
            <TextInput
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Email</FieldLabel>
            <TextInput
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Bio</FieldLabel>
            <TextArea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
            />
          </div>
        </Section>

        {/* appearance */}
        <Section
          title="Appearance"
          description="How the workspace looks. Dark theme is currently the only mode."
        >
          <div className="space-y-1.5">
            <FieldLabel>Theme</FieldLabel>
            <div
              className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2 text-sm text-[var(--text-3)]"
              aria-disabled="true"
            >
              <span>Dark (locked)</span>
              <span className="text-xs">BookHub is dark-only</span>
            </div>
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Font size</FieldLabel>
            <div className="flex gap-2">
              {(["compact", "comfortable", "spacious"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFontScale(s)}
                  className={cn(
                    "flex-1 rounded-md border px-3 py-2 text-sm capitalize transition-colors",
                    fontScale === s
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border text-[var(--text-2)] hover:border-accent/40 hover:text-foreground",
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </Section>

        {/* writing preferences */}
        <Section
          title="Writing preferences"
          description="Defaults applied to new chapters and editor sessions."
        >
          <div className="space-y-1.5">
            <FieldLabel>Auto-save interval (seconds)</FieldLabel>
            <TextInput
              type="number"
              min={5}
              max={300}
              value={autosave}
              onChange={(e) => setAutosave(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <FieldLabel>Daily word count goal</FieldLabel>
            <TextInput
              type="number"
              min={0}
              value={wordGoal}
              onChange={(e) => setWordGoal(e.target.value)}
            />
          </div>
        </Section>

        {/* data */}
        <Section
          title="Data"
          description="Backup or restore your workspace. Files include all books, chapters, and settings."
        >
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => {
                /* placeholder */
              }}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-foreground"
            >
              <Download className="h-3.5 w-3.5" />
              Export backup
            </button>
            <button
              onClick={() => {
                /* placeholder */
              }}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-foreground"
            >
              <Upload className="h-3.5 w-3.5" />
              Import backup
            </button>
          </div>
        </Section>

        {/* API keys */}
        <Section
          title="API keys"
          description="Provider connections used by AI Studio. Keys are stored in secrets and never shown."
        >
          <div className="space-y-2">
            <KeyStatus name="Gemini" configured />
            <KeyStatus name="Claude" configured />
            <KeyStatus name="GLM" configured={false} />
          </div>
          <p className="flex items-center gap-1 text-xs text-[var(--text-3)]">
            <Check className="h-3 w-3 text-emerald-500" />
            Connected providers are available in the AI Router.
          </p>
        </Section>

        {/* Account actions */}
        <Section
          title="Account"
          description="Sign out of your BookHub workspace."
        >
          <button
            onClick={async () => {
              const supabase = createSupabaseBrowser();
              await supabase.auth.signOut();
              window.location.href = "/login";
            }}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:bg-[var(--surface-2)] hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Sign out
          </button>
        </Section>
      </div>
    </div>
  );
}
