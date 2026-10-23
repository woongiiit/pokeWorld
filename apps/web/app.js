const TILE = {
  path: "길",
  ground: "풀밭",
  grass: "풀숲",
  rock: "돌밭",
  stream: "개울",
  bridge: "다리",
  flower: "꽃밭",
  heal: "광장",
  boss: "북쪽 끝",
};

const STARTERS = [
  { species: "도토", type: "풀", move1: "싹물어", move2: "뒹굴림" },
  { species: "부티", type: "불", move1: "씨불꽃", move2: "질주치" },
  { species: "가리", type: "물", move1: "물방울", move2: "등껍질" },
];

const STATUS = { unseen: "못 봄", seen: "만남", caught: "잡음" };
const ERROR_KO = {
  nickname: "닉네임을 다시 봐",
  fast: "잠깐 쉬어",
  bounds: "그쪽으로는 못 가",
  dir: "그쪽으로는 못 가",
  battle: "전투 중이야",
  balls: "볼이 없어",
  switch: "바꿀 수 없어",
  slot: "그 칸은 안 돼",
  kind: "그 행동은 안 돼",
  starter: "이미 시작했어",
  species: "그 네이몬은 안 돼",
  unauthorized: "다시 들어와",
  code: "없는 코드야",
  here: "이미 여기야",
  full: "광장이 가득 찼어",
  bubble: "그 말은 지금 못 해",
  duel: "한 판을 못 걸어",
  cheer: "응원은 한 번이야",
  watch: "관전이 안 돼",
  trade: "교환이 안 돼",
  kick: "들어갈 수 없어",
  reason: "사유를 다시 봐",
  player: "그 사람이 없어",
  cap: "인원을 다시 봐",
};

const app = document.getElementById("app");

let token = localStorage.getItem("pw_token") || "";
let state = null;
let busy = false;
let error = "";
let loadError = "";
let sheet = null;
let overlay = null;
let pickedSpecies = "";
let picked = null;
let openSlot = null;
let dexPage = 0;
let codeDraft = "";
let pickedMate = "";
let nickDraft = "";
let tutor = localStorage.getItem("pw_tutor") || "seoha";
let remainBase = 0;
let remainAt = 0;
let zeroArmed = null;
let zeroSig = "";
let sent = false;
let toastText = "";
let toastUntil = 0;
let pollTimer = 0;
let refreshing = false;
let talk = null; // { name, lines, i }
let outro = null; // 전투가 끝난 뒤 연출이 끝날 때까지 전투 화면을 붙잡는다
let outroTimer = 0;
let lastBattleState = null; // 마지막으로 전투가 있던 상태. outro 동안 화면에 쓴다
const moveQueue = [];
let moveInFlight = false;
let lastMoveDone = 0;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}

function oneLine(log) {
  let text = "";
  if (Array.isArray(log)) {
    const last = log.filter((x) => x != null && String(x).trim() !== "").slice(-1)[0];
    text = last == null ? "" : String(last);
  } else if (log != null && typeof log !== "object") {
    text = String(log);
  }
  return text.replace(/\s+/g, " ").trim();
}

function batchim(name) {
  const c = String(name).charCodeAt(String(name).length - 1);
  if (c < 0xac00 || c > 0xd7a3) return true;
  return (c - 0xac00) % 28 !== 0;
}

function wa(name) {
  return name + (batchim(name) ? "과" : "와");
}

function eul(name) {
  return name + (batchim(name) ? "을" : "를");
}

function typeKey(type) {
  return { 풀: "grass", 물: "water", 불: "fire", 땅: "ground" }[type] || "";
}

function tileName(tile) {
  return TILE[tile] || "";
}

function validNick(raw) {
  const t = String(raw).trim();
  if (t.length < 2 || t.length > 8) return false;
  if (/\s/.test(t)) return false;
  return /^[가-힣A-Za-z0-9]+$/.test(t);
}

function tutorStep() {
  if (tutor === "rival" || tutor === "walk") return tutor;
  if (state?.party?.length) return "done";
  if (tutor === "choose" || tutor === "done") return "choose";
  return tutor || "seoha";
}

function setTutor(step) {
  tutor = step;
  localStorage.setItem("pw_tutor", step);
}

function rivalOf(species) {
  if (species === "도토") return "가리";
  if (species === "부티") return "도토";
  return "부티";
}

function party() {
  return [...(state?.party || [])].sort((a, b) => a.slot - b.slot);
}

function leadSlot() {
  const row = party().find((p) => p.hp >= 1);
  return row ? row.slot : null;
}

function mode() {
  if (!token || (state && !state.nickname)) return "join";
  if (!state) return loadError ? "retry" : "loading";
  if (state.battle || outro) return "battle";
  if (!state.party || state.party.length === 0) return "starter";
  return "field";
}

function battleTrack(s) {
  const kind = s?.battle?.kind || "wild";
  return kind === "boss" ? "boss" : kind === "pvp" ? "duel" : "wild";
}

function trackFor(m) {
  if (m === "battle") return battleTrack(state);
  if (m === "field" && tutorStep() !== "rival") return "route";
  return "town";
}

function cueBattle(prev, next) {
  if (!window.Sound) return;
  if (prev && !prev.battle && next.battle) {
    Sound.jingle("encounter", battleTrack(next));
    return;
  }
  if (prev?.battle && !next.battle && !window.Battle) {
    const last = oneLine(next.log);
    if (last === "포획") Sound.jingle("catch", "route");
    else if (last === "승리" || last === "북쪽") Sound.jingle("win", "route");
    else if (last === "패배") Sound.jingle("lose", "route");
    return;
  }
  if (prev && !prev.incoming && next.incoming) Sound.sfx("ping");
}

const CHART = {
  풀: { 풀: 1, 물: 0.5, 불: 2, 땅: 1 },
  물: { 풀: 2, 물: 1, 불: 1, 땅: 0.5 },
  불: { 풀: 0.5, 물: 1, 불: 1, 땅: 2 },
  땅: { 풀: 1, 물: 2, 불: 0.5, 땅: 1 },
};

function effOf(moveName, attacker, defenderType) {
  if (!attacker || !moveName) return 1;
  const typed = moveName === attacker.move1;
  if (!typed) return 1;
  const row = CHART[attacker.type];
  return row && row[defenderType] != null ? row[defenderType] : 1;
}

// prev 끝부분과 next 앞부분이 겹치는 만큼을 빼고 새로 붙은 줄만 돌려준다.
function newLines(prevArr, nextArr) {
  const p = Array.isArray(prevArr) ? prevArr : [];
  const n = Array.isArray(nextArr) ? nextArr : [];
  for (let k = 0; k <= n.length; k++) {
    const head = n.slice(0, n.length - k);
    if (head.length > p.length) continue;
    const tail = p.slice(p.length - head.length);
    if (head.every((v, i) => v === tail[i])) return n.slice(n.length - k);
  }
  return n.slice();
}

function monAt(s, slot) {
  return (s?.party || []).find((p) => p.slot === slot) || null;
}

