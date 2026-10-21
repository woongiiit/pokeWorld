const assert = require("assert");
const rules = require("./rules");
const game = require("./game");

let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`ok ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${name}`);
    console.error(error);
  }
}

test("도토 레벨 5 싹물어 vs 두더 레벨 3 피해 11", () => {
  const sprout = rules.stats("도토", 5);
  const mole = rules.stats("두더", 3);
  assert.strictEqual(sprout.attack, 14);
  assert.strictEqual(mole.defense, 13);
  assert.strictEqual(rules.creatureMove("도토", 1).power, 44);
  assert.strictEqual(rules.typeMultiplier("풀", "땅"), 100);
  assert.strictEqual(rules.damage({
    level: 5,
    power: 44,
    attack: 14,
    defense: 13,
    multiplier: 100,
  }), 11);
});

test("같은 기술 vs 재돌 레벨 3 피해 30", () => {
  const lizard = rules.stats("재돌", 3);
  assert.strictEqual(lizard.defense, 10);
  assert.strictEqual(lizard.hp, 22);
  assert.strictEqual(rules.typeMultiplier("풀", "불"), 200);
  assert.strictEqual(rules.damage({
    level: 5,
    power: 44,
    attack: 14,
    defense: 10,
    multiplier: 200,
  }), 30);
});

test("스피드 12 대 7 도망 확률 65", () => {
  assert.strictEqual(rules.stats("도토", 5).speed, 12);
  assert.strictEqual(rules.stats("두더", 3).speed, 7);
  assert.strictEqual(rules.fleeChance(12, 7), 65);
});

test("체력 22 포획 확률", () => {
  assert.strictEqual(rules.captureChance(22, 22), 20);
  assert.strictEqual(rules.captureChance(11, 22), 50);
  assert.strictEqual(rules.captureChance(1, 22), 77);
});

test("도토 레벨 5 스탯 30/14/14/12", () => {
  assert.deepStrictEqual(rules.stats("도토", 5), {
    hp: 30,
    attack: 14,
    defense: 14,
    speed: 12,
  });
  assert.deepStrictEqual(rules.stats("가리", 5), {
    hp: 38,
    attack: 12,
    defense: 16,
    speed: 10,
  });
  assert.deepStrictEqual(rules.stats("부티", 5), {
    hp: 26,
    attack: 16,
    defense: 12,
    speed: 16,
  });
  assert.deepStrictEqual(rules.stats("두더", 3), {
    hp: 28,
    attack: 13,
    defense: 13,
    speed: 7,
  });
});

test("오늘 출현이 비면 희귀 3종은 풀숲에 없다", () => {
  assert.strictEqual(rules.TODAY_SPECIES, null);
  const grass = rules.encounterTable("grass", false).map((entry) => entry.species);
  assert.deepStrictEqual(grass, ["두더", "퐁이", "찔레"]);
  assert.deepStrictEqual(rules.weightedGrass("두더", false).map((entry) => entry.weight), [2, 1, 1]);
  assert.deepStrictEqual(
    rules.weightedGrass("이슬꽃", false).map((entry) => entry.species),
    ["두더", "퐁이", "찔레", "이슬꽃"],
  );
  assert.deepStrictEqual(
    rules.weightedGrass("이슬꽃", true).map((entry) => entry.species),
    ["두더", "퐁이", "찔레"],
  );
  const day = rules.kstDate(1_700_000_000_000);
  assert.strictEqual(rules.freshToday("이슬꽃", day, 1_700_000_000_000), "이슬꽃");
  assert.strictEqual(rules.freshToday("이슬꽃", day, 1_700_000_000_000 + rules.DAY_MS), null);
  assert.strictEqual(rules.freshToday("도토", day, 1_700_000_000_000), null);
});

test("들판 칸", () => {
  assert.strictEqual(rules.tileAt(2, 7), "gate");
  assert.strictEqual(rules.tileAt(2, 6), "path");
  assert.strictEqual(rules.tileAt(2, 5), "grass");
  assert.strictEqual(rules.tileAt(0, 0), "rock");
  assert.strictEqual(rules.tileAt(0, 3), "stream");
  assert.strictEqual(rules.tileAt(2, 0), "rock");
  assert.strictEqual(rules.tileAt(-1, 0), null);
  assert.strictEqual(rules.encounterRate("path"), 0);
  assert.strictEqual(rules.encounterRate("gate"), 0);
  assert.strictEqual(rules.encounterRate("grass"), 30);
  assert.strictEqual(rules.encounterRate("rock"), 25);
  assert.strictEqual(rules.encounterRate("stream"), 25);
});

