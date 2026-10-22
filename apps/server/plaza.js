const crypto = require("crypto");
const rules = require("./rules");
const game = require("./game");

function living(account) {
  return account.party.filter((creature) => creature.hp >= 1).sort((a, b) => a.slot - b.slot);
}

function activeOf(account) {
  return account.party.find((creature) => creature.slot === account.battle.activeSlot) || living(account)[0];
}

function findMate(account, all, nickname) {
  return all.find((other) => (
    other.token !== account.token
    && other.plaza === account.plaza
    && other.nickname === nickname
  )) || null;
}

function prepare(account, all) {
  const used = new Set(all.map((other) => other.code).filter(Boolean));
  if (!/^[0-9]{6}$/.test(account.code || "")) {
    let code = "";
    do {
      code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    } while (used.has(code));
    account.code = code;
    account.dirty = true;
  }
  if (!account.plaza) {
    account.plaza = account.code;
    account.dirty = true;
  }
}

function visible(account, all, now) {
  return all
    .filter((other) => other.token !== account.token && other.plaza === account.plaza && other.started)
    .map((other) => ({
      nickname: other.nickname,
      x: other.x,
      y: other.y,
      bubble: other.bubbleUntil > now ? other.bubbleText : "",
      wild: Boolean(other.battle && (other.battle.kind === "wild" || !other.battle.kind)),
      pvp: Boolean(other.battle && other.battle.kind === "pvp"),
      boss: Boolean(other.battle && other.battle.kind === "boss"),
    }));
}

function joinPlaza(account, all, code, cap) {
  if (!/^[0-9]{6}$/.test(code || "")) return { status: 400, error: "code" };
  if (account.plaza === code) return { status: 400, error: "here" };
  const exists = all.some((other) => other.code === code);
  if (!exists) return { status: 400, error: "code" };
  const limit = cap >= 8 && cap <= 40 ? cap : rules.PLAZA_CAP;
  const inside = all.filter((other) => other.plaza === code).length;
  if (inside >= limit) return { status: 400, error: "full" };
  account.plaza = code;
  account.dirty = true;
  return { status: 200 };
}

function say(account, all, text, now) {
  if (!rules.BUBBLES.includes(text)) return { status: 400, error: "bubble" };
  if (account.bubbleText === text && account.bubbleUntil > now) return { status: 400, error: "bubble" };
  const others = all.filter((other) => (
    other.token !== account.token
    && other.plaza === account.plaza
    && other.bubbleUntil > now
  ));
  if (others.length >= 2) return { status: 400, error: "bubble" };
  account.bubbleText = text;
  account.bubbleUntil = now + rules.BUBBLE_MS;
  account.dirty = true;
  return { status: 200 };
}

function askDuel(account, all, nickname, now) {
  if (!account.started || account.battle) return { status: 400, error: "duel" };
  if (living(account).length === 0) return { status: 400, error: "duel" };
  const foe = findMate(account, all, nickname);
  if (!foe || !foe.started || foe.battle || living(foe).length === 0) return { status: 400, error: "duel" };
  if (foe.incoming && foe.incoming.until > now) return { status: 400, error: "duel" };
  foe.incoming = { kind: "duel", from: account.nickname, until: now + rules.TURN_MS };
  foe.dirty = true;
  return { status: 200 };
}

function beginDuel(a, b, now) {
  const id = crypto.randomBytes(8).toString("hex");
  const leadA = living(a)[0];
  const leadB = living(b)[0];
  a.battle = {
    kind: "pvp",
    duelId: id,
    side: "a",
    phase: "turn",
    foeSpecies: leadB.species,
    foeLevel: leadB.level,
    foeHp: leadB.hp,
    activeSlot: leadA.slot,
    deadline: now + rules.TURN_MS,
    log: [],
    pending: null,
    pick: null,
    cheer: 0,
  };
  b.battle = {
    kind: "pvp",
    duelId: id,
    side: "b",
    phase: "turn",
    foeSpecies: leadA.species,
    foeLevel: leadA.level,
    foeHp: leadA.hp,
    activeSlot: leadB.slot,
    deadline: now + rules.TURN_MS,
    log: [],
    pending: null,
    pick: null,
    cheer: 0,
  };
  a.incoming = null;
  b.incoming = null;
  a.dirty = true;
  b.dirty = true;
}

