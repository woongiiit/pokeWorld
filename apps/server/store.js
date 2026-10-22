const fs = require("fs");
const path = require("path");
const rules = require("./rules");

const dataFile = path.join(__dirname, "..", "..", "data", "state.json");

let pool = null;

function asNumber(value) {
  if (value == null) return null;
  return typeof value === "number" ? value : Number(value);
}

function emptyData() {
  return { accounts: {}, ops: emptyOps() };
}

function emptyOps() {
  return { todaySpecies: null, todayDate: null, sessions: {}, audit: [], plazaCap: 40, trades: [] };
}

function packMeta(account) {
  return JSON.stringify({
    code: account.code || null,
    plaza: account.plaza || null,
    bubbleText: account.bubbleText || null,
    bubbleUntil: account.bubbleUntil || null,
    incoming: account.incoming || null,
    pvpWinDate: account.pvpWinDate || null,
    bossBallDate: account.bossBallDate || null,
    kickedUntil: account.kickedUntil || null,
    watch: account.watch || null,
    trade: account.trade || null,
  });
}

function applyMeta(account, raw) {
  let meta = {};
  if (raw) {
    try { meta = JSON.parse(raw); } catch { meta = {}; }
  }
  account.code = meta.code || null;
  account.plaza = meta.plaza || null;
  account.bubbleText = meta.bubbleText || null;
  account.bubbleUntil = meta.bubbleUntil || null;
  account.incoming = meta.incoming || null;
  account.pvpWinDate = meta.pvpWinDate || null;
  account.bossBallDate = meta.bossBallDate || null;
  account.kickedUntil = meta.kickedUntil || null;
  account.watch = meta.watch || null;
  account.trade = meta.trade || null;
}

function readFileStore() {
  if (!fs.existsSync(dataFile)) return emptyData();
  const parsed = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  if (!parsed || typeof parsed !== "object" || !parsed.accounts) return emptyData();
  if (!parsed.ops) parsed.ops = emptyOps();
  return parsed;
}

