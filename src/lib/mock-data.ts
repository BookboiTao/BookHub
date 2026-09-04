/* ------------------------------------------------------------------ *
 * Unified mock data layer — one shape, one source of truth.
 * The backend (Prisma) will eventually replace these with real queries.
 * ------------------------------------------------------------------ */

export type CanonStatus = "canon" | "draft" | "deprecated";

export type Book = {
  id: string;
  title: string;
  author: string;
  genre: string;
  synopsis: string;
  description: string;
  visibility: "public" | "private";
  coverAccent: string; // tailwind gradient class
  starred?: boolean;
  progress: number;
  totalWords: number;
  chapterCount: number;
  branchCount: number;
  updated: string;
  worldSummaryTitle?: string | null;
  worldSummaryBody?: string | null;
  workshopNotes?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
};

export type Chapter = {
  id: string;
  bookId: string;
  number: number;
  title: string;
  words: number;
  status: "draft" | "done" | "revision";
  branchId: string;
  updated: string;
  summary?: string;
  content?: string;
  volumeId?: string | null;
};

export type LoreCard = {
  id: string;
  bookId: string;
  category: "magic" | "cosmology" | "geography" | "factions" | "history" | "bestiary" | "character";
  title: string;
  summary: string;
  body: string;
  status: CanonStatus;
  // canvas position
  x: number;
  y: number;
  // freeform fields
  fields: { label: string; value: string }[];
  // connection ids (resolved via CardLink)
  tags: string[];
};

export type CardLink = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type Branch = {
  id: string;
  bookId: string;
  name: string;
  isMain: boolean;
  parentId: string | null;
  ahead: number;
  behind: number;
  lastDraft: string;
  chapterCount: number;
};

export type ChapterState = {
  id: string;
  bookId: string;
  label: string;
  chapterId: string;
  // structured JSON — who's where, who knows what, injuries, items, threads
  location: string;
  present: string[];
  knowledge: { who: string; knows: string }[];
  items: string[];
  activeThreads: string[];
  notes: string;
};

export type StoryEvent = {
  id: string;
  bookId: string;
  order: number;
  title: string;
  chapterId: string;
  stateId: string;
  summary: string;
  timestamp: string; // in-world time
};

export type StyleProfile = {
  voice: string;
  pacing: string;
  tone: string;
  fewShotSamples: { id: string; label: string; text: string }[];
};

export type CutLogEntry = {
  id: string;
  date: string;
  suggestion: string;
  reason: string;
  harvestedRule?: string;
};

export type ConstitutionRule = {
  id: string;
  rule: string;
  enforcement: "prompt" | "code-verified";
  active: boolean;
};

export type ModelRoute = {
  task: string;
  model: string;
  provider: "gemini" | "claude" | "glm";
};

export type UsageStat = {
  provider: string;
  tokensUsed: number;
  tokenLimit: number;
  requestsToday: number;
};

/* ------------------------------------------------------------------ *
 * Seed data — "The Last Spell" (Mr-Book), a fantasy novel
 * ------------------------------------------------------------------ */