test("닉네임", () => {
  assert.strictEqual(rules.normalizeNickname("  새싹  "), "새싹");
  assert.strictEqual(rules.normalizeNickname("ab"), "ab");
  assert.strictEqual(rules.normalizeNickname("가나다라마바사아"), "가나다라마바사아");
  assert.strictEqual(rules.normalizeNickname("a b"), null);
  assert.strictEqual(rules.normalizeNickname("한"), null);
  assert.strictEqual(rules.normalizeNickname("123456789"), null);
  assert.strictEqual(rules.normalizeNickname("hi!"), null);
  assert.strictEqual(rules.normalizeNickname("ㄱㄴ"), null);
});

test("자정 볼", () => {
  const settled = Date.UTC(2026, 9, 21, 1, 0, 0);
  const oneMidnight = Date.UTC(2026, 9, 21, 15, 0, 0);
  const twoMidnights = Date.UTC(2026, 9, 22, 15, 0, 0);
  assert.strictEqual(rules.midnightsBetween(settled, settled + 1000), 0);
  assert.strictEqual(rules.midnightsBetween(settled, oneMidnight), 1);
  assert.strictEqual(rules.midnightsBetween(settled, twoMidnights), 2);
  assert.strictEqual(rules.settleBallCount(10, 2), 16);
  assert.strictEqual(rules.settleBallCount(28, 2), 30);
});

test("경험치는 레벨 상한에서 0", () => {
  const creature = { species: "도토", level: 5, hp: 10, exp: 0 };
  rules.applyExp(creature, 80);
  assert.strictEqual(creature.level, 6);
  assert.strictEqual(creature.exp, 0);
  assert.strictEqual(creature.hp, 12);
  const capped = { species: "도토", level: 19, hp: 58, exp: 0 };
  rules.applyExp(capped, 400);
  assert.strictEqual(capped.level, 20);
  assert.strictEqual(capped.exp, 0);
  rules.applyExp(capped, 32);
  assert.strictEqual(capped.exp, 0);
});

function account(species = "도토") {
  const player = game.createAccount({ token: "t", nickname: "숲길" });
  const chosen = game.chooseStarter(player, species, 1000);
  assert.strictEqual(chosen.status, 200);
  return player;
}

test("스타터 재선택은 409", () => {
  const player = account();
  assert.strictEqual(game.handleStarter(player, "가리", 2000, rules.scriptedRng([])).status, 409);
  assert.strictEqual(player.party.length, 1);
  assert.strictEqual(player.party[0].species, "도토");
  assert.strictEqual(player.balls, 10);
});

test("300ms 미만과 칸 밖은 거절하고 위치를 유지한다", () => {
  const player = account();
  const rng = rules.scriptedRng([]);
  assert.strictEqual(game.handleMove(player, "n", 1000, rng).status, 200);
  assert.deepStrictEqual([player.x, player.y], [2, 6]);
  assert.strictEqual(game.handleMove(player, "n", 1299, rng).status, 400);
  assert.deepStrictEqual([player.x, player.y], [2, 6]);
  assert.strictEqual(player.lastMoveAt, 1000);
  player.x = 0;
  player.y = 7;
  assert.strictEqual(game.handleMove(player, "s", 2000, rng).status, 400);
  assert.deepStrictEqual([player.x, player.y], [0, 7]);
  assert.strictEqual(player.lastMoveAt, 1000);
});

test("입구에 도착하면 체력을 채운다", () => {
  const player = account();
  player.x = 2;
  player.y = 6;
  player.lastMoveAt = 1000;
  player.party[0].hp = 1;
  assert.strictEqual(game.handleMove(player, "s", 2000, rules.scriptedRng([])).status, 200);
  assert.deepStrictEqual([player.x, player.y], [2, 7]);
  assert.strictEqual(player.party[0].hp, 30);
});

test("풀숲 조우 후 싹물어 피해 11", () => {
  const player = account();
  player.x = 2;
  player.y = 6;
  player.lastMoveAt = 1000;
  const moved = game.handleMove(player, "n", 2000, rules.scriptedRng([1, 1, 2]));
  assert.strictEqual(moved.status, 200);
  assert.strictEqual(player.battle.foeSpecies, "두더");
  assert.strictEqual(player.battle.foeLevel, 3);
  assert.strictEqual(player.dex["두더"], "seen");
  const acted = game.handleAct(player, { kind: "move1" }, 2500, rules.scriptedRng([1, 1, 100]));
  assert.strictEqual(acted.status, 200);
  assert.strictEqual(player.battle.foeHp, 17);
  assert.strictEqual(player.party[0].hp, 30);
  assert.strictEqual(player.battle.phase, "turn");
});