// 서버 응답 두 개를 비교해 전투 연출 이벤트를 만든다.
function battleEvents(prev, next) {
  const ev = [];
  if (!prev || !window.Battle) return ev;
  const pb = prev.battle;
  const nb = next.battle;
  if (!pb && nb) {
    if (!nb.watch) ev.push({ type: "intro" });
    return ev;
  }
  if (!pb) return ev;
  if (pb.watch) return ev;
  let lines;
  let outcome = null;
  if (nb) {
    lines = newLines(pb.log, nb.log);
  } else {
    const all = newLines(prev.log, next.log);
    outcome = all[all.length - 1] || null;
    lines = all.slice(Math.min(pb.log.length, Math.max(0, all.length - 1)), Math.max(0, all.length - 1));
  }
  const prevMe = monAt(prev, pb.activeSlot);
  const sameSlotNext = monAt(next, pb.activeSlot);
  const foeHpFinal = nb ? nb.foe.hp : (outcome === "승리" || outcome === "북쪽" ? 0 : pb.foe.hp);
  let myHpFinal = sameSlotNext ? sameSlotNext.hp : prevMe ? prevMe.hp : 0;
  if (outcome === "패배" || lines.includes("기절")) myHpFinal = 0;
  let foeHp = pb.foe.hp;
  let myHp = prevMe ? prevMe.hp : 0;
  const foeHpChanged = foeHpFinal !== pb.foe.hp;
  let mineUsed = false;
  const foeMon = { species: pb.foe.species, type: pb.foe.type, move1: pb.foe.move1, move2: pb.foe.move2 };
  for (const line of lines) {
    const m = /^(\S+) (\S+) (명중|빗나감)$/.exec(line);
    if (m) {
      const [, attacker, move, result] = m;
      let who;
      if (attacker === pb.foe.species && (!prevMe || attacker !== prevMe.species)) who = "foe";
      else if (prevMe && attacker === prevMe.species && attacker !== pb.foe.species) who = "me";
      else who = foeHpChanged && !mineUsed ? "me" : "foe";
      if (who === "me") mineUsed = true;
      const hit = result === "명중";
      if (who === "me") {
        ev.push({ type: "attack", who, move, hit, eff: effOf(move, prevMe, pb.foe.type), hpFrom: foeHp, hpTo: hit ? foeHpFinal : foeHp });
        if (hit) foeHp = foeHpFinal;
      } else {
        ev.push({ type: "attack", who, move, hit, eff: effOf(move, foeMon, prevMe ? prevMe.type : ""), hpFrom: myHp, hpTo: hit ? myHpFinal : myHp });
        if (hit) myHp = myHpFinal;
      }
      continue;
    }
    if (line === "기절") { ev.push({ type: "faint", who: "me" }); continue; }
    if (line === "포획 실패") { ev.push({ type: "ball", shakes: Math.random() < 0.5 ? 1 : 2, caught: false }); continue; }
    if (line === "교체" && nb && nb.phase === "replace") { ev.push({ type: "ball", shakes: 3, caught: true }); continue; }
    if (line === "도망 실패") { ev.push({ type: "text", text: "도망칠 수 없었다!", ms: 700 }); continue; }
  }
  if (foeHpFinal === 0 && foeHp === 0 && (outcome === "승리" || outcome === "북쪽" || (nb && nb.phase === "down"))) {
    ev.push({ type: "faint", who: "foe" });
  }
  if (nb && nb.activeSlot !== pb.activeSlot) {
    const inMon = monAt(next, nb.activeSlot);
    if (inMon) ev.push({ type: "switch", outName: prevMe && myHp > 0 ? prevMe.species : "", inSpecies: inMon.species, inName: inMon.species, inLevel: inMon.level, inHp: inMon.hp, inMaxHp: inMon.maxHp, inType: inMon.type, inExp: inMon.exp, inToNext: inMon.toNext });
  }
  if (outcome === "승리" && prevMe && sameSlotNext) {
    const amount = pb.foe.level * 8;
    const leveled = sameSlotNext.level > prevMe.level;
    ev.push({ type: "exp", amount, to: sameSlotNext.exp, toNext: prevMe.toNext, levelUp: leveled });
    if (leveled) ev.push({ type: "levelup", level: sameSlotNext.level, maxHp: sameSlotNext.maxHp, hp: sameSlotNext.hp, exp: sameSlotNext.exp, toNext: sameSlotNext.toNext, next: "wild" });
    ev.push({ type: "win", text: "이겼다!" });
  } else if (outcome === "북쪽") {
    ev.push({ type: "win", text: "보스를 물리쳤다!" });
  } else if (outcome === "포획") {
    ev.push({ type: "ball", shakes: 3, caught: true });
  } else if (outcome === "패배") {
    ev.push({ type: "lose", text: "눈앞이 캄캄해졌다… 광장으로 돌아간다." });
  } else if (outcome === "도망") {
    ev.push({ type: "flee" });
  }
  return ev;
}

function remainLeft() {
  if (!state?.battle) return 0;
  return Math.max(0, remainBase - (Date.now() - remainAt));
}

function frozen() {
  if (busy) return true;
  if (mode() !== "battle") return false;
  if (outro) return true;
  if (window.Battle && Battle.busy()) return true;
  return remainLeft() <= 0;
}

function battleSig(s) {
  if (!s?.battle) return "";
  const b = s.battle;
  const body = (s.party || [])
    .map((p) => [p.slot, p.species, p.hp, p.level, p.maxHp].join(":"))
    .join(",");
  return [b.phase, b.activeSlot, b.foe?.species, b.foe?.hp, b.foe?.maxHp, oneLine(b.log), body].join("|");
}

function normalize(s) {
  if (!s || typeof s !== "object") return null;
  const next = {
    nickname: s.nickname || "",
    balls: num(s.balls),
    x: num(s.x),
    y: num(s.y),
    dir: s.dir || "s",
    tile: s.tile || "",
    party: (s.party || []).map((p) => ({
      slot: num(p.slot),
      species: p.species || "",
      type: p.type || "",
      level: num(p.level),
      hp: num(p.hp),
      maxHp: num(p.maxHp),
      exp: num(p.exp),
      toNext: num(p.toNext),
      move1: p.move1 || "",
      move2: p.move2 || "",
    })),
    dex: s.dex || [],
    battle: null,
    log: s.log,
    today: s.today || null,
    code: s.code || "",
    others: (s.others || []).map((mate) => ({
      nickname: mate.nickname || "",
      x: num(mate.x),
      y: num(mate.y),
      dir: mate.dir || "s",
      bubble: mate.bubble || "",
      wild: mate.wild === true,
      pvp: mate.pvp === true,
      boss: mate.boss === true,
    })),
    incoming: s.incoming || null,
    trade: s.trade || null,
    bubble: s.bubble || "",
  };
  if (s.battle) {
    const foe = s.battle.foe || {};
    next.battle = {
      phase: s.battle.phase || "",
      foe: {
        species: foe.species || "",
        label: s.battle.kind === "boss" ? "북쪽" : "",
        type: foe.type || "",
        level: num(foe.level),
        hp: num(foe.hp),
        maxHp: num(foe.maxHp),
        move1: foe.move1 || "",
        move2: foe.move2 || "",
      },
      activeSlot: num(s.battle.activeSlot),
      remainMs: num(s.battle.remainMs),
      log: s.battle.log,
      kind: s.battle.kind || "wild",
      cheered: s.battle.cheered === true,
      keepers: s.battle.keepers || [],
      watch: s.battle.watch === true,
      mate: s.battle.mate || null,
    };
  }
  return next;
}

