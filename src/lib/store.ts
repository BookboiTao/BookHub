import { create } from "zustand";

/* ------------------------------------------------------------------ *
 * UI store — sidebar collapsed state + which sections are expanded.
 * Persisted to localStorage.
 * ------------------------------------------------------------------ */

interface UIState {
  sidebarCollapsed: boolean;
  expandedSections: Record<string, boolean>;
  toggleSidebar: () => void;
  setSidebar: (collapsed: boolean) => void;
  toggleSection: (id: string) => void;
  setSection: (id: string, open: boolean) => void;
}

const STORAGE_KEY = "bh-ui-v2";

function load(): Partial<UIState> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

const saved = load();

export const useUI = create<UIState>((set) => ({
  sidebarCollapsed: saved.sidebarCollapsed ?? false,
  expandedSections: saved.expandedSections ?? { world: true },

  toggleSidebar: () =>
    set((s) => {
      const next = { sidebarCollapsed: !s.sidebarCollapsed };
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ sidebarCollapsed: next.sidebarCollapsed, expandedSections: s.expandedSections }),
        );
      } catch {}
      return { sidebarCollapsed: next.sidebarCollapsed };
    }),

  setSidebar: (collapsed) =>
    set((s) => {
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ sidebarCollapsed, expandedSections: s.expandedSections }),
        );
      } catch {}
      return { sidebarCollapsed };
    }),

  toggleSection: (id) =>
    set((s) => {
      const expandedSections = { ...s.expandedSections, [id]: !s.expandedSections[id] };
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ sidebarCollapsed: s.sidebarCollapsed, expandedSections }),
        );
      } catch {}
      return { expandedSections };
    }),

  setSection: (id, open) =>
    set((s) => {
      const expandedSections = { ...s.expandedSections, [id]: open };
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ sidebarCollapsed: s.sidebarCollapsed, expandedSections }),
        );
      } catch {}
      return { expandedSections };
    }),
}));
