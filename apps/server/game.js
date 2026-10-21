const rules = require("./rules");

const DIRECTIONS = {
  n: [0, -1],
  s: [0, 1],
  w: [-1, 0],
  e: [1, 0],
};

function createAccount({ token, nickname }) {
  const dex = {};
  for (const species of rules.SPECIES_ORDER) dex[species] = "unseen";
  return {
    token,
    nickname,
    balls: 0,
    x: 2,
    y: 7,
    lastMoveAt: null,
    ballSettledAt: null,
    started: false,
    party: [],
    dex,
    battle: null,
    log: [],
    rareSeenDate: null,
    rareSeenSpecies: null,
  };
}

function activeCreature(account) {
  return account.party.find((creature) => creature.slot === account.battle.activeSlot);
}

function living(account) {
  return account.party.filter((creature) => creature.hp >= 1).sort((a, b) => a.slot - b.slot);
}

function smallestEmptySlot(party) {
  const used = new Set(party.map((creature) => creature.slot));
  for (let slot = 0; slot < 3; slot += 1) {
    if (!used.has(slot)) return slot;
  }
  return -1;
}

function pushLog(account, line) {
  account.battle.log.push(line);
  if (account.battle.log.length > 40) account.battle.log.shift();
}

function endBattle(account, line) {
  const lines = account.battle.log.slice();
  if (line) lines.push(line);
  account.log = account.log.concat(lines).slice(-40);
  account.battle = null;
}

function heal(account) {
  for (const creature of account.party) {
    creature.hp = rules.stats(creature.species, creature.level).hp;
  }
}

function warpGate(account) {
  account.x = 2;
  account.y = 7;
  heal(account);
}

function defeat(account) {
  warpGate(account);
  endBattle(account, "패배");
}

function settleBalls(account, now) {
  if (!account.started || account.ballSettledAt == null) return false;
  const nights = rules.midnightsBetween(account.ballSettledAt, now);
  if (nights <= 0) return false;
  account.balls = rules.settleBallCount(account.balls, nights);
  account.ballSettledAt = now;
  return true;
}

function rareAlreadySeen(account, now) {
  if (!rules.RARES.includes(rules.TODAY_SPECIES)) return false;
  return account.rareSeenDate === rules.kstDate(now) && account.rareSeenSpecies === rules.TODAY_SPECIES;
}

function markSeen(account, species) {
  if (account.dex[species] !== "caught") account.dex[species] = "seen";
}

function noteEncounter(account, species, now) {
  markSeen(account, species);
  if (rules.RARES.includes(species)) {
    account.rareSeenDate = rules.kstDate(now);
    account.rareSeenSpecies = species;
  }
}

function startBattle(account, species, level, now) {
  const lead = living(account)[0];
  noteEncounter(account, species, now);
  account.battle = {
    phase: "turn",
    foeSpecies: species,
    foeLevel: level,
    foeHp: rules.stats(species, level).hp,
    activeSlot: lead.slot,
    deadline: now + rules.TURN_MS,
    log: [],
    pending: null,
  };
}

function rollEncounter(account, tile, now, rng) {
  const rate = rules.encounterRate(tile);
  if (rate <= 0) return;
  if (living(account).length === 0) {
    warpGate(account);
    return;
  }
  if (rng.roll(100) > rate) return;
  const table = rules.encounterTable(tile, rareAlreadySeen(account, now));
  const species = rules.pickWeighted(table, rng.roll(rules.weightSum(table)));
  const level = rng.roll(3) + 1;
  startBattle(account, species, level, now);
}

