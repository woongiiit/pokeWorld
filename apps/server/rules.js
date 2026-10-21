const DAY_MS = 86400000;
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const TURN_MS = 20000;

const TODAY_SPECIES = null;

const RESIDENTS = ["흙두더지", "연못개구리", "솔방울새"];
const RARES = ["이슬잠자리", "햇살나비", "안개여우"];
const STARTERS = ["새싹멍", "방울거북", "불씨족제비"];

const SPECIES_ORDER = [
  "새싹멍",
  "방울거북",
  "불씨족제비",
  "흙두더지",
  "연못개구리",
  "솔방울새",
  "잿빛도마뱀",
  "바위너구리",
  "김새우",
  "이슬잠자리",
  "햇살나비",
  "안개여우",
];

const SPECIES = {
  새싹멍: row("풀", "스타터", 22, 10, 10, 8, 2, 1, 1, 1, ["싹물어", "풀", 44, 95], ["뒹굴림", "무상성", 32, 100]),
  방울거북: row("물", "스타터", 26, 8, 12, 6, 3, 1, 1, 1, ["물방울", "물", 40, 100], ["등껍질", "무상성", 34, 100]),
  불씨족제비: row("불", "스타터", 18, 12, 8, 12, 2, 1, 1, 1, ["씨불꽃", "불", 46, 90], ["질주치", "무상성", 30, 100]),
  흙두더지: row("땅", "광장 풀숲", 24, 11, 11, 5, 2, 1, 1, 1, ["두더파", "땅", 48, 90], ["흙묻힘", "무상성", 34, 100]),
  연못개구리: row("물", "광장 풀숲", 18, 10, 8, 11, 2, 1, 1, 1, ["펄떡침", "물", 42, 100], ["혀채찍", "무상성", 30, 100]),
  솔방울새: row("풀", "광장 풀숲", 16, 12, 7, 10, 2, 1, 1, 1, ["솔타격", "풀", 46, 90], ["부리톡", "무상성", 32, 100]),
  잿빛도마뱀: row("불", "돌밭", 18, 13, 8, 9, 2, 1, 1, 1, ["잿더미", "불", 50, 85], ["재꼬리", "무상성", 34, 100]),
  바위너구리: row("땅", "돌밭", 26, 9, 13, 5, 3, 1, 1, 1, ["돌구름", "땅", 42, 100], ["돌몸통", "무상성", 36, 95]),
  김새우: row("물", "개울", 20, 11, 12, 7, 2, 1, 1, 1, ["시내물", "물", 40, 100], ["집게찍", "무상성", 38, 90]),
  이슬잠자리: row("풀", "오늘 출현", 14, 12, 6, 14, 1, 1, 1, 2, ["이슬방울", "풀", 40, 100], ["잔날개", "무상성", 28, 100]),
  햇살나비: row("풀", "오늘 출현", 16, 11, 8, 13, 2, 1, 1, 1, ["햇살가루", "풀", 42, 95], ["팔랑임", "무상성", 30, 100]),
  안개여우: row("불", "오늘 출현", 18, 13, 7, 12, 2, 1, 1, 1, ["여우불", "불", 46, 95], ["안개숨", "무상성", 32, 100]),
};

const TYPE_CHART = {
  풀: { 풀: 100, 물: 50, 불: 200, 땅: 100 },
  물: { 풀: 200, 물: 100, 불: 100, 땅: 50 },
  불: { 풀: 50, 물: 100, 불: 100, 땅: 200 },
  땅: { 풀: 100, 물: 200, 불: 50, 땅: 100 },
};

const MAP = [
  ["rock", "rock", "rock", "rock", "rock"],
  ["rock", "path", "path", "path", "rock"],
  ["path", "grass", "grass", "grass", "path"],
  ["stream", "grass", "grass", "grass", "stream"],
  ["stream", "path", "path", "path", "stream"],
  ["path", "grass", "grass", "grass", "path"],
  ["path", "path", "path", "path", "path"],
  ["path", "path", "gate", "path", "path"],
];

function row(type, habitat, hp, attack, defense, speed, hpG, attackG, defenseG, speedG, move1, move2) {
  return {
    type,
    habitat,
    hp,
    attack,
    defense,
    speed,
    hpG,
    attackG,
    defenseG,
    speedG,
    move1: { name: move1[0], type: move1[1], power: move1[2], accuracy: move1[3] },
    move2: { name: move2[0], type: move2[1], power: move2[2], accuracy: move2[3] },
  };
}

function stats(species, level) {
  const base = SPECIES[species];
  const steps = level - 1;
  return {
    hp: base.hp + steps * base.hpG,
    attack: base.attack + steps * base.attackG,
    defense: base.defense + steps * base.defenseG,
    speed: base.speed + steps * base.speedG,
  };
}

function creatureMove(species, index) {
  const base = SPECIES[species];
  return index === 2 ? base.move2 : base.move1;
}

function typeMultiplier(moveType, defendType) {
  if (moveType === "무상성") return 100;
  return TYPE_CHART[moveType][defendType];
}

