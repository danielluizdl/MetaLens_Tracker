// Browser side: login, player list, HUD (H2N layout, Meta Lens skin), stat drill-down and upload.
// Bundled to public/app.js with esbuild (npm run build:ui).
import { CATALOG, value, type Box, type Cell } from './catalog.ts';
import { describe, fmtSample, fmtValue, keyFor, tone, type Counters } from './hud.ts';

type Stake = { stake: string; hands: number; net_bb: number | null; c: Counters };
type PlayerStats = { site: string; nick: string; team: boolean; stakes: Stake[] };
type PlayerRow = { site: string; nick: string; hands: number };
type Me = { email: string; role: 'admin' | 'player' };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, kids: (Node | string)[] = []) => {
  const n = Object.assign(document.createElement(tag), props);
  for (const k of kids) n.append(k);
  return n;
};
async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  return body;
}

let me: Me | null = null;
let stats: PlayerStats | null = null;
let players: PlayerRow[] = [];
let screen = CATALOG[0].screen;
let stakeFilter = '';
let hasRegs = false;

// ---------- login ----------
let mode: 'in' | 'up' = 'in';
const setMode = (m: 'in' | 'up') => {
  mode = m;
  $('tabIn').setAttribute('aria-selected', String(m === 'in'));
  $('tabUp').setAttribute('aria-selected', String(m === 'up'));
  $('code').hidden = m === 'in';
  $<HTMLButtonElement>('loginBtn').textContent = m === 'in' ? 'Entrar' : 'Criar conta';
  $('loginHint').textContent = m === 'in' ? 'Acesso só para o time.' : 'Precisa de um código de convite de um admin. A primeira conta da base vira admin.';
};
$('tabIn').onclick = () => setMode('in');
$('tabUp').onclick = () => setMode('up');
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const msg = $('loginMsg');
  msg.hidden = true;
  const body = {
    email: $<HTMLInputElement>('email').value.trim(),
    pass: $<HTMLInputElement>('pass').value,
    code: $<HTMLInputElement>('code').value.trim().toUpperCase(),
  };
  try {
    me = await api(mode === 'in' ? '/api/login' : '/api/register', { method: 'POST', body: JSON.stringify(body) }) as Me;
    start();
  } catch (err) {
    msg.hidden = false;
    msg.textContent = (err as Error).message;
  }
});
$('logout').onclick = async () => { await api('/api/logout', { method: 'POST' }).catch(() => {}); location.reload(); };

// ---------- player list (left column) ----------
async function loadPlayers(q = '') {
  const list = $('plist');
  list.replaceChildren(el('div', { className: 'loading', textContent: 'carregando…' }));
  try {
    players = await api(`/api/players?q=${encodeURIComponent(q)}`) as PlayerRow[];
  } catch (err) {
    return list.replaceChildren(el('div', { className: 'loading', textContent: (err as Error).message }));
  }
  if (!players.length) return list.replaceChildren(el('div', { className: 'loading', textContent: q ? 'nenhum jogador com esse começo' : 'base vazia: suba um arquivo de mãos' }));
  list.replaceChildren(...players.map(p => {
    const b = el('button', { onclick: () => open(p) }, [
      el('span', { className: 'nick' }, [
        el('span', { textContent: p.nick }),
        el('span', { className: 'avail' }, availability(p.hands)),
      ]),
      el('span', { className: 'hands num', textContent: fmtSample(p.hands) }),
    ]);
    if (stats && stats.nick === p.nick) b.setAttribute('aria-current', 'true');
    return b;
  }));
}
/** Sample thresholds: preflop reads from ~500 hands, postflop ~1.000, river ~2.000. */
function availability(hands: number) {
  return [500, 1000, 2000].map(limit => {
    const i = el('i');
    i.title = `${limit === 500 ? 'preflop' : limit === 1000 ? 'postflop' : 'river'}: ${hands >= limit ? 'amostra boa' : hands >= limit / 2 ? 'amostra curta' : 'amostra pequena'}`;
    i.className = hands >= limit ? 'on' : hands >= limit / 2 ? 'half' : '';
    return i;
  });
}
let filterTimer: number | undefined;
$('pfilter').addEventListener('input', e => {
  clearTimeout(filterTimer);
  const q = (e.target as HTMLInputElement).value.trim();
  filterTimer = setTimeout(() => loadPlayers(q), 250) as unknown as number;
});

