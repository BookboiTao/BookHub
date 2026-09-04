/* ------------------------------------------------------------------ *
 * data-client.ts — the client-side data layer.
 * Pure fetch functions to the API routes. No React, no caching —
 * that's handled by the StoreProvider hook on top.
 *
 * Same conceptual surface as the old mock store, now async + backed
 * by Supabase via the API routes.
 * ------------------------------------------------------------------ */

import type {
  Book,
  Branch,
  CanonStatus,
  CardLink,
  Chapter,
  ChapterState,
  GlossaryTerm,
  LoreCard,
  StoryEvent,
} from "@/lib/mock-data";

// ---- types (re-exported for component convenience) ----
export type {
  Book,
  Branch,
  CanonStatus,
  CardLink,
  Chapter,
  ChapterState,
  GlossaryTerm,
  LoreCard,
  StoryEvent,
};

// ---- error handling ----

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (res.status === 401) {
    // Redirect to login on 401 — handled in the SPA entry
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new ApiError(401, "Unauthorized");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(res.status, body.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

// ---- snake_case → camelCase mappers (DB → client) ----

function mapBook(b: Record<string, unknown>): Book {
  return {
    id: b.id as string,
    title: b.title as string,
    genre: b.genre as string | null,
    blurb: b.blurb as string | null,
    visibility: b.visibility as "public" | "private",
    coverAccent: b.cover_accent as string | undefined,
    starred: b.starred as boolean | undefined,
    worldSummaryTitle: b.world_summary_title as string | null,
    worldSummaryBody: b.world_summary_body as string | null,
    workshopNotes: b.workshop_notes as string ?? "",
    tags: b.tags as string[],
    createdAt: b.created_at as string,
    updatedAt: b.updated_at as string,
    // legacy mock fields — derived or null
    author: "",
    synopsis: b.blurb as string ?? "",
    description: "",
    progress: 0,
    totalWords: 0,
    chapterCount: 0,
    branchCount: 0,
    updated: b.updated_at as string,
  } as Book;
}

function wordCount(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}

function mapChapter(c: Record<string, unknown>): Chapter {
  const content = (c.content as string) ?? "";
  return {
    id: c.id as string,
    bookId: c.book_id as string,
    branchId: c.branch_id as string | null,
    number: (c.sort_order as number) + 1,
    title: c.title as string,
    status: c.status as "draft" | "revision" | "done",
    content,
    words: wordCount(content),
    updated: c.updated_at as string,
    sortOrder: c.sort_order as number,
    volumeId: c.volume_id as string | null,
  } as Chapter;
}

function mapCard(c: Record<string, unknown>): LoreCard {
  return {
    id: c.id as string,
    bookId: c.book_id as string,
    zoneId: c.zone_id as string | undefined,
    category: c.category as LoreCard["category"],
    title: c.title as string,
    summary: c.summary as string,
    body: c.body as string,
    status: c.canon_status as LoreCard["status"],
    x: c.x as number,
    y: c.y as number,
    sortOrder: c.sort_order as number | undefined,
    tags: c.tags as string[],
    fields: c.fields as { label: string; value: string }[],
    characterData: c.character_data as Record<string, unknown> | undefined,
  } as LoreCard;
}

function mapLink(l: Record<string, unknown>): CardLink {
  return {
    id: l.id as string,
    source: l.from_card_id as string,
    target: l.to_card_id as string,
    label: l.label as string | undefined,
  } as CardLink;
}

function mapGlossary(g: Record<string, unknown>): GlossaryTerm {
  return {
    id: g.id as string,
    bookId: g.book_id as string,
    term: g.term as string,
    definition: g.definition as string,
    relatedCardId: g.related_card_id as string | undefined,
    firstUseChapterId: g.first_use_chapter_id as string | undefined,
  } as GlossaryTerm;
}

function mapState(s: Record<string, unknown>): ChapterState {
  const state = s.state as Record<string, unknown>;
  return {
    id: s.id as string,
    bookId: s.book_id as string,
    chapterId: s.chapter_id as string,
    label: state?.label as string ?? "",
    location: state?.location as string ?? "",
    present: state?.present as string[] ?? [],
    knowledge: state?.knowledge as { who: string; knows: string }[] ?? [],
    items: state?.items as string[] ?? [],
    activeThreads: state?.activeThreads as string[] ?? [],
    notes: s.notes as string | undefined,
  } as ChapterState;
}

function mapEvent(e: Record<string, unknown>): StoryEvent {
  return {
    id: e.id as string,
    bookId: e.book_id as string,
    order: e.sort_order as number,
    title: e.title as string,
    chapterId: e.chapter_id as string | undefined,
    stateId: e.state_id as string | undefined,
    summary: e.description as string ?? "",
    timestamp: "",
  } as StoryEvent;
}

function mapBranch(b: Record<string, unknown>): Branch {
  return {
    id: b.id as string,
    bookId: b.book_id as string,
    name: b.name as string,
    isMain: b.is_default as boolean,
    parentId: null,
    ahead: 0,
    behind: 0,
    lastDraft: "",
    chapterCount: 0,
  } as Branch;
}

// ---- BOOKS ----

export async function getBooks(): Promise<Book[]> {
  const data = await fetchJson<{ books: Record<string, unknown>[] }>("/api/books");
  return data.books.map(mapBook);
}

export async function getBook(id: string): Promise<Book | null> {
  try {
    const data = await fetchJson<{ book: Record<string, unknown> }>(`/api/books/${id}`);
    return mapBook(data.book);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function createBook(input: {
  title: string;
  genre?: string;
  blurb?: string;
  visibility?: "public" | "private";
  tags?: string[];
}): Promise<Book> {
  const data = await fetchJson<{ book: Record<string, unknown> }>("/api/books", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapBook(data.book);
}

export async function updateBook(id: string, updates: Partial<{
  title: string;
  genre: string | null;
  blurb: string | null;
  visibility: "public" | "private";
  worldSummaryTitle: string | null;
  worldSummaryBody: string | null;
  workshopNotes: string;
  tags: string[];
}>): Promise<Book> {
  const data = await fetchJson<{ book: Record<string, unknown> }>(`/api/books/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  return mapBook(data.book);
}

export async function deleteBook(id: string): Promise<void> {
  await fetchJson(`/api/books/${id}`, { method: "DELETE" });
}

// ---- CHAPTERS ----

export async function getChapters(bookId: string): Promise<Chapter[]> {
  const data = await fetchJson<{ chapters: Record<string, unknown>[] }>(`/api/books/${bookId}/chapters`);
  return data.chapters.map(mapChapter);
}

export async function createChapter(bookId: string, input: {
  title: string;
  sortOrder?: number;
  status?: "draft" | "revision" | "done";
  content?: string;
  branchId?: string | null;
}): Promise<Chapter> {
  const data = await fetchJson<{ chapter: Record<string, unknown> }>(`/api/books/${bookId}/chapters`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapChapter(data.chapter);
}

export async function updateChapter(id: string, updates: Partial<{
  title: string;
  status: "draft" | "revision" | "done";
  content: string;
  sortOrder: number;
  branchId: string | null;
}>): Promise<Chapter> {
  const data = await fetchJson<{ chapter: Record<string, unknown> }>(`/api/chapters/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  return mapChapter(data.chapter);
}

export async function deleteChapter(id: string): Promise<void> {
  await fetchJson(`/api/chapters/${id}`, { method: "DELETE" });
}

export async function reorderChapters(bookId: string, order: { id: string; sortOrder: number }[]): Promise<void> {
  await fetchJson(`/api/books/${bookId}/chapters/reorder`, {
    method: "POST",
    body: JSON.stringify({ order }),
  });
}

// ---- DRAFTS ----

export type Draft = {
  id: string;
  chapterId: string;
  content: string;
  message: string;
  why: string | null;
  hash: string | null;
  isMain: boolean;
  wordCount: number;
  createdAt: string;
};

export async function getDrafts(chapterId: string): Promise<Draft[]> {
  const data = await fetchJson<{ drafts: Record<string, unknown>[] }>(`/api/chapters/${chapterId}/drafts`);
  return data.drafts.map((d) => ({
    id: d.id as string,
    chapterId: d.chapter_id as string,
    content: d.content as string,
    message: d.message as string,
    why: d.why as string | null,
    hash: d.hash as string | null,
    isMain: d.is_main as boolean,
    wordCount: d.word_count as number,
    createdAt: d.created_at as string,
  }));
}

export async function createDraft(chapterId: string, input: {
  content: string;
  message: string;
  why?: string | null;
  hash?: string;
  isMain: boolean;
  wordCount: number;
}): Promise<Draft> {
  const data = await fetchJson<{ draft: Record<string, unknown> }>(`/api/chapters/${chapterId}/drafts`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return data.draft as unknown as Draft;
}

export async function publishDraft(draftId: string): Promise<Draft> {
  const data = await fetchJson<{ draft: Record<string, unknown> }>(`/api/drafts/${draftId}`, {
    method: "PATCH",
    body: JSON.stringify({ isMain: true }),
  });
  return data.draft as unknown as Draft;
}

export async function deleteDraft(draftId: string): Promise<void> {
  await fetchJson(`/api/drafts/${draftId}`, { method: "DELETE" });
}

// ---- CARDS ----

export async function getCards(bookId: string, category?: string): Promise<LoreCard[]> {
  const url = category ? `/api/books/${bookId}/cards?category=${category}` : `/api/books/${bookId}/cards`;
  const data = await fetchJson<{ cards: Record<string, unknown>[] }>(url);
  return data.cards.map(mapCard);
}

export async function createCard(bookId: string, input: {
  category: LoreCard["category"];
  title: string;
  summary?: string;
  body?: string;
  canonStatus?: "canon" | "draft" | "deprecated";
  x?: number;
  y?: number;
  sortOrder?: number | null;
  tags?: string[];
  fields?: { label: string; value: string }[];
  characterData?: Record<string, unknown>;
  zoneId?: string | null;
}): Promise<LoreCard> {
  const data = await fetchJson<{ card: Record<string, unknown> }>(`/api/books/${bookId}/cards`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapCard(data.card);
}

export async function updateCard(id: string, updates: Partial<{
  title: string;
  summary: string;
  body: string;
  canonStatus: "canon" | "draft" | "deprecated";
  x: number;
  y: number;
  sortOrder: number | null;
  tags: string[];
  fields: { label: string; value: string }[];
  characterData: Record<string, unknown>;
  zoneId: string | null;
}>): Promise<LoreCard> {
  const data = await fetchJson<{ card: Record<string, unknown> }>(`/api/cards/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  return mapCard(data.card);
}

export async function deleteCard(id: string): Promise<void> {
  await fetchJson(`/api/cards/${id}`, { method: "DELETE" });
}

// ---- CARD LINKS ----

export async function getLinks(bookId: string): Promise<CardLink[]> {
  const data = await fetchJson<{ links: Record<string, unknown>[] }>(`/api/books/${bookId}/links`);
  return data.links.map(mapLink);
}

export async function createLink(bookId: string, input: {
  fromCardId: string;
  toCardId: string;
  label?: string;
}): Promise<CardLink> {
  const data = await fetchJson<{ link: Record<string, unknown> }>(`/api/books/${bookId}/links`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapLink(data.link);
}

export async function deleteLink(id: string): Promise<void> {
  await fetchJson(`/api/links/${id}`, { method: "DELETE" });
}

// ---- GLOSSARY ----

export async function getGlossaryTerms(bookId: string): Promise<GlossaryTerm[]> {
  const data = await fetchJson<{ terms: Record<string, unknown>[] }>(`/api/books/${bookId}/glossary`);
  return data.terms.map(mapGlossary);
}

export async function createGlossaryTerm(bookId: string, input: {
  term: string;
  definition?: string;
  relatedCardId?: string | null;
  firstUseChapterId?: string | null;
}): Promise<GlossaryTerm> {
  const data = await fetchJson<{ term: Record<string, unknown> }>(`/api/books/${bookId}/glossary`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapGlossary(data.term);
}

export async function updateGlossaryTerm(id: string, updates: Partial<{
  term: string;
  definition: string;
  relatedCardId: string | null;
  firstUseChapterId: string | null;
}>): Promise<GlossaryTerm> {
  const data = await fetchJson<{ term: Record<string, unknown> }>(`/api/glossary/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  return mapGlossary(data.term);
}

export async function deleteGlossaryTerm(id: string): Promise<void> {
  await fetchJson(`/api/glossary/${id}`, { method: "DELETE" });
}

// ---- CHAPTER STATES ----

export async function getStates(bookId: string): Promise<ChapterState[]> {
  const data = await fetchJson<{ states: Record<string, unknown>[] }>(`/api/books/${bookId}/states`);
  return data.states.map(mapState);
}

export async function createState(bookId: string, input: {
  chapterId: string;
  state: Record<string, unknown>;
  notes?: string | null;
}): Promise<ChapterState> {
  const data = await fetchJson<{ state: Record<string, unknown> }>(`/api/books/${bookId}/states`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapState(data.state);
}

export async function updateState(id: string, updates: Partial<{
  state: Record<string, unknown>;
  notes: string | null;
}>): Promise<ChapterState> {
  const data = await fetchJson<{ state: Record<string, unknown> }>(`/api/states/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  return mapState(data.state);
}

export async function deleteState(id: string): Promise<void> {
  await fetchJson(`/api/states/${id}`, { method: "DELETE" });
}

// ---- STORY EVENTS ----

export async function getEvents(bookId: string): Promise<StoryEvent[]> {
  const data = await fetchJson<{ events: Record<string, unknown>[] }>(`/api/books/${bookId}/events`);
  return data.events.map(mapEvent);
}

export async function createEvent(bookId: string, input: {
  title: string;
  description?: string;
  sortOrder?: number;
  chapterId?: string | null;
  stateId?: string | null;
}): Promise<StoryEvent> {
  const data = await fetchJson<{ event: Record<string, unknown> }>(`/api/books/${bookId}/events`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapEvent(data.event);
}

export async function updateEvent(id: string, updates: Partial<{
  title: string;
  description: string | null;
  sortOrder: number;
  chapterId: string | null;
  stateId: string | null;
}>): Promise<StoryEvent> {
  const data = await fetchJson<{ event: Record<string, unknown> }>(`/api/events/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  return mapEvent(data.event);
}

export async function deleteEvent(id: string): Promise<void> {
  await fetchJson(`/api/events/${id}`, { method: "DELETE" });
}

// ---- BRANCHES ----

export async function getBranches(bookId: string): Promise<Branch[]> {
  const data = await fetchJson<{ branches: Record<string, unknown>[] }>(`/api/books/${bookId}/branches`);
  return data.branches.map(mapBranch);
}

export async function createBranch(bookId: string, input: {
  name: string;
  description?: string | null;
  isDefault?: boolean;
}): Promise<Branch> {
  const data = await fetchJson<{ branch: Record<string, unknown> }>(`/api/books/${bookId}/branches`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapBranch(data.branch);
}

export async function deleteBranch(id: string): Promise<void> {
  await fetchJson(`/api/branches/${id}`, { method: "DELETE" });
}

// ---- ZONES ----

export async function getZones(bookId: string) {
  const data = await fetchJson<{ zones: Record<string, unknown>[] }>(`/api/books/${bookId}/zones`);
  return data.zones ?? [];
}

// ---- BULK LOAD (replaces loadStore) ----

export async function loadAllData(bookId?: string) {
  if (!bookId) {
    const books = await getBooks();
    return { books, chapters: [], cards: [], links: [], glossaryTerms: [], states: [], events: [], branches: [] };
  }
  const [books, chapters, cards, links, glossaryTerms, states, events, branches] = await Promise.all([
    getBooks(),
    getChapters(bookId),
    getCards(bookId),
    getLinks(bookId),
    getGlossaryTerms(bookId),
    getStates(bookId),
    getEvents(bookId),
    getBranches(bookId),
  ]);
  return { books, chapters, cards, links, glossaryTerms, states, events, branches };
}

// ---- VOLUMES ----

export type Volume = {
  id: string;
  bookId: string;
  title: string;
  summary: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

function mapVolume(v: Record<string, unknown>): Volume {
  return {
    id: v.id as string,
    bookId: v.book_id as string,
    title: v.title as string,
    summary: v.summary as string | null,
    sortOrder: v.sort_order as number,
    createdAt: v.created_at as string,
    updatedAt: v.updated_at as string,
  };
}

export async function getVolumes(bookId: string): Promise<Volume[]> {
  const data = await fetchJson<{ volumes: Record<string, unknown>[] }>(`/api/books/${bookId}/volumes`);
  return data.volumes.map(mapVolume);
}

export async function createVolume(bookId: string, input: {
  title: string;
  summary?: string;
  sortOrder?: number;
}): Promise<Volume> {
  const data = await fetchJson<{ volume: Record<string, unknown> }>(`/api/books/${bookId}/volumes`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  return mapVolume(data.volume);
}

export async function updateVolume(id: string, updates: Partial<{
  title: string;
  summary: string | null;
  sortOrder: number;
}>): Promise<Volume> {
  const data = await fetchJson<{ volume: Record<string, unknown> }>(`/api/volumes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
  return mapVolume(data.volume);
}

export async function deleteVolume(id: string): Promise<void> {
  await fetchJson(`/api/volumes/${id}`, { method: "DELETE" });
}
