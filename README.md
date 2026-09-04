# BookHub

*In the glow of a single, patient screen,*
*A cosmos takes shape in the quiet dark.*
*Each flicker of thought, a world yet unseen,*
*Born from the careful shaping of a mark.*

---

A personal writing workspace — chapters, drafts, a world-bible canvas, character sheets, glossary, and AI-assisted worldbuilding, all in one dark, distraction-free app.

## Tech Stack
- **Framework**: Next.js 16 (App Router, Turbopack)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Database**: Supabase Postgres (RLS-enforced per-user isolation)
- **Auth**: Supabase Auth (`@supabase/ssr`)
- **Canvas**: React Flow v12 (`@xyflow/react`)
- **AI**: z.ai GLM-4-Flash (via `z-ai-web-dev-sdk`)
- **Data fetching**: TanStack Query + custom API routes

## Features

### Library
- Book grid with cover colors, genre, progress, visibility
- New Book modal with title, genre, synopsis, cover color
- Delete book (permanently removes all data)

### WorkShop (incubator)
- Raw notes panel (unstructured brainstorming, auto-saved)
- AI chat that sees your notes + existing World Bible
- Extract entities → structured card candidates with category assignment
- Auto-create card_links between extracted entities
- "Brainstorm with AI" button sends notes to chat

### Chapters
- Drag-to-reorder (affects chapter numbers)
- Volume grouping (create, delete, assign chapters to volumes)
- New Chapter modal with title input
- Delete chapter with confirmation

### Chapter Editor (3-pane)
- **Left rail**: chapter list, ⌘K jump palette, +New chapter, Ctrl+N shortcut
- **Center**: serif prose editor, autosave, @mention character stubs, !glossary! terms
- **Right panel**: 4 tabs — Lore / Drafts / Tools / AI
  - Lore: @mentioned character cards, State-after-Ch-N-1, search-to-pin Bible cards
  - Drafts: searchable history, Save Draft, Publish (main version), delete draft
  - Tools: crutch word panel, read-aloud, word count stats
  - AI: real chat with context (constitution + fingerprint + glossary + chapter prose + character sheets), Continue writing (ghost preview with Insert/Discard), guard flags
- **Keyboard**: ⌘S, ⌘⏎, ⌘K, ⌘., ⌘P, ⌘⇧R, ⌘N, Esc
- **Session memory**: AI chat clears when switching chapters

### World Bible (7 tabs)
- **World Overview**: editable summary, 7 category tiles with counts, minimap, orphan cards flag
- **Magic Systems / Geography / Factions**: FLOW/CANVAS toggle (auto top-down layout vs freeform), drag cards, bezier edges with arrowheads, right-side drawer (progressive disclosure), ⌘F search, AI dock
- **Cosmology**: Reading/Canvas toggle (inline-editable prose sections + Universal Laws rail vs graph)
- **History**: Timeline/Causal map toggle (horizontal era track with drag reorder vs React Flow)
- **Bestiary**: card grid with filter chips, search, Threat/Habitat fields
- **Glossary**: table view with inline edit, delete, AI dock, !term! syntax in editor

### Cast (sheets-first)
- List → Sheet → Map toggle
- Character sheet: identity, description, Arc (with helper text), Voice notes (with helper text), Knows/Doesn't know, relationships, Bible card links, knowledge-as-of-state
- Map: read-only React Flow with typed relationship edges (colored by type)

### Branches, States, Timeline, AI Studio
- **Branches**: tree view, merge placeholder
- **States**: collapsible structured state snapshots
- **Timeline**: vertical event list with chapter/state links
- **AI Studio**: Fingerprint (voice/pacing/tone/samples), Constitution (9 seed rules, toggle/edit/delete), Router (task→model), Usage (per-provider totals), Cut log + "Distill into rules"

### AI Infrastructure
- **Context builder**: layered assembly (constitution + fingerprint + glossary + world summary + scope-dependent slices, ~24k char budget)
- **Guard**: code-side enforcement (em-dashes, "suddenly", generic emotions, triads)
- **Cut log**: every discarded/inserted AI proposal logged
- **Providers**: z.ai GLM-4-Flash (default), extensible to Gemini/OpenRouter/Cloudflare

### Docs
- Keyboard shortcut cheat sheet (⌘K, ⌘S, ⌘⏎, ⌘., ⌘P, ⌘⇧R, ⌘N, ⌘F, Del)
- Full command reference with where-to-find descriptions

## Local Development

```bash
# 1. Set up environment
cp .env.example .env
# Fill in: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_USER_ID

# 2. Run SQL migrations
# Execute supabase/schema.sql, supabase/volumes.sql, supabase/ai-tables.sql in Supabase SQL Editor

# 3. Start dev server
bun install
bun run dev
```

Visit the app. Sign up or sign in. Create a book. Start writing.

## Deploy
- **Vercel**: stock Next.js App Router, set env vars, deploy
- **Cloudflare**: via OpenNext (requires Hyperdrive or Prisma Accelerate for DB connections)
- **Env vars**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_USER_ID`
- Signups can be toggled in Supabase Dashboard → Authentication → Providers → Email
- FICK

## Design System
- **Background**: `#0c0c0e` (void black)
- **Surface**: `#141417` (cards)
- **Border**: `#232328` (1px, everywhere)
- **Text**: `#f4f4f5` / `#9b9ba4` / `#6b6b75` (three tiers)
- **Accent**: `#818cf8` (indigo — active states, links, focus rings only)
- **Rules**: zero gradients, zero glow, zero shadow, 10px card radius, Geist sans for UI, serif for prose
- folk