// ---------- search (top) ----------
let searchTimer: number | undefined;
$('q').addEventListener('input', e => {
  const q = (e.target as HTMLInputElement).value.trim();
  clearTimeout(searchTimer);
  const box = $('results');
  if (!q) { box.hidden = true; return; }
  box.hidden = false;
  box.replaceChildren(el('div', { className: 'loading', textContent: 'buscando…' }));
  searchTimer = setTimeout(async () => {
    try {
      const rows = await api(`/api/player?q=${encodeURIComponent(q)}`) as PlayerRow[];
      box.replaceChildren(...(rows.length
        ? rows.map(r => el('button', { role: 'option', onclick: () => { box.hidden = true; open(r); } }, [
          el('span', { textContent: r.nick }), el('span', { className: 'hands num', textContent: `${fmtSample(r.hands)} mãos` })]))
        : [el('div', { className: 'loading', textContent: `Nenhum jogador começa com "${q}"` })]));
    } catch (err) {
      box.replaceChildren(el('div', { className: 'loading', textContent: (err as Error).message }));
    }
  }, 250) as unknown as number;
});
document.addEventListener('click', e => { if (!$('results').contains(e.target as Node) && e.target !== $('q')) $('results').hidden = true; });
document.addEventListener('keydown', e => { if (e.key === 'Escape') document.querySelectorAll('.panel[open]').forEach(p => p.removeAttribute('open')); });

// ---------- player ----------
async function open(p: PlayerRow) {
  $('main').replaceChildren(el('div', { className: 'loading', textContent: 'carregando…' }));
  try {
    stats = await api(`/api/stats?site=${encodeURIComponent(p.site)}&nick=${encodeURIComponent(p.nick)}`) as PlayerStats;
    stakeFilter = '';
    render();
    loadPlayers($<HTMLInputElement>('pfilter').value.trim());
  } catch (err) {
    $('main').replaceChildren(el('div', { className: 'error', textContent: `Não deu para abrir ${p.nick}: ${(err as Error).message}` }));
  }
}

function counters(): Counters {
  const out: Counters = {};
  for (const s of stats?.stakes ?? []) {
    if (stakeFilter && s.stake !== stakeFilter) continue;
    for (const [k, [o, d]] of Object.entries(s.c)) { const v = (out[k] ??= [0, 0]); v[0] += o; v[1] += d; }
  }
  return out;
}
const vsReg = () => $<HTMLInputElement>('vsreg')?.checked === true && hasRegs;

function cellEl(box: Box, rowLabel: string, col: string | undefined, cell: Cell | null, c: Counters) {
  if (!cell) return el('td', { className: 'none', textContent: '-' });
  const key = keyFor(cell, vsReg());
  const shown = { ...cell, key };
  const [opp] = c[key] ?? [0, 0];
  const label = `${box.title} · ${rowLabel}${col ? ` ${col}` : ''}`;
  return el('td', { className: `cell ${tone(shown, c)}`, title: 'clique para ver o detalhe', onclick: () => showDetail(box, rowLabel, col, cell) }, [
    el('span', { className: 'v', textContent: fmtValue(shown, c) }),
    el('span', { className: 's', textContent: opp ? fmtSample(opp) : '' }),
    el('span', { className: 'r', textContent: cell.range ? `${cell.range[0]}-${cell.range[1]}` : '' }),
  ]);
}

function boxEl(box: Box, c: Counters) {
  const table = el('table');
  if (box.cols) table.append(el('tr', {}, [el('th', {}), ...box.cols.map(t => el('th', { textContent: t }))]));
  for (const row of box.rows) {
    table.append(el('tr', {}, [el('th', { className: 'row', textContent: row.label }),
      ...row.cells.map((cell, i) => cellEl(box, row.label, box.cols?.[i], cell, c))]));
  }
  return el('div', { className: 'box' }, [el('h2', { textContent: box.title }), el('div', { className: 'grid-wrap' }, [table])]);
}