function strike(account, who, move, rng) {
  const battle = account.battle;
  const active = activeCreature(account);
  const foeStats = rules.stats(battle.foeSpecies, battle.foeLevel);
  const playerStats = rules.stats(active.species, active.level);
  const attacker = who === "player" ? active.species : battle.foeSpecies;
  const attack = who === "player" ? playerStats.attack : foeStats.attack;
  const defense = who === "player" ? foeStats.defense : playerStats.defense;
  const level = who === "player" ? active.level : battle.foeLevel;
  const defendType = who === "player"
    ? rules.SPECIES[battle.foeSpecies].type
    : rules.SPECIES[active.species].type;
  if (rng.roll(100) > move.accuracy) {
    pushLog(account, `${attacker} ${move.name} 빗나감`);
    return false;
  }
  const dealt = rules.damage({
    level,
    power: move.power,
    attack,
    defense,
    multiplier: rules.typeMultiplier(move.type, defendType),
  });
  if (who === "player") {
    battle.foeHp = Math.max(0, battle.foeHp - dealt);
    pushLog(account, `${attacker} ${move.name} 명중`);
    return battle.foeHp === 0;
  }
  active.hp = Math.max(0, active.hp - dealt);
  pushLog(account, `${attacker} ${move.name} 명중`);
  return active.hp === 0;
}

function afterPlayerFainted(account, now) {
  if (living(account).length === 0) {
    defeat(account);
    return;
  }
  account.battle.phase = "switch";
  account.battle.deadline = now + rules.TURN_MS;
  pushLog(account, "기절");
}

function chooseWildMove(account, rng) {
  const index = rng.roll(10) <= 7 ? 1 : 2;
  return rules.creatureMove(account.battle.foeSpecies, index);
}

function wildAttack(account, now, rng) {
  const move = chooseWildMove(account, rng);
  strike(account, "foe", move, rng);
  if (!account.battle) return;
  if (activeCreature(account).hp <= 0) afterPlayerFainted(account, now);
  else {
    account.battle.phase = "turn";
    account.battle.deadline = now + rules.TURN_MS;
  }
}

function resolveMoves(account, kind, now, rng) {
  const active = activeCreature(account);
  const playerMove = rules.creatureMove(active.species, kind === "move2" ? 2 : 1);
  const foeMove = chooseWildMove(account, rng);
  const playerSpeed = rules.stats(active.species, active.level).speed;
  const foeSpeed = rules.stats(account.battle.foeSpecies, account.battle.foeLevel).speed;
  const order = playerSpeed >= foeSpeed ? ["player", "foe"] : ["foe", "player"];
  for (const who of order) {
    const killed = strike(account, who, who === "player" ? playerMove : foeMove, rng);
    if (killed) break;
  }
  if (account.battle.foeHp <= 0) {
    const winner = activeCreature(account);
    rules.applyExp(winner, rules.expGain(account.battle.foeLevel));
    endBattle(account, "승리");
    return;
  }
  if (activeCreature(account).hp <= 0) {
    afterPlayerFainted(account, now);
    return;
  }
  account.battle.phase = "turn";
  account.battle.deadline = now + rules.TURN_MS;
}

function validSlot(slot) {
  return slot === 0 || slot === 1 || slot === 2;
}

function catchSuccess(account, now) {
  const caught = {
    species: account.battle.foeSpecies,
    level: account.battle.foeLevel,
    hp: account.battle.foeHp,
    exp: 0,
  };
  const slot = smallestEmptySlot(account.party);
  if (slot >= 0) {
    account.party.push({ slot, species: caught.species, level: caught.level, hp: caught.hp, exp: 0 });
    account.dex[caught.species] = "caught";
    endBattle(account, "포획");
    return;
  }
  account.battle.pending = caught;
  account.battle.phase = "replace";
  account.battle.deadline = now + rules.TURN_MS;
  pushLog(account, "교체");
}

function commitReplace(account, slot) {
  const pending = account.battle.pending;
  account.party = account.party.filter((creature) => creature.slot !== slot);
  account.party.push({
    slot,
    species: pending.species,
    level: pending.level,
    hp: pending.hp,
    exp: 0,
  });
  account.dex[pending.species] = "caught";
  endBattle(account, "교체");
}

