-- MetaLens Tracker — D1 schema. Apply: npx wrangler d1 execute metalens --remote --file schema.sql
-- Nicks are COLLATE NOCASE so prefix search (LIKE 'abc%') uses the primary-key index.

-- Counters per player and stake. c = {"<stat key>": [opportunities, done], ...} (see src/stats.ts)
CREATE TABLE IF NOT EXISTS stats (
  site   TEXT NOT NULL,
  nick   TEXT NOT NULL COLLATE NOCASE,
  stake  TEXT NOT NULL,
  hands  INTEGER NOT NULL,
  net_bb REAL NOT NULL,
  c      TEXT NOT NULL,
  PRIMARY KEY (site, nick, stake)
);

-- Every hand ever counted: the dedupe guard (INSERT fails on a repeated hand → the batch rolls back).
CREATE TABLE IF NOT EXISTS hands (
  site TEXT NOT NULL,
  id   TEXT NOT NULL,
  PRIMARY KEY (site, id)
) WITHOUT ROWID;

-- Audit trail: who sent which file part, and what it added.
CREATE TABLE IF NOT EXISTS uploads (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  user     TEXT NOT NULL,
  sha      TEXT NOT NULL,
  part     INTEGER NOT NULL,
  new      INTEGER NOT NULL,
  dup      INTEGER NOT NULL,
  rejected INTEGER NOT NULL,
  created  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- H2N "Is Reg" marker (imported from H2N Export Notes). Changing it requires /api/admin/rebuild.
CREATE TABLE IF NOT EXISTS regs (
  site TEXT NOT NULL,
  nick TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (site, nick)
);

-- Team members: their bb/100 is hidden in the HUD.
CREATE TABLE IF NOT EXISTS team (
  site TEXT NOT NULL,
  nick TEXT NOT NULL COLLATE NOCASE,
  PRIMARY KEY (site, nick)
);

-- Accounts. Roles: 'admin' (everything) and 'player' (search and read only).
CREATE TABLE IF NOT EXISTS users (
  email   TEXT PRIMARY KEY COLLATE NOCASE,
  pass    TEXT NOT NULL,          -- pbkdf2$<iterations>$<salt b64>$<hash b64>
  role    TEXT NOT NULL DEFAULT 'player',
  created TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Invite codes: an admin creates one, a new account consumes it.
CREATE TABLE IF NOT EXISTS invites (
  code    TEXT PRIMARY KEY,
  role    TEXT NOT NULL DEFAULT 'player',
  created_by TEXT NOT NULL,
  created TEXT NOT NULL DEFAULT (datetime('now')),
  used_by TEXT,
  used    TEXT
);