function render() {
  const main = $('main');
  if (!stats) {
    main.replaceChildren(el('div', { className: 'empty' }, [
      el('h2', { textContent: 'Escolha um jogador' }),
      el('p', { textContent: 'Use a coluna da esquerda ou a busca no topo. As barrinhas ao lado do nick mostram se já há amostra para preflop, postflop e river.' }),
    ]));
    return;
  }
  const shown = stats.stakes.filter(s => !stakeFilter || s.stake === stakeFilter);
  const hands = shown.reduce((a, s) => a + s.hands, 0);
  const net = shown.reduce((a, s) => a + (s.net_bb ?? 0), 0);
  const screens = [...new Set(CATALOG.map(b => b.screen))];
  const c = counters();

  main.replaceChildren(
    el('div', { className: 'who' }, [
      el('h1', { textContent: stats.nick }),
      el('span', { className: 'meta', textContent: `${stats.site} · ${fmtSample(hands)} mãos${stats.team ? ' · jogador do time' : hands ? ` · ${(100 * net / hands).toFixed(1)} bb/100` : ''}` }),
    ]),
    el('div', { className: 'toolbar' }, [
      (() => {
        const s = el('select', { onchange: e => { stakeFilter = (e.target as HTMLSelectElement).value; render(); } },
          [el('option', { value: '', textContent: 'Todas as stakes' }),
            ...stats.stakes.map(x => el('option', { value: x.stake, textContent: `${x.stake} (${fmtSample(x.hands)})`, selected: x.stake === stakeFilter }))]);
        return s;
      })(),
      el('label', { className: 'toggle', title: hasRegs ? 'Contar só vilões marcados como reg (como o H2N)' : 'Lista de regs ainda não carregada' }, [
        Object.assign(document.createElement('input'), { type: 'checkbox', id: 'vsreg', checked: hasRegs, disabled: !hasRegs, onchange: render }),
        'vs reg',
      ]),
    ]),
    el('nav', { className: 'screens' }, screens.map(s => {
      const b = el('button', { textContent: s, onclick: () => { screen = s; render(); } });
      b.setAttribute('aria-current', String(s === screen));
      return b;
    })),
    el('div', { className: 'boxes' }, CATALOG.filter(b => b.screen === screen).map(b => boxEl(b, c))),
  );
}

// ---------- stat drill-down ----------
function showDetail(box: Box, rowLabel: string, col: string | undefined, cell: Cell) {
  const reg = vsReg();
  const key = keyFor(cell, reg);
  const all = counters();
  const [opp, did] = all[key] ?? [0, 0];
  const v = value({ ...cell, key }, all[key]);
  const t = tone({ ...cell, key }, all);
  const perStake = (stats?.stakes ?? []).map(s => ({ stake: s.stake, c: s.c[key] ?? [0, 0] as [number, number] }))
    .filter(x => x.c[0] > 0);
  const family = box.rows.flatMap(r => r.cells.map((x, i) => ({ row: r.label, col: box.cols?.[i], cell: x })))
    .filter(x => x.cell && x.cell.key !== cell.key) as { row: string; col?: string; cell: Cell }[];

  $('detailBody').replaceChildren(
    el('h2', { textContent: `${rowLabel}${col ? ` ${col}` : ''}` }),
    el('div', { className: 'sub', textContent: `${box.title} · ${box.screen}${cell.reg ? (reg ? ' · contando só regs' : ' · contando todos os vilões') : ''}` }),
    el('div', { className: `big num ${t}` }, [el('span', { className: 'v', textContent: isNaN(v) ? '-' : v.toFixed(1) + (cell.ratio ? '' : '%') })]),
    el('div', { className: 'kv' }, [
      el('span', { textContent: 'amostra' }), el('b', { className: 'num', textContent: opp ? `${did} de ${opp}` : 'sem mãos ainda' }),
      el('span', { textContent: 'faixa do time' }), el('b', { className: 'num', textContent: cell.range ? `${cell.range[0]}-${cell.range[1]}` : '—' }),
      el('span', { textContent: 'H2N (dLzinN)' }), el('b', { className: 'num', textContent: cell.h2n ? `${cell.h2n[0]}${cell.ratio ? '' : '%'} (${fmtSample(cell.h2n[1])})` : '—' }),
      el('span', { textContent: 'chave' }), el('b', { className: 'num', textContent: key }),
    ]),
    el('div', { className: 'rule', textContent: describe(cell.key) || 'sem descrição' }),
    ...(perStake.length > 1 ? [
      el('h3', { textContent: 'Por stake', style: 'font-size:13px;color:var(--muted);margin:18px 0 0' }),
      el('table', {}, [
        el('tr', {}, [el('th', { textContent: 'stake' }), el('th', { textContent: 'valor' }), el('th', { textContent: 'amostra' })]),
        ...perStake.map(x => el('tr', {}, [
          el('td', { textContent: x.stake }),
          el('td', { className: 'num', textContent: x.c[0] ? (cell.ratio ? (x.c[1] / x.c[0]).toFixed(1) : (100 * x.c[1] / x.c[0]).toFixed(1) + '%') : '-' }),
          el('td', { className: 'num', textContent: `${x.c[1]} de ${x.c[0]}` }),
        ])),
      ])] : []),
    ...(family.length ? [
      el('h3', { textContent: `Outras células de ${box.title}`, style: 'font-size:13px;color:var(--muted);margin:18px 0 0' }),
      el('table', {}, family.map(f => {
        const k = keyFor(f.cell, reg);
        const [o, d] = all[k] ?? [0, 0];
        return el('tr', { style: 'cursor:pointer' }, [
          el('td', { textContent: `${f.row}${f.col ? ` ${f.col}` : ''}` }),
          el('td', { className: `num ${tone({ ...f.cell, key: k }, all)}` }, [el('span', { className: 'v', textContent: o ? (100 * d / o).toFixed(1) + '%' : '-' })]),
          el('td', { className: 'num', textContent: o ? fmtSample(o) : '' }),
        ]);
      }))] : []),
  );
  $('detail').setAttribute('open', '');
}
$('closeDetail').onclick = () => $('detail').removeAttribute('open');

