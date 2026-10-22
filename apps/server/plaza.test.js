const assert = require("assert");
const rules = require("./rules");
const plaza = require("./plaza");

function person(nickname, species) {
  return {
    token: nickname,
    nickname,
    code: "111111",
    plaza: "111111",
    started: true,
    balls: 10,
    x: 2,
    y: 7,
    party: [{ slot: 0, species, level: 5, hp: rules.stats(species, 5).hp, exp: 0 }],
    dex: {},
    battle: null,
    log: [],
    dirty: false,
  };
}

const noon = Date.UTC(2026, 9, 21, 3, 0, 0);
const bossTime = Date.UTC(2026, 9, 21, 12, 5, 0);

assert.strictEqual(rules.bossWindow(noon), false);
assert.strictEqual(rules.bossWindow(bossTime), true);
assert.strictEqual(rules.bossWindow(bossTime + 15 * 60 * 1000), false);

const solo = person("하나", "도토");
const crowd = [solo];
for (let i = 0; i < 40; i += 1) {
  crowd.push({ ...person("손님" + i, "도토"), token: "t" + i, code: "222222", plaza: "222222" });
}
crowd[1].code = "222222";
assert.strictEqual(plaza.joinPlaza(solo, crowd, "222222", 40).error, "full");
assert.strictEqual(plaza.joinPlaza(solo, [solo, person("둘", "가리")], "333333", 40).error, "code");

const speaker = person("하나", "도토");
const hearer = person("둘", "가리");
assert.strictEqual(plaza.say(speaker, [speaker, hearer], "안녕", noon).status, 200);
assert.strictEqual(plaza.say(speaker, [speaker, hearer], "안녕", noon).error, "bubble");
assert.strictEqual(plaza.say(speaker, [speaker, hearer], "좋아", noon).status, 200);

const wild = person("셋", "부티");
wild.battle = { kind: "wild", cheer: 0, phase: "turn" };
assert.strictEqual(plaza.cheer(speaker, [speaker, wild], "셋").status, 200);
assert.strictEqual(wild.battle.cheer, 8);
assert.strictEqual(plaza.cheer(hearer, [hearer, wild], "셋").error, "cheer");

const a = person("하나", "도토");
const b = person("둘", "가리");
a.party[0].hp = 1;
b.party[0].hp = 30;
assert.strictEqual(plaza.askDuel(a, [a, b], "둘", noon).status, 200);
assert.strictEqual(plaza.answerDuel(b, [a, b], true, noon).status, 200);
a.battle.pick = { kind: "move1" };
b.battle.pick = { kind: "move1" };
plaza.tick([a, b], noon + 1, rules.scriptedRng([1, 1]), []);
assert.strictEqual(a.battle, null);
assert.strictEqual(b.pvpWinDate, rules.kstDate(noon));
assert.strictEqual(b.party[0].exp, 24);

const c = person("넷", "부티");
c.party[0].hp = 1;
const d = person("다섯", "가리");
d.pvpWinDate = rules.kstDate(noon);
plaza.askDuel(c, [c, d], "다섯", noon);
plaza.answerDuel(d, [c, d], true, noon);
c.battle.pick = { kind: "move1" };
d.battle.pick = { kind: "move1" };
const before = d.party[0].exp;
plaza.tick([c, d], noon + 1, rules.scriptedRng([1, 1]), []);
assert.strictEqual(d.party[0].exp, before);

const left = person("왼쪽", "도토");
const right = person("오른쪽", "가리");
assert.strictEqual(plaza.offerTrade(left, [left, right], "오른쪽", 0, noon).status, 200);
assert.strictEqual(plaza.answerTrade(right, [left, right], 0, noon).status, 200);
const trades = [];
plaza.tick([left, right], noon + rules.TRADE_CANCEL_MS, rules.scriptedRng([]), trades);
assert.strictEqual(left.party[0].species, "가리");
assert.strictEqual(right.party[0].species, "도토");
assert.strictEqual(trades.length, 1);
assert.strictEqual(plaza.undoTrade([left, right], trades[0]).status, 200);
assert.strictEqual(left.party[0].species, "도토");

const hold = person("보류", "도토");
const mate = person("상대", "가리");
plaza.offerTrade(hold, [hold, mate], "상대", 0, noon);
assert.strictEqual(plaza.cancelTrade(hold, [hold, mate]).status, 200);
assert.strictEqual(hold.trade, null);
assert.strictEqual(mate.trade, null);

console.log("plaza ok");