function toast(msg) {
  toastText = msg;
  toastUntil = Date.now() + 2500;
  paintToast();
}

function paintToast() {
  const el = document.getElementById("toast");
  if (!el) return;
  const on = toastText && Date.now() < toastUntil;
  el.hidden = !on;
  el.textContent = on ? toastText : "";
}

function noteZero(next) {
  const sig = battleSig(next);
  if (next.battle && num(next.battle.remainMs) <= 0) {
    if (!zeroArmed) {
      zeroArmed = next.battle.phase;
      zeroSig = sig;
    } else if (sig !== zeroSig) {
      if (zeroArmed === "turn" && !sent) toast("시간이 지나 첫 기술을 썼어");
      zeroArmed = next.battle.phase;
      zeroSig = sig;
    }
    return;
  }
  if (!next.battle && zeroArmed === "turn" && !sent) toast("시간이 지나 첫 기술을 썼어");
  zeroArmed = null;
  zeroSig = "";
}

function snapshotSig(s) {
  if (!s) return "";
  const battle = s.battle
    ? {
      phase: s.battle.phase,
      foe: s.battle.foe,
      activeSlot: s.battle.activeSlot,
      log: oneLine(s.battle.log),
    }
    : null;
  return JSON.stringify({
    nickname: s.nickname,
    balls: s.balls,
    x: s.x,
    y: s.y,
    tile: s.tile,
    party: s.party,
    dex: s.dex,
    battle,
    log: oneLine(s.log),
    today: s.today || null,
    code: s.code || "",
    others: s.others || [],
    incoming: s.incoming || null,
    trade: s.trade || null,
    bubble: s.bubble || "",
  });
}

function applyState(raw, opts) {
  const next = normalize(raw);
  if (!next) return;
  const prev = state;
  const same = snapshotSig(next) === snapshotSig(prev);
  const phaseChanged = !prev?.battle || !next.battle || prev.battle.phase !== next.battle.phase;
  noteZero(next);
  cueBattle(prev, next);
  const events = same ? [] : battleEvents(prev, next);
  state = next;
  if (next.battle) {
    remainBase = next.battle.remainMs;
    remainAt = Date.now();
    lastBattleState = next;
  }
  if (prev?.battle && !next.battle && events.length && window.Battle) {
    // 전투 화면을 붙잡고 마지막 연출을 보여준 뒤 필드로 돌아간다.
    outro = { since: Date.now() };
    clearTimeout(outroTimer);
    outroTimer = setTimeout(endOutro, 9000);
  }
  ensurePoll();
  if (same) return;
  if (next.battle) {
    sheet = null;
    if (phaseChanged) {
      picked = null;
      if (overlay === "switch" || overlay === "replace") overlay = null;
    }
  } else {
    picked = null;
    overlay = null;
  }
  loadError = "";
  if (!opts?.keepError) error = "";
  if (events.length && window.Battle) {
    // render 보다 먼저 큐에 넣어야 체력판이 미리 뛰지 않는다.
    Battle.play(events, () => {
      if (outro) endOutro();
      else render();
    });
  }
  render();
}

function endOutro() {
  clearTimeout(outroTimer);
  outroTimer = 0;
  if (!outro) return;
  outro = null;
  render();
}

function ensurePoll() {
  clearInterval(pollTimer);
  pollTimer = 0;
  if (mode() !== "field" && mode() !== "battle") return;
  pollTimer = setInterval(() => {
    if (busy || sheet === "code") return;
    refresh();
  }, state?.battle ? 1000 : 3000);
}

function showError(message) {
  if (!message) return "";
  return ERROR_KO[message] || message;
}

function errText(json, text) {
  if (json) {
    if (typeof json.message === "string") return json.message;
    if (typeof json.error === "string") return json.error;
    if (json.error && typeof json.error.message === "string") return json.error.message;
  }
  if (text && text.length < 160 && !text.trim().startsWith("<")) return text.trim();
  return "";
}

async function api(path, body) {
  const headers = {};
  if (token) headers.authorization = "Bearer " + token;
  const init = { method: body ? "POST" : "GET", headers, cache: "no-store" };
  if (body) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    const err = new Error("연결이 끊겼어");
    err.offline = true;
    throw err;
  }
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  if (res.status === 401) {
    const err = new Error(errText(json, text));
    err.auth = true;
    throw err;
  }
  if (!res.ok) {
    const err = new Error(errText(json, text));
    err.state = json && json.state;
    throw err;
  }
  return json || {};
}

function dropAuth(message) {
  token = "";
  state = null;
  localStorage.removeItem("pw_token");
  sheet = null;
  overlay = null;
  loadError = "";
  error = message || "";
  clearInterval(pollTimer);
  render();
}

async function refresh() {
  if (refreshing || busy || !token) return;
  refreshing = true;
  try {
    const data = await api("/api/state");
    applyState(data.state);
  } catch (err) {
    if (err.auth) dropAuth(showError(err.message));
    else if (!state) {
      loadError = showError(err.message) || "연결이 끊겼어";
      render();
    } else {
      error = showError(err.message) || "연결이 끊겼어";
      render();
    }
  } finally {
    refreshing = false;
  }
}

async function request(path, body, opts) {
  if (busy) return;
  busy = true;
  error = "";
  render();
  try {
    const data = await api(path, body);
    if (data.token) {
      token = data.token;
      localStorage.setItem("pw_token", token);
    }
    if (data.state) applyState(data.state);
    else if (token) await refresh();
    if (opts?.after) opts.after();
  } catch (err) {
    if (err.auth) dropAuth(showError(err.message));
    else {
      overlay = null;
      if (err.state) applyState(err.state, { keepError: true });
      error = showError(err.message) || "연결이 끊겼어";
      render();
    }
  } finally {
    busy = false;
    render();
  }
}

function sendAct(body) {
  if (frozen()) return;
  sent = true;
  request("/api/act", body).finally(() => { sent = false; });
}

// 걷기는 주 버튼을 잠그지 않는다. 한 번에 한 요청씩 순서대로 보낸다.
function pendingMoves() {
  return moveQueue.length + (moveInFlight ? 1 : 0);
}

function selfPosFresh() {
  return pendingMoves() > 0 || Date.now() - lastMoveDone < 800 ? 1 : 0;
}

function canWalk() {
  return mode() === "field" && tutorStep() !== "rival" && !busy && !sheet && !talk && !overlay && moveQueue.length < 3;
}

function queueMove(dir) {
  moveQueue.push(dir);
  pumpMoves();
}

async function pumpMoves() {
  if (moveInFlight || !moveQueue.length) return;
  moveInFlight = true;
  const dir = moveQueue.shift();
  try {
    const data = await api("/api/move", { dir });
    if (tutor === "walk") setTutor("done");
    if (data.state) applyState(data.state);
  } catch (err) {
    moveQueue.length = 0;
    if (err.auth) {
      dropAuth(showError(err.message));
      return;
    }
    if (err.state) applyState(err.state, { keepError: true });
    if (window.Field && state && mode() === "field") Field.snapTo(state.x, state.y);
    if (err.offline) {
      error = err.message;
      render();
    }
  } finally {
    moveInFlight = false;
    lastMoveDone = Date.now();
    if (moveQueue.length) pumpMoves();
  }
}