// ---------- upload (admin) ----------
const CHUNK = 4 * 1024 * 1024;
const sha256 = async (s: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s))))
  .map(b => b.toString(16).padStart(2, '0')).join('');
function splitChunks(text: string) {
  const starts = [...text.matchAll(/^PokerKing Hand #/gm)].map(m => m.index!);
  const chunks: string[] = [];
  let from = 0;
  for (let i = 1; i <= starts.length; i++) {
    const end = i === starts.length ? text.length : starts[i];
    if (end - from >= CHUNK || i === starts.length) { chunks.push(text.slice(from, end)); from = end; }
  }
  return chunks.filter(Boolean);
}
$('openUpload').onclick = () => $('upload').setAttribute('open', '');
$('closeUpload').onclick = () => $('upload').removeAttribute('open');
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
  loadPlayers();
  if (stats) open({ site: stats.site, nick: stats.nick, hands: 0 });
});

// ---------- admin panel ----------
$('openAdmin').onclick = async () => {
  $('admin').setAttribute('open', '');
  const body = $('adminBody');
  body.replaceChildren(el('div', { className: 'loading', textContent: 'carregando…' }));
  try {
    const [invites, users] = await Promise.all([api('/api/invites'), api('/api/users')]) as [
      { code: string; role: string; used_by: string | null }[], { email: string; role: string }[]];
    body.replaceChildren(
      el('button', { className: 'primary', textContent: 'Gerar convite de player', onclick: () => newInvite('player') }),
      el('button', { className: 'ghost', textContent: 'Gerar convite de admin', style: 'margin-top:8px;width:100%', onclick: () => newInvite('admin') }),
      el('h3', { textContent: 'Convites', style: 'font-size:13px;color:var(--muted);margin:18px 0 0' }),
      el('table', {}, [el('tr', {}, [el('th', { textContent: 'código' }), el('th', { textContent: 'tipo' }), el('th', { textContent: 'usado por' })]),
        ...invites.map(i => el('tr', {}, [el('td', { className: 'num', textContent: i.code }), el('td', { textContent: i.role }), el('td', { textContent: i.used_by ?? '—' })]))]),
      el('h3', { textContent: 'Contas', style: 'font-size:13px;color:var(--muted);margin:18px 0 0' }),
      el('table', {}, [el('tr', {}, [el('th', { textContent: 'e-mail' }), el('th', { textContent: 'tipo' })]),
        ...users.map(u => el('tr', {}, [el('td', { textContent: u.email }),
          el('td', {}, [el('select', {
            onchange: async ev => { await api('/api/users', { method: 'POST', body: JSON.stringify({ email: u.email, role: (ev.target as HTMLSelectElement).value }) }); },
          }, [el('option', { value: 'player', textContent: 'player', selected: u.role === 'player' }), el('option', { value: 'admin', textContent: 'admin', selected: u.role === 'admin' })])])]))]),
    );
  } catch (err) {
    body.replaceChildren(el('div', { className: 'error', textContent: (err as Error).message }));
  }
};
async function newInvite(role: string) {
  const r = await api('/api/invites', { method: 'POST', body: JSON.stringify({ role }) }) as { code: string };
  alert(`Código de convite (${role}): ${r.code}`);
  $('openAdmin').click();
}
$('closeAdmin').onclick = () => $('admin').removeAttribute('open');

// ---------- boot ----------
function start() {
  $('login').style.display = 'none';
  $('app').style.display = 'grid';
  $('meLabel').replaceChildren(document.createTextNode(me!.email + ' '), el('span', { className: `tag ${me!.role}`, textContent: me!.role }));
  $('openUpload').hidden = me!.role !== 'admin';
  $('openAdmin').hidden = me!.role !== 'admin';
  api('/api/regs').then(r => { hasRegs = (r as { regs: number }).regs > 0; render(); }).catch(() => {});
  loadPlayers();
  render();
}
api('/api/me').then(u => { me = u as Me; start(); }).catch(() => setMode('in'));