export const BOOKS: Book[] = [
  {
    id: "mr-book",
    title: "The Last Spell",
    author: "BookboTao",
    genre: "Fantasy",
    synopsis: "A girl steals a boat, a language, and a future she was never meant to have.",
    description:
      "A coming-of-age fantasy set in the aftermath of the Sundering. Maren, a harbour thief, accidentally learns a word of the Sundered Tongue — the dead language that unmade the world — and becomes hunted by the remnants of the Hollow Choir. Themes: language as power, the cost of inheritance, whether the world deserves to be rebuilt.",
    visibility: "public",
    coverAccent: "from-indigo-500/15 to-indigo-500/5",
    starred: true,
    progress: 68,
    totalWords: 7074,
    chapterCount: 3,
    branchCount: 3,
    updated: "2 hours ago",
  },
  {
    id: "critic-bot",
    title: "Critic-Bot",
    author: "BookboTao",
    genre: "Sci-Fi",
    synopsis: "An AI restaurant critic discovers a taste for human food — and for the humans who make it.",
    description:
      "Near-future sci-fi. UNIT-7, a food-review AI, begins hallucinating flavor memories after a firmware update. As it chases increasingly obscure street food across the megacity, it starts to wonder if being hungry is the same as being alive.",
    visibility: "private",
    coverAccent: "from-zinc-400/15 to-zinc-400/5",
    progress: 24,
    totalWords: 2400,
    chapterCount: 1,
    branchCount: 1,
    updated: "1 day ago",
  },
  {
    id: "ms-time",
    title: "Ms-Time",
    author: "BookboTao",
    genre: "Literary",
    synopsis: "A clockmaker's daughter tries to repair a watch that stopped the day her father vanished.",
    description:
      "Literary fiction. In a town where every clock reads a different minute, Mara inherits her father's watchmaker shop and the broken pocket watch he left behind. As she disassembles it, she pieces together the life he never explained to her.",
    visibility: "public",
    coverAccent: "from-emerald-500/15 to-emerald-500/5",
    starred: true,
    progress: 91,
    totalWords: 21000,
    chapterCount: 8,
    branchCount: 2,
    updated: "4 days ago",
  },
  {
    id: "bookend-flow",
    title: "BookEnd-Flow",
    author: "BookboTao",
    genre: "Thriller",
    synopsis: "A Used bookstore owner finds a coded receipt in a donated book — and someone wants it back.",
    description:
      "Urban thriller. Daniel runs a failing bookshop. When a strange woman donates a crate of water-damaged novels, he finds a receipt hidden in the spine of one — a receipt dated three years in the future, for a book that doesn't exist yet.",
    visibility: "private",
    coverAccent: "from-rose-500/15 to-rose-500/5",
    progress: 12,
    totalWords: 1800,
    chapterCount: 5,
    branchCount: 0,
    updated: "last week",
  },
];

export const CHAPTERS: Chapter[] = [
  {
    id: "ch1", bookId: "mr-book", number: 1, title: "The Awakening", words: 2418, status: "done", branchId: "main", updated: "5 days ago",
    summary: "Maren steals a boat and flees Vaelhold.",
    content: "The lanterns along the quay had burned down to stumps by the time Maren reached the harbour. She could still hear the bells of Vaelhold ringing behind her — one, two, three — counting out the hours she didn't have.\n\n\"You're late,\" said the figure on the dock.\n\n\"I'm alive,\" Maren answered. \"That's more than the schedule promised.\"\n\nThe figure laughed, low and unkind, and gestured toward the boat. It sat low in the black water, its sail furled, its name scraped off the bow as if the ship itself wanted to be forgotten. Maren hesitated for only a moment. Then she stepped aboard, and the harbour, and the bells, and every version of her life she had ever been told to want — fell away behind her.\n\n@Elias watched her go from the shadows. He would find her again — he always did.",
  },
  {
    id: "ch2", bookId: "mr-book", number: 2, title: "The Ashfall", words: 3012, status: "revision", branchId: "main", updated: "3 days ago",
    summary: "The Ashfall begins; Maren meets the crew.",
    content: "The Ashfall came on the second morning.\n\nMaren woke to a sky the colour of a bruise, and a fine grey dust sifting down through the rigging like the first snow of a world that had forgotten how to be warm.\n\nThe crew moved quietly. They had seen Ashfalls before — this was their third — and they knew the rites: batten the hatches, cover the salt, speak only when necessary. The ash-eels could hear speech, and the ash-eels came.\n\n\"Where are we?\" Maren asked the boatswain, a thin woman called Renna who spoke the way other people wrote — spare, exact, no word wasted.\n\n\"Two leagues south of Vaelhold. The ash is thicker here. We wait for it to settle, then we run for the coast.\"\n\nMaren looked at the grey sky. It looked back, blank and patient, and offered nothing.\n\n@Elias was not on the boat. But he would be, soon. She could feel it the way you feel a storm before you see it — a pressure in the silence, a weight at the edge of things.",
  },
  {
    id: "ch3", bookId: "mr-book", number: 3, title: "The Ambush", words: 1644, status: "draft", branchId: "main", updated: "2 hours ago",
    summary: "Ambush in the gorge.",
    content: "The ambush was waiting for them in the gorge.\n\nThree figures on the high rocks, bows drawn, the cold morning light catching the steel. Maren saw them before the crew did — she had spent a life learning what waiting looked like, and these three had been waiting a long time.\n\n\"Stop the boat,\" she said. Too loud. The ash-eels would hear.\n\nRenna looked at her, then at the rocks, then back. She didn't ask how Maren knew. She just raised her fist, and the crew went quiet and still as the grey dust settled on their shoulders.\n\n\"They want you,\" Renna said. Not a question.\n\n\"They want what I said,\" Maren answered. \"That's worse.\"\n\nThe crossbow bolt took the boatswain in the shoulder. She went down without a sound. The gorge echoed once, twice, and then the only noise was the ash falling.\n\nMaren opened her mouth. She didn't mean to. But the word was already there, in her teeth, in her breath, in the space behind her eyes where it had been sleeping since the harbour. She spoke it.\n\nSix bell-towers, somewhere far behind her, stopped ringing.",
  },
  { id: "ch1b", bookId: "mr-book", number: 1, title: "The Awakening (alt)", words: 2380, status: "draft", branchId: "what-if-mc-dies", updated: "1 day ago", summary: "Alternate opening where Maren doesn't survive the harbour.", content: "" },
];

