/* ------------------------------------------------------------------ *
 * guard.ts — code-side enforcement of constitution rules.
 * 
 * checkProse() runs on every AI output AND is available as a button
 * in the editor Tools tab. Returns violations, never auto-edits.
 * ------------------------------------------------------------------ */

export type Violation = {
  rule: string;
  severity: "error" | "warning";
  quote: string;
  suggestion: string;
};

// Generic emotion phrases to flag
const GENERIC_EMOTION_PHRASES = [
  "jaw tightened", "jaw clenched", "eyes narrowed", "eyes widened",
  "lips pursed", "brow furrowed", "shoulders tensed", "heart pounded",
  "breath caught", "stomach dropped", "spine straightened",
  "a shiver ran down", "goosebumps rose",
];

// Reflexive triad pattern: ", the X, the Y, the Z"
const TRIAD_PATTERN = /,\s+the\s+\w+,\s+the\s+\w+/g;

export function checkProse(text: string): Violation[] {
  const violations: Violation[] = [];

  // Rule 1: Zero em-dashes
  if (text.includes("—") || text.includes("–")) {
    const matches = text.match(/—|–/g) ?? [];
    violations.push({
      rule: "Zero em-dashes (Rule 1)",
      severity: "error",
      quote: `${matches.length} em-dash(es) found`,
      suggestion: "Replace em-dashes with commas, periods, or parentheses.",
    });
  }

  // Rule 3a: "suddenly" count > 2
  const suddenlyCount = (text.toLowerCase().match(/\bsuddenly\b/g) ?? []).length;
  if (suddenlyCount > 2) {
    violations.push({
      rule: "No reflexive 'suddenly' (Rule 3)",
      severity: "warning",
      quote: `"suddenly" appears ${suddenlyCount} times`,
      suggestion: "Reduce to at most 2. The word rarely earns its place.",
    });
  }

  // Rule 3b: "seemed to" without real uncertainty
  const seemedCount = (text.toLowerCase().match(/\bseemed to\b/g) ?? []).length;
  if (seemedCount > 1) {
    violations.push({
      rule: "No 'seemed to' hedges (Rule 3)",
      severity: "warning",
      quote: `"seemed to" appears ${seemedCount} times`,
      suggestion: "Replace with direct statements. If something is uncertain, name the uncertainty.",
    });
  }

  // Rule 3c: "something shifted" vagueness
  const shiftedMatches = text.match(/something\s+(shifted|changed|stirred|moved)/gi) ?? [];
  if (shiftedMatches.length > 0) {
    violations.push({
      rule: "No vagueness (Rule 3)",
      severity: "warning",
      quote: shiftedMatches[0] ?? "",
      suggestion: "If something changes, name what specifically changed.",
    });
  }

  // Rule 4: Generic emotion phrases
  const textLower = text.toLowerCase();
  for (const phrase of GENERIC_EMOTION_PHRASES) {
    if (textLower.includes(phrase)) {
      violations.push({
        rule: "No generic emotion catalog (Rule 4)",
        severity: "warning",
        quote: `"${phrase}"`,
        suggestion: "Replace with a specific, causal detail instead of a stock body-language cue.",
      });
    }
  }

  // Rule 5: Reflexive triad pattern
  const triadMatches = text.match(TRIAD_PATTERN) ?? [];
  if (triadMatches.length > 0) {
    violations.push({
      rule: "No reflexive triads (Rule 5)",
      severity: "warning",
      quote: triadMatches[0] ?? "",
      suggestion: "The ', the X, the Y' pattern stacks description. Consider varying structure.",
    });
  }

  return violations;
}
