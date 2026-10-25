// Copies the single-threaded "lite" Stockfish build (1.7 MB wasm, no special HTTP headers needed)
// from node_modules into public/, where the browser Web Worker loads it from.
import { copyFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "stockfish", "bin");
const to = join(root, "public", "stockfish");
const files = ["stockfish-19-lite-single.js", "stockfish-19-lite-single.wasm"];

if (!existsSync(from)) {
  console.warn("copy-engine: 'stockfish' is not installed yet, skipping");
  process.exit(0);
}
mkdirSync(to, { recursive: true });
for (const f of files) copyFileSync(join(from, f), join(to, f));
console.log(`copy-engine: ${files.join(", ")} -> public/stockfish`);
