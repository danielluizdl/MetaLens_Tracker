// Sends a hand history file to the local Worker (npm run dev), in chunks of whole hands.
// Usage: node scripts/import-local.mjs hands_dLzinN.txt [http://localhost:8787]
import { readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const [file, base = 'http://localhost:8787'] = process.argv.slice(2);
if (!file) { console.error('usage: node scripts/import-local.mjs <file.txt> [base-url]'); process.exit(1); }

const CHUNK = 4 * 1024 * 1024;
const text = readFileSync(file, 'utf8');
const sha = createHash('sha256').update(text).digest('hex');

const starts = [...text.matchAll(/^PokerKing Hand #/gm)].map(m => m.index);
const chunks = [];
let from = 0;
for (let i = 1; i <= starts.length; i++) {
  const end = i === starts.length ? text.length : starts[i];
  if (end - from >= CHUNK || i === starts.length) { chunks.push(text.slice(from, end)); from = end; }
}

console.log(`${file}: ${(statSync(file).size / 1e6).toFixed(1)} MB, ${starts.length} hands, ${chunks.length} chunks`);
const total = { new: 0, dup: 0, rejected: 0 };
const started = Date.now();
for (const [i, chunk] of chunks.entries()) {
  const res = await fetch(`${base}/api/upload?sha=${sha}&part=${i}`, { method: 'POST', body: gzipSync(chunk) });
  const body = await res.json();
  if (!res.ok) { console.error(`chunk ${i + 1}: ${res.status} ${JSON.stringify(body)}`); process.exit(1); }
  total.new += body.new; total.dup += body.dup; total.rejected += body.rejected;
  process.stdout.write(`\rchunk ${i + 1}/${chunks.length} · ${total.new} new · ${total.dup} dup`);
}
console.log(`\ndone in ${((Date.now() - started) / 1000).toFixed(0)}s: ${total.new} new, ${total.dup} duplicated, ${total.rejected} rejected`);
