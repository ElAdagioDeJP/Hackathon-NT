// Runs pdf → extract on every fixture tender and writes
// fixtures/tenders/<tenderId>.requirements.json for the draft and the benchmark.
// Usage: bun run ai:extract-fixtures [tenderId...]
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { FIXTURES_DIR, loadFixture } from "../app/services/ai/analyze";
import { extractRequirements } from "../app/services/ai/extract";
import { parsePdf } from "../app/services/ai/pdf";
import { EXTRACT_PROMPT_VERSION } from "../app/services/ai/prompts/extract.v2";

async function main() {
  const ids = process.argv.slice(2).length
    ? process.argv.slice(2)
    : (await readdir(FIXTURES_DIR))
        .filter((f) => f.endsWith(".json") && !f.endsWith(".requirements.json"))
        .map((f) => f.replace(/\.json$/, ""));
  
  for (const id of ids) {
    const { fixture, bytes } = await loadFixture(id);
    const pages = await parsePdf(bytes);
    const ocr = pages.filter((p) => p.needsOcr).length;
    console.log(`${id}: ${pages.length} pages (${ocr} need OCR)`);
    const { requirements, stats } = await extractRequirements(pages);
    await writeFile(
      join(FIXTURES_DIR, `${id}.requirements.json`),
      JSON.stringify({ tenderId: fixture.tenderId, prompt: EXTRACT_PROMPT_VERSION, stats, requirements }, null, 2) + "\n",
    );
    console.log(`  ${requirements.length} requirements`, stats);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