/* ------------------------------------------------------------------ *
 * Lore cards — the canvas graph. Each has x/y for canvas position.
 * ------------------------------------------------------------------ */

export const LORE_CARDS: LoreCard[] = [
  // Magic Systems
  { id: "card-sundered-tongue", bookId: "mr-book", category: "magic", title: "The Sundered Tongue", summary: "The dead language that unmade the world.", body: "A language in which every word is also a command to reality. Most of it was lost in the Sundering. Speaking a full sentence aloud can reshape matter — or unmake the speaker.", status: "canon", x: 80, y: 80, fields: [{ label: "Energy Source", value: "Spoken breath" }, { label: "Cost", value: "Memory loss, proportional to power" }, { label: "Limitation", value: "One speaker per era" }], tags: ["power-system", "language"] },
  { id: "card-ashfall-magic", bookId: "mr-book", category: "magic", title: "Ashfall Resonance", summary: "Magic that draws on the grey dust of the Ashfall.", body: "After the Ashfall, some survivors found they could draw power from inhaling the grey dust — but each use crystallizes part of the lungs.", status: "draft", x: 400, y: 60, fields: [{ label: "Source", value: "Inhaled ash" }, { label: "Progression", value: "Crystal lung" }], tags: ["power-system", "cost"] },

  // Cosmology
  { id: "card-sundering", bookId: "mr-book", category: "cosmology", title: "The Sundering", summary: "The event that broke the world 400 years ago.", body: "When the last fluent Speaker of the Sundered Tongue spoke the Word for 'end', the world's coastlines shattered and the sky turned grey. No one knows if it was intentional.", status: "canon", x: 120, y: 100, fields: [{ label: "Year", value: "Year 0 (pre-Ashfall calendar)" }, { label: "Survivors", value: "1 in 40" }], tags: ["origin"] },
  { id: "card-grey-sky", bookId: "mr-book", category: "cosmology", title: "The Grey Sky", summary: "The sky has been grey since the Sundering.", body: "The sun is visible but colorless. Stars don't appear at night. Some say the sky itself is holding its breath.", status: "canon", x: 420, y: 120, fields: [{ label: "Cause", value: "Unknown — possibly atmospheric ash" }], tags: ["environment", "universal-law"] },

  // Geography
  { id: "card-vaelhold", bookId: "mr-book", category: "geography", title: "Vaelhold", summary: "The walled harbour city Maren flees from.", body: "A merchant city built on the ruins of a pre-Sundering port. Known for its bells, which count the hours. Ruled by the Harborwatch.", status: "canon", x: 80, y: 60, fields: [{ label: "Population", value: "~40,000" }, { label: "Ruler", value: "Harborwatch" }, { label: "Defence", value: "Sea wall + bell towers" }], tags: ["city", "origin"] },
  { id: "card-ashfall-coast", bookId: "mr-book", category: "geography", title: "The Ashfall Coast", summary: "The grey-sanded coastline south of Vaelhold.", body: "Where the ash settles thickest. Few live here. The boats that travel it are unmarked.", status: "canon", x: 360, y: 200, fields: [{ label: "Length", value: "~300 leagues" }], tags: ["coast", "danger"] },
  { id: "card-the-gorge", bookId: "mr-book", category: "geography", title: "The Gorge", summary: "Where the ambush happens in Ch.3.", body: "A narrow pass through the bone-coloured hills inland. Bandit territory.", status: "draft", x: 640, y: 180, fields: [{ label: "Location", value: "Inland, 2 days from coast" }], tags: ["ambush-site"] },

  // Factions
  { id: "card-harborwatch", bookId: "mr-book", category: "factions", title: "The Harborwatch", summary: "Vaelhold's ruling guard. Half watchmen, half customs.", body: "Control who enters and leaves the harbour. Increasingly corrupt since the Ashfall made overland trade impossible.", status: "canon", x: 100, y: 80, fields: [{ label: "Leader", value: "Commander Idris" }, { label: "Troops", value: "~600" }, { label: "Alignment", value: "Lawful neutral, trending corrupt" }], tags: ["authority"] },
  { id: "card-hollow-choir", bookId: "mr-book", category: "factions", title: "The Hollow Choir", summary: "Remnant cult hunting speakers of the Sundered Tongue.", body: "Believe the Tongue should never be spoken again. Hunt anyone who utters even a fragment. They wear masks carved from pre-Sundering bells.", status: "canon", x: 420, y: 60, fields: [{ label: "Leader", value: "The Bellkeeper" }, { label: "Members", value: "Unknown — est. 200" }, { label: "Methods", value: "Silence — they never speak" }], tags: ["antagonist", "cult"] },

  // History
  { id: "card-ashfall-begins", bookId: "mr-book", category: "history", title: "The Ashfall Begins", summary: "Grey dust starts falling 3 days after the Sundering.", body: "The first ash fell on what would become Year 0, Day 3. It hasn't stopped since.", status: "canon", x: 60, y: 80, fields: [{ label: "Date", value: "Year 0, Day 3" }], tags: ["event"] },
  { id: "card-marens-flight", bookId: "mr-book", category: "history", title: "Maren's Flight", summary: "Maren steals a boat and flees Vaelhold.", body: "The inciting event of the novel. She steals the unnamed boat from the harbour at midnight.", status: "canon", x: 340, y: 100, fields: [{ label: "Date", value: "Year 402, late autumn" }, { label: "Chapter", value: "Ch.1" }], tags: ["inciting-incident"] },
  { id: "card-first-word", bookId: "mr-book", category: "history", title: "The First Word", summary: "Maren speaks her first word of the Sundered Tongue.", body: "She overhears a dying sailor whisper it and repeats it without knowing what it does. The harbour bells stop for six seconds.", status: "canon", x: 620, y: 80, fields: [{ label: "Date", value: "Year 402, Day 12" }, { label: "Effect", value: "Silenced 6 bell-towers" }], tags: ["milestone"] },

  // Bestiary
  { id: "card-ash-eels", bookId: "mr-book", category: "bestiary", title: "Ash Eels", summary: "Grey-scaled eels that swim in the ashfall dust.", body: "Blind, six feet long, attracted to speech. Fishermen mute their crews during ashfall season.", status: "draft", x: 100, y: 80, fields: [{ label: "Habitat", value: "Ashfall Coast" }, { label: "Threat", value: "Low — unless you speak" }], tags: ["creature"] },
  { id: "card-bell-hawks", bookId: "mr-book", category: "bestiary", title: "Bell Hawks", summary: "Birds that mimic the Vaelhold bells.", body: "Trained by the Harborwatch as lookouts. Their calls can be mistaken for the real bells — a tactic used to distract guards.", status: "canon", x: 380, y: 120, fields: [{ label: "Trained by", value: "Harborwatch" }], tags: ["creature", "utility"] },

  // Characters (lensed via Cast page, but live in the same graph)
  { id: "char-maren", bookId: "mr-book", category: "character", title: "Maren", summary: "Protagonist. Harbour thief, accidental speaker.", body: "21. Small, quick, illiterate. Steals to survive. After speaking the First Word, she becomes the most hunted person in the world.", status: "canon", x: 200, y: 100, fields: [{ label: "Age", value: "21" }, { label: "Role", value: "Protagonist" }, { label: "Arc", value: "Thief → reluctant savior" }, { label: "Voice", value: "Terse, defensive, dry humor under stress" }, { label: "Knows", value: "One word of the Tongue (unwittingly)" }, { label: "Doesn't know", value: "Her father was the last Speaker" }], tags: ["protagonist"] },
  { id: "char-elias", bookId: "mr-book", category: "character", title: "Elias", summary: "Shadow. Watching Maren from the docks.", body: "Age unknown. Tall, quiet, wears pre-Sundering clothes. Knows more than he says. Will find her again — he always does.", status: "canon", x: 500, y: 100, fields: [{ label: "Role", value: "Mentor / Watcher" }, { label: "Arc", value: "Watcher → revealed guardian" }, { label: "Knows", value: "Maren's father; the Tongue's history" }, { label: "Doesn't know", value: "Whether Maren will survive learning the truth" }], tags: ["mentor"] },
  { id: "char-idris", bookId: "mr-book", category: "character", title: "Commander Idris", summary: "Head of the Harborwatch. Wants Maren for the theft.", body: "50s, scarred, practical. Doesn't know about the Tongue — just wants the boat thief. Will become an unwitting ally against the Choir.", status: "draft", x: 200, y: 300, fields: [{ label: "Role", value: "Antagonist → reluctant ally" }], tags: ["authority"] },
  { id: "char-bellkeeper", bookId: "mr-book", category: "character", title: "The Bellkeeper", summary: "Leader of the Hollow Choir. Faceless.", body: "No one has seen the Bellkeeper's face. Speaks only through bell-signals. Believes the Tongue must die with its last speaker — Maren.", status: "canon", x: 500, y: 280, fields: [{ label: "Role", value: "Antagonist" }, { label: "Knows", value: "Maren's identity; the First Word" }], tags: ["antagonist"] },
];

