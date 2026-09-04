"use client";

import {
  Home,
  FileText,
  Globe,
  Users,
  GitBranch,
  Save,
  Calendar,
  Bot,
  Settings as SettingsIcon,
  Library,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Command,
  BookOpen,
  Lightbulb,
} from "lucide-react";
import { useRouter, activeSection, currentBookId, BIBLE_TABS, type View, type SectionId } from "./router";
import { useUI } from "@/lib/store";
import { useBook } from "@/lib/hooks";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ *
 * Nav config — extensible. Adding a section = one array entry.
 * ------------------------------------------------------------------ */

type NavLeaf = {
  id: SectionId;
  label: string;
  icon: typeof Home;
  view: (bookId: string) => View;
};

type NavParent = {
  id: SectionId;
  label: string;
  icon: typeof Home;
  children: { id: string; label: string; view: (bookId: string) => View }[];
};

type NavItem = NavLeaf | NavParent;

function isParent(i: NavItem): i is NavParent {
  return "children" in i;
}

const NAV: NavItem[] = [
  { id: "workshop", label: "WorkShop", icon: Lightbulb, view: (b) => ({ name: "workshop", bookId: b }) },
  { id: "home", label: "Home", icon: Home, view: (b) => ({ name: "book-home", bookId: b }) },
  { id: "chapters", label: "Chapters", icon: FileText, view: (b) => ({ name: "chapters", bookId: b }) },
  {
    id: "world",
    label: "World Bible",
    icon: Globe,
    children: [
      { id: "overview", label: "Overview", view: (b: string) => ({ name: "world", bookId: b }) },
      ...BIBLE_TABS.map((t) => ({
        id: t.id,
        label: t.label,
        view: (b: string): View => ({ name: "world", bookId: b, tab: t.id }),
      })),
    ],
  },
  { id: "cast", label: "Cast", icon: Users, view: (b) => ({ name: "cast", bookId: b }) },
  { id: "branches", label: "Branches", icon: GitBranch, view: (b) => ({ name: "branches", bookId: b }) },
  { id: "states", label: "States", icon: Save, view: (b) => ({ name: "states", bookId: b }) },
  { id: "timeline", label: "Timeline", icon: Calendar, view: (b) => ({ name: "timeline", bookId: b }) },
  { id: "ai", label: "AI Studio", icon: Bot, view: (b) => ({ name: "ai", bookId: b }) },
];

/* ------------------------------------------------------------------ *
 * Logo — clean open book, no git metaphor
 * ------------------------------------------------------------------ */
function Logo({ collapsed }: { collapsed: boolean }) {
  const { navigate } = useRouter();
  return (
    <button
      onClick={() => navigate({ name: "library" })}
      className="flex items-center gap-2.5"
      aria-label="BookHub"
    >
      <svg viewBox="0 0 32 32" fill="none" className="h-7 w-7 shrink-0 text-foreground" role="img" aria-label="BookHub">
        <path d="M16 7.5C14 6 11 5.5 7 6v15.5c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V6c-4-.5-7 0-9 1.5z" fill="currentColor" opacity="0.12" />
        <path d="M16 7.5C14 6 11 5.5 7 6v15.5c4-.5 7 0 9 1.5 2-1.5 5-2 9-1.5V6c-4-.5-7 0-9 1.5z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        <line x1="16" y1="8" x2="16" y2="23" stroke="currentColor" strokeWidth="1.6" />
      </svg>
      {!collapsed && (
        <span className="font-semibold text-[15px] tracking-tight text-foreground">BookHub</span>
      )}
    </button>
  );
}

/* ------------------------------------------------------------------ *
 * Sidebar
 * ------------------------------------------------------------------ */
