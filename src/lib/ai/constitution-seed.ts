/* ------------------------------------------------------------------ *
 * constitution-seed.ts — the default Constitution + Fingerprint,
 * client-safe (no server imports, importable from both
 * context-builder.ts on the server and ai-studio.tsx on the client).
 *
 * Source: the full "Gen. Novel Skill" 36-rule AI-tell-avoidance
 * document, condensed to system-prompt-length entries. Rule numbers
 * below match that document's own numbering (0-36) so "rule 23" means
 * the same thing here as it does there.
 *
 * enforcement: "code"   — guard.ts (src/lib/ai/guard.ts) actually
 *                         checks this one, even if only a heuristic.
 * enforcement: "prompt" — judgment call, left to the model. Some of
 *                         these (32, 34) are genuinely syntactic and
 *                         will move to "code" once HALPE is wired in,
 *                         since regex can't reliably parse clause
 *                         structure the way a real grammar engine can.
 * ------------------------------------------------------------------ */

export type ConstitutionRule = {
  id: string;
  text: string;
  enforcement: "prompt" | "code";
  active: boolean;
};

export type Fingerprint = {
  voice: string;
  pacing: string;
  tone: string;
  samples: { id: string; label: string; text: string }[];
};

/* ------------------------------------------------------------------ *
 * Story Profile — the Study Study Guide's own vocabulary, condensed to
 * the handful of fields that actually change the advice an assistant
 * gives. Not a card collection like World Bible; one compact object per
 * book, threaded into every AI call the same way Fingerprint already is.
 * AI proposes a first draft by reading your chapters + World Bible; you
 * correct it, same pattern as Constitution.
 * ------------------------------------------------------------------ */
export type CastRole = {
  role: "subject" | "object" | "opponent" | "helper" | "sender" | "receiver";
  cardId?: string; // points at an existing World Bible character card
  name: string; // denormalized label, kept in sync when cardId is set
};

export type StoryProfile = {
  structure: string; // e.g. "Three-act", "Episodic", "Nonlinear"
  structureNote: string; // roughly where the story is right now within it
  castConfig: string; // e.g. "Single protagonist", "Ensemble", "Reciprocal"
  castRoles: CastRole[];
  changeMode: string; // "External", "Internal", or "Both"
  resolutionMode: string; // "Resolved", "Unresolved", "Near-static", "Incomplete/ongoing"
  centralConflict: string; // one line
  narrationMode: string; // POV/focalization, e.g. "Close third, single POV"
  infoWithheld: string; // what's currently being withheld from the reader
};

export const STORY_PROFILE_SEED: StoryProfile = {
  structure: "",
  structureNote: "",
  castConfig: "",
  castRoles: [],
  changeMode: "",
  resolutionMode: "",
  centralConflict: "",
  narrationMode: "",
  infoWithheld: "",
};

/* ------------------------------------------------------------------ *
 * Merge helpers — the bug these fix: `saved ?? SEED` only falls back
 * to the seed when the DB column is genuinely null. A book created
 * BEFORE rules 10-36 existed already has a real, non-null 9-element
 * constitution array saved — so it silently shadows the full seed
 * forever, and new users never see the update. Same problem for
 * story_profile: the column defaults to '{}'::jsonb (not null), so an
 * existing row returns `{}` — truthy, so `??` never fires, and any
 * code reading `storyProfile.castRoles.length` crashes on undefined.
 * ------------------------------------------------------------------ */

/** Union saved rules with the current seed by id — keeps the user's own
 * active/enforcement edits to rules they've already seen, and adds any
 * new rules from the seed that their saved copy predates. */
export function mergeConstitution(saved: ConstitutionRule[] | null | undefined): ConstitutionRule[] {
  if (!saved || saved.length === 0) return CONSTITUTION_SEED;
  const savedIds = new Set(saved.map((r) => r.id));
  const newFromSeed = CONSTITUTION_SEED.filter((r) => !savedIds.has(r.id));
  return [...saved, ...newFromSeed];
}

/** Shallow-merge saved story profile fields over the seed's empty
 * defaults, so a partial/empty `{}` from the DB default never leaves a
 * field (especially the castRoles array) undefined. */
export function mergeStoryProfile(saved: Partial<StoryProfile> | null | undefined): StoryProfile {
  return {
    ...STORY_PROFILE_SEED,
    ...(saved ?? {}),
    castRoles: saved?.castRoles ?? STORY_PROFILE_SEED.castRoles,
  };
}