function answerDuel(account, all, accept, now) {
  const incoming = account.incoming;
  if (!incoming || incoming.kind !== "duel" || incoming.until < now) {
    account.incoming = null;
    account.dirty = true;
    return { status: 400, error: "duel" };
  }
  const foe = findMate(account, all, incoming.from);
  account.incoming = null;
  account.dirty = true;
  if (!accept || !foe || foe.battle || living(account).length === 0 || living(foe).length === 0) {
    return { status: 200 };
  }
  beginDuel(foe, account, now);
  return { status: 200 };
}

function mirror(account, foe) {
  const active = activeOf(foe);
  account.battle.foeSpecies = active.species;
  account.battle.foeLevel = active.level;
  account.battle.foeHp = active.hp;
}

function strike(attacker, defender, moveIndex, rng, log) {
  const move = rules.creatureMove(attacker.species, moveIndex);
  const atk = rules.stats(attacker.species, attacker.level);
  const def = rules.stats(defender.species, defender.level);
  const multiplier = rules.typeMultiplier(move.type, rules.SPECIES[defender.species].type);
  if (rng.roll(100) > move.accuracy) {
    log.push(`${attacker.species} ${move.name} 빗나감`);
    return;
  }
  const dealt = rules.damage({
    level: attacker.level,
    power: move.power,
    attack: atk.attack,
    defense: def.defense,
    multiplier,
  });
  defender.hp = Math.max(0, defender.hp - dealt);
  log.push(`${attacker.species} ${move.name} 명중`);
}

function finishPvp(winner, loser, now) {
  const date = rules.kstDate(now);
  if (winner.pvpWinDate !== date) {
    const active = activeOf(winner);
    if (active && active.hp >= 1) rules.applyExp(active, rules.PVP_BONUS_EXP);
    winner.pvpWinDate = date;
  }
  const winLog = (winner.battle.log || []).concat(["승리"]);
  const loseLog = (loser.battle.log || []).concat(["패배"]);
  winner.log = winner.log.concat(winLog).slice(-40);
  loser.log = loser.log.concat(loseLog).slice(-40);
  winner.battle = null;
  loser.battle = null;
  winner.dirty = true;
  loser.dirty = true;
}

function resolvePair(a, b, now, rng) {
  if (!a.battle || !b.battle) return;
  if (a.battle.phase === "switch" || b.battle.phase === "switch") return;
  const due = now >= a.battle.deadline;
  if (!due && !(a.battle.pick && b.battle.pick)) return;
  const pickA = a.battle.pick || { kind: "move1" };
  const pickB = b.battle.pick || { kind: "move1" };
  const log = [];
  if (pickA.kind === "switch" && living(a).some((creature) => creature.slot === pickA.slot)) {
    a.battle.activeSlot = pickA.slot;
  }
  if (pickB.kind === "switch" && living(b).some((creature) => creature.slot === pickB.slot)) {
    b.battle.activeSlot = pickB.slot;
  }
  const order = rules.stats(activeOf(a).species, activeOf(a).level).speed
    >= rules.stats(activeOf(b).species, activeOf(b).level).speed
    ? [a, b]
    : [b, a];
  for (const actor of order) {
    const other = actor === a ? b : a;
    const pick = actor === a ? pickA : pickB;
    if (pick.kind === "switch") continue;
    if (activeOf(actor).hp < 1 || activeOf(other).hp < 1) break;
    strike(activeOf(actor), activeOf(other), pick.kind === "move2" ? 2 : 1, rng, log);
  }
  a.battle.log = a.battle.log.concat(log).slice(-40);
  b.battle.log = b.battle.log.concat(log).slice(-40);
  a.battle.pick = null;
  b.battle.pick = null;
  const downA = activeOf(a).hp < 1;
  const downB = activeOf(b).hp < 1;
  if (downA && living(a).length === 0 && living(b).length > 0) {
    finishPvp(b, a, now);
    return;
  }
  if (downB && living(b).length === 0 && living(a).length > 0) {
    finishPvp(a, b, now);
    return;
  }
  if (downA && living(a).length > 0) {
    a.battle.phase = "switch";
  } else if (a.battle) {
    a.battle.phase = "turn";
  }
  if (downB && living(b).length > 0) {
    b.battle.phase = "switch";
  } else if (b.battle) {
    b.battle.phase = "turn";
  }
  if (a.battle) {
    a.battle.deadline = now + rules.TURN_MS;
    mirror(a, b);
  }
  if (b.battle) {
    b.battle.deadline = now + rules.TURN_MS;
    mirror(b, a);
  }
  a.dirty = true;
  b.dirty = true;
}