function timeoutReplace(account) {
  const fainted = account.party.filter((creature) => creature.hp <= 0).sort((a, b) => a.slot - b.slot);
  const slot = fainted.length > 0 ? fainted[0].slot : 2;
  commitReplace(account, slot);
}

function timeoutSwitch(account, now) {
  const next = living(account)[0];
  if (!next) {
    defeat(account);
    return;
  }
  account.battle.activeSlot = next.slot;
  account.battle.phase = "turn";
  account.battle.deadline = now + rules.TURN_MS;
  pushLog(account, "교대");
}

function resolveTimeout(account, now, rng) {
  if (!account.battle || now < account.battle.deadline) return false;
  if (account.battle.phase === "turn") resolveMoves(account, "move1", now, rng);
  else if (account.battle.phase === "switch") timeoutSwitch(account, now);
  else if (account.battle.phase === "replace") timeoutReplace(account);
  return true;
}

function openRequest(account, now, rng) {
  settleBalls(account, now);
  return resolveTimeout(account, now, rng);
}

function chooseStarter(account, species, now) {
  if (account.started) return { status: 409, error: "starter" };
  if (!rules.STARTERS.includes(species)) return { status: 400, error: "species" };
  const level = 5;
  account.party = [{
    slot: 0,
    species,
    level,
    hp: rules.stats(species, level).hp,
    exp: 0,
  }];
  account.dex[species] = "caught";
  account.balls = 10;
  account.ballSettledAt = now;
  account.started = true;
  account.x = 2;
  account.y = 7;
  heal(account);
  return { status: 200 };
}

function handleStarter(account, species, now, rng) {
  const timedOut = openRequest(account, now, rng);
  if (account.started) return { status: 409, error: "starter" };
  if (timedOut) return { status: 200 };
  return chooseStarter(account, species, now);
}

function tryMove(account, dir, now, rng) {
  if (!account.started) return { status: 400, error: "starter" };
  if (account.battle) return { status: 400, error: "battle" };
  const delta = DIRECTIONS[dir];
  if (!delta) return { status: 400, error: "dir" };
  const x = account.x + delta[0];
  const y = account.y + delta[1];
  if (!rules.tileAt(x, y)) return { status: 400, error: "bounds" };
  if (account.lastMoveAt != null && now - account.lastMoveAt < 300) {
    return { status: 400, error: "fast" };
  }
  account.x = x;
  account.y = y;
  account.lastMoveAt = now;
  if (living(account).length === 0) {
    warpGate(account);
    return { status: 200 };
  }
  const tile = rules.tileAt(x, y);
  if (tile === "gate") heal(account);
  rollEncounter(account, tile, now, rng);
  return { status: 200 };
}

function handleMove(account, dir, now, rng) {
  if (openRequest(account, now, rng)) return { status: 200 };
  return tryMove(account, dir, now, rng);
}

function actTurn(account, kind, slot, now, rng) {
  if (kind === "move1" || kind === "move2") {
    resolveMoves(account, kind, now, rng);
    return { status: 200 };
  }
  if (kind === "switch") {
    const target = account.party.find((creature) => creature.slot === slot);
    const others = living(account).filter((creature) => creature.slot !== account.battle.activeSlot);
    if (!target || target.hp < 1 || target.slot === account.battle.activeSlot || others.length === 0) {
      return { status: 400, error: "switch" };
    }
    account.battle.activeSlot = slot;
    pushLog(account, "교대");
    wildAttack(account, now, rng);
    return { status: 200 };
  }
  if (kind === "flee") {
    const active = activeCreature(account);
    const chance = rules.fleeChance(
      rules.stats(active.species, active.level).speed,
      rules.stats(account.battle.foeSpecies, account.battle.foeLevel).speed,
    );
    if (rng.roll(100) <= chance) {
      endBattle(account, "도망");
      return { status: 200 };
    }
    pushLog(account, "도망 실패");
    wildAttack(account, now, rng);
    return { status: 200 };
  }
  if (kind === "ball") {
    if (account.balls < 1) return { status: 400, error: "balls" };
    if (account.battle.foeHp < 1) return { status: 400, error: "balls" };
    account.balls -= 1;
    const maxHp = rules.stats(account.battle.foeSpecies, account.battle.foeLevel).hp;
    const chance = rules.captureChance(account.battle.foeHp, maxHp, 0);
    if (rng.roll(100) <= chance) {
      catchSuccess(account, now);
      return { status: 200 };
    }
    pushLog(account, "포획 실패");
    wildAttack(account, now, rng);
    return { status: 200 };
  }
  return { status: 400, error: "kind" };
}

