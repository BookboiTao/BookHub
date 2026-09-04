"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/data-client";

/* ------------------------------------------------------------------ *
 * Query keys — hierarchical for targeted invalidation.
 * ------------------------------------------------------------------ */
export const qk = {
  books: ["books"] as const,
  book: (id: string) => ["books", id] as const,
  chapters: (bookId: string) => ["books", bookId, "chapters"] as const,
  chapter: (id: string) => ["chapters", id] as const,
  drafts: (chapterId: string) => ["chapters", chapterId, "drafts"] as const,
  cards: (bookId: string) => ["books", bookId, "cards"] as const,
  cardsByCategory: (bookId: string, category: string) =>
    ["books", bookId, "cards", category] as const,
  links: (bookId: string) => ["books", bookId, "links"] as const,
  glossary: (bookId: string) => ["books", bookId, "glossary"] as const,
  states: (bookId: string) => ["books", bookId, "states"] as const,
  events: (bookId: string) => ["books", bookId, "events"] as const,
  branches: (bookId: string) => ["books", bookId, "branches"] as const,
  zones: (bookId: string) => ["books", bookId, "zones"] as const,
};

/* ------------------------------------------------------------------ *
 * BOOKS
 * ------------------------------------------------------------------ */
export function useBooks() {
  return useQuery({ queryKey: qk.books, queryFn: api.getBooks });
}

export function useBook(bookId: string | null) {
  return useQuery({
    queryKey: bookId ? qk.book(bookId) : ["books", "null"],
    queryFn: () => api.getBook(bookId!),
    enabled: !!bookId,
  });
}

export function useCreateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createBook,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.books }),
  });
}

export function useUpdateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof api.updateBook>[1] }) =>
      api.updateBook(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.books }),
  });
}

export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteBook,
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.books }),
  });
}

/* ------------------------------------------------------------------ *
 * CHAPTERS
 * ------------------------------------------------------------------ */
export function useChapters(bookId: string | null) {
  return useQuery({
    queryKey: bookId ? qk.chapters(bookId) : ["null"],
    queryFn: () => api.getChapters(bookId!),
    enabled: !!bookId,
  });
}

export function useCreateChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, input }: { bookId: string; input: Parameters<typeof api.createChapter>[1] }) =>
      api.createChapter(bookId, input),
    onSuccess: (_data, { bookId }) => qc.invalidateQueries({ queryKey: qk.chapters(bookId) }),
  });
}

export function useUpdateChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof api.updateChapter>[1] }) =>
      api.updateChapter(id, updates),
    onSuccess: (chapter) => qc.invalidateQueries({ queryKey: qk.chapters(chapter.bookId) }),
  });
}

export function useDeleteChapter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteChapter,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["books"] }),
  });
}

export function useReorderChapters() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, order }: { bookId: string; order: { id: string; sortOrder: number }[] }) =>
      api.reorderChapters(bookId, order),
    onSuccess: (_data, { bookId }) => qc.invalidateQueries({ queryKey: qk.chapters(bookId) }),
  });
}

/* ------------------------------------------------------------------ *
 * DRAFTS
 * ------------------------------------------------------------------ */
export function useDrafts(chapterId: string | null) {
  return useQuery({
    queryKey: chapterId ? qk.drafts(chapterId) : ["null"],
    queryFn: () => api.getDrafts(chapterId!),
    enabled: !!chapterId,
  });
}

export function useCreateDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ chapterId, input }: { chapterId: string; input: Parameters<typeof api.createDraft>[1] }) =>
      api.createDraft(chapterId, input),
    onSuccess: (_data, { chapterId }) => qc.invalidateQueries({ queryKey: qk.drafts(chapterId) }),
  });
}

export function usePublishDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.publishDraft,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chapters"] }),
  });
}

export function useDeleteDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteDraft,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["chapters"] }),
  });
}

/* ------------------------------------------------------------------ *
 * CARDS
 * ------------------------------------------------------------------ */
export function useCards(bookId: string | null) {
  return useQuery({
    queryKey: bookId ? qk.cards(bookId) : ["null"],
    queryFn: () => api.getCards(bookId!),
    enabled: !!bookId,
  });
}

export function useCreateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, input }: { bookId: string; input: Parameters<typeof api.createCard>[1] }) =>
      api.createCard(bookId, input),
    onSuccess: (_data, { bookId }) => qc.invalidateQueries({ queryKey: qk.cards(bookId) }),
  });
}

export function useUpdateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof api.updateCard>[1] }) =>
      api.updateCard(id, updates),
    onMutate: async ({ id, updates }) => {
      // Optimistically update the cards query cache so position changes
      // survive component remounts (key={bookId-tab})
      await qc.cancelQueries({ queryKey: ["books"] });
      const queries = qc.getQueriesData<{ cards: Record<string, unknown>[] }>({ queryKey: ["books"] });
      for (const [queryKey, data] of queries) {
        if (data?.cards) {
          qc.setQueryData(queryKey, {
            ...data,
            cards: data.cards.map((c: Record<string, unknown>) => {
              if (c.id === id) {
                return {
                  ...c,
                  ...(updates.title !== undefined && { title: updates.title }),
                  ...(updates.summary !== undefined && { summary: updates.summary }),
                  ...(updates.body !== undefined && { body: updates.body }),
                  ...(updates.canonStatus !== undefined && { canon_status: updates.canonStatus }),
                  ...(updates.x !== undefined && { x: updates.x }),
                  ...(updates.y !== undefined && { y: updates.y }),
                  ...(updates.tags !== undefined && { tags: updates.tags }),
                  ...(updates.fields !== undefined && { fields: updates.fields }),
                  ...(updates.sortOrder !== undefined && { sort_order: updates.sortOrder }),
                };
              }
              return c;
            }),
          });
        }
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["books"] }),
  });
}