function settlePvp(all, now, rng) {
  const seen = new Set();
  for (const account of all) {
    if (!account.battle || account.battle.kind !== "pvp" || seen.has(account.battle.duelId)) continue;
    const foe = all.find((other) => (
      other.token !== account.token
      && other.battle
      && other.battle.duelId === account.battle.duelId
    ));
    seen.add(account.battle.duelId);
    if (!foe) {
      account.battle = null;
      account.dirty = true;
      continue;
    }
    const first = account.battle.side === "a" ? account : foe;
    const second = first === account ? foe : account;
    resolvePair(first, second, now, rng);
  }
}

function actPvp(account, all, input, now) {
  if (!account.battle || account.battle.kind !== "pvp") return { status: 400, error: "duel" };
  if (account.battle.phase === "switch") {
    const slot = input && input.slot;
    if (input.kind !== "switch" || !living(account).some((creature) => creature.slot === slot)) {
      return { status: 400, error: "switch" };
    }
    account.battle.activeSlot = slot;
    account.battle.phase = "turn";
    account.battle.deadline = now + rules.TURN_MS;
    const foe = all.find((other) => other.battle && other.battle.duelId === account.battle.duelId);
    if (foe) mirror(foe, account);
    account.dirty = true;
    return { status: 200 };
  }
  const kind = input && input.kind;
  if (kind !== "move1" && kind !== "move2" && kind !== "switch") return { status: 400, error: "kind" };
  if (kind === "switch" && !living(account).some((creature) => creature.slot === input.slot && creature.slot !== account.battle.activeSlot)) {
    return { status: 400, error: "switch" };
  }
  account.battle.pick = { kind, slot: input.slot };
  account.dirty = true;
  return { status: 200 };
}

function cheer(account, all, nickname) {
  const foe = findMate(account, all, nickname);
  if (!foe || !foe.battle) return { status: 400, error: "cheer" };
  const kind = foe.battle.kind || "wild";
  if (kind !== "wild") return { status: 400, error: "cheer" };
  if ((foe.battle.cheer || 0) > 0) return { status: 400, error: "cheer" };
  foe.battle.cheer = 8;
  foe.dirty = true;
  return { status: 200 };
}

function watch(account, all, nickname) {
  if (account.battle) return { status: 400, error: "watch" };
  const foe = findMate(account, all, nickname);
  if (!foe || !foe.battle || foe.battle.kind !== "pvp") return { status: 400, error: "watch" };
  const count = all.filter((other) => other.watch === foe.battle.duelId).length;
  if (count >= 2) return { status: 400, error: "watch" };
  account.watch = foe.battle.duelId;
  account.dirty = true;
  return { status: 200 };
}

function leaveWatch(account) {
  account.watch = null;
  account.dirty = true;
  return { status: 200 };
}