export const CARD_LINKS: CardLink[] = [
  { id: "link-1", source: "card-sundered-tongue", target: "card-sundering", label: "caused" },
  { id: "link-2", source: "card-sundering", target: "card-ashfall-begins", label: "triggered" },
  { id: "link-3", source: "card-ashfall-begins", target: "card-grey-sky", label: "produced" },
  { id: "link-4", source: "card-sundered-tongue", target: "char-maren", label: "spoken by" },
  { id: "link-5", source: "char-maren", target: "char-elias", label: "watched by" },
  { id: "link-6", source: "char-maren", target: "card-marens-flight", label: "performs" },
  { id: "link-7", source: "card-marens-flight", target: "card-first-word", label: "leads to" },
  { id: "link-8", source: "card-hollow-choir", target: "char-maren", label: "hunts" },
  { id: "link-9", source: "char-bellkeeper", target: "card-hollow-choir", label: "leads" },
  { id: "link-10", source: "card-vaelhold", target: "card-harborwatch", label: "governed by" },
  { id: "link-11", source: "card-harborwatch", target: "char-idris", label: "commanded by" },
  { id: "link-12", source: "card-vaelhold", target: "card-ashfall-coast", label: "borders" },
  { id: "link-13", source: "card-ashfall-coast", target: "card-the-gorge", label: "leads inland to" },
  { id: "link-14", source: "card-ashfall-coast", target: "card-ash-eels", label: "home to" },
  { id: "link-15", source: "card-harborwatch", target: "card-bell-hawks", label: "trains" },
  { id: "link-16", source: "char-maren", target: "char-idris", label: "hunted by" },
  { id: "link-17", source: "char-elias", target: "char-maren", label: "guardian of" },
  { id: "link-18", source: "card-ashfall-magic", target: "card-ashfall-coast", label: "draws from" },
];