function writeFileStore(data) {
  fs.mkdirSync(path.dirname(dataFile), { recursive: true });
  const tmp = `${dataFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  if (fs.existsSync(dataFile)) fs.unlinkSync(dataFile);
  fs.renameSync(tmp, dataFile);
}

async function init() {
  if (!process.env.DATABASE_URL) {
    fs.mkdirSync(path.dirname(dataFile), { recursive: true });
    if (!fs.existsSync(dataFile)) writeFileStore(emptyData());
    return;
  }
  const { Pool } = require("pg");
  pool = new Pool({ connectionString: process.env.DATABASE_URL });
  await pool.query(`
    CREATE TABLE IF NOT EXISTS accounts (
      token TEXT PRIMARY KEY,
      nickname TEXT NOT NULL,
      balls INTEGER NOT NULL,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      last_move_at BIGINT,
      ball_settled_at BIGINT,
      started BOOLEAN NOT NULL,
      log TEXT NOT NULL,
      rare_seen_date TEXT,
      rare_seen_species TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS party (
      token TEXT NOT NULL REFERENCES accounts(token),
      slot INTEGER NOT NULL,
      species TEXT NOT NULL,
      level INTEGER NOT NULL,
      hp INTEGER NOT NULL,
      exp INTEGER NOT NULL,
      PRIMARY KEY (token, slot)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS dex (
      token TEXT NOT NULL REFERENCES accounts(token),
      species TEXT NOT NULL,
      status TEXT NOT NULL,
      PRIMARY KEY (token, species)
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS battles (
      token TEXT PRIMARY KEY REFERENCES accounts(token),
      phase TEXT NOT NULL,
      foe_species TEXT NOT NULL,
      foe_level INTEGER NOT NULL,
      foe_hp INTEGER NOT NULL,
      active_slot INTEGER NOT NULL,
      deadline BIGINT NOT NULL,
      log TEXT NOT NULL,
      pending_species TEXT,
      pending_level INTEGER,
      pending_hp INTEGER
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ops_state (
      id INTEGER PRIMARY KEY,
      today_species TEXT,
      today_date TEXT
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_sessions (
      id TEXT PRIMARY KEY,
      expires_at BIGINT NOT NULL
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_audit (
      id BIGSERIAL PRIMARY KEY,
      at BIGINT NOT NULL,
      action TEXT NOT NULL,
      value TEXT
    )
  `);
  await pool.query("ALTER TABLE accounts ADD COLUMN IF NOT EXISTS meta TEXT");
  await pool.query("ALTER TABLE battles ADD COLUMN IF NOT EXISTS body TEXT");
  await pool.query("ALTER TABLE ops_state ADD COLUMN IF NOT EXISTS extra TEXT");
}

async function load(token) {
  if (!pool) {
    const row = readFileStore().accounts[token];
    return row ? rules.migrateAccount(JSON.parse(JSON.stringify(row))) : null;
  }
  const account = await pool.query("SELECT * FROM accounts WHERE token = $1", [token]);
  if (account.rows.length === 0) return null;
  const row = account.rows[0];
  const party = await pool.query("SELECT * FROM party WHERE token = $1 ORDER BY slot", [token]);
  const dex = await pool.query("SELECT species, status FROM dex WHERE token = $1", [token]);
  const battle = await pool.query("SELECT * FROM battles WHERE token = $1", [token]);
  const dexMap = {};
  for (const entry of dex.rows) dexMap[entry.species] = entry.status;
  const battleRow = battle.rows[0];
  const loaded = {
    token: row.token,
    nickname: row.nickname,
    balls: row.balls,
    x: row.x,
    y: row.y,
    lastMoveAt: asNumber(row.last_move_at),
    ballSettledAt: asNumber(row.ball_settled_at),
    started: row.started,
    party: party.rows.map((creature) => ({
      slot: creature.slot,
      species: creature.species,
      level: creature.level,
      hp: creature.hp,
      exp: creature.exp,
    })),
    dex: dexMap,
    battle: battleRow
      ? {
        phase: battleRow.phase,
        foeSpecies: battleRow.foe_species,
        foeLevel: battleRow.foe_level,
        foeHp: battleRow.foe_hp,
        activeSlot: battleRow.active_slot,
        deadline: asNumber(battleRow.deadline),
        log: JSON.parse(battleRow.log),
        pending: battleRow.pending_species
          ? {
            species: battleRow.pending_species,
            level: battleRow.pending_level,
            hp: battleRow.pending_hp,
            exp: 0,
          }
          : null,
      }
      : null,
    log: JSON.parse(row.log),
    rareSeenDate: row.rare_seen_date,
    rareSeenSpecies: row.rare_seen_species,
  };
  applyMeta(loaded, row.meta);
  if (battleRow && battleRow.body) {
    try { loaded.battle = JSON.parse(battleRow.body); } catch { /* keep the column battle */ }
  }
  return rules.migrateAccount(loaded);
}

async function save(account) {
  if (!pool) {
    const data = readFileStore();
    data.accounts[account.token] = account;
    writeFileStore(data);
    return;
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `
        INSERT INTO accounts (
          token, nickname, balls, x, y, last_move_at, ball_settled_at, started, log, rare_seen_date, rare_seen_species, meta
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (token) DO UPDATE SET
          nickname = EXCLUDED.nickname,
          balls = EXCLUDED.balls,
          x = EXCLUDED.x,
          y = EXCLUDED.y,
          last_move_at = EXCLUDED.last_move_at,
          ball_settled_at = EXCLUDED.ball_settled_at,
          started = EXCLUDED.started,
          log = EXCLUDED.log,
          rare_seen_date = EXCLUDED.rare_seen_date,
          rare_seen_species = EXCLUDED.rare_seen_species,
          meta = EXCLUDED.meta
      `,
      [
        account.token,
        account.nickname,
        account.balls,
        account.x,
        account.y,
        account.lastMoveAt,
        account.ballSettledAt,
        account.started,
        JSON.stringify(account.log),
        account.rareSeenDate,
        account.rareSeenSpecies,
        packMeta(account),
      ],
    );
    await client.query("DELETE FROM party WHERE token = $1", [account.token]);
    for (const creature of account.party) {
      await client.query(
        "INSERT INTO party (token, slot, species, level, hp, exp) VALUES ($1,$2,$3,$4,$5,$6)",
        [account.token, creature.slot, creature.species, creature.level, creature.hp, creature.exp],
      );
    }
    await client.query("DELETE FROM dex WHERE token = $1", [account.token]);
    for (const [species, status] of Object.entries(account.dex)) {
      await client.query(
        "INSERT INTO dex (token, species, status) VALUES ($1,$2,$3)",
        [account.token, species, status],
      );
    }
    await client.query("DELETE FROM battles WHERE token = $1", [account.token]);
    if (account.battle) {
      await client.query(
        `
          INSERT INTO battles (
            token, phase, foe_species, foe_level, foe_hp, active_slot, deadline, log,
            pending_species, pending_level, pending_hp, body
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        `,
        [
          account.token,
          account.battle.phase,
          account.battle.foeSpecies,
          account.battle.foeLevel,
          account.battle.foeHp,
          account.battle.activeSlot,
          account.battle.deadline,
          JSON.stringify(account.battle.log),
          account.battle.pending ? account.battle.pending.species : null,
          account.battle.pending ? account.battle.pending.level : null,
          account.battle.pending ? account.battle.pending.hp : null,
          JSON.stringify(account.battle),
        ],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  init,
  load,
  save,
  loadAll,
  persist,
  loadOps,
  saveOps,
  listPlayers,
  setSpawn,
  createSession,
  readSession,
  dropSession,
  appendAudit,
};

async function loadOps() {
  if (!pool) {
    const ops = readFileStore().ops || emptyOps();
    const now = Date.now();
    ops.sessions = Object.fromEntries(
      Object.entries(ops.sessions || {}).filter(([, expires]) => expires > now),
    );
    ops.audit = (ops.audit || []).slice(0, 40);
    if (!ops.plazaCap) ops.plazaCap = 40;
    if (!ops.trades) ops.trades = [];
    return ops;
  }
  const state = await pool.query("SELECT today_species, today_date, extra FROM ops_state WHERE id = 1");
  const sessions = await pool.query("SELECT id, expires_at FROM admin_sessions WHERE expires_at > $1", [Date.now()]);
  const audit = await pool.query("SELECT at, action, value FROM admin_audit ORDER BY id DESC LIMIT 40");
  const row = state.rows[0] || {};
  const sessionMap = {};
  for (const entry of sessions.rows) sessionMap[entry.id] = Number(entry.expires_at);
  let extra = {};
  if (row.extra) {
    try { extra = JSON.parse(row.extra); } catch { extra = {}; }
  }
  return {
    todaySpecies: row.today_species || null,
    todayDate: row.today_date || null,
    sessions: sessionMap,
    audit: audit.rows.map((entry) => ({
      at: Number(entry.at),
      action: entry.action,
      value: entry.value,
    })),
    plazaCap: extra.plazaCap || 40,
    trades: extra.trades || [],
  };
}

async function listPlayers() {
  if (!pool) {
    return Object.values(readFileStore().accounts).map((account) => ({
      nickname: account.nickname,
      balls: account.balls,
      started: account.started === true,
      inBattle: Boolean(account.battle),
    }));
  }
  const rows = await pool.query(`
    SELECT a.nickname, a.balls, a.started, (b.token IS NOT NULL) AS in_battle
    FROM accounts a
    LEFT JOIN battles b ON b.token = a.token
    ORDER BY a.nickname
  `);
  return rows.rows.map((row) => ({
    nickname: row.nickname,
    balls: row.balls,
    started: row.started === true,
    inBattle: row.in_battle === true,
  }));
}

async function setSpawn(species, now) {
  const choice = species ? rules.canon(String(species)) : null;
  if (choice && !rules.spawnChoices().includes(choice)) return { status: 400, error: "species" };
  const date = choice ? rules.kstDate(now) : null;
  const value = choice || "없음";
  if (!pool) {
    const data = readFileStore();
    data.ops = data.ops || emptyOps();
    data.ops.todaySpecies = choice;
    data.ops.todayDate = date;
    data.ops.audit = [{ at: now, action: "spawn.set", value }].concat(data.ops.audit || []).slice(0, 40);
    writeFileStore(data);
    return { status: 200 };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      INSERT INTO ops_state (id, today_species, today_date)
      VALUES (1, $1, $2)
      ON CONFLICT (id) DO UPDATE
      SET today_species = EXCLUDED.today_species, today_date = EXCLUDED.today_date
    `, [choice, date]);
    await client.query(
      "INSERT INTO admin_audit (at, action, value) VALUES ($1, 'spawn.set', $2)",
      [now, value],
    );
    await client.query("COMMIT");
    return { status: 200 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function createSession(id, expiresAt) {
  if (!pool) {
    const data = readFileStore();
    data.ops = data.ops || emptyOps();
    data.ops.sessions = data.ops.sessions || {};
    data.ops.sessions[id] = expiresAt;
    writeFileStore(data);
    return;
  }
  await pool.query(
    "INSERT INTO admin_sessions (id, expires_at) VALUES ($1, $2)",
    [id, expiresAt],
  );
}

async function readSession(id) {
  if (!id) return false;
  const ops = await loadOps();
  return (ops.sessions[id] || 0) > Date.now();
}

async function loadAll() {
  if (!pool) {
    return Object.values(readFileStore().accounts).map((row) => rules.migrateAccount(JSON.parse(JSON.stringify(row))));
  }
  const accounts = await pool.query("SELECT token FROM accounts");
  const all = [];
  for (const row of accounts.rows) {
    const loaded = await load(row.token);
    if (loaded) all.push(loaded);
  }
  return all;
}

async function saveOps(ops) {
  if (!pool) return;
  const extra = JSON.stringify({ plazaCap: ops.plazaCap || 40, trades: ops.trades || [] });
  await pool.query(`
    INSERT INTO ops_state (id, today_species, today_date, extra)
    VALUES (1, $1, $2, $3)
    ON CONFLICT (id) DO UPDATE SET
      today_species = EXCLUDED.today_species,
      today_date = EXCLUDED.today_date,
      extra = EXCLUDED.extra
  `, [ops.todaySpecies || null, ops.todayDate || null, extra]);
}

async function persist(all, ops) {
  if (!pool) {
    const data = readFileStore();
    for (const account of all) {
      if (!account.dirty) continue;
      delete account.dirty;
      data.accounts[account.token] = account;
    }
    data.ops = data.ops || emptyOps();
    data.ops.todaySpecies = ops.todaySpecies;
    data.ops.todayDate = ops.todayDate;
    data.ops.audit = ops.audit;
    data.ops.plazaCap = ops.plazaCap || 40;
    data.ops.trades = ops.trades || [];
    writeFileStore(data);
    return;
  }
  for (const account of all) {
    if (!account.dirty) continue;
    delete account.dirty;
    await save(account);
  }
  if (ops) await saveOps(ops);
}

async function appendAudit(row) {
  if (!pool) {
    const data = readFileStore();
    data.ops = data.ops || emptyOps();
    data.ops.audit = [row].concat(data.ops.audit || []).slice(0, 40);
    writeFileStore(data);
    return;
  }
  await pool.query(
    "INSERT INTO admin_audit (at, action, value) VALUES ($1, $2, $3)",
    [row.at, row.action, row.value],
  );
}

function oneAccount(data, nickname) {
  const found = Object.values(data.accounts).filter((account) => account.nickname === nickname);
  if (found.length !== 1) return null;
  return found[0];
}

async function grantBalls(nickname, amount, reason, now) {
  const audit = { at: now, action: "ball.grant", value: `${nickname} +${amount} ${reason}` };
  if (!pool) {
    const data = readFileStore();
    const account = oneAccount(data, nickname);
    if (!account) return { status: 400, error: "player" };
    account.balls = Math.min(30, account.balls + amount);
    data.ops = data.ops || emptyOps();
    data.ops.audit = [audit].concat(data.ops.audit || []).slice(0, 40);
    writeFileStore(data);
    return { status: 200 };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      "UPDATE accounts SET balls = LEAST(30, balls + $2) WHERE nickname = $1 RETURNING nickname",
      [nickname, amount],
    );
    if (updated.rowCount !== 1) {
      await client.query("ROLLBACK");
      return { status: 400, error: "player" };
    }
    await client.query(
      "INSERT INTO admin_audit (at, action, value) VALUES ($1, $2, $3)",
      [audit.at, audit.action, audit.value],
    );
    await client.query("COMMIT");
    return { status: 200 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function midnightBalls(nickname, reason, now) {
  const audit = { at: now, action: "ball.midnight", value: `${nickname} ${reason}` };
  if (!pool) {
    const data = readFileStore();
    const account = oneAccount(data, nickname);
    if (!account) return { status: 400, error: "player" };
    account.balls = Math.min(30, account.balls + 3);
    account.ballSettledAt = now;
    data.ops = data.ops || emptyOps();
    data.ops.audit = [audit].concat(data.ops.audit || []).slice(0, 40);
    writeFileStore(data);
    return { status: 200 };
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const updated = await client.query(
      "UPDATE accounts SET balls = LEAST(30, balls + 3), ball_settled_at = $2 WHERE nickname = $1 RETURNING nickname",
      [nickname, now],
    );
    if (updated.rowCount !== 1) {
      await client.query("ROLLBACK");
      return { status: 400, error: "player" };
    }
    await client.query(
      "INSERT INTO admin_audit (at, action, value) VALUES ($1, $2, $3)",
      [audit.at, audit.action, audit.value],
    );
    await client.query("COMMIT");
    return { status: 200 };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function dropSession(id) {
  if (!pool) {
    const data = readFileStore();
    if (data.ops && data.ops.sessions) delete data.ops.sessions[id];
    writeFileStore(data);
    return;
  }
  await pool.query("DELETE FROM admin_sessions WHERE id = $1", [id]);
}