function offerTrade(account, all, nickname, slot, now) {
  if (account.battle || account.trade) return { status: 400, error: "trade" };
  const foe = findMate(account, all, nickname);
  if (!foe || foe.battle || foe.trade) return { status: 400, error: "trade" };
  const mine = account.party.find((creature) => creature.slot === slot);
  if (!mine) return { status: 400, error: "trade" };
  const id = crypto.randomBytes(8).toString("hex");
  account.trade = { id, phase: "wait", other: foe.nickname, give: slot, until: now + rules.TURN_MS };
  foe.trade = { id, phase: "answer", other: account.nickname, take: slot, until: now + rules.TURN_MS };
  account.dirty = true;
  foe.dirty = true;
  return { status: 200 };
}

function answerTrade(account, all, slot, now) {
  if (!account.trade || account.trade.phase !== "answer") return { status: 400, error: "trade" };
  const foe = findMate(account, all, account.trade.other);
  const mine = account.party.find((creature) => creature.slot === slot);
  if (!foe || !foe.trade || foe.trade.id !== account.trade.id || !mine) return { status: 400, error: "trade" };
  account.trade.give = slot;
  account.trade.phase = "cancel";
  account.trade.until = now + rules.TRADE_CANCEL_MS;
  foe.trade.phase = "cancel";
  foe.trade.until = now + rules.TRADE_CANCEL_MS;
  account.dirty = true;
  foe.dirty = true;
  return { status: 200 };
}

function cancelTrade(account, all) {
  if (!account.trade) return { status: 400, error: "trade" };
  const id = account.trade.id;
  const foe = all.find((other) => other !== account && other.trade && other.trade.id === id);
  account.trade = null;
  account.dirty = true;
  if (foe) {
    foe.trade = null;
    foe.dirty = true;
  }
  return { status: 200 };
}

function swapCreatures(a, b) {
  const giveA = a.party.find((creature) => creature.slot === a.trade.give);
  const giveB = b.party.find((creature) => creature.slot === b.trade.give);
  if (!giveA || !giveB) return null;
  const copyA = { ...giveA };
  const copyB = { ...giveB };
  const nextA = a.party.filter((creature) => creature.slot !== giveA.slot);
  const nextB = b.party.filter((creature) => creature.slot !== giveB.slot);
  nextA.push({ ...copyB, slot: giveA.slot });
  nextB.push({ ...copyA, slot: giveB.slot });
  if (nextA.length === 0 || nextB.length === 0) return null;
  return { copyA, copyB, slotA: giveA.slot, slotB: giveB.slot, nextA, nextB };
}

function commitTrade(a, b, now, trades) {
  const swapped = swapCreatures(a, b);
  if (!swapped) {
    a.trade = null;
    b.trade = null;
    a.dirty = true;
    b.dirty = true;
    return;
  }
  a.party = swapped.nextA;
  b.party = swapped.nextB;
  a.dex[swapped.copyB.species] = "caught";
  b.dex[swapped.copyA.species] = "caught";
  const record = {
    id: a.trade.id,
    at: now,
    a: { token: a.token, nickname: a.nickname, slot: swapped.slotA, creature: swapped.copyA },
    b: { token: b.token, nickname: b.nickname, slot: swapped.slotB, creature: swapped.copyB },
  };
  trades.push(record);
  if (trades.length > 20) trades.shift();
  a.log = a.log.concat([`${b.nickname}와 교환`]).slice(-40);
  b.log = b.log.concat([`${a.nickname}와 교환`]).slice(-40);
  a.trade = null;
  b.trade = null;
  a.dirty = true;
  b.dirty = true;
}