export function useDeleteCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteCard,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["books"] }),
  });
}

/* ------------------------------------------------------------------ *
 * LINKS
 * ------------------------------------------------------------------ */
export function useLinks(bookId: string | null) {
  return useQuery({
    queryKey: bookId ? qk.links(bookId) : ["null"],
    queryFn: () => api.getLinks(bookId!),
    enabled: !!bookId,
  });
}

export function useCreateLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, input }: { bookId: string; input: Parameters<typeof api.createLink>[1] }) =>
      api.createLink(bookId, input),
    onSuccess: (_data, { bookId }) => qc.invalidateQueries({ queryKey: qk.links(bookId) }),
  });
}

export function useDeleteLink() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteLink,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["books"] }),
  });
}

/* ------------------------------------------------------------------ *
 * GLOSSARY
 * ------------------------------------------------------------------ */
export function useGlossaryTerms(bookId: string | null) {
  return useQuery({
    queryKey: bookId ? qk.glossary(bookId) : ["null"],
    queryFn: () => api.getGlossaryTerms(bookId!),
    enabled: !!bookId,
  });
}

export function useCreateGlossaryTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, input }: { bookId: string; input: Parameters<typeof api.createGlossaryTerm>[1] }) =>
      api.createGlossaryTerm(bookId, input),
    onSuccess: (_data, { bookId }) => qc.invalidateQueries({ queryKey: qk.glossary(bookId) }),
  });
}

export function useDeleteGlossaryTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteGlossaryTerm,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["books"] }),
  });
}

export function useUpdateGlossaryTerm() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof api.updateGlossaryTerm>[1] }) =>
      api.updateGlossaryTerm(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["books"] }),
  });
}

/* ------------------------------------------------------------------ *
 * STATES
 * ------------------------------------------------------------------ */
export function useStates(bookId: string | null) {
  return useQuery({
    queryKey: bookId ? qk.states(bookId) : ["null"],
    queryFn: () => api.getStates(bookId!),
    enabled: !!bookId,
  });
}

/* ------------------------------------------------------------------ *
 * EVENTS
 * ------------------------------------------------------------------ */
export function useEvents(bookId: string | null) {
  return useQuery({
    queryKey: bookId ? qk.events(bookId) : ["null"],
    queryFn: () => api.getEvents(bookId!),
    enabled: !!bookId,
  });
}

/* ------------------------------------------------------------------ *
 * BRANCHES
 * ------------------------------------------------------------------ */
export function useBranches(bookId: string | null) {
  return useQuery({
    queryKey: bookId ? qk.branches(bookId) : ["null"],
    queryFn: () => api.getBranches(bookId!),
    enabled: !!bookId,
  });
}

/* ------------------------------------------------------------------ *
 * ZONES
 * ------------------------------------------------------------------ */
export function useZones(bookId: string | null) {
  return useQuery({
    queryKey: bookId ? qk.zones(bookId) : ["null"],
    queryFn: () => api.getZones(bookId!),
    enabled: !!bookId,
  });
}

/* ------------------------------------------------------------------ *
 * BULK LOAD — replaces loadStore() for components that need everything
 * for a single book (world-bible, editor, cast).
 * ------------------------------------------------------------------ */
export function useBookData(bookId: string | null) {
  const books = useBooks();
  const chapters = useChapters(bookId);
  const cards = useCards(bookId);
  const links = useLinks(bookId);
  const glossary = useGlossaryTerms(bookId);
  const states = useStates(bookId);
  const events = useEvents(bookId);
  const branches = useBranches(bookId);

  const loading =
    books.isLoading ||
    (bookId ? (chapters.isLoading || cards.isLoading || links.isLoading) : false);

  const error =
    books.error ?? chapters.error ?? cards.error ?? links.error ?? glossary.error ?? states.error ?? events.error ?? branches.error;

  return {
    books: books.data ?? [],
    chapters: chapters.data ?? [],
    cards: cards.data ?? [],
    links: links.data ?? [],
    glossaryTerms: glossary.data ?? [],
    states: states.data ?? [],
    events: events.data ?? [],
    branches: branches.data ?? [],
    loading,
    error,
  };
}

/* ------------------------------------------------------------------ *
 * Loading skeleton helper
 * ------------------------------------------------------------------ */
export function LoadingSpinner() {
  return (
    <div className="flex h-full items-center justify-center p-12">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#232328] border-t-[#818cf8]" />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * VOLUMES
 * ------------------------------------------------------------------ */
export const volumeKeys = {
  all: (bookId: string) => ["books", bookId, "volumes"] as const,
};

export function useVolumes(bookId: string | null) {
  return useQuery({
    queryKey: bookId ? volumeKeys.all(bookId) : ["null"],
    queryFn: () => api.getVolumes(bookId!),
    enabled: !!bookId,
  });
}

export function useCreateVolume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookId, input }: { bookId: string; input: Parameters<typeof api.createVolume>[1] }) =>
      api.createVolume(bookId, input),
    onSuccess: (_data, { bookId }) => qc.invalidateQueries({ queryKey: volumeKeys.all(bookId) }),
  });
}

export function useUpdateVolume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Parameters<typeof api.updateVolume>[1] }) =>
      api.updateVolume(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["books"] }),
  });
}

export function useDeleteVolume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteVolume,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["books"] }),
  });
}
