// Browser side: search, HUD rendering (H2N layout from the catalog) and chunked upload.
// Bundled to public/app.js with esbuild (npm run build:ui).
import { CATALOG, type Box } from './catalog.ts';
import { fmtSample, fmtValue, keyFor, tone, tooltip, type Counters } from './hud.ts';

type Stake = { stake: string; hands: number; net_bb: number | null; c: Counters };
type PlayerStats = { site: string; nick: string; team: boolean; stakes: Stake[] };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, kids: (Node | string)[] = []) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};
const RECENT_KEY = 'metalens.recent';
const recent = (): { site: string; nick: string; hands: number }[] => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]'); } catch { return []; } };
const remember = (p: { site: string; nick: string; hands: number }) => {
  const list = [p, ...recent().filter(x => !(x.nick === p.nick && x.site === p.site))].slice(0, 12);
  try { localStorage.setItem(RECENT_KEY, JSON.stringify(list)); } catch { /* private mode */ }
};

let stats: PlayerStats | null = null;
let screen = CATALOG[0].screen;
let stakeFilter = '';
let hasRegs = false;

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, init);
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body;
}
const showError = (msg: string) => { const e = $('error'); e.hidden = false; e.textContent = msg; };
const clearError = () => { $('error').hidden = true; };

// ---------- search ----------
let searchTimer: number | undefined;
$<HTMLInputElement>('q').addEventListener('input', e => {
  const q = (e.target as HTMLInputElement).value.trim();
  clearTimeout(searchTimer);
  if (!q) return hideResults();
  const box = $('results');
  box.hidden = false;
  box.replaceChildren(el('div', { className: 'loading', textContent: 'buscando…' }));
  searchTimer = setTimeout(async () => {
    try {
      const rows = await api(`/api/player?q=${encodeURIComponent(q)}`) as { site: string; nick: string; hands: number }[];
      box.replaceChildren(...(rows.length
        ? rows.map(r => el('button', { onclick: () => open(r), role: 'option' },
          [el('span', { textContent: r.nick }), el('span', { className: 'hands', textContent: `${fmtSample(r.hands)} mãos` })]))
        : [el('div', { className: 'loading', textContent: `Nenhum jogador começa com "${q}"` })]));
    } catch (err) {
      box.replaceChildren(el('div', { className: 'loading', textContent: String((err as Error).message) }));
    }
  }, 250) as unknown as number;
});
const hideResults = () => { $('results').hidden = true; };
document.addEventListener('click', e => { if (!$('results').contains(e.target as Node) && e.target !== $('q')) hideResults(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { hideResults(); $('drawer').removeAttribute('open'); } });

async function open(p: { site: string; nick: string; hands: number }) {
  hideResults();
  clearError();
  $('main').replaceChildren(el('div', { className: 'loading', textContent: 'carregando…' }));
  try {
    stats = await api(`/api/stats?site=${encodeURIComponent(p.site)}&nick=${encodeURIComponent(p.nick)}`) as PlayerStats;
    remember({ ...p, hands: stats.stakes.reduce((a, s) => a + s.hands, 0) });
    render();
  } catch (err) {
    $('main').replaceChildren();
    showError(`Não deu para abrir ${p.nick}: ${(err as Error).message}`);
  }
}

// ---------- HUD ----------
function counters(): Counters {
  const out: Counters = {};
  for (const s of stats?.stakes ?? []) {
    if (stakeFilter && s.stake !== stakeFilter) continue;
    for (const [k, [o, d]] of Object.entries(s.c)) { const v = (out[k] ??= [0, 0]); v[0] += o; v[1] += d; }
  }
  return out;
}

function boxEl(box: Box, c: Counters, vsReg: boolean) {
  const table = el('table');
  if (box.cols) table.append(el('tr', {}, [el('th', {}), ...box.cols.map(t => el('th', { textContent: t }))]));
  for (const row of box.rows) {
    const tr = el('tr', {}, [el('th', { className: 'row', textContent: row.label })]);
    for (const cell of row.cells) {
      if (!cell) { tr.append(el('td', { textContent: '-', className: 'none' })); continue; }
      const key = keyFor(cell, vsReg);
      const shown = { ...cell, key };
      const [opp] = c[key] ?? [0, 0];
      const label = `${box.title} ${row.label}`;
      tr.append(el('td', { className: tone(shown, c), title: tooltip(cell, label, c, vsReg) }, [
        el('span', { className: 'v', textContent: fmtValue(shown, c) }),
        el('span', { className: 's', textContent: opp ? fmtSample(opp) : '' }),
        el('span', { className: 'r', textContent: cell.range ? `${cell.range[0]}-${cell.range[1]}` : '' }),
      ]));
    }
    table.append(tr);
  }
  return el('div', { className: 'box' }, [el('h2', { textContent: box.title }), el('div', { className: 'grid-wrap' }, [table])]);
}

function render() {
  const main = $('main');
  if (!stats) { // first screen: search + recently opened players
    $('who').hidden = true; $('tabs').hidden = true;
    const list = recent();
    main.replaceChildren(el('div', { className: 'home' }, [
      el('h2', { textContent: 'Busque um jogador' }),
      el('p', { textContent: list.length ? 'Últimos que você abriu:' : 'Digite o nick do vilão na busca acima.' }),
      el('div', { className: 'recent' }, list.map(p => el('button', { onclick: () => open(p) }, [
        el('span', { textContent: p.nick }), el('span', { className: 'hands', textContent: ` ${fmtSample(p.hands)}` })]))),
    ]));
    return;
  }
  const vsReg = $<HTMLInputElement>('vsreg').checked && hasRegs;
  const shown = stats.stakes.filter(s => !stakeFilter || s.stake === stakeFilter);
  const hands = shown.reduce((a, s) => a + s.hands, 0);
  const net = shown.reduce((a, s) => a + (s.net_bb ?? 0), 0);

  $('who').hidden = false;
  $('who').replaceChildren(el('b', { textContent: stats.nick }), document.createTextNode(
    ` · ${stats.site} · ${fmtSample(hands)} mãos${stats.team ? ' · jogador do time' : hands ? ` · ${(100 * net / hands).toFixed(1)} bb/100` : ''}`));

  const stake = $<HTMLSelectElement>('stake');
  stake.replaceChildren(el('option', { value: '', textContent: 'Todas as stakes' }),
    ...stats.stakes.map(s => el('option', { value: s.stake, textContent: `${s.stake} (${fmtSample(s.hands)})`, selected: s.stake === stakeFilter })));

  const screens = [...new Set(CATALOG.map(b => b.screen))];
  $('tabs').hidden = false;
  $('tabs').replaceChildren(...screens.map(s => el('button', {
    textContent: s, onclick: () => { screen = s; render(); },
  }, [])).map((b, i) => { b.setAttribute('aria-current', String(screens[i] === screen)); return b; }));

  const c = counters();
  main.replaceChildren(el('div', { className: 'boxes' }, CATALOG.filter(b => b.screen === screen).map(b => boxEl(b, c, vsReg))));
}

$('stake').addEventListener('change', e => { stakeFilter = (e.target as HTMLSelectElement).value; render(); });
$('vsreg').addEventListener('change', render);

// ---------- upload (chunks of whole hands; the Worker parses and counts) ----------
const CHUNK = 4 * 1024 * 1024;
const sha256 = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
  .map(b => b.toString(16).padStart(2, '0')).join('');

function splitChunks(text: string) {
  const starts: number[] = [];
  const re = /^PokerKing Hand #/gm;
  for (let m; (m = re.exec(text));) starts.push(m.index);
  const chunks: string[] = [];
  let from = 0;
  for (let i = 1; i <= starts.length; i++) {
    const end = i === starts.length ? text.length : starts[i];
    if (end - from >= CHUNK || i === starts.length) { chunks.push(text.slice(from, end)); from = end; }
  }
  return chunks.filter(Boolean);
}

$('openUpload').onclick = () => $('drawer').setAttribute('open', '');
$('closeUpload').onclick = () => $('drawer').removeAttribute('open');
$('file').addEventListener('change', async e => {
  const files = [...((e.target as HTMLInputElement).files ?? [])];
  const log = $('uplog'), bar = $('prog');
  const totals = { new: 0, dup: 0, rejected: 0 };
  for (const file of files) {
    const text = await file.text();
    const sha = await sha256(text);
    const chunks = splitChunks(text);
    log.textContent += `\n${file.name}: ${chunks.length} pedaço(s)`;
    for (const [i, chunk] of chunks.entries()) {
      bar.style.width = `${(100 * i) / chunks.length}%`;
      log.textContent += `\n  pedaço ${i + 1} de ${chunks.length}…`;
      try {
        const gz = await new Response(new Blob([chunk]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
        const r = await api(`/api/upload?sha=${sha}&part=${i}`, { method: 'POST', body: gz }) as typeof totals;
        totals.new += r.new; totals.dup += r.dup; totals.rejected += r.rejected;
        log.textContent += ` ${r.new} novas, ${r.dup} repetidas`;
      } catch (err) {
        log.textContent += ` falhou (${(err as Error).message}) — reenvie o arquivo para completar`;
        break;
      }
    }
    bar.style.width = '100%';
  }
  log.textContent += `\nTotal: ${totals.new} novas, ${totals.dup} repetidas, ${totals.rejected} rejeitadas`;
  if (stats) open({ site: stats.site, nick: stats.nick, hands: 0 });
});

// ---------- boot ----------
api('/api/regs').then(r => {
  hasRegs = (r as { regs: number }).regs > 0;
  const wrap = $('regWrap'), box = $<HTMLInputElement>('vsreg');
  box.checked = hasRegs;
  box.disabled = !hasRegs;
  wrap.setAttribute('aria-disabled', String(!hasRegs));
  wrap.title = hasRegs ? 'Contar só vilões marcados como reg (como o H2N)' : 'Lista de regs ainda não carregada';
}).catch(() => { /* boot without regs */ });
render();
