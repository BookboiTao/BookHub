"use client";

import { useEffect, useState } from "react";
import { RouterProvider, useRouter } from "@/components/bookhub/router";
import { AppShell } from "@/components/bookhub/app-shell";
import { MyBooksPage } from "@/components/bookhub/pages/my-books";
import { BookHomePage } from "@/components/bookhub/pages/book-home";
import { ChaptersPage } from "@/components/bookhub/pages/chapters";
import { WorldBiblePage } from "@/components/bookhub/pages/world-bible";
import { CastPage } from "@/components/bookhub/pages/cast";
import { BranchesPage } from "@/components/bookhub/pages/branches";
import { StatesPage } from "@/components/bookhub/pages/states";
import { TimelinePage } from "@/components/bookhub/pages/timeline";
import { AIStudioPage } from "@/components/bookhub/pages/ai-studio";
import { SettingsPage } from "@/components/bookhub/pages/settings";
import { DocsPage } from "@/components/bookhub/pages/docs";
import { WorkShopPage } from "@/components/bookhub/pages/workshop";
import { EditorPage } from "@/components/bookhub/editor-page";
import { createSupabaseBrowser } from "@/lib/supabase-browser";
import { Loader2 } from "lucide-react";

function CurrentView() {
  const { view } = useRouter();

  // Editor is full-screen — no AppShell
  if (view.name === "editor") {
    return <EditorPage bookId={view.bookId} chapterId={view.chapterId} />;
  }

  // Everything else is wrapped in AppShell
  return (
    <AppShell>
      {view.name === "library" && <MyBooksPage />}
      {view.name === "docs" && <DocsPage />}
      {view.name === "settings" && <SettingsPage />}
      {view.name === "book-home" && <BookHomePage bookId={view.bookId} />}
      {view.name === "workshop" && <WorkShopPage bookId={view.bookId} />}
      {view.name === "chapters" && <ChaptersPage bookId={view.bookId} />}
      {view.name === "world" && (
        <WorldBiblePage
          bookId={view.bookId}
          tab={view.tab}
          focusCardId={view.focusCardId}
        />
      )}
      {view.name === "cast" && (
        <CastPage bookId={view.bookId} focusCardId={view.focusCardId} />
      )}
      {view.name === "branches" && <BranchesPage bookId={view.bookId} />}
      {view.name === "states" && <StatesPage bookId={view.bookId} />}
      {view.name === "timeline" && <TimelinePage bookId={view.bookId} />}
      {view.name === "ai" && <AIStudioPage bookId={view.bookId} />}
    </AppShell>
  );
}

export default function Home() {
  const [authState, setAuthState] = useState<"loading" | "authed" | "redirecting">("loading");

  useEffect(() => {
    const supabase = createSupabaseBrowser();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        setAuthState("redirecting");
        window.location.href = "/login";
      } else {
        setAuthState("authed");
      }
    });

    // Listen for auth changes (logout etc.)
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        window.location.href = "/login";
      }
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  if (authState === "loading" || authState === "redirecting") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0c0c0e]">
        <Loader2 className="h-6 w-6 animate-spin text-[#6b6b75]" />
      </div>
    );
  }

  return (
    <RouterProvider>
      <CurrentView />
    </RouterProvider>
  );
}