function livingOthers() {
  if (!state?.battle) return [];
  return party().filter((p) => p.hp >= 1 && p.slot !== state.battle.activeSlot);
}

function activeMon() {
  if (!state?.battle) return null;
  return party().find((p) => p.slot === state.battle.activeSlot) || null;
}

function hpWidth(hp, max) {
  if (!max) return "0%";
  return Math.max(0, Math.min(100, (hp / max) * 100)) + "%";
}

function pill(type) {
  const key = typeKey(type);
  return `<i class="pill${key ? " t-" + key : ""}">${esc(type || "")}</i>`;
}

function statusPlate(mon) {
  if (!mon) return "";
  const key = typeKey(mon.type);
  return `<div class="plate">
    <p class="creature${key ? " t-" + key : ""}">${esc(mon.label || mon.species)}</p>
    <p class="meta">${pill(mon.type)}<span>레벨 ${num(mon.level)}</span></p>
    <div class="hp"><span class="fill${key ? " t-" + key : ""}" style="width:${hpWidth(mon.hp, mon.maxHp)}"></span></div>
    <p class="hpnum">${num(mon.hp)}/${num(mon.maxHp)}</p>
  </div>`;
}

function battleStage(foe, me, slim) {
  return `<section class="arena${slim ? " slim" : ""}">
      <div class="lane far">
        ${statusPlate(foe)}
        ${sprite(foe.species, slim ? 40 : 64)}
      </div>
      ${me ? `<div class="lane near">${sprite(me.species, 56)}${statusPlate(me)}</div>` : ""}
    </section>`;
}
function creatureCard(mon, role) {
  if (!mon) return `<article class="card ${role}"></article>`;
  const key = typeKey(mon.type);
  const size = role.includes("foe") ? (role.includes("short") ? 48 : 72) : 48;
  return `<article class="card ${role}">
    ${sprite(mon.species, size)}
    <p class="creature${key ? " t-" + key : ""}">${esc(mon.species)}</p>
    <p class="meta">${pill(mon.type)}<span>레벨 ${num(mon.level)}</span></p>
    <div class="hp"><span class="fill${key ? " t-" + key : ""}" style="width:${hpWidth(mon.hp, mon.maxHp)}"></span></div>
    <p class="hpnum">${num(mon.hp)}/${num(mon.maxHp)}</p>
  </article>`;
}

function partyButton(p, act, extra) {
  if (!p) {
    return `<div class="row"><span class="art"></span><span class="creature">비어 있음</span></div>`;
  }
  const key = typeKey(p.type);
  const lead = leadSlot() === p.slot ? "선두" : "";
  const open = extra.open ? `<span class="extra">${esc(extra.extra || "")}</span>` : "";
  return `<button type="button" class="row${extra.sel ? " sel" : ""}" data-act="${act}" data-slot="${p.slot}"${extra.disabled ? " disabled" : ""}>
    <span class="art">${sprite(p.species, 32)}</span>
    <span class="creature${key ? " t-" + key : ""}">${esc(p.species)}</span>
    <span class="tagline">${esc(extra.tag || lead)}</span>
    <span class="meta">${pill(p.type)}<span>레벨 ${num(p.level)}</span></span>
    <span class="hpnum">${num(p.hp)}/${num(p.maxHp)}</span>
    <span class="hp"><span class="fill${key ? " t-" + key : ""}" style="width:${hpWidth(p.hp, p.maxHp)}"></span></span>
    ${open}
  </button>`;
}

function dialog(title, body, alt, altAct, ok, okAct) {
  const lock = busy;
  return `<div class="scrim" data-act="scrim"></div>
    <div class="dialog" role="dialog">
      <h2>${esc(title)}</h2>
      <p>${esc(body)}</p>
      <button type="button" class="textbtn" data-act="${altAct}"${lock ? " disabled" : ""}>${esc(alt)}</button>
      <button type="button" class="main" data-act="${okAct}"${lock ? " disabled" : ""}>${lock ? "판정 중" : esc(ok)}</button>
    </div>`;
}

function sheetShell(title, body) {
  return `<div class="scrim" data-act="scrim"></div>
    <section class="sheet">
      <div class="handle"></div>
      <div class="sheet-head">
        <h2>${esc(title)}</h2>
        <button type="button" class="iconx" data-act="sheet-close">닫기</button>
      </div>
      <div class="scroll">${body}</div>
    </section>`;
}

function mainButton(label, opts) {
  const off = opts?.disabled || busy;
  if (opts?.stack && !busy) {
    return `<button type="${opts.submit ? "submit" : "button"}" class="main stack" id="main" data-act="main"${off ? " disabled" : ""}>
      <span class="mainline">${opts.pill || ""}${esc(label)}</span>
      <small>${esc(opts.small || "")}</small>
    </button>`;
  }
  const text = busy && opts?.pending ? "판정 중" : label;
  return `<button type="${opts?.submit ? "submit" : "button"}" class="main" id="main" data-act="main"${off ? " disabled" : ""}>${esc(text)}</button>`;
}

function toastBox() {
  const on = toastText && Date.now() < toastUntil;
  return `<div id="toast" class="toast"${on ? "" : " hidden"}>${on ? esc(toastText) : ""}</div>`;
}

function renderJoin() {
  const ok = validNick(nickDraft) && !busy;
  return `<form class="stage" id="joinform">
      <div class="topline"><h1>야생광장</h1>${soundButton()}</div>
      <p class="sub">하림</p>
      <div class="grow"></div>
      <input class="nick" id="nick" name="nickname" maxlength="8" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="go" placeholder="닉네임" value="${esc(nickDraft)}">
      <p class="hint">2자에서 8자</p>
      <p class="err">${esc(error)}</p>
      <div class="grow"></div>
    </form>
    <div class="foot">${mainButton("입장", { disabled: !ok })}</div>
    ${toastBox()}`;
}

function renderTalk() {
  const second = tutorStep() === "seoha2";
  return `<div class="stage">
      <p class="sub">하림마을</p>
      <h1>서하</h1>
      <div class="grow"></div>
      <div class="line">
        <p>${second ? "네이몬은 자연에서 온 생물이야. 도토, 부티, 가리 중 하나를 골라." : "하림마을에 온 걸 환영해. 나는 서하야."}</p>
      </div>
      <div class="grow"></div>
    </div>
    <div class="foot">${mainButton(second ? "고르기" : "다음")}</div>
    ${toastBox()}`;
}

function renderRival() {
  const mine = party()[0]?.species || "네이몬";
  const other = rivalOf(mine);
  return `<div class="stage">
      <p class="sub">하림마을</p>
      <h1>민재</h1>
      <div class="pair">${sprite(mine, 72)}${sprite(other, 72)}</div>
      <div class="line">
        <p>나 민재야. 너는 ${esc(eul(mine))} 골랐구나. 나는 ${esc(other)}로 갈게.</p>
        <p>북쪽 풀숲으로 가. 야생 네이몬을 만나면 기술이나 볼을 써.</p>
      </div>
      <div class="grow"></div>
    </div>
    <div class="foot">${mainButton("출발")}</div>
    ${toastBox()}`;
}

