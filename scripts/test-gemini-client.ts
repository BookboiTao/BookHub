// Quick sanity test for the Gemini client.
// Calls callGemini with a fake key — should fail at Google's end with a
// predictable 400/API_KEY_INVALID error, which proves the request shape,
// URL, and error handling are all wired correctly.
//
// Run with: bun run scripts/test-gemini-client.ts

import { callGemini, testProvider, MODEL_CATALOG, ALL_PROVIDER_KEYS } from "../src/lib/ai/provider-clients";

async function main() {
  console.log("=== MODEL_CATALOG ===");
  for (const k of ALL_PROVIDER_KEYS) {
    console.log(
      `  ${k}: ${MODEL_CATALOG[k].label} — requiresApiKey=${MODEL_CATALOG[k].requiresApiKey} — ${MODEL_CATALOG[k].models.length} model(s)`,
    );
  }

  console.log("\n=== testProvider(zai) — keyless, should succeed ===");
  const zaiResult = await testProvider("zai");
  console.log(JSON.stringify(zaiResult, null, 2));

  console.log("\n=== testProvider(gemini) with FAKE key ===");
  const fakeGeminiResult = await testProvider("gemini", { gemini: "AIzaSyFAKE_KEY_FOR_STRUCTURE_TEST_only" });
  console.log(JSON.stringify(fakeGeminiResult, null, 2));
  if (!fakeGeminiResult.ok && fakeGeminiResult.error) {
    console.log("  ✅ Error surfaced correctly — provider code path works.");
  } else if (fakeGeminiResult.ok) {
    console.log("  ⚠️  Unexpected success — Google may have weirdly accepted the fake key. Investigate.");
  }

  console.log("\n=== testProvider(gemini) with NO key ===");
  const noKeyResult = await testProvider("gemini");
  console.log(JSON.stringify(noKeyResult, null, 2));
  if (!noKeyResult.ok && !noKeyResult.hasKey) {
    console.log("  ✅ Correctly reported 'no key' without making a network call.");
  }

  console.log("\n=== callGemini direct call with fake key (verifies error parsing) ===");
  try {
    await callGemini(
      { messages: [{ role: "user", content: "Reply OK" }], maxTokens: 5 },
      "gemini-2.0-flash",
      "AIzaSyFAKE_KEY_FOR_STRUCTURE_TEST_only",
    );
    console.log("  ⚠️  Unexpected success.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`  Got expected error: ${msg}`);
    if (msg.startsWith("Gemini error:")) {
      console.log("  ✅ Error message format is correct.");
    } else {
      console.log("  ⚠️  Error format unexpected — review callGemini error handling.");
    }
  }

  console.log("\n=== Done ===");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
