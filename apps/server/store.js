const fs = require("fs");
const path = require("path");

const dataFile = path.join(__dirname, "..", "..", "data", "state.json");

let pool = null;

function asNumber(value) {
  if (value == null) return null;
  return typeof value === "number" ? value : Number(value);
}

function emptyData() {
  return { accounts: {} };
}

function readFileStore() {
  if (!fs.existsSync(dataFile)) return emptyData();
  const parsed = JSON.parse(fs.readFileSync(dataFile, "utf8"));
  if (!parsed || typeof parsed !== "object" || !parsed.accounts) return emptyData();
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
}

async function load(token) {
  if (!pool) {
    const row = readFileStore().accounts[token];
    return row ? JSON.parse(JSON.stringify(row)) : null;
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
  return {
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
          token, nickname, balls, x, y, last_move_at, ball_settled_at, started, log, rare_seen_date, rare_seen_species
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
          rare_seen_species = EXCLUDED.rare_seen_species
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
            pending_species, pending_level, pending_hp
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
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
};