function renderStarter() {
  const cards = STARTERS.map((s) => {
    const key = typeKey(s.type);
    const sel = pickedSpecies === s.species;
    return `<button type="button" class="starter${sel ? " sel" : ""}" data-act="pick-species" data-species="${esc(s.species)}"${busy ? " disabled" : ""}>
      ${sprite(s.species, 80)}
      <span class="starter-copy">
        ${pill(s.type)}
        <span class="creature${key ? " t-" + key : ""}">${esc(s.species)}</span>
        <span class="moves">${esc(s.move1)} · ${esc(s.move2)}</span>
      </span>
    </button>`;
  }).join("");
  let extra = "";
  if (overlay === "starter" && pickedSpecies) {
    extra = dialog(wa(pickedSpecies) + " 시작할까", "이 선택은 고정이야", "다시 고르기", "dialog-close", "시작", "starter-go");
  }
  return `<div class="stage">
      <h1>함께 갈 네이몬</h1>
      <p class="sub">한 마리만 고른다</p>
      <div class="scroll grow">${cards}</div>
    </div>
    <div class="foot">
      <p class="err">${esc(error)}</p>
      ${overlay === "starter" ? "" : mainButton("이 네이몬으로 시작", { disabled: !pickedSpecies })}
    </div>
    ${extra}${toastBox()}`;
}

function talkHtml() {
  if (!talk) return "";
  const line = talk.lines[talk.i] || "";
  const last = talk.i >= talk.lines.length - 1;
  return `<div class="talkbox" data-act="talk-next">
      <b>${esc(talk.name)}</b>
      <p>${esc(line)}</p>
      <small>${last ? "닫기" : "다음"} ▸</small>
    </div>`;
}

function fieldLayerHtml() {
  return `${state.incoming && state.incoming.kind === "duel" ? dialog("한 판", `${esc(state.incoming.from)}가 한 판 하자고 해`, "거절", "duel-no", "수락", "duel-yes") : ""}
    ${state.trade && state.trade.phase === "answer" ? sheetShell("교환", party().map((mon) => `<button type="button" class="row" data-act="trade-answer" data-slot="${mon.slot}">${esc(mon.species)}</button>`).join("")) : ""}
    ${state.trade && state.trade.phase === "cancel" ? dialog("교환", "10초 안에 취소할 수 있어", "두기", "trade-wait", "취소", "trade-cancel") : ""}
    ${fieldSheetHtml()}${talkHtml()}${toastBox()}`;
}

function fieldLogText() {
  if (tutorStep() === "walk") return "북쪽 풀숲으로 가. 만나면 기술이나 볼을 써.";
  const line = oneLine(state.log);
  if (line) return line;
  if (state.today) return `오늘 풀숲에 ${state.today}`;
  if (!state.others || state.others.length === 0) return `코드 ${state.code || ""}를 친구에게 알려줘`;
  return "";
}

function fieldMainLabel() {
  if (talk) return talk.i >= talk.lines.length - 1 ? "닫기" : "다음";
  return sheet ? "닫기" : "파티";
}

function renderField() {
  return `<div class="stage fieldstage">
      <header class="hud">
        <b class="tag">${esc(state.nickname)}</b>
        <button type="button" class="textbtn" id="hud-code" data-act="open-code">코드 ${esc(state.code || "")}</button>
        <span id="hud-balls">볼 ${num(state.balls)}</span>
        ${soundButton()}
      </header>
      <div id="fieldwrap" class="fieldwrap"></div>
      <p class="log" id="fieldlog">${esc(fieldLogText())}</p>
      <div class="controls">
        <div class="dpad">
          <button type="button" class="dkey up" data-hold="n" aria-label="위">▲</button>
          <button type="button" class="dkey left" data-hold="w" aria-label="왼쪽">◀</button>
          <button type="button" class="dkey right" data-hold="e" aria-label="오른쪽">▶</button>
          <button type="button" class="dkey down" data-hold="s" aria-label="아래">▼</button>
        </div>
        <div class="actions">
          <button type="button" class="abtn" data-act="interact">A</button>
          <div class="dock">
            <button type="button" class="round" data-act="open-dex">기록</button>
            <button type="button" class="round" data-act="open-say">한마디</button>
          </div>
        </div>
      </div>
    </div>
    <div class="foot">
      <p class="err" id="fielderr">${esc(error)}</p>
      ${mainButton(fieldMainLabel())}
    </div>
    <div id="layer">${fieldLayerHtml()}</div>`;
}

function mountField() {
  const wrap = document.getElementById("fieldwrap");
  if (!wrap || !window.Field) return;
  Field.mount(wrap, {
    canMove: canWalk,
    onStep(dir) { queueMove(dir); },
    onBump() { if (window.Sound) Sound.sfx("bump"); },
    onTalk(npc) {
      if (talk || sheet) return;
      talk = { name: npc.name, lines: npc.lines, i: 0 };
      if (window.Sound) Sound.sfx("menu");
      render();
    },
    onSign(text) {
      if (talk || sheet) return;
      talk = { name: "표지판", lines: [text], i: 0 };
      render();
    },
    onMate(name) {
      if (talk) return;
      pickedMate = name;
      sheet = "mate";
      render();
    },
  });
  Field.update(state, 0);
}

function patchField() {
  const balls = document.getElementById("hud-balls");
  if (balls) balls.textContent = "볼 " + num(state.balls);
  const code = document.getElementById("hud-code");
  if (code) code.textContent = "코드 " + (state.code || "");
  const log = document.getElementById("fieldlog");
  if (log) log.textContent = fieldLogText();
  const err = document.getElementById("fielderr");
  if (err) err.textContent = error;
  const layer = document.getElementById("layer");
  if (layer) {
    const html = fieldLayerHtml();
    if (layer.dataset.html !== html) {
      layer.innerHTML = html;
      layer.dataset.html = html;
    }
  }
  const main = document.getElementById("main");
  if (main) {
    main.textContent = fieldMainLabel();
    main.disabled = busy;
  }
  if (window.Field) {
    Field.update(state, selfPosFresh());
    Field.setBubble(state.bubble);
  }
}

function fieldSheetHtml() {
  let extra = "";
  if (sheet === "party") {
    const rowsHtml = [0, 1, 2].map((i) => {
      const list = party();
      const p = list[i] || null;
      if (!p) return partyButton(null, "expand", {});
      const open = openSlot === p.slot;
      const bits = [p.move1, p.move2].filter(Boolean);
      if (p.level < 20 && p.toNext > 0) bits.push(`경험 ${p.exp}/${p.toNext}`);
      return partyButton(p, "expand", {
        open,
        extra: open ? bits.join(" · ") : "",
      });
    }).join("");
    extra = sheetShell("파티", rowsHtml);
  } else if (sheet === "dex") {
    extra = sheetShell("기록", dexHtml());
  } else if (sheet === "code") {
    extra = sheetShell("코드", `<p class="hint">코드 ${esc(state.code || "")}</p>
      <label class="hint">여섯 자리 <input id="code-input" inputmode="numeric" maxlength="6" value="${esc(codeDraft)}"></label>
      <button type="button" class="main" data-act="code-go"${codeDraft.length === 6 ? "" : " disabled"}>들어가기</button>`);
  } else if (sheet === "say") {
    const words = ["안녕", "이쪽이야", "풀숲 가자", "한 판 하자", "좋아", "잠깐", "보스 대기", "잘 가"];
    extra = sheetShell("한마디", words.map((word) => (
      `<button type="button" class="row" data-act="say" data-text="${esc(word)}"${state.bubble === word ? " disabled" : ""}>${esc(word)}</button>`
    )).join(""));
  } else if (sheet === "mate") {
    const mate = (state.others || []).find((item) => item.nickname === pickedMate);
    const buttons = [];
    if (mate && !mate.wild && !mate.pvp && !mate.boss) buttons.push(`<button type="button" class="row" data-act="duel-ask" data-name="${esc(pickedMate)}">대전</button>`);
    if (mate && mate.wild) buttons.push(`<button type="button" class="row" data-act="cheer" data-name="${esc(pickedMate)}">응원</button>`);
    if (mate && mate.pvp) buttons.push(`<button type="button" class="row" data-act="watch" data-name="${esc(pickedMate)}">관전</button>`);
    if (mate && !mate.wild && !mate.pvp && !mate.boss) buttons.push(`<button type="button" class="row" data-act="trade-open" data-name="${esc(pickedMate)}">교환</button>`);
    extra = sheetShell(pickedMate || "사람", buttons.join("") || `<p class="hint">지금 할 일이 없어</p>`);
  } else if (sheet === "trade") {
    extra = sheetShell("교환", party().map((mon) => (
      `<button type="button" class="row" data-act="trade-slot" data-slot="${mon.slot}">${esc(mon.species)}</button>`
    )).join(""));
  }
  return extra;
}