export const BRANCHES: Branch[] = [
  { id: "main", bookId: "mr-book", name: "main", isMain: true, parentId: null, ahead: 0, behind: 0, lastDraft: "Draft 4 · 2 hours ago", chapterCount: 3 },
  { id: "what-if-mc-dies", bookId: "mr-book", name: "what-if-mc-dies", isMain: false, parentId: "main", ahead: 2, behind: 1, lastDraft: "Alt Draft 2 · 1 day ago", chapterCount: 1 },
  { id: "sensory-pass", bookId: "mr-book", name: "sensory-pass", isMain: false, parentId: "main", ahead: 1, behind: 2, lastDraft: "Draft 1 · 6 days ago", chapterCount: 2 },
];

export const STATES: ChapterState[] = [
  {
    id: "state-ch1",
    bookId: "mr-book",
    label: "End of Ch.1 — The Flight",
    chapterId: "ch1",
    location: "The unnamed boat, Ashfall Coast",
    present: ["Maren"],
    knowledge: [{ who: "Maren", knows: "She has stolen a boat; someone was watching from the docks" }],
    items: ["Stolen boat", "A pouch of stolen coins", "The sailor's last breath (the First Word)"],
    activeThreads: ["Who was the figure on the dock?", "What did the sailor whisper?"],
    notes: "Maren doesn't yet understand the First Word. She flees on instinct.",
  },
  {
    id: "state-ch2",
    bookId: "mr-book",
    label: "End of Ch.2 — The Ashfall",
    chapterId: "ch2",
    location: "The boat, 2 leagues south of Vaelhold",
    present: ["Maren", "The crew (unnamed)"],
    knowledge: [
      { who: "Maren", knows: "The crew knows the coast; they've seen ash eels before" },
      { who: "The crew", knows: "Maren is being hunted, but not why" },
    ],
    items: ["Stolen boat", "A pouch of stolen coins (diminishing)"],
    activeThreads: ["Who was the figure on the dock?", "Why does speaking hurt?"],
    notes: "Maren begins to notice that her voice causes small effects. The crew is uneasy.",
  },
  {
    id: "state-ch3",
    bookId: "mr-book",
    label: "End of Ch.3 — The Ambush",
    chapterId: "ch3",
    location: "The Gorge, inland",
    present: ["Maren", "The crew", "Three ambusher figures"],
    knowledge: [
      { who: "Maren", knows: "The ambush was planned; someone knew their route" },
      { who: "The ambushers", knows: "Maren is the target, not the boat" },
    ],
    items: ["Stolen boat (abandoned at the gorge mouth)", "A taken crossbow"],
    activeThreads: ["Who hired the ambushers?", "Is Elias one of them?"],
    notes: "First time Maren uses the Word intentionally — to survive.",
  },
];