function actSwitch(account, kind, slot, now) {
  if (kind !== "switch" || !validSlot(slot)) return { status: 400, error: "switch" };
  const target = account.party.find((creature) => creature.slot === slot);
  if (!target || target.hp < 1) return { status: 400, error: "switch" };
  account.battle.activeSlot = slot;
  account.battle.phase = "turn";
  account.battle.deadline = now + rules.TURN_MS;
  pushLog(account, "교대");
  return { status: 200 };
}

function actReplace(account, kind, slot) {
  if (kind !== "replace" || !validSlot(slot)) return { status: 400, error: "slot" };
  if (!account.party.some((creature) => creature.slot === slot)) {
    return { status: 400, error: "slot" };
  }
  commitReplace(account, slot);
  return { status: 200 };
}

function handleAct(account, input, now, rng) {
  if (openRequest(account, now, rng)) return { status: 200 };
  if (!account.battle) return { status: 400, error: "battle" };
  const kind = input && input.kind;
  const slot = input ? input.slot : undefined;
  if (slot !== undefined && !validSlot(slot)) return { status: 400, error: "slot" };
  if (account.battle.phase === "turn") return actTurn(account, kind, slot, now, rng);
  if (account.battle.phase === "switch") return actSwitch(account, kind, slot, now);
  if (account.battle.phase === "replace") return actReplace(account, kind, slot);
  return { status: 400, error: "kind" };
}

function handleState(account, now, rng) {
  openRequest(account, now, rng);
  return { status: 200 };
}

function view(account, now) {
  const battle = account.battle
    ? {
      phase: account.battle.phase,
      foe: {
        species: account.battle.foeSpecies,
        type: rules.SPECIES[account.battle.foeSpecies].type,
        level: account.battle.foeLevel,
        hp: account.battle.foeHp,
        maxHp: rules.stats(account.battle.foeSpecies, account.battle.foeLevel).hp,
      },
      activeSlot: account.battle.activeSlot,
      remainMs: Math.max(0, account.battle.deadline - now),
      log: account.battle.log.slice(),
    }
    : null;
  return {
    nickname: account.nickname,
    balls: account.balls,
    x: account.x,
    y: account.y,
    tile: rules.tileAt(account.x, account.y),
    party: account.party
      .map((creature) => {
        const maxHp = rules.stats(creature.species, creature.level).hp;
        return {
          slot: creature.slot,
          species: creature.species,
          type: rules.SPECIES[creature.species].type,
          level: creature.level,
          hp: creature.hp,
          maxHp,
          exp: creature.level >= 20 ? 0 : creature.exp,
          toNext: rules.expToNext(creature.level),
          move1: rules.SPECIES[creature.species].move1.name,
          move2: rules.SPECIES[creature.species].move2.name,
        };
      })
      .sort((a, b) => a.slot - b.slot),
    dex: rules.SPECIES_ORDER.map((species) => ({
      species,
      type: rules.SPECIES[species].type,
      habitat: rules.SPECIES[species].habitat,
      status: account.dex[species],
    })),
    battle,
    log: account.log.slice(),
  };
}

module.exports = {
  createAccount,
  chooseStarter,
  handleStarter,
  handleMove,
  handleAct,
  handleState,
  view,
  settleBalls,
};