function settleTrades(all, now, trades) {
  const seen = new Set();
  for (const account of all) {
    if (!account.trade || seen.has(account.trade.id)) continue;
    const foe = all.find((other) => other.trade && other.trade.id === account.trade.id && other.token !== account.token);
    seen.add(account.trade.id);
    if (!foe) {
      account.trade = null;
      account.dirty = true;
      continue;
    }
    if (account.trade.phase === "cancel" && now >= account.trade.until) {
      const first = account.trade.give != null && foe.trade.give != null ? account : foe;
      const second = first === account ? foe : account;
      if (first.trade.give == null || second.trade.give == null) {
        first.trade = null;
        second.trade = null;
        first.dirty = true;
        second.dirty = true;
      } else {
        commitTrade(first, second, now, trades);
      }
    } else if ((account.trade.phase === "wait" || account.trade.phase === "answer") && now >= account.trade.until) {
      account.trade = null;
      foe.trade = null;
      account.dirty = true;
      foe.dirty = true;
    }
  }
}

function syncBoss(all, now) {
  const date = rules.kstDate(now);
  const groups = new Map();
  for (const account of all) {
    if (!account.battle || account.battle.kind !== "boss" || account.battle.bossDate !== date) continue;
    const key = `${account.plaza}:${date}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(account);
  }
  for (const group of groups.values()) {
    const hp = Math.min(...group.map((account) => account.battle.foeHp));
    if (hp <= 0) {
      for (const account of group) {
        if (account.bossBallDate !== date) {
          account.balls = Math.min(30, account.balls + rules.BOSS_BALLS);
          account.bossBallDate = date;
        }
        game.endBoss(account);
        account.dirty = true;
      }
      continue;
    }
    const keepers = Array.from({ length: Math.max(0, 4 - group.length) }, () => "광장지기");
    for (const account of group) {
      if (account.battle.foeHp !== hp) account.battle.foeHp = hp;
      account.battle.keepers = keepers;
      account.dirty = true;
    }
  }
}

function clearWatch(all, now) {
  const live = new Set(all.filter((account) => account.battle && account.battle.duelId).map((account) => account.battle.duelId));
  for (const account of all) {
    if (account.watch && !live.has(account.watch)) {
      account.watch = null;
      account.dirty = true;
    }
    if (account.incoming && account.incoming.until < now) {
      account.incoming = null;
      account.dirty = true;
    }
  }
}

function tick(all, now, rng, trades) {
  settlePvp(all, now, rng);
  settleTrades(all, now, trades);
  syncBoss(all, now);
  clearWatch(all, now);
}

function drawBattle(account) {
  if (!account.battle) return;
  account.log = account.log.concat(account.battle.log || [], ["무승부"]).slice(-40);
  account.battle = null;
  account.dirty = true;
}

function kick(account, all, until) {
  if (account.battle && account.battle.kind === "pvp") {
    const foe = all.find((other) => other.battle && other.battle.duelId === account.battle.duelId);
    drawBattle(account);
    if (foe) drawBattle(foe);
  } else {
    drawBattle(account);
  }
  account.kickedUntil = until;
  account.dirty = true;
}

function undoTrade(all, record) {
  if (!record) return { status: 400, error: "trade" };
  const a = all.find((account) => account.token === record.a.token);
  const b = all.find((account) => account.token === record.b.token);
  if (!a || !b) return { status: 400, error: "trade" };
  const heldA = a.party.find((creature) => creature.slot === record.a.slot && creature.species === record.b.creature.species);
  const heldB = b.party.find((creature) => creature.slot === record.b.slot && creature.species === record.a.creature.species);
  if (!heldA || !heldB) return { status: 400, error: "trade" };
  a.party = a.party.filter((creature) => creature.slot !== record.a.slot);
  b.party = b.party.filter((creature) => creature.slot !== record.b.slot);
  a.party.push({ ...record.a.creature, slot: record.a.slot });
  b.party.push({ ...record.b.creature, slot: record.b.slot });
  if (a.party.length === 0 || b.party.length === 0) return { status: 400, error: "trade" };
  a.dirty = true;
  b.dirty = true;
  return { status: 200 };
}

module.exports = {
  prepare,
  visible,
  joinPlaza,
  say,
  askDuel,
  answerDuel,
  actPvp,
  cheer,
  watch,
  leaveWatch,
  offerTrade,
  answerTrade,
  cancelTrade,
  tick,
  kick,
  undoTrade,
  drawBattle,
};