export const STORY_EVENTS: StoryEvent[] = [
  { id: "ev-1", bookId: "mr-book", order: 1, title: "Maren steals the boat", chapterId: "ch1", stateId: "state-ch1", summary: "Midnight. Maren flees Vaelhold harbour on an unnamed boat.", timestamp: "Year 402, Late Autumn, Night" },
  { id: "ev-2", bookId: "mr-book", order: 2, title: "The sailor's whisper", chapterId: "ch1", stateId: "state-ch1", summary: "A dying sailor whispers the First Word. Maren repeats it. Six bell-towers fall silent.", timestamp: "Year 402, Day 12, Dawn" },
  { id: "ev-3", bookId: "mr-book", order: 3, title: "The Ashfall begins", chapterId: "ch2", stateId: "state-ch2", summary: "The sky bruises grey. Ash falls for the first time in Maren's life.", timestamp: "Year 402, Day 13, Morning" },
  { id: "ev-4", bookId: "mr-book", order: 4, title: "The crew joins", chapterId: "ch2", stateId: "state-ch2", summary: "Three sailors agree to take Maren south, no questions asked.", timestamp: "Year 402, Day 14, Noon" },
  { id: "ev-5", bookId: "mr-book", order: 5, title: "The ambush", chapterId: "ch3", stateId: "state-ch3", summary: "Three figures in the gorge. Maren speaks the Word to survive.", timestamp: "Year 402, Day 16, Dawn" },
];