function dexCaughtIndex() {
  const rows = state.dex || [];
  const caught = rows.findIndex((row) => row.status === "caught");
  if (caught >= 0) return caught;
  const seen = rows.findIndex((row) => row.status === "seen");
  return seen >= 0 ? seen : 0;
}

function dexHtml() {
  const rows = state.dex || [];
  const total = rows.length;
  if (!total) return `<p class="hint">아직이야</p>`;
  if (dexPage < 0 || dexPage >= total) dexPage = 0;
  const row = rows[dexPage];
  const hidden = row.status === "unseen";
  const caught = rows.filter((item) => item.status === "caught").length;
  const known = hidden ? null : party().find((mon) => mon.species === row.species);
  const key = hidden ? "" : typeKey(row.type);
  const habitat = hidden ? "" : row.habitat || "";
  const moves = known ? [known.move1, known.move2].filter(Boolean).join(" · ") : "";
  return `<div class="dexpage">
    <p class="tagline">잡은 ${num(caught)} · ${num(dexPage + 1)}/${num(total)}</p>
    <div class="art">${hidden ? `<span class="blank"></span>` : sprite(row.species, 80, row.status === "caught" ? "" : "dim")}</div>
    <p class="creature${key ? " t-" + key : ""}">${hidden ? "빈 칸" : esc(row.species)}</p>
    <p class="meta">${hidden ? "" : pill(row.type)}${known ? `<span>레벨 ${num(known.level)}</span>` : ""}</p>
    <p class="hint">${hidden ? "아직이야" : esc(STATUS[row.status] || "")}${habitat ? " · " + esc(habitat) : ""}</p>
    ${moves ? `<p class="hint">${esc(moves)}</p>` : ""}
    <div class="dexnav">
      <button type="button" data-act="dex-prev"${dexPage === 0 ? " disabled" : ""}>이전</button>
      <button type="button" data-act="dex-next"${dexPage >= total - 1 ? " disabled" : ""}>다음</button>
    </div>
  </div>`;
}

function renderBattle() {
  const b = battleView().battle;
  const phase = b.phase;
  const lock = frozen();
  const sec = Math.ceil(remainLeft() / 1000);
  const urgent = sec <= 8;
  const label = phase === "switch" ? "교대" : phase === "replace" ? "교체" : phase === "turn" ? "내 턴" : "판정 중";
  const me = activeMon();
  let switchRows = "";
  if (phase === "switch" || overlay === "switch") {
    switchRows = party().map((p) => {
      const active = p.slot === b.activeSlot;
      const dead = p.hp < 1;
      const tag = dead ? "쓰러짐" : active ? "전투 중" : "";
      return partyButton(p, "pick", { sel: picked === p.slot, disabled: active || dead || lock, tag });
    }).join("");
  }
  let body = "";
  if (phase === "switch") {
    body = switchRows;
  } else if (phase === "replace") {
    body = `<p class="pick">파티가 가득 찼어</p>` + party().map((p) => {
      return partyButton(p, "pick", { sel: picked === p.slot, disabled: lock, tag: "" });
    }).join("");
  } else if (phase === "turn") {
    body = "";
  } else {
    body = "";
  }

  let aux = "";
  const kind = b.kind || "wild";
  if (b.watch) {
    aux = `<p class="hint">관전</p>`;
  } else if (phase === "turn" && !overlay) {
    const ballLabel = state.balls > 0 ? `볼 ${state.balls}` : "볼이 없어";
    const move2 = me?.move2 || "기술";
    const catchButtons = kind === "wild"
      ? `<button type="button" data-act="ball" data-go ${lock ? "disabled" : ""}>${esc(ballLabel)}</button>
      <button type="button" data-act="flee-open" data-go ${lock ? "disabled" : ""}>도망</button>`
      : "";
    aux = `<div class="aux">
      <button type="button" data-act="move2" data-go ${lock ? "disabled" : ""}>${esc(move2)}</button>
      <button type="button" data-act="switch-open" data-go ${lock ? "disabled" : ""}>교대</button>
      ${catchButtons}
    </div>`;
  }

  let main = "";
  let dialogHtml = "";
  if (overlay === "flee") {
    dialogHtml = dialog("도망갈까", "이 야생은 끝나", "남기", "dialog-close", "도망", "flee-go");
  } else if (overlay === "replace") {
    const mon = party().find((p) => p.slot === picked);
    dialogHtml = dialog(mon ? eul(mon.species) + " 보낼까" : "보낼까", "파티에서 사라져", "다시", "dialog-close", "보내기", "replace-go");
  } else if (phase === "turn" && overlay === "switch") {
    main = mainButton("교대", { disabled: picked == null || lock || !livingOthers().length, pending: true });
    dialogHtml = sheetShell("교대", switchRows);
  } else if (b.watch) {
    main = mainButton("나가기");
  } else if (phase === "turn") {
    const move = me?.move1 || "기술";
    if (lock) main = mainButton("판정 중", { disabled: true, pending: true });
    else main = mainButton(move, { stack: true, pill: me ? pill(me.type) : "", small: "넘기면 이 기술", pending: true });
  } else if (phase === "switch") {
    main = mainButton("교대", { disabled: picked == null || lock, pending: true });
  } else if (phase === "replace") {
    main = mainButton("보내기", { disabled: picked == null || lock, pending: true });
  } else {
    main = mainButton("판정 중", { disabled: true, pending: true });
  }

  if (outro) {
    aux = "";
    main = mainButton("…", { disabled: true, pending: true });
    body = "";
    dialogHtml = "";
  }
  const parts = {
    label,
    sec,
    urgent,
    log: oneLine(b.log),
    body,
    foot: `${aux}<p class="err">${esc(error)}</p>${main}`,
    layer: `${dialogHtml}${toastBox()}`,
    slim: phase === "switch" || phase === "replace",
  };
  return parts;
}

function battleView() {
  return state?.battle ? state : lastBattleState;
}

