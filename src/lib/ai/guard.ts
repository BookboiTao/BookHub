/* ------------------------------------------------------------------ *
 * guard.ts — code-side enforcement of constitution rules.
 *
 * checkProse() runs on every AI output AND is available as a manual
 * "Check my prose" button in the editor Tools tab. Returns violations,
 * never auto-edits.
 *
 * Rule numbers in violation labels match constitution-seed.ts's own
 * numbering (the Gen Novel Skill doc's 0-36 scheme) — "Rule 23" here
 * means the same rule as constitution rule id "rule-23".
 *
 * The `constitution` param actually matters: pass the book's active
 * constitution and checkProse only returns violations for rules that
 * are BOTH active and tagged enforcement:"code" there. Turn a rule off,
 * or flip it to "prompt" in the Constitution tab, and its checker
 * genuinely stops firing — this reads each violation's own "(Rule N)"
 * label back against the constitution rather than needing every check
 * broken into a separate registered function, so it stays a thin
 * wrapper around the exact checks below rather than a rewrite of them.
 * Omit `constitution` and every check still runs (old callers keep
 * working unchanged).
 * ------------------------------------------------------------------ */

import type { ConstitutionRule } from "./constitution-seed";

export type Violation = {
  rule: string;
  severity: "error" | "warning";
  quote: string;
  suggestion: string;
};

// Rule 3: generic emotion phrases (the "shown" stock catalog — just as
// much a tell now as the "told" version it was meant to replace)
const GENERIC_EMOTION_PHRASES = [
  "jaw tightened", "jaw clenched", "eyes narrowed", "eyes widened",
  "lips pursed", "brow furrowed", "shoulders tensed", "heart pounded",
  "breath caught", "stomach dropped", "spine straightened",
  "a shiver ran down", "goosebumps rose",
];

// Rule 11: the "could feel" fix-catalog is now just as stock as the
// "could feel" pattern it was meant to replace
const COULD_FEEL_FIX_PHRASES = [
  "a grip tightened", "a grip tightens", "a look was avoided", "a look is avoided",
  "someone shifted in their seat", "someone shifts in their seat",
];

// Rule 12: adverb-verb pairs where the adverb restates what the verb
// already implies (a lazy adverb, not a precise one)
const REDUNDANT_ADVERB_PAIRS = [
  "whispered quietly", "whispered softly", "shouted loudly", "screamed loudly",
  "yelled loudly", "murmured quietly", "murmured softly",
];

// Rule 10: cliché-phrased chapter/scene endings (stock trailer-voice)
const CLICHE_ENDING_PHRASES = [
  "little did he know", "little did she know", "little did they know",
  "life was about to change forever", "would never be the same again",
  "nothing would ever be the same",
];

// Rule 24: reflexive environmental personification as a scene opener
const ENV_PERSONIFICATION_PHRASES = [
  "city breathed", "city stirred", "city held its breath",
  "night settled over", "dawn crept", "the wind whispered",
];

// Rule 14: reflexive triad pattern: ", the X, the Y, the Z"
const TRIAD_PATTERN = /,\s+the\s+\w+,\s+the\s+\w+/g;

// Rule 17: transition-word fatigue at sentence/paragraph starts
const TRANSITION_FATIGUE_PATTERN = /(^|\n|\.\s+)(Then,|After a while,|After,)/g;

// Rule 23: the dual-framing chapter closer
const DUAL_FRAMING_PATTERN = /Some\s+call(?:ed)?\s+it\s+.+?\.\s*Others,?\s+more\s+quietly,?\s+call(?:ed)?\s+it/i;