test("넘겨준 오늘 희귀는 풀숲에 한 번 나온다", () => {
  const player = account();
  player.x = 2;
  player.y = 6;
  player.lastMoveAt = 1000;
  game.handleMove(player, "n", 2000, rules.scriptedRng([1, 4, 2]), "이슬꽃");
  assert.strictEqual(player.battle.foeSpecies, "이슬꽃");
  const again = account();
  again.x = 2;
  again.y = 6;
  again.lastMoveAt = 1000;
  again.rareSeenDate = rules.kstDate(2000);
  again.rareSeenSpecies = "이슬꽃";
  game.handleMove(again, "n", 2000, rules.scriptedRng([1, 1, 2]), "이슬꽃");
  assert.strictEqual(again.battle.foeSpecies, "두더");
});

test("재돌은 피해 30으로 기절하고 경험치 24", () => {
  const player = account();
  player.x = 1;
  player.y = 1;
  player.lastMoveAt = 1000;
  game.handleMove(player, "w", 2000, rules.scriptedRng([1, 1, 2]));
  assert.strictEqual(player.battle.foeSpecies, "재돌");
  assert.strictEqual(player.battle.foeLevel, 3);
  game.handleAct(player, { kind: "move1" }, 2500, rules.scriptedRng([1, 1]));
  assert.strictEqual(player.battle, null);
  assert.strictEqual(player.party[0].exp, 24);
  assert.strictEqual(player.party[0].level, 5);
  assert.strictEqual(player.dex["재돌"], "seen");
  assert.deepStrictEqual([player.x, player.y], [0, 1]);
});

test("도망 65는 성공하고 경험치가 없다", () => {
  const player = account();
  player.x = 2;
  player.y = 6;
  player.lastMoveAt = 1000;
  game.handleMove(player, "n", 2000, rules.scriptedRng([1, 1, 2]));
  game.handleAct(player, { kind: "flee" }, 2500, rules.scriptedRng([65]));
  assert.strictEqual(player.battle, null);
  assert.strictEqual(player.party[0].exp, 0);
  assert.strictEqual(player.balls, 10);
});

test("체력 22 포획 20은 빈 슬롯에 넣고 볼이 준다", () => {
  const player = account();
  player.x = 1;
  player.y = 1;
  player.lastMoveAt = 1000;
  game.handleMove(player, "w", 2000, rules.scriptedRng([1, 1, 2]));
  assert.strictEqual(player.battle.foeHp, 22);
  game.handleAct(player, { kind: "ball" }, 2500, rules.scriptedRng([20]));
  assert.strictEqual(player.battle, null);
  assert.strictEqual(player.balls, 9);
  assert.strictEqual(player.party.length, 2);
  const caught = player.party.find((creature) => creature.slot === 1);
  assert.strictEqual(caught.species, "재돌");
  assert.strictEqual(caught.level, 3);
  assert.strictEqual(caught.hp, 22);
  assert.strictEqual(caught.exp, 0);
  assert.strictEqual(player.dex["재돌"], "caught");
  assert.strictEqual(player.party[0].exp, 0);
});

test("파티가 가득하면 교체 저장 전에 소유가 바뀌지 않는다", () => {
  const player = account();
  player.party.push({ slot: 1, species: "두더", level: 3, hp: 0, exp: 0 });
  player.party.push({ slot: 2, species: "찔레", level: 2, hp: 5, exp: 0 });
  player.dex["두더"] = "caught";
  player.x = 1;
  player.y = 1;
  player.lastMoveAt = 1000;
  game.handleMove(player, "w", 2000, rules.scriptedRng([1, 1, 2]));
  game.handleAct(player, { kind: "ball" }, 2500, rules.scriptedRng([20]));
  assert.strictEqual(player.battle.phase, "replace");
  assert.strictEqual(player.party.some((creature) => creature.species === "재돌"), false);
  assert.strictEqual(player.dex["재돌"], "seen");
  assert.strictEqual(game.handleAct(player, { kind: "flee" }, 2600, rules.scriptedRng([])).status, 400);
  assert.strictEqual(player.battle.phase, "replace");
  game.handleAct(player, { kind: "replace", slot: 1 }, 2700, rules.scriptedRng([]));
  assert.strictEqual(player.battle, null);
  assert.strictEqual(player.party.length, 3);
  assert.strictEqual(player.party.find((creature) => creature.slot === 1).species, "재돌");
  assert.strictEqual(player.dex["두더"], "caught");
  assert.strictEqual(player.dex["재돌"], "caught");
});

