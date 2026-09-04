"use client";

import { useState } from "react";
import { Keyboard, X } from "lucide-react";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * DocsPage — keyboard cheat sheet + command reference.
 * ------------------------------------------------------------------ */

const SHORTCUTS = [
  { keys: ["⌘", "K"], context: "Editor", action: "Jump to chapter palette" },
  { keys: ["⌘", "S"], context: "Editor", action: "Save draft (opens WhyModal)" },
  { keys: ["⌘", "⏎"], context: "Editor", action: "Publish (marks as main version)" },
  { keys: ["⌘", "."], context: "Editor", action: "Toggle focus mode" },
  { keys: ["⌘", "P"], context: "Editor", action: "Toggle preview mode" },
  { keys: ["⌘", "⇧", "R"], context: "Editor", action: "Toggle read aloud" },
  { keys: ["⌘", "N"], context: "Editor", action: "New chapter" },
  { keys: ["Esc"], context: "Editor", action: "Exit focus/preview mode" },
  { keys: ["⌘", "F"], context: "World Bible", action: "Search across all cards" },
  { keys: ["Del"], context: "World Bible canvas", action: "Delete selected card" },
  { keys: ["Double-click"], context: "World Bible canvas", action: "Create new card at cursor" },
  { keys: ["Drag card edge"], context: "World Bible canvas", action: "Connect two cards" },
];

const COMMANDS = [
  { name: "New Book", where: "My Books → +New button", desc: "Create a new book project with title, genre, and visibility." },
  { name: "New Chapter", where: "Chapters page → New Chapter", desc: "Create a chapter in the current volume. Drag to reorder." },
  { name: "New Volume", where: "Chapters page → New Volume", desc: "Group chapters into volumes (e.g. Part 1, Part 2)." },
  { name: "New Card", where: "World Bible → + button or double-click", desc: "Create a lore card in the current Bible tab." },
  { name: "Tidy Layout", where: "World Bible → grid icon", desc: "Auto-arrange all cards in a 3-column grid." },
  { name: "@Mention", where: "Editor → type @CapitalName", desc: "Creates a character stub → navigates to Cast page to fill in details." },
  { name: "!Glossary!", where: "Editor → type !term!", desc: "Marks a word for the glossary. Closing ! triggers the save prompt." },
  { name: "AI Chat", where: "Editor → AI tab, or Bible → Bot icon", desc: "Talk to the AI about your world. It sees your cards, constitution, and glossary." },
  { name: "Continue Writing", where: "Editor → AI tab → Continue button", desc: "AI generates the next paragraphs. Preview → Insert or Discard." },
  { name: "Brainstorm Cards", where: "Bible tab → AiDock → Brainstorm", desc: "AI proposes new cards for the current tab. Create with one click." },
  { name: "Extract Entities", where: "WorkShop → Extract button", desc: "AI scans your raw notes + chat and extracts structured cards to dispatch to Bible tabs." },
  { name: "Guard Pass", where: "AI output (automatic)", desc: "Checks AI prose for em-dashes, 'suddenly', generic emotions, and other constitution violations." },
  { name: "Cut Log", where: "AI Studio → Fingerprint → Cut log", desc: "Every discarded/inserted AI proposal is logged. Distill into new rules." },
];

export function DocsPage() {
  const [showCheatSheet, setShowCheatSheet] = useState(false);

  return (
    <div className="mx-auto max-w-3xl p-6 sm:p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-foreground">Docs</h1>
        <p className="mt-1 text-sm text-[var(--text-2)]">
          Everything BookHub can do, and how to use it.
        </p>
      </div>

      {/* Command List tab */}
      <section>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--text-3)]">
            ⌨️ Command list
          </h2>
          <button
            onClick={() => setShowCheatSheet(true)}
            className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground"
          >
            <Keyboard className="h-3.5 w-3.5" />
            Cheat sheet
          </button>
        </div>

        {/* shortcuts table */}
        <div className="mb-8 overflow-hidden rounded-lg border border-border">
          <div className="grid grid-cols-[auto_1fr_1fr] gap-0 border-b border-border bg-[var(--surface-2)] px-4 py-2 text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
            <span>Shortcut</span>
            <span>Context</span>
            <span>Action</span>
          </div>
          {SHORTCUTS.map((s, i) => (
            <div
              key={i}
              className={cn(
                "grid grid-cols-[auto_1fr_1fr] items-center gap-4 px-4 py-2.5 text-sm",
                i > 0 && "border-t border-border",
              )}
            >
              <div className="flex items-center gap-1">
                {s.keys.map((k, j) => (
                  <kbd
                    key={j}
                    className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-2)]"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
              <span className="text-xs text-[var(--text-3)]">{s.context}</span>
              <span className="text-sm text-foreground">{s.action}</span>
            </div>
          ))}
        </div>

        {/* commands list */}
        <div className="space-y-2">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-[var(--text-3)]">
            Commands & features
          </h3>
          {COMMANDS.map((cmd, i) => (
            <div
              key={i}
              className={cn(
                "rounded-lg border border-border bg-card p-4",
                i > 0 && "",
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium text-foreground">{cmd.name}</span>
                <span className="text-[11px] text-[var(--text-3)]">{cmd.where}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--text-2)]">{cmd.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Cheat sheet overlay */}
      {showCheatSheet && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowCheatSheet(false)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-border bg-card p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Keyboard shortcuts</h2>
              <button
                onClick={() => setShowCheatSheet(false)}
                className="rounded-md p-1 text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              {SHORTCUTS.map((s, i) => (
                <div key={i} className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-[var(--text-2)]">{s.action}</span>
                  <div className="flex items-center gap-1">
                    {s.keys.map((k, j) => (
                      <kbd
                        key={j}
                        className="rounded border border-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-2)]"
                      >
                        {k}
                      </kbd>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
