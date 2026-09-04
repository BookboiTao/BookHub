"use client";

import { useMemo } from "react";
import {
  GitBranch,
  GitMerge,
  Plus,
  CircleDot,
  FileText,
  Clock,
  ArrowDown,
} from "lucide-react";
import { useBranches, LoadingSpinner } from "@/lib/hooks";
import type { Branch } from "@/lib/data-client";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * BranchesPage — visual branch tree (NOT React Flow).
 *
 * `main` at top, child branches below connected by SVG lines.
 * No 4-branch limit (this was explicitly removed).
 * Below the tree: a Merge view placeholder.
 * ------------------------------------------------------------------ */

function BranchCard({
  branch,
  isLast,
}: {
  branch: Branch;
  isLast: boolean;
}) {
  return (
    <div className="relative">
      {/* connector line from parent — rendered by parent wrapper */}
      <div
        className={cn(
          "rounded-lg border bg-card p-4",
          branch.isMain ? "border-accent" : "border-border",
        )}
      >
        <div className="flex items-start gap-3">
          <GitBranch
            className={cn(
              "mt-0.5 h-4 w-4 shrink-0",
              branch.isMain ? "text-accent" : "text-[var(--text-3)]",
            )}
          />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[13px] font-medium text-foreground">
                {branch.name}
              </span>
              {branch.isMain && (
                <span className="rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[11px] font-medium text-accent">
                  main
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-[var(--text-3)]">
              <span className="inline-flex items-center gap-1">
                <ArrowDown className="h-3 w-3" />
                {branch.ahead} ahead
              </span>
              <span className="inline-flex items-center gap-1">
                <ArrowDown className="h-3 w-3 rotate-180" />
                {branch.behind} behind
              </span>
              <span className="inline-flex items-center gap-1">
                <FileText className="h-3 w-3" />
                {branch.chapterCount} {branch.chapterCount === 1 ? "chapter" : "chapters"}
              </span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {branch.lastDraft}
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* hide if last (no more children to draw under) */}
      {isLast && <div className="hidden" />}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Tree row — parent branch + its children, connected by an SVG line.
 * ------------------------------------------------------------------ */
function BranchTree({
  main,
  childBranches,
}: {
  main: Branch;
  childBranches: Branch[];
}) {
  return (
    <div className="space-y-0">
      <BranchCard branch={main} isLast={false} />

      {childBranches.length > 0 && (
        <div className="relative pl-6">
          {/* vertical connector from main down to children row */}
          <div className="absolute left-[22px] top-0 h-6 w-px bg-border" aria-hidden />

          {/* horizontal row of children */}
          <div className="grid gap-4 pt-6 sm:grid-cols-2 lg:grid-cols-3">
            {childBranches.map((child) => (
              <div key={child.id} className="relative">
                {/* connector hook: vertical + horizontal stub from the trunk */}
                <div
                  className="absolute -left-[22px] top-0 h-6 w-px bg-border"
                  aria-hidden
                />
                <div
                  className="absolute -left-[22px] top-6 h-px w-[22px] bg-border"
                  aria-hidden
                />
                <BranchCard branch={child} isLast />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Merge view — placeholder UI (non-functional).
 * ------------------------------------------------------------------ */
function MergeViewPlaceholder({ branches }: { branches: Branch[] }) {
  const branchOptions = branches;

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-center gap-2">
        <GitMerge className="h-4 w-4 text-[var(--text-3)]" />
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-[var(--text-2)]">
          Merge view
        </h3>
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <p className="text-[13px] leading-relaxed text-[var(--text-2)]">
          Select chapters from each side to create a merged draft. Pick a
          chapter from two branches to compare them line-by-line, then merge
          chosen sections into a new draft on the target branch.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
              From
            </span>
            <select
              disabled
              className="mt-1 w-full appearance-none rounded-md border border-border bg-background px-3 py-2 font-mono text-[12px] text-[var(--text-2)] opacity-60"
              defaultValue=""
            >
              <option value="" disabled>
                Choose a branch…
              </option>
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
              Into
            </span>
            <select
              disabled
              className="mt-1 w-full appearance-none rounded-md border border-border bg-background px-3 py-2 font-mono text-[12px] text-[var(--text-2)] opacity-60"
              defaultValue=""
            >
              <option value="" disabled>
                Choose a branch…
              </option>
              {branchOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-4 flex items-center gap-2">
          <button
            disabled
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground opacity-50"
          >
            <GitMerge className="h-3.5 w-3.5" />
            Create merged draft
          </button>
          <span className="text-[11px] text-[var(--text-3)]">
            Placeholder — merge not yet implemented.
          </span>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ *
 * Page
 * ------------------------------------------------------------------ */
export function BranchesPage({ bookId }: { bookId: string }) {
  const { data: branchData, isLoading } = useBranches(bookId);
  const branches = branchData ?? [];
  if (isLoading) return <LoadingSpinner />;
  const main = branches.find((b) => b.isMain) ?? branches[0];
  const children = branches.filter((b) => !b.isMain && b.parentId === main?.id);

  return (
    <div className="mx-auto max-w-4xl p-6 sm:p-8">
      {/* header */}
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
            <CircleDot className="h-3 w-3" />
            Branches
          </div>
          <h1 className="mt-1 text-xl font-semibold text-foreground">
            Branch tree
          </h1>
          <p className="mt-1 text-[13px] text-[var(--text-2)]">
            Track divergent drafts and explore alternate storylines.
          </p>
        </div>
        <button className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground hover:bg-accent/90 transition-colors">
          <Plus className="h-3.5 w-3.5" />
          New branch
        </button>
      </div>

      {/* tree */}
      {main ? (
        <BranchTree main={main} childBranches={children} />
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <GitBranch className="mx-auto h-6 w-6 text-[var(--text-3)]" />
          <p className="mt-2 text-[13px] text-[var(--text-2)]">No branches yet.</p>
        </div>
      )}

      {/* merge placeholder */}
      <MergeViewPlaceholder branches={branches} />
    </div>
  );
}