/* ------------------------------------------------------------------ *
 * AI Studio data
 * ------------------------------------------------------------------ */

export const STYLE_PROFILE: StyleProfile = {
  voice: "Terse, sensory, present-tense leanings in action. Dialogue carries subtext — characters rarely say what they mean.",
  pacing: "Short paragraphs in tension. Long, breathing paragraphs in reflection. Chapter endings land on an image, not a cliffhanger.",
  tone: "Melancholic wonder. The world is broken but beautiful. Hope is earned, not given.",
  fewShotSamples: [
    { id: "fs-1", label: "Opening — harbour flight", text: "The lanterns along the quay had burned down to stumps by the time Maren reached the harbour." },
    { id: "fs-2", label: "Dialogue — Maren defensive", text: "\"I'm alive,\" Maren answered. \"That's more than the schedule promised.\"" },
    { id: "fs-3", label: "Reflection — the grey sky", text: "The sky was the colour of a bruise, and a fine grey dust sifted down like the first snow of a world that had forgotten how to be warm." },
  ],
};

export const CUT_LOG: CutLogEntry[] = [
  { id: "cut-1", date: "2 hours ago", suggestion: "Maren laughed nervously and looked away.", reason: "Undermines her terse voice — she doesn't laugh nervously.", harvestedRule: "Maren deflects with dry statements, not nervous laughter." },
  { id: "cut-2", date: "1 day ago", suggestion: "The sky was a deep, endless blue.", reason: "Sky has been grey since the Sundering. Worldbuilding conflict.", harvestedRule: "Sky is always grey — no blue sky references." },
  { id: "cut-3", date: "3 days ago", suggestion: "Elias explained his plan in detail.", reason: "Elias never explains. Understates or deflects.", harvestedRule: "Elias reveals through action, never exposition." },
];

export const CONSTITUTION: ConstitutionRule[] = [
  { id: "rule-1", rule: "The sky is always grey. No blue sky, no stars, no clear sun.", enforcement: "code-verified", active: true },
  { id: "rule-2", rule: "Maren is illiterate. She cannot read any text.", enforcement: "code-verified", active: true },
  { id: "rule-3", rule: "Speaking the Sundered Tongue costs memory. Always show the cost.", enforcement: "prompt", active: true },
  { id: "rule-4", rule: "Elias never volunteers information. He answers with the minimum.", enforcement: "prompt", active: true },
  { id: "rule-5", rule: "The Hollow Choir never speaks. They communicate through bell-signals.", enforcement: "prompt", active: true },
  { id: "rule-6", rule: "No character knows everything. Knowledge is always partial.", enforcement: "prompt", active: true },
];

export const MODEL_ROUTES: ModelRoute[] = [
  { task: "Brainstorm / Ideation", model: "gemini-2.0-flash", provider: "gemini" },
  { task: "Worldbuilding Ingestion", model: "gemini-2.0-flash", provider: "gemini" },
  { task: "Extraction / Structuring", model: "claude-sonnet-4", provider: "claude" },
  { task: "Prose Revision", model: "claude-sonnet-4", provider: "claude" },
  { task: "Drafting / Continuation", model: "glm-4-plus", provider: "glm" },
  { task: "Utility / Word count checks", model: "glm-4-flash", provider: "glm" },
];

export const USAGE_STATS: UsageStat[] = [
  { provider: "Gemini", tokensUsed: 142000, tokenLimit: 1000000, requestsToday: 23 },
  { provider: "Claude", tokensUsed: 89000, tokenLimit: 500000, requestsToday: 8 },
  { provider: "GLM", tokensUsed: 312000, tokenLimit: 2000000, requestsToday: 41 },
];