function battleScene() {
  const s = battleView();
  const b = s.battle;
  const foe = { species: b.foe.species, name: b.foe.label || b.foe.species, level: b.foe.level, hp: b.foe.hp, maxHp: b.foe.maxHp, type: b.foe.type };
  let mine = null;
  if (b.watch && b.mate) {
    mine = { species: b.mate.species, name: b.mate.species, level: num(b.mate.level), hp: num(b.mate.hp), maxHp: num(b.mate.maxHp), type: b.mate.type || "" };
  } else {
    const m = (s.party || []).find((p) => p.slot === b.activeSlot);
    if (m) mine = { species: m.species, name: m.species, level: m.level, hp: m.hp, maxHp: m.maxHp, type: m.type, exp: m.exp, toNext: m.toNext };
  }
  const habitat = b.kind === "wild"
    ? (["grass", "rock", "stream"].includes(s.tile) ? s.tile : "grass")
    : b.kind === "pvp" ? "duel" : "boss";
  return { kind: b.kind, habitat, foe, me: mine };
}

function renderBattleShell() {
  const p = renderBattle();
  return `<div class="stage battle">
      <div class="track${p.urgent ? " urgent" : ""}"><div class="fill" id="timebar"></div></div>
      <div class="turnhead"><span id="bphase">${esc(p.label)}</span><span id="secs"${p.urgent ? ' class="urgent"' : ""}>${p.sec}초</span></div>
      <div id="arenawrap" class="arenawrap${p.slim ? " slim" : ""}"></div>
      <p class="log" id="blog">${esc(p.log)}</p>
      <div class="scroll grow" id="bbody">${p.body}</div>
    </div>
    <div class="foot" id="bfoot">${p.foot}</div>
    <div id="blayer">${p.layer}</div>`;
}

function mountBattle() {
  const wrap = document.getElementById("arenawrap");
  if (!wrap || !window.Battle) return;
  Battle.mount(wrap, {
    onText(text) {
      const el = document.getElementById("blog");
      if (el) el.textContent = text;
    },
  });
  Battle.setScene(battleScene());
}

function patchBattle() {
  const p = renderBattle();
  const set = (id, html) => {
    const el = document.getElementById(id);
    if (el && el.dataset.html !== html) {
      el.innerHTML = html;
      el.dataset.html = html;
    }
  };
  const phaseEl = document.getElementById("bphase");
  if (phaseEl) phaseEl.textContent = p.label;
  const animating = window.Battle && Battle.busy();
  const log = document.getElementById("blog");
  if (log && !animating && !(window.Battle && Battle.text)) log.textContent = p.log;
  const wrap = document.getElementById("arenawrap");
  if (wrap) wrap.classList.toggle("slim", p.slim);
  set("bbody", p.body);
  set("bfoot", p.foot);
  set("blayer", p.layer);
  if (window.Battle) Battle.setScene(battleScene());
}

function soundButton() {
  const on = window.Sound ? Sound.on : false;
  return `<button type="button" class="textbtn sound${on ? "" : " off"}" data-act="sound" aria-label="${on ? "소리 끄기" : "소리 켜기"}">${on ? "♪" : "♪ 끔"}</button>`;
}

function render() {
  const m = mode();
  if (window.Sound) Sound.want(trackFor(m));
  if (m === "join" && app.dataset.mode === "join") {
    const nick = document.getElementById("nick");
    const err = app.querySelector(".err");
    const main = document.getElementById("main");
    if (nick && err && main) {
      if (document.activeElement !== nick) nick.value = nickDraft;
      err.textContent = error;
      main.disabled = busy || !validNick(nickDraft);
      paintToast();
      return;
    }
  }
  const walking = m === "field" && tutorStep() !== "rival";
  if (walking && app.dataset.mode === "field" && document.getElementById("fieldwrap")) {
    patchField();
    return;
  }
  if (m === "battle" && app.dataset.mode === "battle" && document.getElementById("arenawrap")) {
    patchBattle();
    paintToast();
    return;
  }
  if (!walking && window.Field && document.getElementById("fieldwrap")) Field.destroy();
  if (m !== "battle" && window.Battle && document.getElementById("arenawrap")) Battle.destroy();
  if (!walking) talk = null;
  app.dataset.mode = m;
  let html = "";
  if (m === "loading") html = `<div class="stage center"><p>불러오는 중</p></div>${toastBox()}`;
  else if (m === "retry") {
    html = `<div class="stage center"><p class="err">${esc(loadError || error)}</p></div>
      <div class="foot">${mainButton("다시 시도")}</div>${toastBox()}`;
  } else if (m === "join") html = renderJoin();
  else if (m === "starter") html = tutorStep() === "choose" ? renderStarter() : renderTalk();
  else if (m === "field" && tutorStep() === "rival") html = renderRival();
  else if (m === "battle") html = renderBattleShell();
  else html = renderField();
  app.innerHTML = html;
  if (walking) mountField();
  if (m === "battle") mountBattle();
  const bar = document.getElementById("timebar");
  if (bar && state?.battle) {
    bar.style.width = Math.max(0, Math.min(100, (remainLeft() / 20000) * 100)) + "%";
  }
  const nick = document.getElementById("nick");
  if (nick && document.activeElement !== nick) nick.focus();
}

function onMain() {
  const m = mode();
  if (m === "retry") return refresh();
  if (m === "join") {
    if (!validNick(nickDraft)) return;
    return request("/api/join", { nickname: nickDraft.trim() });
  }
  if (m === "starter") {
    const step = tutorStep();
    if (step === "seoha") {
      setTutor("seoha2");
      render();
      return;
    }
    if (step === "seoha2") {
      setTutor("choose");
      render();
      return;
    }
    if (!pickedSpecies) return;
    overlay = "starter";
    render();
    return;
  }
  if (m === "field") {
    if (tutorStep() === "rival") {
      setTutor("walk");
      render();
      return;
    }
    if (talk) {
      advanceTalk();
      return;
    }
    if (sheet) {
      sheet = null;
      render();
      return;
    }
    sheet = "party";
    openSlot = null;
    render();
    return;
  }
  if (m !== "battle" || state.battle.watch) {
    if (state?.battle?.watch) return request("/api/watch", { leave: true });
    return;
  }
  if (frozen()) return;
  const phase = state.battle.phase;
  if (phase === "turn" && overlay === "switch") {
    if (picked == null) return;
    overlay = null;
    return sendAct({ kind: "switch", slot: picked });
  }
  if (phase === "turn") return sendAct({ kind: "move1" });
  if (phase === "switch") {
    if (picked == null) return;
    return sendAct({ kind: "switch", slot: picked });
  }
  if (phase === "replace") {
    if (picked == null) return;
    overlay = "replace";
    render();
  }
}

