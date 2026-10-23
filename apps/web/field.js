// 필드 렌더러. Canvas 2D 위에 하림 월드를 16px 타일로 그리고, 걷기·카메라·D패드를 처리한다.
// 서버는 칸 단위 판정만 한다. 여기서는 칸 사이를 보간해 걷는 것처럼 보이게 한다.
(function () {
  const T = 16;
  const VIEW_W = 10; // 가로 10칸
  const STEP_MS = 230;
  const MAX_TAGS = 6;
  const DIRS = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };

  // ---- 난수와 팔레트 -------------------------------------------------------
  let seed = 1;
  function srand(s) { seed = (s >>> 0) || 1; }
  function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  function ri(n) { return Math.floor(rnd() * n); }

  const P = {
    g0: "#6aa65a", g1: "#5a9450", g2: "#7cb468", g3: "#3f7a3b", g4: "#2f5f2e",
    p0: "#dcc89e", p1: "#cbb48a", p2: "#eadcb6", p3: "#b59c73",
    w0: "#4a90aa", w1: "#5ea6be", w2: "#9fd3e2", w3: "#36718a",
    r0: "#a3aaae", r1: "#848d93", r2: "#c3c9cc", r3: "#5f686e",
    t0: "#2c5a33", t1: "#3c7a42", t2: "#58984f", t3: "#1f3f24", t4: "#7ab565", trunk: "#5c3f27",
    roof0: "#c0583f", roof1: "#8f3a2b", roof2: "#dc7c62", roof3: "#5e2418",
    wall0: "#f1e6cc", wall1: "#d8c9a6", wall2: "#a8956f", line: "#3a2f26",
    door: "#7a5433", door2: "#46301c", win: "#9fd3e2", win2: "#4a90aa",
    fence: "#d1a86f", fence2: "#8a683f",
    flower: ["#f5d76e", "#ee6f8e", "#f7f3ea", "#8fb8f2"],
    sign: "#b98a56", sign2: "#5c3f27",
    st0: "#b3bcc1", st1: "#7f8a90", st2: "#dde3e6",
    h0: "#d2d9db", h1: "#aeb9bd", h2: "#eef2f3",
    b0: "#2b2d38", b1: "#7a58b3", b2: "#b79af0",
    shadow: "rgba(20,30,20,0.28)",
  };

  // ---- 타일 아틀라스 -------------------------------------------------------
  const atlas = {}; // kind -> [variant][frame] canvas

  function tileCanvas() {
    const c = document.createElement("canvas");
    c.width = T;
    c.height = T;
    return c;
  }

  function px(ctx, x, y, color, w = 1, h = 1) {
    ctx.fillStyle = color;
    ctx.fillRect(x, y, w, h);
  }

  function baseGround(ctx, v) {
    px(ctx, 0, 0, P.g0, T, T);
    srand(101 + v * 17);
    for (let i = 0; i < 9; i++) px(ctx, ri(T), ri(T), rnd() < 0.5 ? P.g1 : P.g2);
    for (let i = 0; i < 3; i++) { const x = ri(T - 2), y = ri(T - 1); px(ctx, x, y, P.g1, 2, 1); }
  }

  const DRAW = {
    ground(ctx, v) { baseGround(ctx, v); },
    grass(ctx, v) {
      baseGround(ctx, v + 3);
      srand(300 + v * 31);
      for (let i = 0; i < 5; i++) {
        const x = 1 + ri(T - 4), y = 2 + ri(T - 4);
        px(ctx, x, y + 2, P.g3); px(ctx, x + 1, y + 1, P.g3); px(ctx, x + 2, y, P.g4); px(ctx, x + 3, y + 1, P.g3); px(ctx, x + 1, y + 3, P.g4);
        px(ctx, x + 2, y + 1, P.g2);
      }
    },
    path(ctx, v) {
      px(ctx, 0, 0, P.p0, T, T);
      srand(500 + v * 13);
      for (let i = 0; i < 10; i++) px(ctx, ri(T), ri(T), rnd() < 0.5 ? P.p1 : P.p2);
      for (let i = 0; i < 2; i++) px(ctx, ri(T - 1), ri(T), P.p3, 2, 1);
    },
    rock(ctx, v) {
      px(ctx, 0, 0, P.r0, T, T);
      srand(700 + v * 7);
      for (let i = 0; i < 6; i++) { const x = ri(T - 3), y = ri(T - 2); px(ctx, x, y, P.r1, 3, 2); px(ctx, x, y, P.r2, 2, 1); }
      for (let i = 0; i < 5; i++) px(ctx, ri(T), ri(T), P.r3);
    },
    stream(ctx, v, f) {
      px(ctx, 0, 0, P.w1, T, T);
      srand(900 + v);
      for (let i = 0; i < 4; i++) { const x = ri(T - 4), y = (ri(T) + f * 3) % T; px(ctx, x, y, P.w2, 4, 1); px(ctx, (x + 7) % T, (y + 5) % T, P.w0, 3, 1); }
      for (let i = 0; i < 3; i++) px(ctx, ri(T), ri(T), P.r2);
    },
    water(ctx, v, f) {
      px(ctx, 0, 0, P.w0, T, T);
      srand(1100 + v);
      for (let i = 0; i < 5; i++) { const x = ri(T - 5), y = (ri(T) + f * 4) % T; px(ctx, x, y, P.w3, 5, 1); }
      for (let i = 0; i < 3; i++) { const x = ri(T - 3), y = (ri(T) + f * 7) % T; px(ctx, x, y, P.w2, 3, 1); }
    },
    bridge(ctx) {
      px(ctx, 0, 0, P.fence, T, T);
      for (let y = 3; y < T; y += 4) px(ctx, 0, y, P.fence2, T, 1);
      px(ctx, 0, 0, P.fence2, T, 2); px(ctx, 0, T - 2, P.fence2, T, 2);
      px(ctx, 0, 0, P.line, T, 1); px(ctx, 0, T - 1, P.line, T, 1);
    },
    tree(ctx, v) {
      baseGround(ctx, v + 9);
      px(ctx, 3, 14, P.t3, 10, 2);
      px(ctx, 6, 12, P.trunk, 4, 3);
      const blob = (x, y, w, h, c) => px(ctx, x, y, c, w, h);
      blob(2, 3, 12, 10, P.t3);
      blob(3, 2, 10, 11, P.t0);
      blob(4, 1, 8, 2, P.t1); blob(3, 3, 10, 7, P.t1);
      blob(4, 2, 6, 2, P.t2); blob(4, 4, 4, 3, P.t2); blob(9, 5, 3, 2, P.t2);
      blob(5, 2, 2, 1, P.t4); blob(5, 4, 1, 2, P.t4);
      if (v === 1) { blob(10, 3, 2, 1, P.t4); blob(8, 8, 3, 2, P.t0); }
      if (v === 2) { blob(4, 8, 3, 2, P.t0); blob(10, 2, 1, 1, P.t4); }
    },
    stone(ctx, v) {
      baseGround(ctx, v + 20);
      px(ctx, 2, 12, P.shadow, 12, 3);
      px(ctx, 3, 4, P.st1, 10, 9); px(ctx, 2, 6, P.st1, 12, 6);
      px(ctx, 4, 3, P.st0, 8, 8); px(ctx, 3, 6, P.st0, 10, 4);
      px(ctx, 5, 4, P.st2, 4, 2); px(ctx, 4, 6, P.st2, 2, 2);
      px(ctx, 3, 11, P.r3, 10, 1);
    },
    flower(ctx, v) {
      baseGround(ctx, v + 30);
      srand(1500 + v * 3);
      for (let i = 0; i < 4; i++) {
        const x = 1 + ri(T - 4), y = 1 + ri(T - 4), c = P.flower[ri(P.flower.length)];
        px(ctx, x + 1, y + 2, P.g3); px(ctx, x, y, c, 3, 1); px(ctx, x + 1, y - 1 < 0 ? 0 : y - 1, c); px(ctx, x + 1, y + 1, c); px(ctx, x + 1, y, "#fff3b0");
      }
    },
    fence(ctx, v) {
      baseGround(ctx, v + 40);
      px(ctx, 0, 6, P.fence, T, 2); px(ctx, 0, 11, P.fence, T, 2);
      px(ctx, 0, 8, P.fence2, T, 1); px(ctx, 0, 13, P.fence2, T, 1);
      px(ctx, 2, 3, P.fence, 3, 12); px(ctx, 11, 3, P.fence, 3, 12);
      px(ctx, 2, 3, P.line, 3, 1); px(ctx, 11, 3, P.line, 3, 1);
      px(ctx, 4, 4, P.fence2, 1, 11); px(ctx, 13, 4, P.fence2, 1, 11);
    },
    roof(ctx, v) {
      px(ctx, 0, 0, P.roof0, T, T);
      for (let y = 3; y < T; y += 4) { px(ctx, 0, y, P.roof1, T, 1); }
      for (let y = 0; y < T; y += 4) for (let x = (y / 4) % 2 ? 4 : 0; x < T; x += 8) px(ctx, x, y + 1, P.roof2, 3, 1);
      if (v === 1) { px(ctx, 0, 0, P.roof3, T, 1); px(ctx, 0, 1, P.roof2, T, 1); }
      if (v === 2) { px(ctx, 0, T - 2, P.roof3, T, 2); }
    },
    wall(ctx) {
      px(ctx, 0, 0, P.wall0, T, T);
      for (let y = 3; y < T; y += 4) px(ctx, 0, y, P.wall1, T, 1);
      for (let y = 0; y < T; y += 4) px(ctx, ((y / 4) % 2) * 4 + 2, y, P.wall1, 1, 3);
      px(ctx, 0, T - 2, P.wall2, T, 2);
    },
    window(ctx) {
      DRAW.wall(ctx);
      px(ctx, 3, 3, P.line, 10, 9);
      px(ctx, 4, 4, P.win, 8, 7); px(ctx, 4, 4, "#ffffff", 3, 2);
      px(ctx, 7, 4, P.win2, 1, 7); px(ctx, 4, 7, P.win2, 8, 1);
    },
    door(ctx) {
      DRAW.wall(ctx);
      px(ctx, 3, 2, P.line, 10, 14);
      px(ctx, 4, 3, P.door, 8, 13);
      px(ctx, 5, 4, P.door2, 6, 1); px(ctx, 5, 4, P.door2, 1, 11);
      px(ctx, 9, 9, "#f5d76e", 1, 1);
    },
    sign(ctx, v) {
      baseGround(ctx, v + 50);
      px(ctx, 7, 9, P.sign2, 2, 6);
      px(ctx, 2, 2, P.line, 12, 8);
      px(ctx, 3, 3, P.sign, 10, 6);
      px(ctx, 4, 4, P.sign2, 8, 1); px(ctx, 4, 6, P.sign2, 6, 1);
    },
    heal(ctx, v) {
      px(ctx, 0, 0, P.h0, T, T);
      px(ctx, 0, 7, P.h1, T, 1); px(ctx, 0, 15, P.h1, T, 1);
      px(ctx, 7, 0, P.h1, 1, 8); px(ctx, 15, 0, P.h1, 1, 8);
      px(ctx, 3, 8, P.h1, 1, 8); px(ctx, 11, 8, P.h1, 1, 8);
      px(ctx, 1, 1, P.h2, 3, 1); px(ctx, 9, 9, P.h2, 3, 1); px(ctx, 12, 2, P.h2, 2, 1);
      if (v === 1) px(ctx, 5, 11, P.h2, 2, 1);
    },
    boss(ctx, v, f) {
      px(ctx, 0, 0, P.b0, T, T);
      px(ctx, 2, 2, P.r3, 12, 12);
      px(ctx, 3, 3, P.b0, 10, 10);
      const g = f ? P.b2 : P.b1;
      px(ctx, 7, 4, g, 2, 8); px(ctx, 4, 7, g, 8, 2);
      px(ctx, 5, 5, g); px(ctx, 10, 5, g); px(ctx, 5, 10, g); px(ctx, 10, 10, g);
    },
  };

  const VARIANTS = { ground: 3, grass: 3, path: 3, rock: 3, tree: 3, flower: 3, fence: 2, roof: 3, heal: 2, stone: 2, sign: 1 };
  const FRAMES = { stream: 2, water: 2, boss: 2 };

  function buildAtlas() {
    for (const kind of Object.keys(DRAW)) {
      const vs = VARIANTS[kind] || 1;
      const fs = FRAMES[kind] || 1;
      atlas[kind] = [];
      for (let v = 0; v < vs; v++) {
        atlas[kind][v] = [];
        for (let f = 0; f < fs; f++) {
          const c = tileCanvas();
          const ctx = c.getContext("2d");
          DRAW[kind](ctx, v, f);
          atlas[kind][v][f] = c;
        }
      }
    }
  }

  // ---- 스프라이트 ----------------------------------------------------------
  const spriteCache = new Map();

  function drawRows(rows, pal, flip, keys) {
    const h = rows.length;
    const w = rows[0].length;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x];
        if (ch === "." || ch === " ") continue;
        const color = keys ? pal[keys[ch]] : pal[ch];
        if (!color) continue;
        ctx.fillStyle = color;
        ctx.fillRect(flip ? w - 1 - x : x, y, 1, 1);
      }
    }
    return c;
  }

  // 아트가 아직 없을 때 쓰는 기본 사람 (16x20).
  const FALLBACK = {
    pal: { k: "#2b2420", s: "#f2cfa8", h: "#4a3225", t: "#3e7fc1", p: "#2d3a59", e: "#2b2420", w: "#f4f0e6" },
    frames: (() => {
      const head = [
        "......kkkk......",
        ".....khhhhk.....",
        "....khhhhhhk....",
        "....khhhhhhk....",
        "....kssssssk....",
        "....ksessesk....",
        "....kssssssk....",
        ".....kssssk.....",
      ];
      const body = (l, r) => [
        "......kkkk......",
        ".....kttttk.....",
        "....ksttttsk....",
        "....ksttttsk....",
        ".....kttttk.....",
        ".....kppppk.....",
        ".....kppppk.....",
        l, r,
        "................",
        "................",
        "................",
      ];
      const stand = head.concat(body(".....kp..pk.....", ".....kk..kk....."));
      const a = head.concat(body("....kp....pk....", "....kk....kk...."));
      const b = head.concat(body("......kppk......", "......kkkk......"));
      return { down: [stand, a, b], up: [stand, a, b], left: [stand, a, b] };
    })(),
  };

  function personSprite(look, dir, frame, tint) {
    const key = look + "|" + dir + "|" + frame + "|" + (tint || "");
    if (spriteCache.has(key)) return spriteCache.get(key);
    const pix = window.PIX && window.PIX.people && window.PIX.people[look] ? window.PIX.people[look] : FALLBACK;
    const flip = dir === "right" && !pix.frames.right;
    const src = pix.frames[flip ? "left" : dir] || pix.frames.down;
    const rows = src[frame] || src[0];
    let pal = pix.pal;
    if (tint) pal = Object.assign({}, pal, { shirt: tint, t: tint, cap: tint });
    const c = drawRows(rows, pal, flip, pix.keys || null);
    spriteCache.set(key, c);
    return c;
  }

  function tintFor(name) {
    let h = 0;
    for (const ch of String(name || "")) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const hues = ["#d9534f", "#e0a52d", "#8e5fd1", "#2fa08a", "#d16fb5", "#5a8ad6", "#7aa83a", "#e07a2f"];
    return hues[h % hues.length];
  }

  // ---- 상태 ----------------------------------------------------------------
  let canvas = null;
  let ctx = null;
  let wrap = null;
  let tagLayer = null;
  let scale = 1;
  let viewW = VIEW_W * T;
  let viewH = 12 * T;
  let raf = 0;
  let hooks = {};
  let heldDir = null;
  let lastTime = 0;
  let animT = 0;

  const me = { x: 0, y: 0, px: 0, py: 0, dir: "down", moving: false, from: null, to: null, t0: 0, name: "", tint: "" };
  const others = new Map(); // nickname -> entity
  let npcs = [];
  let cam = { x: 0, y: 0 };
  let facingCache = "";
  let signPopup = null;

  const DIR_NAME = { n: "up", s: "down", w: "left", e: "right" };

  function world() { return window.WORLD; }

  function resize() {
    if (!wrap || !canvas) return;
    const rect = wrap.getBoundingClientRect();
    const cssW = Math.max(1, rect.width);
    const cssH = Math.max(1, rect.height);
    const dpr = window.devicePixelRatio || 1;
    scale = Math.max(1, Math.floor((cssW * dpr) / (VIEW_W * T)));
    viewW = VIEW_W * T;
    viewH = Math.max(6 * T, Math.round((cssH / cssW) * viewW));
    canvas.width = viewW * scale;
    canvas.height = viewH * scale;
    canvas.style.width = cssW + "px";
    canvas.style.height = cssH + "px";
    ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
  }

  function mount(container, opts) {
    hooks = opts || {};
    wrap = container;
    wrap.innerHTML = "";
    canvas = document.createElement("canvas");
    canvas.className = "fieldcanvas";
    tagLayer = document.createElement("div");
    tagLayer.className = "tags";
    wrap.appendChild(canvas);
    wrap.appendChild(tagLayer);
    if (!atlas.ground) buildAtlas();
    me.moving = false;
    me.to = null;
    me.bubble = "";
    heldDir = null;
    others.clear();
    npcs = (world().NPCS || []).map((n) => ({ ...n, px: n.x * T, py: n.y * T, face: n.dir || "down" }));
    resize();
    window.addEventListener("resize", resize);
    if (window.ResizeObserver) {
      ro = new ResizeObserver(resize);
      ro.observe(wrap);
    }
    lastTime = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
    canvas.addEventListener("click", onCanvasTap);
  }

  let ro = null;

  function destroy() {
    cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener("resize", resize);
    if (ro) { ro.disconnect(); ro = null; }
    heldDir = null;
    others.clear();
    wrap = null;
    canvas = null;
    tagLayer = null;
  }

  function setMe(state, snap) {
    me.name = state.nickname || "";
    if (me.moving && performance.now() - me.t0 > STEP_MS * 3) finishStep();
    if (snap || (!me.moving && (me.x !== state.x || me.y !== state.y))) {
      me.x = state.x;
      me.y = state.y;
      me.px = state.x * T;
      me.py = state.y * T;
      me.moving = false;
      me.to = null;
    }
    if (!me.moving && state.dir && DIR_NAME[state.dir]) me.dir = DIR_NAME[state.dir];
  }

  // 서버 상태 반영. pending 은 아직 응답을 못 받은 내 이동 수.
  function update(state, pending) {
    if (!state) return;
    if (!canvas) return;
    if (pending > 0) {
      me.name = state.nickname || "";
    } else {
      setMe(state, false);
      if (!me.moving && (me.x !== state.x || me.y !== state.y)) setMe(state, true);
    }
    const seen = new Set();
    for (const mate of state.others || []) {
      seen.add(mate.nickname);
      let ent = others.get(mate.nickname);
      if (!ent) {
        ent = { name: mate.nickname, x: mate.x, y: mate.y, px: mate.x * T, py: mate.y * T, dir: DIR_NAME[mate.dir] || "down", tint: tintFor(mate.nickname) };
        others.set(mate.nickname, ent);
      }
      ent.x = mate.x;
      ent.y = mate.y;
      ent.dir = DIR_NAME[mate.dir] || ent.dir;
      ent.bubble = mate.bubble || "";
      ent.busy = mate.wild ? "wild" : mate.pvp ? "pvp" : mate.boss ? "boss" : "";
    }
    for (const key of [...others.keys()]) if (!seen.has(key)) others.delete(key);
  }

  function snapTo(x, y) {
    me.x = x; me.y = y; me.px = x * T; me.py = y * T; me.moving = false; me.to = null;
  }

  function hold(dir) { heldDir = dir; }
  function release(dir) { if (!dir || heldDir === dir) heldDir = null; }

  function facingTile() {
    const d = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[me.dir];
    return { x: me.x + d[0], y: me.y + d[1] };
  }

  function interact() {
    const w = world();
    const f = facingTile();
    const npc = w.npcAt(f.x, f.y);
    if (npc) {
      const ent = npcs.find((n) => n.id === npc.id);
      if (ent) ent.face = { up: "down", down: "up", left: "right", right: "left" }[me.dir];
      if (hooks.onTalk) hooks.onTalk(npc);
      return true;
    }
    const sign = w.SIGNS[f.x + "," + f.y];
    if (sign) {
      if (hooks.onSign) hooks.onSign(sign);
      return true;
    }
    const c = w.cell(f.x, f.y);
    if (c && c.kind === "door") {
      if (hooks.onSign) hooks.onSign("문이 잠겨 있다.");
      return true;
    }
    for (const ent of others.values()) {
      if (ent.x === f.x && ent.y === f.y) {
        if (hooks.onMate) hooks.onMate(ent.name);
        return true;
      }
    }
    return false;
  }

  function tryStep(dir) {
    if (me.moving || !hooks.canMove || !hooks.canMove()) return;
    const [dx, dy] = DIRS[dir];
    me.dir = DIR_NAME[dir];
    const nx = me.x + dx;
    const ny = me.y + dy;
    const w = world();
    const blockedByMate = [...others.values()].some((o) => o.x === nx && o.y === ny);
    if (!w.walkable(nx, ny) || blockedByMate) {
      if (hooks.onBump) hooks.onBump();
      return;
    }
    me.moving = true;
    me.from = { x: me.x, y: me.y };
    me.to = { x: nx, y: ny };
    me.t0 = performance.now();
    if (hooks.onStep) hooks.onStep(dir);
  }

  function finishStep() {
    me.x = me.to.x;
    me.y = me.to.y;
    me.px = me.x * T;
    me.py = me.y * T;
    me.moving = false;
    me.to = null;
    if (hooks.onArrive) hooks.onArrive(me.x, me.y);
  }

  function onCanvasTap(e) {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const lx = ((e.clientX - rect.left) / rect.width) * viewW + cam.x;
    const ly = ((e.clientY - rect.top) / rect.height) * viewH + cam.y;
    const tx = Math.floor(lx / T);
    const ty = Math.floor(ly / T);
    for (const ent of others.values()) {
      if (ent.x === tx && (ent.y === ty || ent.y === ty + 1)) {
        if (hooks.onMate) hooks.onMate(ent.name);
        return;
      }
    }
    const npc = world().npcAt(tx, ty);
    if (npc && Math.abs(npc.x - me.x) + Math.abs(npc.y - me.y) <= 2) {
      if (hooks.onTalk) hooks.onTalk(npc);
    }
  }

  // ---- 프레임 --------------------------------------------------------------
  function frame(now) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(100, now - lastTime);
    lastTime = now;
    animT += dt;

    if (me.moving) {
      const k = Math.min(1, (now - me.t0) / STEP_MS);
      me.px = (me.from.x + (me.to.x - me.from.x) * k) * T;
      me.py = (me.from.y + (me.to.y - me.from.y) * k) * T;
      if (k >= 1) finishStep();
    }
    if (!me.moving && heldDir) tryStep(heldDir);

    for (const ent of others.values()) {
      const tx = ent.x * T, ty = ent.y * T;
      const sp = (T / STEP_MS) * dt * 1.1;
      if (Math.abs(tx - ent.px) > 2 * T || Math.abs(ty - ent.py) > 2 * T) { ent.px = tx; ent.py = ty; }
      ent.walking = tx !== ent.px || ty !== ent.py;
      if (ent.walking) {
        if (Math.abs(tx - ent.px) >= Math.abs(ty - ent.py)) ent.dir = tx > ent.px ? "right" : "left";
        else ent.dir = ty > ent.py ? "down" : "up";
      }
      ent.px += Math.max(-sp, Math.min(sp, tx - ent.px));
      ent.py += Math.max(-sp, Math.min(sp, ty - ent.py));
    }

    const w = world();
    const mapW = w.W * T, mapH = w.H * T;
    cam.x = Math.round(Math.max(0, Math.min(mapW - viewW, me.px + T / 2 - viewW / 2)));
    cam.y = Math.round(Math.max(0, Math.min(mapH - viewH, me.py + T / 2 - viewH / 2)));
    draw(w);
    placeTags();
  }

  function tileImage(kind, x, y) {
    const set = atlas[kind] || atlas.ground;
    const v = set.length > 1 ? (x * 7 + y * 13 + ((x ^ y) & 3)) % set.length : 0;
    const frames = set[v];
    const f = frames.length > 1 ? Math.floor(animT / 520) % frames.length : 0;
    return frames[f];
  }

  function draw(w) {
    if (!ctx) return;
    ctx.save();
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = P.t3;
    ctx.fillRect(0, 0, viewW, viewH);
    const x0 = Math.floor(cam.x / T), y0 = Math.floor(cam.y / T);
    const x1 = Math.min(w.W - 1, Math.ceil((cam.x + viewW) / T));
    const y1 = Math.min(w.H - 1, Math.ceil((cam.y + viewH) / T));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const c = w.cell(x, y);
        if (!c) continue;
        ctx.drawImage(tileImage(c.kind, x, y), x * T - cam.x, y * T - cam.y);
      }
    }

    // 그릴 대상 모으기: y 순 정렬
    const list = [];
    for (const n of npcs) list.push({ kind: "npc", px: n.px, py: n.py, look: n.look, dir: n.face, frame: 0, ent: n });
    for (const o of others.values()) list.push({ kind: "mate", px: o.px, py: o.py, look: "trainer", dir: o.dir, frame: o.walking ? walkFrame(animT) : 0, tint: o.tint, ent: o });
    list.push({ kind: "me", px: me.px, py: me.py, look: "trainer", dir: me.dir, frame: me.moving ? walkFrame(performance.now() - me.t0 + 60) : 0, ent: me });
    list.sort((a, b) => a.py - b.py);

    for (const it of list) {
      const sx = Math.round(it.px - cam.x);
      const sy = Math.round(it.py - cam.y);
      if (sx < -T || sy < -2 * T || sx > viewW || sy > viewH + T) continue;
      // 그림자
      ctx.fillStyle = P.shadow;
      ctx.fillRect(sx + 3, sy + T - 3, 10, 2);
      const img = personSprite(it.look, it.dir, it.frame, it.tint);
      ctx.drawImage(img, sx, sy - (img.height - T));
      // 풀숲에 서면 아래쪽을 풀로 덮는다
      const under = w.cell(Math.round(it.px / T), Math.round(it.py / T));
      if (under && under.kind === "grass") {
        const g = tileImage("grass", Math.round(it.px / T), Math.round(it.py / T));
        ctx.drawImage(g, 0, 8, T, 8, Math.round(it.px / T) * T - cam.x, Math.round(it.py / T) * T - cam.y + 8, T, 8);
      }
      if (it.kind === "mate" && it.ent.busy) {
        ctx.fillStyle = it.ent.busy === "wild" ? "#f5d76e" : it.ent.busy === "pvp" ? "#ee6f8e" : "#b79af0";
        ctx.fillRect(sx + 6, sy - img.height + T - 5, 4, 3);
      }
    }
    ctx.restore();
  }

  function walkFrame(ms) {
    const q = Math.floor((ms % STEP_MS) / (STEP_MS / 4));
    return [1, 0, 2, 0][q];
  }

  // 이름표와 말풍선은 DOM 으로 올려 글자가 선명하게 보이도록 한다.
  function placeTags() {
    if (!tagLayer || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const kx = rect.width / viewW, ky = rect.height / viewH;
    const list = [...others.values()]
      .map((o) => ({ o, d: Math.abs(o.x - me.x) + Math.abs(o.y - me.y) }))
      .sort((a, b) => (Boolean(b.o.bubble) - Boolean(a.o.bubble)) || a.d - b.d)
      .slice(0, MAX_TAGS);
    let bubbles = 0;
    const html = [];
    for (const { o } of list) {
      const x = (o.px - cam.x + T / 2) * kx;
      const y = (o.py - cam.y - 6) * ky;
      if (x < -40 || y < -40 || x > rect.width + 40 || y > rect.height + 40) continue;
      const said = o.bubble && bubbles < 2 ? o.bubble : "";
      if (said) bubbles++;
      html.push(`<div class="tag${said ? " talk" : ""}" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px" data-name="${esc(o.name)}">${said ? `<i>${esc(said)}</i>` : ""}<b>${esc(o.name)}</b></div>`);
    }
    if (me.bubble) {
      const x = (me.px - cam.x + T / 2) * kx;
      const y = (me.py - cam.y - 6) * ky;
      html.push(`<div class="tag talk mine" style="left:${x.toFixed(1)}px;top:${y.toFixed(1)}px"><i>${esc(me.bubble)}</i></div>`);
    }
    const next = html.join("");
    if (next !== tagLayer.dataset.last) {
      tagLayer.innerHTML = next;
      tagLayer.dataset.last = next;
    }
  }

  function esc(v) {
    return String(v == null ? "" : v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function setBubble(text) { me.bubble = text || ""; }

  function tileAtMe() {
    const c = world().cell(me.x, me.y);
    return c ? c.label : "";
  }

  window.Field = { mount, destroy, update, snapTo, hold, release, interact, setBubble, tileAtMe, get pos() { return { x: me.x, y: me.y, moving: me.moving }; }, personSprite, tintFor, T };
})();
