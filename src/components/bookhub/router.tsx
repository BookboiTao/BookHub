"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

/* ------------------------------------------------------------------ *
 * BookHub SPA router — hash-based, single-route, full route tree.
 *
 * Routes:
 *   #/                                    My Books (library)
 *   #/settings                            Global settings
 *   #/b/:bookId                           Book Home (overview)
 *   #/b/:bookId/chapters                   Chapter list
 *   #/b/:bookId/world/:tab                 World Bible canvas
 *                                           tab: magic|cosmology|geography|factions|history|bestiary
 *   #/b/:bookId/cast                       Character relationship canvas
 *   #/b/:bookId/branches                   Branch tree + merge
 *   #/b/:bookId/states                     Chapter State manager
 *   #/b/:bookId/timeline                   Story chronology
 *   #/b/:bookId/ai                         AI Studio
 *   #/b/:bookId/chapter/:chapterId/edit    Chapter editor (legacy route, kept)
 * ------------------------------------------------------------------ */

export type BibleTab =
  | "magic"
  | "cosmology"
  | "geography"
  | "factions"
  | "history"
  | "bestiary"
  | "glossary";

export type View =
  | { name: "library" }
  | { name: "docs" }
  | { name: "settings" }
  | { name: "workshop"; bookId: string }
  | { name: "book-home"; bookId: string }
  | { name: "chapters"; bookId: string }
  | { name: "world"; bookId: string; tab?: BibleTab; focusCardId?: string }
  | { name: "cast"; bookId: string; focusCardId?: string }
  | { name: "branches"; bookId: string }
  | { name: "states"; bookId: string }
  | { name: "timeline"; bookId: string }
  | { name: "ai"; bookId: string }
  | { name: "editor"; bookId: string; chapterId: string };

type RouterCtx = {
  view: View;
  navigate: (view: View) => void;
  back: () => void;
};

const Ctx = createContext<RouterCtx | null>(null);

export const BIBLE_TABS: { id: BibleTab; label: string }[] = [
  { id: "magic", label: "Magic Systems" },
  { id: "cosmology", label: "Cosmology" },
  { id: "geography", label: "Geography" },
  { id: "factions", label: "Factions" },
  { id: "history", label: "History" },
  { id: "bestiary", label: "Bestiary" },
  { id: "glossary", label: "Glossary" },
];

export function isBibleTab(s: string): s is BibleTab {
  return ["magic", "cosmology", "geography", "factions", "history", "bestiary", "glossary"].includes(s);
}

function parseHash(): View {
  if (typeof window === "undefined") return { name: "library" };
  const [pathPart, queryPart] = window.location.hash.replace(/^#\/?/, "").split("?");
  const parts = pathPart.split("/").filter(Boolean);
  const query = new URLSearchParams(queryPart ?? "");

  if (parts.length === 0) return { name: "library" };

  if (parts[0] === "settings") return { name: "settings" };
  if (parts[0] === "docs") return { name: "docs" };

  if (parts[0] === "b" && parts[1]) {
    const bookId = parts[1];

    if (parts[2] === "chapter" && parts[3] && parts[4] === "edit") {
      return { name: "editor", bookId, chapterId: parts[3] };
    }
    if (parts[2] === "workshop") return { name: "workshop", bookId };
    if (parts[2] === "chapters") return { name: "chapters", bookId };
    if (parts[2] === "world") {
      if (parts[3] && isBibleTab(parts[3])) {
        return { name: "world", bookId, tab: parts[3], focusCardId: query.get("focus") ?? undefined };
      }
      return { name: "world", bookId };
    }
    if (parts[2] === "cast") return { name: "cast", bookId, focusCardId: query.get("focus") ?? undefined };
    if (parts[2] === "branches") return { name: "branches", bookId };
    if (parts[2] === "states") return { name: "states", bookId };
    if (parts[2] === "timeline") return { name: "timeline", bookId };
    if (parts[2] === "ai") return { name: "ai", bookId };

    return { name: "book-home", bookId };
  }

  return { name: "library" };
}

function viewToHash(v: View): string {
  switch (v.name) {
    case "library":
      return "#/";
    case "settings":
      return "#/settings";
    case "docs":
      return "#/docs";
    case "book-home":
      return `#/b/${v.bookId}`;
    case "workshop":
      return `#/b/${v.bookId}/workshop`;
    case "chapters":
      return `#/b/${v.bookId}/chapters`;
    case "world": {
      if (!v.tab) return `#/b/${v.bookId}/world`;
      const qs = v.focusCardId ? `?focus=${v.focusCardId}` : "";
      return `#/b/${v.bookId}/world/${v.tab}${qs}`;
    }
    case "cast":
      return v.focusCardId ? `#/b/${v.bookId}/cast?focus=${v.focusCardId}` : `#/b/${v.bookId}/cast`;
    case "branches":
      return `#/b/${v.bookId}/branches`;
    case "states":
      return `#/b/${v.bookId}/states`;
    case "timeline":
      return `#/b/${v.bookId}/timeline`;
    case "ai":
      return `#/b/${v.bookId}/ai`;
    case "editor":
      return `#/b/${v.bookId}/chapter/${v.chapterId}/edit`;
  }
}

export function RouterProvider({ children }: { children: React.ReactNode }) {
  const [view, setView] = useState<View>(() => parseHash());

  useEffect(() => {
    const onHash = () => setView(parseHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const navigate = useCallback((next: View) => {
    const hash = viewToHash(next);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
    }
    setView(next);
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  }, []);

  const back = useCallback(() => window.history.back(), []);

  return <Ctx.Provider value={{ view, navigate, back }}>{children}</Ctx.Provider>;
}

export function useRouter() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useRouter must be used inside <RouterProvider>");
  return ctx;
}

/* ------------------------------------------------------------------ *
 * Helpers — determine the active "section" for sidebar highlighting
 * ------------------------------------------------------------------ */
export type SectionId =
  | "library"
  | "docs"
  | "workshop"
  | "home"
  | "chapters"
  | "world"
  | "cast"
  | "branches"
  | "states"
  | "timeline"
  | "ai"
  | "settings";

export function activeSection(view: View): SectionId | null {
  switch (view.name) {
    case "library":
      return "library";
    case "docs":
      return "docs";
    case "settings":
      return "settings";
    case "book-home":
      return "home";
    case "workshop":
      return "workshop";
    case "chapters":
      return "chapters";
    case "world":
      return "world";
    case "cast":
      return "cast";
    case "branches":
      return "branches";
    case "states":
      return "states";
    case "timeline":
      return "timeline";
    case "ai":
      return "ai";
    case "editor":
      return "chapters"; /* editor lives under chapters */
  }
}

export function currentBookId(view: View): string | null {
  if ("bookId" in view) return view.bookId;
  return null;
}