function damage({ level, power, attack, defense, multiplier }) {
  const byDefense = Math.floor(((level + 5) * power * attack) / defense);
  const byForty = Math.floor(byDefense / 40);
  const dealt = Math.floor((byForty * multiplier) / 100);
  return dealt < 1 ? 1 : dealt;
}

function fleeChance(speed, foeSpeed) {
  const chance = 40 + Math.floor((speed * 40) / (speed + foeSpeed));
  return chance > 80 ? 80 : chance;
}

function captureChance(hp, maxHp, cheer = 0) {
  const percent = Math.floor((hp * 100) / maxHp);
  const chance = 20 + Math.floor(((100 - percent) * 60) / 100) + cheer;
  return chance > 80 ? 80 : chance;
}

function expGain(foeLevel) {
  return foeLevel * 8;
}

function expToNext(level) {
  if (level >= 20) return 0;
  return level * 16;
}

function applyExp(creature, amount) {
  if (creature.level >= 20) {
    creature.exp = 0;
    return;
  }
  creature.exp += amount;
  while (creature.level < 20 && creature.exp >= creature.level * 16) {
    creature.exp -= creature.level * 16;
    const beforeHp = stats(creature.species, creature.level).hp;
    creature.level += 1;
    const afterHp = stats(creature.species, creature.level).hp;
    creature.hp = Math.min(afterHp, creature.hp + (afterHp - beforeHp));
    if (creature.level >= 20) {
      creature.exp = 0;
      break;
    }
  }
}

function tileAt(x, y) {
  if (x < 0 || x > 4 || y < 0 || y > 7) return null;
  return MAP[y][x];
}

function encounterRate(tile) {
  if (tile === "grass") return 30;
  if (tile === "rock") return 25;
  if (tile === "stream") return 25;
  return 0;
}

function weightedGrass(today, rareSeen) {
  if (today == null || today === "") {
    return RESIDENTS.map((species) => ({ species, weight: 1 }));
  }
  if (RESIDENTS.includes(today)) {
    return RESIDENTS.map((species) => ({
      species,
      weight: species === today ? 2 : 1,
    }));
  }
  if (RARES.includes(today) && !rareSeen) {
    return RESIDENTS.map((species) => ({ species, weight: 1 })).concat([
      { species: today, weight: 1 },
    ]);
  }
  return RESIDENTS.map((species) => ({ species, weight: 1 }));
}

function encounterTable(tile, rareSeen) {
  if (tile === "rock") {
    return [
      { species: "잿빛도마뱀", weight: 1 },
      { species: "바위너구리", weight: 1 },
    ];
  }
  if (tile === "stream") return [{ species: "김새우", weight: 1 }];
  if (tile === "grass") return weightedGrass(TODAY_SPECIES, rareSeen);
  return [];
}

function pickWeighted(entries, roll) {
  let cursor = 0;
  for (const entry of entries) {
    cursor += entry.weight;
    if (roll <= cursor) return entry.species;
  }
  return entries[entries.length - 1].species;
}

function weightSum(entries) {
  return entries.reduce((sum, entry) => sum + entry.weight, 0);
}

function kstDayIndex(ms) {
  return Math.floor((ms + KST_OFFSET_MS) / DAY_MS);
}

function midnightsBetween(lastMs, nowMs) {
  if (lastMs == null || nowMs <= lastMs) return 0;
  return kstDayIndex(nowMs) - kstDayIndex(lastMs);
}

function kstDate(ms) {
  const shifted = new Date(ms + KST_OFFSET_MS);
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${shifted.getUTCFullYear()}-${month}-${day}`;
}

function normalizeNickname(raw) {
  if (typeof raw !== "string") return null;
  const name = raw.trim();
  const chars = Array.from(name);
  if (chars.length < 2 || chars.length > 8) return null;
  if (!/^[0-9A-Za-z가-힣]+$/.test(name)) return null;
  return name;
}

function scriptedRng(values) {
  let index = 0;
  return {
    roll(max) {
      if (index >= values.length) {
        throw new Error("rng exhausted");
      }
      const value = values[index];
      index += 1;
      if (!Number.isInteger(value) || value < 1 || value > max) {
        throw new Error(`roll ${value} outside 1..${max}`);
      }
      return value;
    },
  };
}

function defaultRng() {
  return {
    roll(max) {
      return 1 + Math.floor(Math.random() * max);
    },
  };
}

function settleBallCount(balls, nights) {
  return Math.min(30, balls + 3 * nights);
}

module.exports = {
  DAY_MS,
  TURN_MS,
  TODAY_SPECIES,
  RESIDENTS,
  RARES,
  STARTERS,
  SPECIES_ORDER,
  SPECIES,
  MAP,
  stats,
  creatureMove,
  typeMultiplier,
  damage,
  fleeChance,
  captureChance,
  expGain,
  expToNext,
  applyExp,
  tileAt,
  encounterRate,
  weightedGrass,
  encounterTable,
  pickWeighted,
  weightSum,
  midnightsBetween,
  kstDate,
  normalizeNickname,
  scriptedRng,
  defaultRng,
  settleBallCount,
};