app.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  if (btn.dataset.act === "scrim" && e.target !== btn) return;
  if (btn.disabled || busy) return;
  const act = btn.dataset.act;
  if (act === "sound") {
    if (window.Sound) Sound.toggle();
    for (const el of app.querySelectorAll("[data-act=sound]")) el.outerHTML = soundButton();
    return;
  }
  if (window.Sound && act !== "scrim") Sound.sfx("blip");
  if (act === "main") return onMain();
  if (act === "pick-species") {
    pickedSpecies = btn.dataset.species || "";
    render();
    return;
  }
  if (act === "dialog-close") {
    overlay = null;
    render();
    return;
  }
  if (act === "scrim" || act === "sheet-close") {
    if (overlay === "switch" && state?.battle?.phase === "turn") overlay = null;
    if (overlay === "starter" || overlay === "flee" || overlay === "replace") overlay = null;
    sheet = null;
    render();
    return;
  }
  if (act === "starter-go") {
    if (!pickedSpecies) return;
    return request("/api/starter", { species: pickedSpecies }, { after() { overlay = null; setTutor("rival"); } });
  }
  if (act === "open-code") {
    sheet = "code";
    codeDraft = "";
    render();
    return;
  }
  if (act === "code-go") {
    return request("/api/plaza", { code: codeDraft }, { after() { sheet = null; codeDraft = ""; } });
  }
  if (act === "open-say") {
    sheet = "say";
    render();
    return;
  }
  if (act === "say") {
    return request("/api/say", { text: btn.dataset.text || "" }, { after() { sheet = null; } });
  }
  if (act === "mate") {
    pickedMate = btn.dataset.name || "";
    sheet = "mate";
    render();
    return;
  }
  if (act === "duel-ask") {
    return request("/api/duel", { nickname: btn.dataset.name || "" }, { after() { sheet = null; } });
  }
  if (act === "duel-yes") return request("/api/duel", { accept: true });
  if (act === "duel-no") return request("/api/duel", { accept: false });
  if (act === "cheer") {
    return request("/api/cheer", { nickname: btn.dataset.name || "" }, { after() { sheet = null; } });
  }
  if (act === "watch") {
    return request("/api/watch", { nickname: btn.dataset.name || "" }, { after() { sheet = null; } });
  }
  if (act === "trade-open") {
    pickedMate = btn.dataset.name || pickedMate;
    sheet = "trade";
    render();
    return;
  }
  if (act === "trade-slot") {
    return request("/api/trade", { nickname: pickedMate, slot: num(btn.dataset.slot) }, { after() { sheet = null; } });
  }
  if (act === "trade-answer") {
    return request("/api/trade", { slot: num(btn.dataset.slot) });
  }
  if (act === "trade-cancel") return request("/api/trade", { cancel: true });
  if (act === "trade-wait") {
    render();
    return;
  }
  if (act === "open-dex") {
    sheet = "dex";
    dexPage = dexCaughtIndex();
    render();
    return;
  }
  if (act === "dex-prev") {
    dexPage = Math.max(0, dexPage - 1);
    render();
    return;
  }
  if (act === "dex-next") {
    dexPage = Math.min((state?.dex || []).length - 1, dexPage + 1);
    render();
    return;
  }
  if (act === "expand") {
    const slot = num(btn.dataset.slot);
    openSlot = openSlot === slot ? null : slot;
    render();
    return;
  }
  if (act === "interact") {
    if (mode() !== "field" || !window.Field) return;
    if (talk) return advanceTalk();
    if (sheet) return;
    if (!Field.interact()) Field.release();
    return;
  }
  if (act === "talk-next") return advanceTalk();
  if (mode() !== "battle" || frozen()) return;
  if (act === "move2") return sendAct({ kind: "move2" });
  if (act === "ball") {
    if (state.balls < 1) return toast("볼이 없어");
    return sendAct({ kind: "ball" });
  }
  if (act === "flee-open") {
    overlay = "flee";
    render();
    return;
  }
  if (act === "flee-go") {
    overlay = null;
    return sendAct({ kind: "flee" });
  }
  if (act === "switch-open") {
    if (!livingOthers().length) return toast("바꿀 네이몬이 없어");
    overlay = "switch";
    picked = null;
    render();
    return;
  }
  if (act === "pick") {
    picked = num(btn.dataset.slot);
    render();
    return;
  }
  if (act === "replace-go") {
    if (picked == null) return;
    const slot = picked;
    overlay = null;
    return sendAct({ kind: "replace", slot });
  }
});

function advanceTalk() {
  if (!talk) return;
  if (talk.i < talk.lines.length - 1) talk.i += 1;
  else talk = null;
  if (window.Sound) Sound.sfx("blip");
  render();
}

// D패드: 누르고 있는 동안 걷는다.
const KEY_DIR = { ArrowUp: "n", ArrowDown: "s", ArrowLeft: "w", ArrowRight: "e", w: "n", s: "s", a: "w", d: "e" };
function holdStart(e) {
  const key = e.target.closest("[data-hold]");
  if (!key || !window.Field) return;
  e.preventDefault();
  if (key.setPointerCapture && e.pointerId != null) {
    try { key.setPointerCapture(e.pointerId); } catch {}
  }
  Field.hold(key.dataset.hold);
}
function holdEnd(e) {
  const key = e.target.closest("[data-hold]");
  if (!window.Field) return;
  Field.release(key ? key.dataset.hold : null);
}
app.addEventListener("pointerdown", holdStart);
app.addEventListener("pointerup", holdEnd);
app.addEventListener("pointercancel", holdEnd);
app.addEventListener("pointerleave", (e) => { if (e.target.closest && e.target.closest("[data-hold]")) holdEnd(e); }, true);
app.addEventListener("contextmenu", (e) => { if (e.target.closest("[data-hold]")) e.preventDefault(); });
document.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  const dir = KEY_DIR[e.key];
  if (dir && window.Field && mode() === "field") {
    e.preventDefault();
    Field.hold(dir);
    return;
  }
  if ((e.key === "Enter" || e.key === " " || e.key === "z") && mode() === "field" && window.Field && !sheet && e.target.tagName !== "INPUT") {
    e.preventDefault();
    if (talk) advanceTalk();
    else Field.interact();
  }
});
document.addEventListener("keyup", (e) => {
  const dir = KEY_DIR[e.key];
  if (dir && window.Field) Field.release(dir);
});

app.addEventListener("input", (e) => {
  if (e.target.id === "code-input") {
    codeDraft = String(e.target.value || "").replace(/\D/g, "").slice(0, 6);
    const go = document.querySelector("[data-act=code-go]");
    if (go) go.disabled = codeDraft.length !== 6;
    return;
  }
  if (e.target.id !== "nick") return;
  nickDraft = e.target.value;
  const main = document.getElementById("main");
  if (main) main.disabled = busy || !validNick(nickDraft);
});

app.addEventListener("submit", (e) => {
  e.preventDefault();
  if (busy || mode() !== "join" || !validNick(nickDraft)) return;
  request("/api/join", { nickname: nickDraft.trim() });
});

setInterval(() => {
  if (toastText && Date.now() >= toastUntil) paintToast();
  if (mode() !== "battle" || !state?.battle) return;
  const secEl = document.getElementById("secs");
  const bar = document.getElementById("timebar");
  const left = remainLeft();
  const sec = Math.ceil(left / 1000);
  if (secEl) {
    secEl.textContent = sec + "초";
    secEl.classList.toggle("urgent", sec <= 8);
  }
  if (bar) {
    bar.style.width = Math.max(0, Math.min(100, (left / 20000) * 100)) + "%";
    bar.parentElement.classList.toggle("urgent", sec <= 8);
  }
  if (left <= 0 && !zeroArmed) {
    zeroArmed = state.battle.phase;
    zeroSig = battleSig(state);
    overlay = null;
    render();
    if (!busy) refresh();
  }
}, 200);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && token) refresh();
});

if (token) refresh();
else render();
