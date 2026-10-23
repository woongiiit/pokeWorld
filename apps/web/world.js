// 하림 월드. 서버(판정)와 클라이언트(그리기)가 같은 파일을 읽는다.
// 24 x 40 타일. 남쪽이 하림마을, 가운데가 북쪽 들길, 북쪽 끝이 돌밭과 보스 자리다.
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.WORLD = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const ROWS = [
    "TTTTTTTTTTTTTTTTTTTTTTTT", // 0
    "TTTTTTTTTrrrrrrrTTTTTTTT", // 1
    "TTTTTTTrrroooooorrTTTTTT", // 2
    "TTTTTTrrro..B...orrTTTTT", // 3  보스 자리
    "TTTTTTrrro......orrTTTTT", // 4
    "TTTTTTTrrroo..oorrTTTTTT", // 5
    "TTTTTTTTrrrr..rrrTTTTTTT", // 6
    "TTTTTTT.rrr,,,rrr.TTTTTT", // 7
    "TTTTT...rr,,,,,rr...TTTT", // 8
    "TTTT..rrr,,,..,,rr...TTT", // 9
    "TTT...rr,,,.....,,r..TTT", // 10
    "TT..oo.,,,...o..,,....TT", // 11
    "TT~~~~~~~~~==~~~~~~~~~TT", // 12 개울
    "TT~~~~~~~~~==~~~~~~~~~TT", // 13
    "TTwww..ggg.,,.ggg..wwwTT", // 14
    "TT.ww.gggg.,,.gggg.ww.TT", // 15
    "TT...ggggg.,,.ggggg...TT", // 16
    "TTT..gggg..,,..gggg..TTT", // 17
    "TTTT.ggg...,,...ggg.TTTT", // 18
    "TTTT......,,,......TTTTT", // 19
    "TTT.ggg....,,...gggg.TTT", // 20
    "TTT.gggg...,,..ggggg..TT", // 21
    "TT..gggg...,,..gggg...TT", // 22
    "TT...ggg...,,...gg...TTT", // 23
    "TTT........,,.......TTTT", // 24
    "TTTT|||||..,,s|||||.TTTT", // 25 마을 북쪽 울타리
    "TTTT.^^^^^.,,.^^^^..TTTT", // 26 연구소 지붕 / 집 지붕
    "TTTT.^^^^^.,,.^^^^..TTTT", // 27
    "TTTT.#WDW#.,,.#DW#..TTTT", // 28
    "TTTT.,,,,,,,,,,,,,..TTTT", // 29
    "TTT..f...PPP..f..^^^^TTT", // 30 광장
    "TTT..f...PPP..f..^^^^TTT", // 31
    "TTT......PPP.....#WD#TTT", // 32
    "TTT|||...,,,.....s..TTTT", // 33
    "TTT......,,,........TTTT", // 34
    "TTT.ffff.,,,.....|||TTTT", // 35
    "TTT.ffff.,,,........TTTT", // 36
    "TTTT......S.........TTTT", // 37 시작
    "TTTTTTTTTTTTTTTTTTTTTTTT", // 38
    "TTTTTTTTTTTTTTTTTTTTTTTT", // 39
  ];

  const LEGEND = {
    ".": { kind: "ground", walk: true, label: "풀밭" },
    ",": { kind: "path", walk: true, label: "길" },
    "g": { kind: "grass", walk: true, label: "풀숲", habitat: "grass" },
    "r": { kind: "rock", walk: true, label: "돌밭", habitat: "rock" },
    "w": { kind: "stream", walk: true, label: "개울", habitat: "stream" },
    "~": { kind: "water", walk: false, label: "물" },
    "=": { kind: "bridge", walk: true, label: "다리" },
    "T": { kind: "tree", walk: false, label: "나무" },
    "o": { kind: "stone", walk: false, label: "바위" },
    "f": { kind: "flower", walk: true, label: "꽃밭" },
    "|": { kind: "fence", walk: false, label: "울타리" },
    "^": { kind: "roof", walk: false, label: "지붕" },
    "#": { kind: "wall", walk: false, label: "벽" },
    "W": { kind: "window", walk: false, label: "창" },
    "D": { kind: "door", walk: false, label: "문" },
    "s": { kind: "sign", walk: false, label: "표지판" },
    "P": { kind: "heal", walk: true, label: "광장" },
    "S": { kind: "ground", walk: true, label: "마당" },
    "B": { kind: "boss", walk: true, label: "북쪽 끝" },
  };

  const NPCS = [
    { id: "seoha", name: "서하", x: 7, y: 29, dir: "down", look: "lab",
      lines: ["네이몬은 자연에서 온 생물이야.", "북쪽 들길 풀숲에서 야생을 만나. 체력이 낮을 때 볼을 던져."] },
    { id: "minjae", name: "민재", x: 12, y: 24, dir: "down", look: "rival",
      lines: ["나보다 먼저 세 마리 채우기만 해 봐.", "개울 건너 돌밭엔 더 센 녀석이 나와."] },
    { id: "kid", name: "꼬마", x: 6, y: 32, dir: "right", look: "kid",
      lines: ["광장 돌바닥에 서면 네이몬이 기운을 차린대!"] },
    { id: "granny", name: "할머니", x: 16, y: 35, dir: "left", look: "granny",
      lines: ["밤 아홉 시엔 북쪽 끝에 가지 마라. 큰 놈이 내려온단다."] },
    { id: "haru", name: "하루", x: 10, y: 4, dir: "down", look: "keeper",
      lines: ["나는 광장지기 하루. 보스가 오면 빈자리를 내가 채울게."] },
  ];

  const SIGNS = {
    "13,25": "↑ 북쪽 들길 · 개울 너머 돌밭",
    "17,33": "하림마을 · 광장에 서면 파티가 회복된다",
  };

  const H = ROWS.length;
  const W = ROWS[0].length;
  const npcAt = {};
  for (const npc of NPCS) npcAt[npc.x + "," + npc.y] = npc;

  function find(ch) {
    for (let y = 0; y < H; y++) {
      const x = ROWS[y].indexOf(ch);
      if (x >= 0) return { x, y };
    }
    return null;
  }

  function cell(x, y) {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    return LEGEND[ROWS[y][x]] || null;
  }

  function walkable(x, y) {
    const c = cell(x, y);
    if (!c || !c.walk) return false;
    return !npcAt[x + "," + y];
  }

  // 판정용 타일 이름. 걸을 수 없으면 null.
  function tile(x, y) {
    if (!walkable(x, y)) return null;
    return cell(x, y).kind;
  }

  function habitat(x, y) {
    const c = cell(x, y);
    return c && c.habitat ? c.habitat : null;
  }

  function label(x, y) {
    const c = cell(x, y);
    return c ? c.label : "";
  }

  const HEAL_ALL = [];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (ROWS[y][x] === "P") HEAL_ALL.push({ x, y });

  return {
    W,
    H,
    ROWS,
    LEGEND,
    NPCS,
    SIGNS,
    START: find("S"),
    HEAL: HEAL_ALL[Math.floor(HEAL_ALL.length / 2)],
    BOSS: find("B"),
    cell,
    walkable,
    tile,
    habitat,
    label,
    npcAt: (x, y) => npcAt[x + "," + y] || null,
  };
});
