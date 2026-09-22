// Loads the H2N reg list into the local database. One nick per line in the file.
// Usage: node scripts/load-regs.mjs regs.txt [PokerKing]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [file, site = 'PokerKing'] = process.argv.slice(2);
if (!file) { console.error('usage: node scripts/load-regs.mjs <regs.txt> [site]'); process.exit(1); }

const nicks = [...new Set(readFileSync(file, 'utf8').split(/\r?\n/).map(s => s.trim()).filter(Boolean))];
const q = (s) => `'${s.replace(/'/g, "''")}'`;
const sql = nicks.map(n => `INSERT OR IGNORE INTO regs (site, nick) VALUES (${q(site)}, ${q(n)});`).join('\n');
writeFileSync('.regs.sql', sql);

execFileSync('npx', ['wrangler', 'd1', 'execute', 'metalens', '--local', '--file', '.regs.sql'], { stdio: 'inherit', shell: true });
console.log(`${nicks.length} regs carregados. Rode o recálculo para as stats "vs reg" passarem a contar:`);
console.log('  curl -X POST "http://localhost:8787/api/admin/rebuild"');