function Sidebar() {
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const expandedSections = useUI((s) => s.expandedSections);
  const toggleSection = useUI((s) => s.toggleSection);
  const { view, navigate } = useRouter();
  const section = activeSection(view);
  const bookId = currentBookId(view);
  const { data: sidebarBook } = useBook(bookId);

  function leafClass(active: boolean) {
    return cn(
      "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
      active
        ? "bg-accent/10 text-accent"
        : "text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground",
      collapsed && "justify-center px-0",
    );
  }

  return (
    <aside
      className={cn(
        "flex shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200",
        collapsed ? "w-[56px]" : "w-[240px]",
      )}
    >
      {/* logo + collapse */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-sidebar-border px-3">
        <Logo collapsed={collapsed} />
        {!collapsed && (
          <button
            onClick={toggleSidebar}
            className="ml-auto rounded-md p-1.5 text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-foreground"
            aria-label="Collapse sidebar"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      {collapsed && (
        <div className="border-b border-sidebar-border p-2">
          <button
            onClick={toggleSidebar}
            className="flex w-full items-center justify-center rounded-md p-1.5 text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-foreground"
            aria-label="Expand sidebar"
          >
            <PanelLeftOpen className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* library + docs links (always visible) */}
      <div className="space-y-0.5 p-2">
        <button
          onClick={() => navigate({ name: "library" })}
          title={collapsed ? "My Books" : undefined}
          className={leafClass(section === "library")}
        >
          <Library className="h-4 w-4 shrink-0" />
          {!collapsed && <span>My Books</span>}
        </button>
        <button
          onClick={() => navigate({ name: "docs" })}
          title={collapsed ? "Docs" : undefined}
          className={leafClass(section === "docs")}
        >
          <BookOpen className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Docs</span>}
        </button>
      </div>

      {/* book sections — only when a book is open */}
      {bookId ? (
        <>
          {!collapsed && (
            <div className="px-4 pb-1 pt-2">
              <span className="text-[11px] font-medium uppercase tracking-wider text-[var(--text-3)]">
                {sidebarBook?.title ?? "Book"}
              </span>
            </div>
          )}
          <nav className="bh-scroll flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
            {NAV.map((item) => {
              if (isParent(item)) {
                const expanded = expandedSections[item.id] ?? true;
                const parentActive = section === item.id;
                if (collapsed) {
                  return (
                    <button
                      key={item.id}
                      onClick={() => toggleSidebar()}
                      title={item.label}
                      className={leafClass(parentActive)}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                    </button>
                  );
                }
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => toggleSection(item.id)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] font-medium transition-colors",
                        parentActive
                          ? "text-accent"
                          : "text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground",
                      )}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="flex-1 text-left">{item.label}</span>
                      {expanded ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-3)]" />
                      )}
                    </button>
                    {expanded && (
                      <div className="ml-4 mt-0.5 space-y-0.5 border-l border-sidebar-border pl-2">
                        {item.children.map((child) => {
                          const active =
                            section === item.id &&
                            view.name === "world" &&
                            ((child.id === "overview" && !(view as { tab?: string }).tab) ||
                              (view as { tab?: string }).tab === child.id);
                          return (
                            <button
                              key={child.id}
                              onClick={() => navigate(child.view(bookId))}
                              className={cn(
                                "flex w-full items-center rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                                active
                                  ? "bg-accent/10 text-accent"
                                  : "text-[var(--text-2)] hover:bg-[var(--surface-2)] hover:text-foreground",
                              )}
                            >
                              {child.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(item.view(bookId))}
                  title={collapsed ? item.label : undefined}
                  className={leafClass(section === item.id)}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </nav>
        </>
      ) : (
        <div className="flex-1" />
      )}

      {/* settings + profile */}
      <div className="shrink-0 space-y-0.5 border-t border-sidebar-border p-2">
        <button
          onClick={() => navigate({ name: "settings" })}
          title={collapsed ? "Settings" : undefined}
          className={leafClass(section === "settings")}
        >
          <SettingsIcon className="h-4 w-4 shrink-0" />
          {!collapsed && <span>Settings</span>}
        </button>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ *
 * Top bar — breadcrumb, search, actions
 * ------------------------------------------------------------------ */
function TopBar() {
  const { view, navigate } = useRouter();
  const bookId = currentBookId(view);
  const { data: bookData } = useBook(bookId);
  const book = bookId ? (bookData ?? null) : null;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-background px-4">
      {/* breadcrumb */}
      <nav className="flex items-center gap-1.5 text-[13px]">
        <button
          onClick={() => navigate({ name: "library" })}
          className="text-[var(--text-2)] hover:text-foreground transition-colors"
        >
          Library
        </button>
        {book && (
          <>
            <span className="text-[var(--text-3)]">/</span>
            <button
              onClick={() => navigate({ name: "book-home", bookId: book.id })}
              className={cn(
                "hover:text-foreground transition-colors",
                view.name === "book-home" ? "text-foreground" : "text-[var(--text-2)]",
              )}
            >
              {book.title}
            </button>
            {view.name !== "book-home" && (
              <>
                <span className="text-[var(--text-3)]">/</span>
                <span className="text-foreground capitalize">
                  {view.name === "world"
                    ? (view as { tab: string }).tab === "glossary"
                      ? "Glossary"
                      : (view as { tab: string }).tab === "magic"
                        ? "Magic Systems"
                        : (view as { tab: string }).tab === "bestiary"
                          ? "Bestiary"
                          : (view as { tab: string }).tab === "cosmology"
                            ? "Cosmology"
                            : (view as { tab: string }).tab === "geography"
                              ? "Geography"
                              : (view as { tab: string }).tab === "factions"
                                ? "Factions"
                                : (view as { tab: string }).tab === "history"
                                  ? "History"
                                  : (view as { tab: string }).tab
                    : view.name === "editor"
                      ? "Editor"
                      : view.name === "workshop"
                        ? "WorkShop"
                        : view.name}
                </span>
              </>
            )}
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        {/* command palette trigger */}
        <button
          className="flex h-8 items-center gap-2 rounded-md border border-border bg-card px-2.5 text-[13px] text-[var(--text-3)] hover:bg-[var(--surface-2)] hover:text-[var(--text-2)] transition-colors"
          onClick={() => {/* TODO: command palette */}}
        >
          <Search className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Search…</span>
          <kbd className="hidden items-center gap-0.5 rounded border border-border bg-background px-1 py-0.5 text-[10px] font-medium sm:flex">
            <Command className="h-2.5 w-2.5" />K
          </kbd>
        </button>

        {/* new book — only on the library page */}
        {view.name === "library" && (
          <button
            onClick={() => navigate({ name: "library" })}
            className="flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-[13px] font-medium text-accent-foreground hover:bg-accent/90 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">New</span>
          </button>
        )}
      </div>
    </header>
  );
}

/* ------------------------------------------------------------------ *
 * AppShell — wraps all non-editor views
 * ------------------------------------------------------------------ */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="bh-scroll flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Full-screen shell — for the editor (no sidebar, no top bar)
 * ------------------------------------------------------------------ */
export function FullScreenShell({ children }: { children: React.ReactNode }) {
  return <div className="flex h-screen overflow-hidden bg-background text-foreground">{children}</div>;
}