export const CONSTITUTION_SEED: ConstitutionRule[] = [
  { id: "rule-tm", text: "The Three Mistakes (gut-check when moving fast): over-explain everything; give life to things unnecessarily; write the right words in the wrong way.", enforcement: "prompt", active: true },
  { id: "rule-0", text: "Zero em-dashes ('—') anywhere, ever, in this user's prose. Restructure with a comma, period, semicolon, or rephrase instead.", enforcement: "code", active: true },
  { id: "rule-1", text: "Beyond rule 0: the fix for dash-overuse is genuine sentence-length variety, not a blanket switch to short choppy sentences (that's its own tell).", enforcement: "prompt", active: true },
  { id: "rule-2", text: "No unearned personification of insignificant objects/settings (\"the candle whispered secrets\"). Plain atmospheric description without personifying it is fine and often necessary.", enforcement: "prompt", active: true },
  { id: "rule-3", text: "No generic emotion catalog, told OR shown (\"jaw tightened\" is now just as stock as \"he felt a surge of anger\"). Reach for something specific to this character/moment instead of either pre-approved mode. Vary the mode used across a manuscript.", enforcement: "code", active: true },
  { id: "rule-4", text: "No redundant/vague adjective stacking where multiple modifiers gesture at the same vague thing (\"the dark, brooding, mysterious figure\"). Modifiers that each carry distinct information are fine.", enforcement: "prompt", active: true },
  { id: "rule-5", text: "No reflexive 'suddenly' / 'without warning' used to manufacture tension instead of building it through pacing.", enforcement: "code", active: true },
  { id: "rule-6", text: "No reflexive 'seemed to' / 'appeared to' hedge when the POV genuinely knows what's happening. Commit to the statement. Real perceptual ambiguity is a legitimate exception.", enforcement: "code", active: true },
  { id: "rule-7", text: "No stacked/mixed metaphors piled onto one image until none of them land. A single sustained metaphor is fine.", enforcement: "prompt", active: true },
  { id: "rule-8", text: "No internal-monologue dumps in brisk/noir-adjacent registers — trust the reader (\"he hesitated, then knocked\" over paragraphs of wondering).", enforcement: "prompt", active: true },
  { id: "rule-9", text: "No vague 'something shifted/changed' construction. If something changes, name what changed.", enforcement: "code", active: true },
  { id: "rule-10", text: "No cliché-phrased chapter endings (\"little did he know...\"). End on a concrete moment (image, line, action) instead of a narrator lean-in announcing significance. Prefer a small open pull over an announced hook.", enforcement: "code", active: true },
  { id: "rule-11", text: "'Could feel' constructions (\"she could feel the tension\") and their supposed fix (\"a grip tightens, a look is avoided\") are BOTH generic stock catalogs now. Find the one specific, causally-linked detail unique to this scene instead of reaching for either default.", enforcement: "code", active: true },
  { id: "rule-12", text: "Cut redundant/automatic adverbs that restate what the verb already implies (\"whispered quietly\", \"shouted loudly\"). Keep adverbs that carry real information the verb alone can't (\"nodded slowly\" conveying reluctance).", enforcement: "code", active: true },
  { id: "rule-13", text: "No 'perfect protagonist' (always composed, never awkward) — but also no 'always flawed/fumbling' as a default personality setting. Real people are situationally competent, not uniformly either way.", enforcement: "prompt", active: true },
  { id: "rule-14", text: "No reflexive lists of three (\"the pain, the loss, the suffering\") as the only rhythm a manuscript uses. Vary — sometimes two, four, or one.", enforcement: "code", active: true },
  { id: "rule-15", text: "Let scenes breathe. Silence between characters, or a beat with no description/thought/action filling it, is allowed and often carries real weight.", enforcement: "prompt", active: true },
  { id: "rule-16", text: "Don't editorialize the causal/thematic connection between two juxtaposed scenes or beats. Let the juxtaposition do the work; trust the reader to draw the link.", enforcement: "prompt", active: true },
  { id: "rule-17", text: "Transition-word fatigue: 'Then,' 'After a while,' 'After,' used reflexively to mark sequence when the order is already obvious from the actions themselves. Cut them; keep one only where real timing ambiguity exists.", enforcement: "code", active: true },
  { id: "rule-18", text: "Don't fragment one continuous action across isolated one-beat paragraphs when the genre calls for flow — combine with commas/participial phrases instead of a paragraph break per micro-action. (Genre-dependent: slow, deliberate/philosophical registers may correctly want the isolation.)", enforcement: "prompt", active: true },
  { id: "rule-19", text: "Add punctuation by ear during revision, not front-loaded as a grammar exercise. Write the passage first however it comes out; add a comma/full stop only where it actually needs a breath.", enforcement: "prompt", active: true },
  { id: "rule-20", text: "If a single image is personified more than once in a passage, the personifications must agree with each other (nature-force OR predator, not switched between lines) or the image becomes incoherent.", enforcement: "prompt", active: true },
  { id: "rule-21", text: "The parallel-flip sentence (\"Nobody was surprised it happened. People were surprised by how it happened.\") reads sharp once, becomes a tell as a recurring opener. Cap at one per chapter; try the flat non-parallel version and compare.", enforcement: "prompt", active: true },
  { id: "rule-22", text: "Any single recurring device for undercutting institutional/official language (e.g. euphemism-translation) becomes a tell through repetition. Vary the mechanism — sometimes translate outright, sometimes juxtapose with no comment, sometimes let a character react instead.", enforcement: "prompt", active: true },
  { id: "rule-23", text: "The 'Some called it X. Others, more quietly, called it Y' dual-framing chapter closer is a reliable-sounding move precisely because it's overused. Try at least one other closing mode first; cap at roughly once every few chapters, not once per chapter.", enforcement: "code", active: true },
  { id: "rule-24", text: "Reflexive environmental personification as a scene-opener/transition (\"the city breathed softly as dawn arrived\") is a stock default the way 'suddenly' is. Try grounding the opening in one concrete, non-personified detail (a sound, a smell) first.", enforcement: "code", active: true },
  { id: "rule-25", text: "Don't default every conversation to sharp, short, combative dialogue rhythm regardless of scene context. A grieving, warm, or bureaucratic exchange needs its own rhythm.", enforcement: "prompt", active: true },
  { id: "rule-26", text: "When reviewing a revision, check whether a fixed AI-tell actually resolved or just migrated to a different target in the same passage (e.g. over-personified setting fixed, but character faces now get unearned dramatic momentum instead).", enforcement: "prompt", active: true },
  { id: "rule-27", text: "Positive technique to actively use: weave physical setting details directly into the flow of action/dialogue (not separate descriptive blocks) to keep the reader spatially oriented without breaking momentum.", enforcement: "prompt", active: true },
  { id: "rule-28", text: "[Critique behavior] A fix must be proportional to the actual problem — a missing comma gets a comma, not a full rewrite of the sentence's imagery.", enforcement: "prompt", active: true },
  { id: "rule-29", text: "[Critique behavior] A proposed fix must not introduce a new AI-tell while resolving a different one (e.g. fixing redundancy by introducing a confusing forced metaphor).", enforcement: "prompt", active: true },
  { id: "rule-30", text: "[Critique behavior] A proposed fix must not invent new concrete sensory/environmental details absent from the original passage at that narrative moment, even if plausible-sounding — this can create continuity errors.", enforcement: "prompt", active: true },
  { id: "rule-31", text: "[Critique behavior] Before flagging something as a violation, confirm it actually is one. A plain, defensible statement of fact isn't automatically 'telling not showing.' Over-flagging erodes trust in the critique.", enforcement: "prompt", active: true },
  { id: "rule-32", text: "Comma splices: two independent clauses glued together with only a comma where a period, semicolon, or conjunction belongs. The single most common issue across real manuscripts. (Genuinely syntactic — best caught by a real grammar engine; will move to code enforcement once HALPE is wired in.)", enforcement: "prompt", active: true },
  { id: "rule-33", text: "Watch for repetitive paragraph-level templating across a sequence of similar beats (e.g. ten falling stars each narrated with the exact same subject-arrives/color-noted/descends template). Distinct from rule 14 — this is structural repetition across beats, not word-level rhythm within one sentence.", enforcement: "prompt", active: true },
  { id: "rule-34", text: "Watch for misplaced/dangling modifiers creating unintentionally absurd meaning (an opening modifier phrase must describe the subject that actually follows it). (Genuinely syntactic — will move to code enforcement once HALPE is wired in.)", enforcement: "prompt", active: true },
  { id: "rule-35", text: "Don't repeat the same physical description in close proximity (a few paragraphs apart) without narrative purpose — usually a drafting artifact, not an intentional callback.", enforcement: "code", active: true },
  { id: "rule-36", text: "Dialogue echo: different characters shouldn't deliver structurally identical lines for a similar beat — it flattens distinct voices into one shared internal monologue.", enforcement: "code", active: true },
  { id: "rule-pacing", text: "Pacing preference: slow-paced but with real momentum in every passage, not 'steady progressive' dutiful incident-free progression. Slow is fine if every paragraph earns its place; slow is a problem if nothing is actually happening.", enforcement: "prompt", active: true },
  { id: "rule-chlen", text: "Typical chapters run ~2,500-5,000 words. Shorter interstitial/narrator-only chapters (500-1,500) are a legitimate pacing tool — don't pad to match other chapters.", enforcement: "prompt", active: true },
  { id: "rule-grammar", text: "Grammar/spelling/punctuation matters even in rough drafts, enough that ideas aren't obscured — flag run-on unpunctuated paragraphs and typos even when moving fast.", enforcement: "prompt", active: true },
];

export const FINGERPRINT_SEED: Fingerprint = {
  voice: "",
  pacing: "",
  tone: "",
  samples: [],
};