test("교체 시간 초과는 체력 0인 가장 앞 슬롯을 보낸다", () => {
  const player = account();
  player.party.push({ slot: 1, species: "두더", level: 3, hp: 4, exp: 0 });
  player.party.push({ slot: 2, species: "찔레", level: 2, hp: 5, exp: 0 });
  player.x = 1;
  player.y = 1;
  player.lastMoveAt = 1000;
  game.handleMove(player, "w", 2000, rules.scriptedRng([1, 1, 2]));
  game.handleAct(player, { kind: "ball" }, 2500, rules.scriptedRng([20]));
  player.party[0].hp = 0;
  player.battle.deadline = 3000;
  game.handleState(player, 3000, rules.scriptedRng([]));
  assert.strictEqual(player.battle, null);
  assert.strictEqual(player.party.find((creature) => creature.slot === 0).species, "재돌");
  assert.strictEqual(player.party.find((creature) => creature.slot === 1).species, "두더");
});

test("볼 0과 전투 중 이동은 400이고 전투는 유지된다", () => {
  const player = account();
  player.x = 2;
  player.y = 6;
  player.lastMoveAt = 1000;
  game.handleMove(player, "n", 2000, rules.scriptedRng([100]));
  assert.strictEqual(player.battle, null);
  game.handleMove(player, "s", 2300, rules.scriptedRng([]));
  game.handleMove(player, "n", 2700, rules.scriptedRng([1, 1, 2]));
  const deadline = player.battle.deadline;
  const foeHp = player.battle.foeHp;
  player.balls = 0;
  const rejected = game.handleAct(player, { kind: "ball" }, 2800, rules.scriptedRng([]));
  assert.strictEqual(rejected.status, 400);
  assert.strictEqual(player.balls, 0);
  assert.strictEqual(player.battle.foeHp, foeHp);
  assert.strictEqual(player.battle.deadline, deadline);
  const blocked = game.handleMove(player, "s", 4000, rules.scriptedRng([]));
  assert.strictEqual(blocked.status, 400);
  assert.deepStrictEqual([player.x, player.y], [2, 5]);
  assert.strictEqual(player.battle.deadline, deadline);
});

test("패배는 입구에서 회복하고 쓴 볼은 돌아오지 않는다", () => {
  const player = account();
  player.x = 2;
  player.y = 6;
  player.lastMoveAt = 1000;
  player.balls = 9;
  game.handleMove(player, "n", 2000, rules.scriptedRng([1, 2, 3]));
  assert.strictEqual(player.battle.foeSpecies, "퐁이");
  player.party[0].hp = 1;
  game.handleAct(player, { kind: "move1" }, 2500, rules.scriptedRng([1, 1]));
  assert.strictEqual(player.battle, null);
  assert.deepStrictEqual([player.x, player.y], [2, 7]);
  assert.strictEqual(player.party[0].hp, 30);
  assert.strictEqual(player.party[0].exp, 0);
  assert.strictEqual(player.balls, 9);
  assert.strictEqual(player.dex["퐁이"], "seen");
});

test("응답에 확률과 배율 필드가 없다", () => {
  const player = account();
  const state = game.view(player, 1000);
  const keys = new Set();
  const walk = (value) => {
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const key of Object.keys(value)) {
      keys.add(key);
      walk(value[key]);
    }
  };
  walk(state);
  for (const hidden of ["power", "accuracy", "multiplier", "chance", "roll", "attack", "defense", "speed"]) {
    assert.strictEqual(keys.has(hidden), false);
  }
  assert.strictEqual(state.dex.length, 12);
  assert.strictEqual(state.party[0].move1, "싹물어");
  assert.strictEqual(state.party[0].move2, "뒹굴림");
  assert.strictEqual(state.party[0].toNext, 80);
  assert.strictEqual(state.tile, "gate");
});

if (failed > 0) {
  process.exit(1);
}
console.log(`passed ${failed === 0 ? "all" : failed}`);