// Every check below is intentionally left exactly as tested (Step 1) —
// only renamed and wrapped, not modified. See checkProse() at the bottom
// for the constitution-aware gating.
function runAllChecks(text: string): Violation[] {
  const violations: Violation[] = [];
  const textLower = text.toLowerCase();

  // Rule 0: Zero em-dashes, absolute
  if (text.includes("—") || text.includes("–")) {
    const matches = text.match(/—|–/g) ?? [];
    violations.push({
      rule: "Zero em-dashes (Rule 0)",
      severity: "error",
      quote: `${matches.length} em-dash(es) found`,
      suggestion: "Replace em-dashes with commas, periods, or parentheses.",
    });
  }

  // Rule 5: "suddenly" / "without warning" count
  const suddenlyCount = (textLower.match(/\bsuddenly\b|\bwithout warning\b/g) ?? []).length;
  if (suddenlyCount > 2) {
    violations.push({
      rule: "No reflexive 'suddenly' (Rule 5)",
      severity: "warning",
      quote: `"suddenly"/"without warning" appears ${suddenlyCount} times`,
      suggestion: "Reduce to at most 2. Build tension through pacing instead of announcing it.",
    });
  }

  // Rule 6: "seemed to" / "appeared to" hedge
  const seemedCount = (textLower.match(/\bseemed to\b|\bappeared to\b/g) ?? []).length;
  if (seemedCount > 1) {
    violations.push({
      rule: "No 'seemed to' hedges (Rule 6)",
      severity: "warning",
      quote: `"seemed to"/"appeared to" appears ${seemedCount} times`,
      suggestion: "Commit to direct statements. If something is genuinely uncertain, name the uncertainty.",
    });
  }

  // Rule 9: "something shifted" vagueness
  const shiftedMatches = text.match(/something\s+(shifted|changed|stirred|moved)/gi) ?? [];
  if (shiftedMatches.length > 0) {
    violations.push({
      rule: "No vagueness (Rule 9)",
      severity: "warning",
      quote: shiftedMatches[0] ?? "",
      suggestion: "If something changes, name what specifically changed.",
    });
  }

  // Rule 3: generic emotion catalog (told or shown, both now stock)
  for (const phrase of GENERIC_EMOTION_PHRASES) {
    if (textLower.includes(phrase)) {
      violations.push({
        rule: "No generic emotion catalog (Rule 3)",
        severity: "warning",
        quote: `"${phrase}"`,
        suggestion: "Replace with a specific, causal detail instead of a stock body-language cue.",
      });
    }
  }

  // Rule 14: reflexive triad pattern
  const triadMatches = text.match(TRIAD_PATTERN) ?? [];
  if (triadMatches.length > 0) {
    violations.push({
      rule: "No reflexive triads (Rule 14)",
      severity: "warning",
      quote: triadMatches[0] ?? "",
      suggestion: "The ', the X, the Y' pattern stacks description. Consider varying structure (two, four, or one).",
    });
  }

  // Rule 10: cliché chapter/scene endings
  for (const phrase of CLICHE_ENDING_PHRASES) {
    if (textLower.includes(phrase)) {
      violations.push({
        rule: "No cliché endings (Rule 10)",
        severity: "warning",
        quote: `"${phrase}"`,
        suggestion: "End on a concrete image, line, or action instead of a narrator lean-in announcing significance.",
      });
    }
  }

  // Rule 11: "could feel" pattern AND its equally-stock "fix" catalog
  const couldFeelCount = (textLower.match(/\bcould feel the\b/g) ?? []).length;
  if (couldFeelCount > 0) {
    violations.push({
      rule: "No 'could feel' pattern (Rule 11)",
      severity: "warning",
      quote: `"could feel the" appears ${couldFeelCount} time(s)`,
      suggestion: "Find one specific, causally-linked detail unique to this scene instead.",
    });
  }
  for (const phrase of COULD_FEEL_FIX_PHRASES) {
    if (textLower.includes(phrase)) {
      violations.push({
        rule: "No stock 'tension' catalog (Rule 11)",
        severity: "warning",
        quote: `"${phrase}"`,
        suggestion: "This 'fix' phrase is now just as generic as what it replaced. Reach for something specific instead.",
      });
    }
  }

  // Rule 12: redundant adverb-verb pairs
  for (const phrase of REDUNDANT_ADVERB_PAIRS) {
    if (textLower.includes(phrase)) {
      violations.push({
        rule: "Redundant adverb (Rule 12)",
        severity: "warning",
        quote: `"${phrase}"`,
        suggestion: "The adverb restates what the verb already implies. Cut it, or replace with one that adds real information.",
      });
    }
  }

  // Rule 17: transition-word fatigue
  const transitionMatches = text.match(TRANSITION_FATIGUE_PATTERN) ?? [];
  if (transitionMatches.length > 2) {
    violations.push({
      rule: "Transition-word fatigue (Rule 17)",
      severity: "warning",
      quote: `"Then,"/"After a while,"/"After," used ${transitionMatches.length} times to open a line`,
      suggestion: "Cut sequencing words where the order is already obvious from the actions themselves.",
    });
  }

  // Rule 23: the dual-framing chapter closer
  if (DUAL_FRAMING_PATTERN.test(text)) {
    violations.push({
      rule: "Dual-framing closer (Rule 23)",
      severity: "warning",
      quote: "'Some called it X. Others, more quietly, called it Y' pattern found",
      suggestion: "Reliable-sounding precisely because it's overused. Try a single image or flat statement first; cap this to once every few chapters.",
    });
  }

  // Rule 24: reflexive environmental personification as scene opener
  for (const phrase of ENV_PERSONIFICATION_PHRASES) {
    if (textLower.includes(phrase)) {
      violations.push({
        rule: "Reflexive environmental personification (Rule 24)",
        severity: "warning",
        quote: `"${phrase}"`,
        suggestion: "Try grounding the scene opening in one concrete, non-personified detail (a sound, a smell) first.",
      });
    }
  }

  // Rule 35: duplicate description repeated in close proximity
  // (4-word shingles repeated within ~600 chars, without narrative purpose)
  const words = text.split(/\s+/);
  const shingleFirstSeen = new Map<string, number>();
  const seenPairsReported = new Set<string>();
  let skipUntil = -1;
  for (let i = 0; i + 4 <= words.length; i++) {
    if (i < skipUntil) continue;
    const shingle = words.slice(i, i + 4).join(" ").toLowerCase().replace(/[^\w\s]/g, "");
    if (shingle.length < 12) continue; // skip short/common shingles
    const charPos = words.slice(0, i).join(" ").length;
    const prevPos = shingleFirstSeen.get(shingle);
    if (prevPos !== undefined && charPos - prevPos < 600 && !seenPairsReported.has(shingle)) {
      seenPairsReported.add(shingle);
      skipUntil = i + 4; // don't re-flag overlapping shingles from the same repeated phrase
      violations.push({
        rule: "Duplicate description (Rule 35)",
        severity: "warning",
        quote: words.slice(i, i + 4).join(" "),
        suggestion: "The same phrase repeats in close proximity — likely a drafting artifact rather than an intentional callback.",
      });
    } else if (prevPos === undefined) {
      shingleFirstSeen.set(shingle, charPos);
    }
  }

  // Rule 36: dialogue echo — different quoted lines that are near-identical
  const quotedLines = [...text.matchAll(/"([^"]{10,120})"/g)].map((m) => m[1]);
  for (let i = 0; i < quotedLines.length; i++) {
    for (let j = i + 1; j < quotedLines.length; j++) {
      const a = quotedLines[i]?.toLowerCase().replace(/[^\w\s]/g, "").trim();
      const b = quotedLines[j]?.toLowerCase().replace(/[^\w\s]/g, "").trim();
      if (!a || !b) continue;
      const wordsA = new Set(a.split(/\s+/));
      const wordsB = new Set(b.split(/\s+/));
      const intersection = [...wordsA].filter((w) => wordsB.has(w)).length;
      // Overlap ratio relative to the smaller line (captures "same skeleton,
      // different key word" structural echoes better than plain Jaccard).
      const similarity = Math.min(wordsA.size, wordsB.size) > 0
        ? intersection / Math.min(wordsA.size, wordsB.size)
        : 0;
      if (similarity > 0.55 && wordsA.size > 3) {
        violations.push({
          rule: "Dialogue echo (Rule 36)",
          severity: "warning",
          quote: `"${quotedLines[i]}" / "${quotedLines[j]}"`,
          suggestion: "Two lines of dialogue are structurally near-identical — check they're not flattening distinct character voices into one.",
        });
      }
    }
  }

  return violations;
}

function ruleIdFromLabel(label: string): string | null {
  const m = label.match(/Rule\s+(\d+)/i);
  return m ? `rule-${m[1]}` : null;
}

export function checkProse(text: string, constitution?: ConstitutionRule[]): Violation[] {
  const all = runAllChecks(text);
  if (!constitution) return all; // no constitution passed: run everything (back-compat default)

  const activeCodeIds = new Set(
    constitution.filter((r) => r.active && r.enforcement === "code").map((r) => r.id),
  );
  return all.filter((v) => {
    const id = ruleIdFromLabel(v.rule);
    // If a violation's label doesn't map to a known rule id, don't
    // silently drop it — only filter out ones we can actually match
    // against the constitution's "off"/"prompt-only" state.
    return id ? activeCodeIds.has(id) : true;
  });
}