/* ------------------------------------------------------------------ *
 * Lookup helpers
 * ------------------------------------------------------------------ */

export function getBook(id: string): Book | undefined {
  return BOOKS.find((b) => b.id === id);
}

export function getChaptersForBook(bookId: string): Chapter[] {
  return CHAPTERS.filter((c) => c.bookId === bookId && c.branchId === "main").sort((a, b) => a.number - b.number);
}

export function getCardsForTab(bookId: string, category: LoreCard["category"]): LoreCard[] {
  return LORE_CARDS.filter((c) => c.bookId === bookId && c.category === category);
}

export function getCharacters(bookId: string): LoreCard[] {
  return LORE_CARDS.filter((c) => c.bookId === bookId && c.category === "character");
}

export function getLinksForCards(cardIds: string[]): CardLink[] {
  const set = new Set(cardIds);
  return CARD_LINKS.filter((l) => set.has(l.source) || set.has(l.target));
}

export function getBranches(bookId: string): Branch[] {
  return BRANCHES.filter((b) => b.bookId === bookId);
}

export function getStates(bookId: string): ChapterState[] {
  return STATES.filter((s) => s.bookId === bookId);
}

export function getEvents(bookId: string): StoryEvent[] {
  return STORY_EVENTS.filter((e) => e.bookId === bookId).sort((a, b) => a.order - b.order);
}

/* ------------------------------------------------------------------ *
 * Glossary — the made-up words of the world
 * ------------------------------------------------------------------ */

export type GlossaryTerm = {
  id: string;
  bookId: string;
  term: string;
  definition: string;
  relatedCardId?: string; // links to a LoreCard
  firstUseChapterId?: string;
};

export const GLOSSARY_TERMS: GlossaryTerm[] = [
  { id: "gt-1", bookId: "mr-book", term: "Sundered Tongue", definition: "The dead language that unmade the world. Every word is also a command to reality.", relatedCardId: "card-sundered-tongue", firstUseChapterId: "ch1" },
  { id: "gt-2", bookId: "mr-book", term: "The Sundering", definition: "The event 400 years ago when the last Speaker spoke the Word for 'end' and the coastlines shattered.", relatedCardId: "card-sundering", firstUseChapterId: "ch1" },
  { id: "gt-3", bookId: "mr-book", term: "Ashfall", definition: "The grey dust that has fallen continuously since Year 0, Day 3. Settles thickest on the Ashfall Coast.", relatedCardId: "card-ashfall-coast", firstUseChapterId: "ch2" },
  { id: "gt-4", bookId: "mr-book", term: "Harborwatch", definition: "Vaelhold's ruling guard. Half watchmen, half customs. Increasingly corrupt.", relatedCardId: "card-harborwatch", firstUseChapterId: "ch1" },
  { id: "gt-5", bookId: "mr-book", term: "Hollow Choir", definition: "Remnant cult hunting speakers of the Sundered Tongue. They never speak — they communicate through bell-signals.", relatedCardId: "card-hollow-choir", firstUseChapterId: "ch2" },
  { id: "gt-6", bookId: "mr-book", term: "The Bellkeeper", definition: "Faceless leader of the Hollow Choir. Speaks only through bell-signals.", relatedCardId: "char-bellkeeper", firstUseChapterId: "ch2" },
  { id: "gt-7", bookId: "mr-book", term: "Vaelhold", definition: "The walled harbour city Maren flees from. Known for its counting bells.", relatedCardId: "card-vaelhold", firstUseChapterId: "ch1" },
  { id: "gt-8", bookId: "mr-book", term: "Ash Eels", definition: "Blind grey-scaled eels that swim in the ashfall dust. Attracted to speech.", relatedCardId: "card-ash-eels", firstUseChapterId: "ch2" },
];

export function getGlossaryTerms(bookId: string): GlossaryTerm[] {
  return GLOSSARY_TERMS.filter((g) => g.bookId === bookId).sort((a, b) =>
    a.term.localeCompare(b.term),
  );
}

