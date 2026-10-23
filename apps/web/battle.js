// 전투 연출. Canvas 2D 위에 상대와 내 네이몬, 체력판, 공격·피격·포획·기절·레벨업을 그린다.
// 판정은 서버가 한다. 여기서는 서버 응답의 변화를 순서대로 보여줄 뿐이다.
(function () {
  const FOE_SCALE = 2.5;
  const ME_SCALE = 3;
  const EASE = (t) => 1 - Math.pow(1 - t, 3);
  const EASE_IN = (t) => t * t;

  const C = {
    paper: "#fbf7ee", ink: "#1b2a22", muted: "#5c6b62", line: "#c9d2cc",
    hpHi: "#4fb55a", hpMid: "#e3b23c", hpLo: "#d9534f", exp: "#5a8ad6",
    ball0: "#e24b3f", ball1: "#f4f0e6", ballLine: "#2b2420",
  };

  const BG = {
    grass: { sky0: "#bfe3f5", sky1: "#dff2f8", ground: "#79b56a", ground2: "#5f9a4f", plat: "#a8d28d", plat2: "#7fb46a", far: "#4f8a43" },
    rock: { sky0: "#c9d6e2", sky1: "#eef2f5", ground: "#aeb5ba", ground2: "#8d969c", plat: "#c7cdd1", plat2: "#9aa3a8", far: "#6f7b83" },
    stream: { sky0: "#b8dcef", sky1: "#e4f3fa", ground: "#6fb2c9", ground2: "#4f93ad", plat: "#bfe3ee", plat2: "#86c1d4", far: "#3e7d93" },
    duel: { sky0: "#d9c8f2", sky1: "#f3edfb", ground: "#b39adb", ground2: "#8f74bd", plat: "#d9c8f2", plat2: "#b39adb", far: "#6c4fa1" },
    boss: { sky0: "#1d2033", sky1: "#3b3f63", ground: "#3a3550", ground2: "#2a263b", plat: "#5a4f7a", plat2: "#3f3659", far: "#161425" },
    town: { sky0: "#cfe6f3", sky1: "#eef6fa", ground: "#8fc47d", ground2: "#6ea35e", plat: "#b7dba3", plat2: "#8fc47d", far: "#4f8a43" },
  };

  let wrap = null, canvas = null, ctx = null, raf = 0;
  let W = 320, H = 230, dpr = 1;
  let hooks = {};
  let theme = BG.grass;
  let kind = "wild";

  // 배우
  function actor() {
    return { species: "", name: "", level: 0, hp: 0, maxHp: 0, hpShown: 0, exp: 0, toNext: 0, expShown: 0, type: "", x: 0, y: 0, alpha: 1, flash: 0, scale: 1, visible: true, drop: 0, shown: false };
  }
  const foe = actor();
  const me = actor();
  let shake = { amp: 0, until: 0 };
  let ball = null; // { x, y, rot, visible, burst }
  let stars = [];
  let fx = null; // { kind, t, who }
  let text = "";

  const queue = [];
  let cur = null;
  let onIdle = null;

  const spriteCache = new Map();

  function monSprite(species, side) {
    const key = species + "|" + side;
    if (spriteCache.has(key)) return spriteCache.get(key);
    const pix = window.PIX && window.PIX.mons && window.PIX.mons[species];
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 32;
    const g = c.getContext("2d");
    if (pix && pix[side]) {
      const rows = pix[side];
      for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < rows[y].length; x++) {
          const ch = rows[y][x];
          if (ch === "." || ch === " ") continue;
          const color = pix.pal[ch];
          if (!color) continue;
          g.fillStyle = color;
          g.fillRect(x, y, 1, 1);
        }
      }
    } else {
      g.fillStyle = "#8a9a90";
      g.beginPath();
      g.ellipse(16, 18, 11, 10, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "#1b2a22";
      g.fillRect(12, 14, 2, 2);
      g.fillRect(19, 14, 2, 2);
    }
    spriteCache.set(key, c);
    return c;
  }

  function resize() {
    if (!wrap || !canvas) return;
    const r = wrap.getBoundingClientRect();
    W = Math.max(200, Math.round(r.width));
    H = Math.max(160, Math.round(r.height));
    dpr = Math.min(3, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
  }

  function mount(container, opts) {
    hooks = opts || {};
    wrap = container;
    wrap.innerHTML = "";
    canvas = document.createElement("canvas");
    canvas.className = "arenacanvas";
    wrap.appendChild(canvas);
    ctx = canvas.getContext("2d");
    resize();
    window.addEventListener("resize", resize);
    if (window.ResizeObserver) {
      ro = new ResizeObserver(resize);
      ro.observe(wrap);
    }
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  let ro = null;

  function destroy() {
    cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener("resize", resize);
    if (ro) { ro.disconnect(); ro = null; }
    queue.length = 0;
    cur = null;
    onIdle = null;
    ball = null;
    stars = [];
    fx = null;
    text = "";
    foe.shown = false;
    me.shown = false;
    wrap = null;
    canvas = null;
  }

  function fill(a, src) {
    if (!src) { a.visible = false; return; }
    const fresh = a.species !== src.species;
    a.species = src.species;
    a.name = src.name || src.species;
    a.level = src.level;
    a.maxHp = src.maxHp;
    a.type = src.type || "";
    a.exp = src.exp || 0;
    a.toNext = src.toNext || 0;
    if (fresh || !a.shown) {
      a.hp = src.hp;
      a.hpShown = src.hp;
      a.expShown = a.exp;
      a.alpha = 1;
      a.drop = 0;
      a.scale = 1;
      a.visible = true;
      a.shown = true;
    }
    a.target = src;
  }

  // 장면 교체. 연출 중이 아니면 즉시 값을 맞춘다.
  function setScene(scene) {
    kind = scene.kind || "wild";
    theme = BG[scene.habitat && BG[scene.habitat] ? scene.habitat : kind === "pvp" ? "duel" : kind === "boss" ? "boss" : "grass"];
    fill(foe, scene.foe);
    fill(me, scene.me);
    if (!busy()) {
      syncNow();
    }
  }

  function syncNow() {
    for (const a of [foe, me]) {
      if (!a.target) continue;
      a.hp = a.target.hp;
      a.hpShown = a.target.hp;
      a.level = a.target.level;
      a.maxHp = a.target.maxHp;
      a.exp = a.target.exp || 0;
      a.expShown = a.exp;
      if (a.target.hp > 0 && a.alpha === 0 && a.drop > 0) { a.alpha = 1; a.drop = 0; }
      a.visible = true;
      a.scale = 1;
    }
    ball = null;
  }

  function busy() { return Boolean(cur) || queue.length > 0; }

  // ---- 타임라인 -----------------------------------------------------------
  function step(dur, update, start, end) { queue.push({ dur, update, start, end }); }
  function wait(ms) { step(ms, null); }
  // 이름은 장면이 채워진 뒤에 읽어야 하므로 함수로 받으면 그때 평가한다.
  function say(line) {
    step(0, null, () => {
      text = typeof line === "function" ? line() : line;
      if (hooks.onText) hooks.onText(text);
    });
  }
  function sfx(name) { step(0, null, () => { if (window.Sound) Sound.sfx(name); }); }
  function jingle(name, next) { step(0, null, () => { if (window.Sound) Sound.jingle(name, next); }); }

  function who(side) { return side === "me" ? me : foe; }
  // josa(word, 받침O, 받침X): 받침이 있으면 a(이/은), 없으면 b(가/는)
  function josa(word, a, b) {
    const code = word.charCodeAt(word.length - 1);
    if (code < 0xac00 || code > 0xd7a3) return word + b;
    return word + ((code - 0xac00) % 28 === 0 ? b : a);
  }

  function play(events, done) {
    onIdle = done || null;
    for (const ev of events) {
      if (ev.type === "intro") intro(ev);
      else if (ev.type === "attack") attack(ev);
      else if (ev.type === "faint") faint(ev);
      else if (ev.type === "ball") throwBall(ev);
      else if (ev.type === "switch") switchIn(ev);
      else if (ev.type === "levelup") levelUp(ev);
      else if (ev.type === "exp") gainExp(ev);
      else if (ev.type === "win") { say(ev.text || "이겼다!"); jingle("win", "route"); wait(1400); }
      else if (ev.type === "lose") { say(ev.text || "눈앞이 캄캄해졌다…"); jingle("lose", "town"); wait(1600); }
      else if (ev.type === "flee") { say(ev.text || "무사히 도망쳤다!"); sfx("miss"); step(350, (t) => { me.x = -W * EASE_IN(t); }); wait(300); }
      else if (ev.type === "text") { say(ev.text); wait(ev.ms || 600); }
    }
  }

  function intro(ev) {
    step(0, null, () => { foe.x = W * 0.6; me.x = -W * 0.6; foe.alpha = 1; me.alpha = 1; foe.visible = true; me.visible = Boolean(me.species); });
    step(560, (t) => { foe.x = W * 0.6 * (1 - EASE(t)); me.x = -W * 0.6 * (1 - EASE(t)); });
    say(() => ev.text || (kind === "boss" ? `보스 ${josa(foe.name, "이", "가")} 내려왔다!` : kind === "pvp" ? `${josa(ev.rival || "상대", "이", "가")} 승부를 걸어왔다!` : `야생 ${josa(foe.name, "이", "가")} 나타났다!`));
    wait(900);
  }

  function attack(ev) {
    const a = who(ev.who);
    const d = who(ev.who === "me" ? "foe" : "me");
    const dir = ev.who === "me" ? 1 : -1;
    say(() => `${a.name}의 ${ev.move}!`);
    step(130, (t) => { a.x = dir * 18 * EASE(t); a.y = -dir * 8 * EASE(t); });
    if (!ev.hit) {
      step(220, (t) => { a.x = dir * 18 * (1 - t); a.y = -dir * 8 * (1 - t); });
      say("빗나갔다…");
      sfx("miss");
      wait(500);
      return;
    }
    step(0, null, () => {
      if (window.Sound) Sound.sfx(ev.eff > 1 ? "super" : ev.eff < 1 ? "weak" : "hit");
      shake = { amp: ev.eff > 1 ? 7 : ev.eff < 1 ? 2 : 4, until: performance.now() + 320 };
      fx = { kind: ev.eff > 1 ? "burst" : "hit", who: ev.who === "me" ? "foe" : "me", t0: performance.now(), type: a.type };
    });
    step(360, (t) => { d.flash = Math.floor(t * 6) % 2 ? 0.85 : 0; d.x = (dir * -1) * (t < 0.5 ? 4 : 0); a.x = dir * 18 * (1 - t); a.y = -dir * 8 * (1 - t); }, null, () => { d.flash = 0; d.x = 0; a.x = 0; a.y = 0; });
    const from = ev.hpFrom, to = ev.hpTo;
    step(520, (t) => { d.hpShown = from + (to - from) * EASE(t); }, () => { d.hp = to; }, () => { d.hpShown = to; });
    if (ev.eff > 1) { say("효과가 굉장했다!"); wait(550); }
    else if (ev.eff < 1) { say("효과가 별로인 듯하다…"); wait(550); }
    else wait(250);
  }

  function faint(ev) {
    const a = who(ev.who);
    say(() => `${josa(a.name, "은", "는")} 쓰러졌다!`);
    sfx("faint");
    step(480, (t) => { a.drop = 46 * EASE_IN(t); a.alpha = 1 - t; }, null, () => { a.alpha = 0; a.visible = false; });
    wait(400);
  }

  function switchIn(ev) {
    say(`${ev.outName ? ev.outName + ", 돌아와! " : ""}가라, ${ev.inName}!`);
    if (ev.outName) step(260, (t) => { me.scale = 1 - 0.9 * EASE_IN(t); me.alpha = 1 - t; });
    step(0, null, () => { me.species = ev.inSpecies; me.name = ev.inName; me.level = ev.inLevel; me.hp = ev.inHp; me.hpShown = ev.inHp; me.maxHp = ev.inMaxHp; me.type = ev.inType || ""; me.exp = ev.inExp || 0; me.expShown = me.exp; me.toNext = ev.inToNext || 0; me.visible = true; me.drop = 0; });
    step(300, (t) => { me.scale = 0.2 + 0.8 * EASE(t); me.alpha = t; }, null, () => { me.scale = 1; me.alpha = 1; });
    wait(300);
  }

  function gainExp(ev) {
    say(() => `${josa(me.name, "은", "는")} 경험치를 ${ev.amount} 얻었다!`);
    const from = me.expShown, to = ev.to, span = ev.toNext || 1;
    step(ev.levelUp ? 500 : 600, (t) => { me.expShown = from + ((ev.levelUp ? span : to) - from) * EASE(t); }, null, () => { me.expShown = ev.levelUp ? 0 : to; if (!ev.levelUp) me.toNext = span; });
    wait(200);
  }

  function levelUp(ev) {
    step(0, null, () => { me.level = ev.level; me.maxHp = ev.maxHp; me.hp = ev.hp; me.hpShown = ev.hp; me.exp = ev.exp || 0; me.expShown = me.exp; me.toNext = ev.toNext || 0; stars = burstStars(me, 10); });
    say(() => `${josa(me.name, "은", "는")} 레벨 ${ev.level}에 도달했다!`);
    jingle("levelup", ev.next || "wild");
    wait(1500);
  }

  function throwBall(ev) {
    say("볼을 던졌다!");
    sfx("throw");
    const sx = W * 0.2, sy = H * 0.8, ex = foeCenter().x, ey = foeCenter().y;
    step(0, null, () => { ball = { x: sx, y: sy, rot: 0, visible: true }; });
    step(520, (t) => { const k = EASE(t); ball.x = sx + (ex - sx) * k; ball.y = sy + (ey - sy) * k - Math.sin(Math.PI * t) * 90; ball.rot = t * 9; });
    step(300, (t) => { foe.scale = 1 - 0.95 * EASE_IN(t); foe.flash = 0.7 * (1 - t); foe.alpha = 1 - t * 0.6; }, null, () => { foe.visible = false; foe.scale = 1; foe.flash = 0; foe.alpha = 1; });
    step(220, (t) => { ball.y = ey + (platFoe().y - ey) * EASE_IN(t); });
    sfx("hit");
    wait(300);
    for (let i = 0; i < ev.shakes; i++) {
      sfx("shake");
      step(440, (t) => { ball.rot = Math.sin(t * Math.PI * 2) * 0.45 * (1 - t * 0.3); }, null, () => { ball.rot = 0; });
      wait(260);
    }
    if (ev.caught) {
      sfx("click");
      step(0, null, () => { ball.dim = true; stars = burstStars({ x: ball.x, y: ball.y }, 8, true); });
      say(`${josa(foe.name, "을", "를")} 잡았다!`);
      jingle("catch", "route");
      wait(1500);
    } else {
      sfx("break");
      step(0, null, () => { ball.burst = performance.now(); foe.visible = true; });
      step(220, (t) => { foe.scale = 0.2 + 0.8 * EASE(t); foe.flash = 0.6 * (1 - t); }, null, () => { foe.scale = 1; foe.flash = 0; ball = null; });
      say(ev.shakes >= 2 ? "아깝다! 조금만 더였는데!" : "아, 나와버렸다!");
      wait(650);
    }
  }

  function burstStars(a, n, atPoint) {
    const cx = atPoint ? a.x : (a === me ? platMe().x : platFoe().x);
    const cy = atPoint ? a.y : (a === me ? platMe().y - 40 : platFoe().y - 30);
    const out = [];
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4;
      out.push({ x: cx, y: cy, vx: Math.cos(ang) * (40 + Math.random() * 40), vy: Math.sin(ang) * (40 + Math.random() * 40) - 30, t0: performance.now(), life: 700 + Math.random() * 300 });
    }
    return out;
  }

  // ---- 좌표 ---------------------------------------------------------------
  function platFoe() { return { x: W * 0.69, y: H * 0.46, rx: 58, ry: 14 }; }
  function platMe() { return { x: W * 0.29, y: H * 0.98, rx: 66, ry: 15 }; }
  function foeCenter() { const p = platFoe(); return { x: p.x, y: p.y - 16 * FOE_SCALE + 4 }; }

  // ---- 프레임 --------------------------------------------------------------
  function frame(now) {
    raf = requestAnimationFrame(frame);
    // 길이 0인 단계는 같은 프레임에서 연달아 처리한다.
    for (let guard = 0; guard < 64; guard++) {
      if (!cur && queue.length) {
        cur = queue.shift();
        cur.t0 = now;
        if (cur.start) cur.start();
      }
      if (!cur) {
        if (onIdle) { const f = onIdle; onIdle = null; f(); }
        break;
      }
      const t = cur.dur > 0 ? Math.min(1, (now - cur.t0) / cur.dur) : 1;
      if (cur.update) cur.update(t);
      if (t < 1) break;
      if (cur.end) cur.end();
      cur = null;
    }
    draw(now);
  }

  function draw(now) {
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let ox = 0, oy = 0;
    if (now < shake.until) { ox = (Math.random() - 0.5) * shake.amp * 2; oy = (Math.random() - 0.5) * shake.amp * 2; }
    ctx.clearRect(0, 0, W, H);
    ctx.save();
    ctx.translate(ox, oy);

    // 배경
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, theme.sky0);
    sky.addColorStop(1, theme.sky1);
    ctx.fillStyle = sky;
    ctx.fillRect(-10, -10, W + 20, H + 20);
    ctx.fillStyle = theme.far;
    for (let i = -1; i < 9; i++) {
      const bx = i * (W / 7) + ((i * 37) % 11);
      ctx.beginPath();
      ctx.ellipse(bx, H * 0.5, W / 9, 22 + ((i * 13) % 9), 0, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = theme.ground;
    ctx.fillRect(-10, H * 0.5, W + 20, H);
    ctx.fillStyle = theme.ground2;
    ctx.fillRect(-10, H * 0.5, W + 20, 3);

    // 발판
    for (const [p, main, edge] of [[platFoe(), theme.plat, theme.plat2], [platMe(), theme.plat, theme.plat2]]) {
      ctx.fillStyle = edge;
      ctx.beginPath(); ctx.ellipse(p.x, p.y + 3, p.rx, p.ry, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = main;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2); ctx.fill();
    }

    // 상대
    if (foe.visible && foe.species) drawActor(foe, "front", platFoe(), FOE_SCALE, now);
    // 나
    if (me.visible && me.species) drawActor(me, "back", platMe(), ME_SCALE, now);

    // 볼
    if (ball && ball.visible) drawBall(ball, now);
    // 이펙트
    if (fx) drawFx(now);
    // 별
    drawStars(now);
    ctx.restore();

    // 체력판 (흔들림 없음)
    if (foe.species) drawPlate(foe, 10, 10, false);
    if (me.species) drawPlate(me, W - 158, H - 78, true);
  }

  function drawActor(a, side, plat, scale, now) {
    const img = monSprite(a.species, side);
    const size = 32 * scale * a.scale;
    const bob = side === "front" && !busy() ? Math.sin(now / 420) * 1.5 : 0;
    const x = plat.x - size / 2 + a.x;
    const y = plat.y - size + 6 + a.y + a.drop + bob;
    ctx.save();
    ctx.globalAlpha = a.alpha;
    // 그림자
    ctx.fillStyle = "rgba(20,30,20,0.18)";
    ctx.beginPath(); ctx.ellipse(plat.x + a.x, plat.y + 2, size * 0.32, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.imageSmoothingEnabled = false;
    if (a.drop > 0) {
      ctx.beginPath(); ctx.rect(x - 10, 0, size + 20, plat.y + 8); ctx.clip();
    }
    ctx.drawImage(img, x, y, size, size);
    if (a.flash > 0) {
      ctx.globalCompositeOperation = "source-atop";
      ctx.globalAlpha = a.alpha * a.flash;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
  }

  function drawBall(b, now) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate(b.rot);
    if (b.burst) {
      const k = Math.min(1, (now - b.burst) / 250);
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, 0, 12 + 30 * k, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.globalAlpha = b.dim ? 0.85 : 1;
    ctx.fillStyle = C.ballLine;
    ctx.beginPath(); ctx.arc(0, 0, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.ball0;
    ctx.beginPath(); ctx.arc(0, 0, 10, Math.PI, Math.PI * 2); ctx.fill();
    ctx.fillStyle = C.ball1;
    ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI); ctx.fill();
    ctx.fillStyle = C.ballLine;
    ctx.fillRect(-10, -1.5, 20, 3);
    ctx.beginPath(); ctx.arc(0, 0, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = b.dim ? "#d8d2c4" : "#fff";
    ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawFx(now) {
    const k = (now - fx.t0) / 340;
    if (k >= 1) { fx = null; return; }
    const p = fx.who === "me" ? platMe() : platFoe();
    const cx = p.x, cy = p.y - (fx.who === "me" ? 48 : 36);
    const col = { 풀: "#6fbf4f", 물: "#4f9fd9", 불: "#f08a3c", 땅: "#c9a05a" }[fx.type] || "#ffffff";
    ctx.save();
    ctx.globalAlpha = 1 - k;
    ctx.strokeStyle = col;
    ctx.lineWidth = 3;
    const n = fx.kind === "burst" ? 8 : 5;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * Math.PI * 2 + 0.3;
      const r0 = 8 + 30 * k, r1 = r0 + 10 + 12 * k;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
      ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      ctx.stroke();
    }
    if (fx.kind === "burst") {
      ctx.fillStyle = col;
      ctx.globalAlpha = (1 - k) * 0.5;
      ctx.beginPath(); ctx.arc(cx, cy, 10 + 26 * k, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
  }

  function drawStars(now) {
    if (!stars.length) return;
    ctx.save();
    stars = stars.filter((s) => now - s.t0 < s.life);
    for (const s of stars) {
      const t = (now - s.t0) / 1000;
      const x = s.x + s.vx * t, y = s.y + s.vy * t + 60 * t * t;
      ctx.globalAlpha = 1 - (now - s.t0) / s.life;
      ctx.fillStyle = "#f5d76e";
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a1 = (i / 5) * Math.PI * 2 - Math.PI / 2, a2 = a1 + Math.PI / 5;
        ctx.lineTo(x + Math.cos(a1) * 5, y + Math.sin(a1) * 5);
        ctx.lineTo(x + Math.cos(a2) * 2.2, y + Math.sin(a2) * 2.2);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPlate(a, x, y, mine) {
    const w = 148, h = mine ? 68 : 50;
    ctx.save();
    ctx.fillStyle = "rgba(27,42,34,0.18)";
    roundRect(x + 2, y + 3, w, h, 10); ctx.fill();
    ctx.fillStyle = C.paper;
    roundRect(x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    roundRect(x, y, w, h, 10); ctx.stroke();
    ctx.fillStyle = C.ink;
    ctx.font = "700 13px system-ui, -apple-system, 'Noto Sans KR', sans-serif";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(a.name, x + 10, y + 18);
    ctx.font = "600 11px system-ui, -apple-system, 'Noto Sans KR', sans-serif";
    ctx.fillStyle = C.muted;
    const lv = "Lv " + a.level;
    ctx.fillText(lv, x + w - 10 - ctx.measureText(lv).width, y + 18);
    // 체력
    const bx = x + 10, by = y + 27, bw = w - 20, bh = 7;
    const pct = a.maxHp > 0 ? Math.max(0, Math.min(1, a.hpShown / a.maxHp)) : 0;
    ctx.fillStyle = C.line;
    roundRect(bx, by, bw, bh, 3); ctx.fill();
    ctx.fillStyle = pct > 0.5 ? C.hpHi : pct > 0.2 ? C.hpMid : C.hpLo;
    if (pct > 0) { roundRect(bx, by, Math.max(4, bw * pct), bh, 3); ctx.fill(); }
    ctx.font = "800 9px system-ui, sans-serif";
    ctx.fillStyle = C.muted;
    ctx.fillText("HP", bx, by + bh + 10);
    if (mine) {
      ctx.font = "700 12px system-ui, -apple-system, 'Noto Sans KR', sans-serif";
      ctx.fillStyle = C.ink;
      const num = Math.round(a.hpShown) + " / " + a.maxHp;
      ctx.fillText(num, x + w - 10 - ctx.measureText(num).width, by + bh + 12);
      // 경험치
      const ey = y + h - 9;
      ctx.fillStyle = C.line;
      roundRect(bx, ey, bw, 4, 2); ctx.fill();
      const ep = a.toNext > 0 ? Math.max(0, Math.min(1, a.expShown / a.toNext)) : a.level >= 20 ? 1 : 0;
      ctx.fillStyle = C.exp;
      if (ep > 0) { roundRect(bx, ey, Math.max(3, bw * ep), 4, 2); ctx.fill(); }
    }
    ctx.restore();
  }

  window.Battle = { mount, destroy, setScene, play, busy, get text() { return text; }, monSprite };
})();
