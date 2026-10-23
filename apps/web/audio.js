// 야생광장 사운드. 음원 파일 없이 Web Audio로 4채널 칩튠을 직접 연주한다.
// 채널: 리드(사각파 50%), 화음(사각파 25%), 베이스(삼각파), 드럼(노이즈).
// 모든 곡은 이 게임을 위해 새로 쓴 오리지널이다.
(function () {
  const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const STORE_KEY = "pw_sound";

  // "E5:2 -:2" 같은 토큰을 [{ step, len, midi }]로 바꾼다. 16분음표 단위.
  function parseLine(text) {
    const out = [];
    let step = 0;
    for (const token of String(text || "").trim().split(/\s+/)) {
      if (!token) continue;
      const [name, lenText] = token.split(":");
      const len = Math.max(1, parseInt(lenText || "1", 10));
      if (name !== "-") {
        const m = /^([A-G])(#|b)?(\d)$/.exec(name);
        if (!m) throw new Error("bad note " + token);
        const semi = NOTE[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
        out.push({ step, len, midi: (parseInt(m[3], 10) + 1) * 12 + semi });
      }
      step += len;
    }
    return { events: out, steps: step };
  }

  function bars(list) {
    return list.join(" ");
  }

  function repeat(text, times) {
    return Array.from({ length: times }, () => text).join(" ");
  }

  // ---- 작곡 ----------------------------------------------------------------

  const TRACKS = {
    // 하림마을: 따뜻한 다장조, 느긋한 걸음.
    town: {
      bpm: 104,
      lead: bars([
        "E5:4 G5:2 E5:2 D5:4 C5:4",
        "D5:2 E5:2 D5:4 A4:8",
        "C5:4 E5:2 C5:2 B4:4 A4:4",
        "G4:2 A4:2 B4:4 C5:8",
        "E5:4 G5:2 A5:2 G5:4 E5:4",
        "D5:2 E5:2 F5:4 E5:4 D5:4",
        "C5:4 D5:2 E5:2 G4:4 A4:4",
        "B4:2 C5:2 D5:4 C5:8",
      ]),
      harm: bars([
        "E4:8 G4:8",
        "D4:8 B3:8",
        "C4:8 E4:8",
        "F4:4 D4:4 E4:8",
        "G4:8 E4:8",
        "F4:8 B3:8",
        "E4:8 F4:8",
        "D4:4 G4:4 E4:8",
      ]),
      bass: bars([
        "C3:4 -:2 C3:2 G3:4 E3:4",
        "G2:4 -:2 G2:2 D3:4 B2:4",
        "A2:4 -:2 A2:2 E3:4 C3:4",
        "F2:4 F2:4 G2:4 G2:4",
        "C3:4 -:2 C3:2 G3:4 E3:4",
        "D3:4 -:2 D3:2 G2:4 B2:4",
        "A2:4 -:2 A2:2 F2:4 F2:4",
        "G2:4 G2:4 C3:8",
      ]),
      drum: repeat("..h...h...h...h.", 8),
      mix: { lead: 0.9, harm: 0.7, bass: 0.9, drum: 0.5 },
    },

    // 북쪽 들길: 사장조, 튀는 베이스와 엇박 스탭.
    route: {
      bpm: 130,
      lead: bars([
        "D5:2 -:2 D5:2 E5:2 G5:4 A5:4",
        "B5:4 A5:2 G5:2 E5:8",
        "D5:2 -:2 D5:2 E5:2 G5:4 B5:4",
        "A5:4 G5:2 E5:2 D5:8",
        "C5:2 -:2 C5:2 D5:2 E5:4 G5:4",
        "A5:4 G5:2 E5:2 D5:8",
        "B4:2 -:2 B4:2 C5:2 D5:4 E5:4",
        "D5:2 E5:2 D5:2 B4:2 G4:8",
      ]),
      harm: bars([
        "-:2 B4:2 -:2 B4:2 -:2 D5:2 -:2 D5:2",
        "-:2 G4:2 -:2 G4:2 -:2 B4:2 -:2 B4:2",
        "-:2 B4:2 -:2 B4:2 -:2 D5:2 -:2 D5:2",
        "-:2 A4:2 -:2 A4:2 -:2 F#4:2 -:2 F#4:2",
        "-:2 E4:2 -:2 E4:2 -:2 G4:2 -:2 G4:2",
        "-:2 A4:2 -:2 A4:2 -:2 F#4:2 -:2 F#4:2",
        "-:2 G4:2 -:2 G4:2 -:2 E4:2 -:2 E4:2",
        "-:2 A4:2 -:2 F#4:2 -:2 G4:2 -:2 B4:2",
      ]),
      bass: bars([
        "G2:2 G2:2 -:2 G2:2 D3:2 -:2 G2:2 -:2",
        "E2:2 E2:2 -:2 E2:2 B2:2 -:2 E2:2 -:2",
        "G2:2 G2:2 -:2 G2:2 D3:2 -:2 G2:2 -:2",
        "D3:2 D3:2 -:2 D3:2 A2:2 -:2 D3:2 -:2",
        "C3:2 C3:2 -:2 C3:2 G2:2 -:2 C3:2 -:2",
        "D3:2 D3:2 -:2 D3:2 A2:2 -:2 D3:2 -:2",
        "E2:2 E2:2 -:2 E2:2 C3:2 C3:2 -:2 C3:2",
        "D3:2 D3:2 -:2 D3:2 G2:2 -:2 G2:2 -:2",
      ]),
      drum: repeat("k.h.s.hhk.h.s.h.", 7) + "k.h.s.hhk.h.s.ss",
      mix: { lead: 1, harm: 0.7, bass: 1, drum: 0.8 },
    },

    // 야생 전투: 가단조, 16분 아르페지오 위를 달리는 리드.
    wild: {
      bpm: 162,
      lead: bars([
        "A4:2 A4:2 C5:2 A4:2 E5:4 D5:2 C5:2",
        "B4:2 C5:2 B4:2 G4:2 E4:8",
        "A4:2 A4:2 C5:2 A4:2 E5:4 G5:4",
        "A5:4 G5:2 E5:2 D5:4 C5:4",
        "F5:2 F5:2 E5:2 D5:2 C5:4 B4:4",
        "E5:2 E5:2 D5:2 C5:2 B4:4 G#4:4",
        "A4:2 C5:2 E5:2 A5:2 G5:2 E5:2 D5:2 C5:2",
        "B4:2 C5:2 D5:2 B4:2 A4:8",
      ]),
      harm: bars([
        repeat("A3:1 C4:1 E4:1 C4:1", 4),
        repeat("G3:1 B3:1 D4:1 B3:1", 2) + " " + repeat("E3:1 G#3:1 B3:1 G#3:1", 2),
        repeat("A3:1 C4:1 E4:1 C4:1", 4),
        repeat("F3:1 A3:1 C4:1 A3:1", 2) + " " + repeat("G3:1 B3:1 D4:1 B3:1", 2),
        repeat("F3:1 A3:1 C4:1 A3:1", 2) + " " + repeat("G3:1 B3:1 D4:1 B3:1", 2),
        repeat("E3:1 G#3:1 B3:1 G#3:1", 4),
        repeat("A3:1 C4:1 E4:1 C4:1", 4),
        repeat("E3:1 G#3:1 B3:1 G#3:1", 2) + " " + repeat("A3:1 C4:1 E4:1 C4:1", 2),
      ]),
      bass: bars([
        repeat("A2:2 A3:2", 4),
        repeat("G2:2 G3:2", 2) + " " + repeat("E2:2 E3:2", 2),
        repeat("A2:2 A3:2", 4),
        repeat("F2:2 F3:2", 2) + " " + repeat("G2:2 G3:2", 2),
        repeat("F2:2 F3:2", 2) + " " + repeat("G2:2 G3:2", 2),
        repeat("E2:2 E3:2", 4),
        repeat("A2:2 A3:2", 4),
        repeat("E2:2 E3:2", 2) + " " + repeat("A2:2 A3:2", 2),
      ]),
      drum: repeat("k.h.s.h.k.h.s.hh", 7) + "k.h.s.h.s.s.s.s.",
      mix: { lead: 1, harm: 0.6, bass: 1, drum: 1 },
    },

    // 대전: 마단조, 트레몰로 화음과 쪼개진 베이스.
    duel: {
      bpm: 152,
      lead: bars([
        "E5:2 -:2 E5:2 G5:2 F#5:2 E5:2 D5:4",
        "E5:2 -:2 E5:2 G5:2 A5:2 G5:2 F#5:4",
        "G5:2 -:2 G5:2 B5:2 A5:2 G5:2 F#5:4",
        "E5:2 D5:2 B4:2 D5:2 E5:8",
        "C5:2 -:2 C5:2 E5:2 D5:2 C5:2 B4:4",
        "D5:2 -:2 D5:2 F#5:2 E5:2 D5:2 C5:4",
        "B4:2 D5:2 E5:2 G5:2 F#5:2 E5:2 D5:2 B4:2",
        "C5:2 B4:2 A4:2 B4:2 E5:8",
      ]),
      harm: bars([
        repeat("E4:1 G4:1", 8),
        repeat("E4:1 G4:1", 8),
        repeat("C4:1 E4:1", 4) + " " + repeat("D4:1 F#4:1", 4),
        repeat("E4:1 G4:1", 8),
        repeat("A3:1 C4:1", 8),
        repeat("D4:1 F#4:1", 8),
        repeat("E4:1 G4:1", 4) + " " + repeat("C4:1 E4:1", 4),
        repeat("B3:1 D#4:1", 4) + " " + repeat("E4:1 G4:1", 4),
      ]),
      bass: bars([
        "E2:2 E2:2 E3:2 E2:2 E2:2 E3:2 E2:2 D3:2",
        "E2:2 E2:2 E3:2 E2:2 E2:2 E3:2 E2:2 D3:2",
        "C3:2 C3:2 C3:2 C3:2 D3:2 D3:2 D3:2 D3:2",
        "E2:2 E2:2 E3:2 E2:2 E2:2 E3:2 E2:2 E2:2",
        "A2:2 A2:2 A3:2 A2:2 A2:2 A3:2 A2:2 G2:2",
        "D3:2 D3:2 D3:2 D3:2 D3:2 D3:2 C3:2 C3:2",
        "E2:2 E2:2 E3:2 E2:2 C3:2 C3:2 C3:2 C3:2",
        "B2:2 B2:2 B2:2 B2:2 E2:2 E2:2 E3:2 E2:2",
      ]),
      drum: repeat("k.hhs.h.k.hhs.hh", 7) + "k.hhs.h.s.s.ssss",
      mix: { lead: 1, harm: 0.55, bass: 1, drum: 1 },
    },

    // 북쪽 보스: 라단조, 무거운 킥과 반음 긴장.
    boss: {
      bpm: 138,
      lead: bars([
        "D5:4 -:2 D5:2 F5:2 E5:2 D5:2 C#5:2",
        "D5:4 -:2 A4:2 A#4:4 A4:4",
        "D5:4 -:2 D5:2 F5:2 G5:2 A5:2 A#5:2",
        "A5:4 G5:2 F5:2 E5:8",
        "F5:4 -:2 F5:2 E5:2 D5:2 C5:2 D5:2",
        "E5:4 -:2 E5:2 F5:2 E5:2 D5:2 C#5:2",
        "D5:2 F5:2 A5:2 D6:2 C6:2 A5:2 F5:2 D5:2",
        "C#5:2 D5:2 E5:2 C#5:2 D5:8",
      ]),
      harm: bars([
        "D4:2 -:2 A3:2 -:2 D4:2 -:2 A3:2 -:2",
        "A3:2 -:2 C#4:2 -:2 A3:2 -:2 C#4:2 -:2",
        "D4:2 -:2 A3:2 -:2 D4:2 -:2 A3:2 -:2",
        "G3:2 -:2 A#3:2 -:2 A3:2 -:2 C#4:2 -:2",
        "A#3:2 -:2 D4:2 -:2 A#3:2 -:2 D4:2 -:2",
        "A3:2 -:2 C#4:2 -:2 A3:2 -:2 C#4:2 -:2",
        "D4:2 -:2 A3:2 -:2 D4:2 -:2 A3:2 -:2",
        "A3:2 -:2 C#4:2 -:2 D4:2 -:2 A3:2 -:2",
      ]),
      bass: bars([
        "D2:2 D2:2 D2:2 D3:2 D2:2 D2:2 D3:2 C#3:2",
        "A2:2 A2:2 A2:2 A3:2 A2:2 A2:2 A3:2 G2:2",
        "D2:2 D2:2 D2:2 D3:2 D2:2 D2:2 D3:2 C#3:2",
        "G2:2 G2:2 G2:2 G3:2 A2:2 A2:2 A2:2 A3:2",
        "A#2:2 A#2:2 A#2:2 A#3:2 A#2:2 A#2:2 A#3:2 A2:2",
        "A2:2 A2:2 A2:2 A3:2 A2:2 A2:2 A3:2 G2:2",
        "D2:2 D2:2 D2:2 D3:2 D2:2 D2:2 D3:2 C#3:2",
        "A2:2 A2:2 A2:2 A3:2 D2:2 D2:2 D3:2 D2:2",
      ]),
      drum: repeat("k...k...k.s.k...", 7) + "k...k...k.s.k.ss",
      mix: { lead: 1, harm: 0.8, bass: 1.1, drum: 1.1 },
    },
  };

  // 한 번만 연주하고 BGM으로 돌아가는 징글.
  const JINGLES = {
    encounter: {
      bpm: 160,
      lead: "E5:1 F5:1 F#5:1 G5:1 G#5:1 A5:1 A#5:1 B5:1 C6:4",
      harm: "A3:1 A#3:1 B3:1 C4:1 C#4:1 D4:1 D#4:1 E4:1 A4:4",
      bass: "A2:8 E2:4",
      drum: "kkkkkkkks...",
    },
    win: {
      bpm: 140,
      lead: "C5:2 E5:2 G5:2 C6:4 -:2 B5:2 C6:2 D6:4 C6:2 -:2 G5:8",
      harm: "E4:2 G4:2 C5:2 E5:4 -:2 G5:2 E5:2 G5:4 E5:2 -:2 E5:8",
      bass: "C3:4 C3:4 G2:4 G2:4 G2:4 G2:4 C3:8",
      drum: "k.h.s.h.k.h.s.h.k.h.s...k.......",
    },
    catch: {
      bpm: 150,
      lead: "G5:2 G5:2 G5:2 -:2 E5:2 G5:2 A5:4 G5:2 E5:2 C5:2 E5:2 G5:8",
      harm: "E5:2 E5:2 E5:2 -:2 C5:2 E5:2 F5:4 E5:2 C5:2 G4:2 C5:2 E5:8",
      bass: "C3:4 C3:4 F2:4 F2:4 C3:4 G2:4 C3:8",
      drum: "k...s...k...s...k.s.k.s.k.......",
    },
    lose: {
      bpm: 92,
      lead: "E5:4 D5:4 C5:4 B4:4 A4:12 -:4",
      harm: "C5:4 B4:4 A4:4 G#4:4 E4:12 -:4",
      bass: "A2:8 E2:8 A2:12 -:4",
      drum: "",
    },
  };

  // BGM을 멈추지 않고 겹쳐 내는 효과음.
  const SFX = {
    blip: { bpm: 200, lead: "C6:1", harm: "", bass: "", drum: "" },
    ping: { bpm: 160, lead: "E6:1 A6:3", harm: "C#6:1 E6:3", bass: "", drum: "" },
  };

  function compile(def) {
    const lead = parseLine(def.lead);
    const harm = parseLine(def.harm);
    const bass = parseLine(def.bass);
    const drum = String(def.drum || "").replace(/\s+/g, "");
    const steps = Math.max(lead.steps, harm.steps, bass.steps, drum.length, 1);
    return {
      bpm: def.bpm,
      steps,
      lead: lead.events,
      harm: harm.events,
      bass: bass.events,
      drum,
      mix: def.mix || { lead: 1, harm: 0.7, bass: 1, drum: 0.9 },
    };
  }

  const compiled = {};
  function song(table, name) {
    const key = name + "@" + (table === TRACKS ? "t" : table === JINGLES ? "j" : "s");
    if (!compiled[key]) compiled[key] = compile(table[name]);
    return compiled[key];
  }

  // ---- 신시사이저 ----------------------------------------------------------

  let ctx = null;
  let master = null;
  let pulse25 = null;
  let noiseBuf = null;
  let meter = null;
  let enabled = localStorage.getItem(STORE_KEY) !== "off";
  let unlocked = false;

  let desired = "";
  let current = null; // { name, song, step, nextTime, gain }
  let jingleUntil = 0;
  let jingleTimer = 0;
  let loopTimer = 0;

  const GAIN = { lead: 0.14, harm: 0.07, bass: 0.2, drum: 0.16 };

  function hz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);

    const n = 48;
    const real = new Float32Array(n);
    const imag = new Float32Array(n);
    for (let k = 1; k < n; k++) {
      real[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * 0.25);
    }
    pulse25 = ctx.createPeriodicWave(real, imag, { disableNormalization: false });

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return ctx;
  }

  function tone(kind, midi, at, dur, level, out) {
    const osc = ctx.createOscillator();
    if (kind === "harm") osc.setPeriodicWave(pulse25);
    else osc.type = kind === "bass" ? "triangle" : "square";
    osc.frequency.value = hz(midi);
    const g = ctx.createGain();
    const peak = GAIN[kind] * level;
    const end = at + Math.max(0.03, dur - 0.02);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.005);
    g.gain.linearRampToValueAtTime(peak * 0.72, Math.min(end, at + 0.08));
    g.gain.setValueAtTime(peak * 0.72, end);
    g.gain.linearRampToValueAtTime(0.0001, end + 0.03);
    osc.connect(g);
    g.connect(out);
    osc.start(at);
    osc.stop(end + 0.04);
  }

  function hit(ch, at, level, out) {
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filt = ctx.createBiquadFilter();
    const g = ctx.createGain();
    let dur = 0.05;
    let peak = GAIN.drum * level;
    if (ch === "k") {
      filt.type = "lowpass";
      filt.frequency.value = 180;
      dur = 0.09;
      peak *= 1.6;
      const thump = ctx.createOscillator();
      thump.type = "triangle";
      thump.frequency.setValueAtTime(150, at);
      thump.frequency.exponentialRampToValueAtTime(45, at + 0.1);
      const tg = ctx.createGain();
      tg.gain.setValueAtTime(GAIN.drum * level * 1.8, at);
      tg.gain.exponentialRampToValueAtTime(0.0001, at + 0.12);
      thump.connect(tg);
      tg.connect(out);
      thump.start(at);
      thump.stop(at + 0.13);
    } else if (ch === "s") {
      filt.type = "bandpass";
      filt.frequency.value = 1900;
      filt.Q.value = 0.7;
      dur = 0.11;
      peak *= 1.1;
    } else {
      filt.type = "highpass";
      filt.frequency.value = 6500;
      dur = 0.035;
      peak *= 0.55;
    }
    g.gain.setValueAtTime(peak, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(out);
    src.start(at);
    src.stop(at + dur + 0.01);
  }

  function stepDur(s) {
    return 60 / s.bpm / 4;
  }

  function scheduleStep(s, step, at, out) {
    const sd = stepDur(s);
    for (const ev of s.lead) if (ev.step === step) tone("lead", ev.midi, at, ev.len * sd, s.mix.lead, out);
    for (const ev of s.harm) if (ev.step === step) tone("harm", ev.midi, at, ev.len * sd, s.mix.harm, out);
    for (const ev of s.bass) if (ev.step === step) tone("bass", ev.midi, at, ev.len * sd, s.mix.bass, out);
    const d = s.drum[step];
    if (d && d !== ".") hit(d, at, s.mix.drum, out);
  }

  function playOnce(s, level) {
    const out = ctx.createGain();
    out.gain.value = level;
    out.connect(master);
    const start = ctx.currentTime + 0.02;
    const sd = stepDur(s);
    for (let i = 0; i < s.steps; i++) scheduleStep(s, i, start + i * sd, out);
    return s.steps * sd;
  }

  // ---- 재생 제어 -----------------------------------------------------------

  function stopLoop(fade) {
    clearInterval(loopTimer);
    loopTimer = 0;
    if (!current) return;
    const g = current.gain;
    const now = ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(g.gain.value, now);
    g.gain.linearRampToValueAtTime(0.0001, now + (fade ? 0.25 : 0.03));
    setTimeout(() => g.disconnect(), fade ? 300 : 60);
    current = null;
  }

  function startLoop(name) {
    if (!ctx || !TRACKS[name]) return;
    stopLoop(true);
    const s = song(TRACKS, name);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.2);
    gain.connect(master);
    current = { name, song: s, step: 0, nextTime: ctx.currentTime + 0.05, gain };
    loopTimer = setInterval(pump, 30);
    pump();
  }

  function pump() {
    if (!current || !ctx) return;
    const s = current.song;
    const sd = stepDur(s);
    if (current.nextTime < ctx.currentTime - 0.5) current.nextTime = ctx.currentTime + 0.02;
    while (current.nextTime < ctx.currentTime + 0.16) {
      scheduleStep(s, current.step, current.nextTime, current.gain);
      current.step = (current.step + 1) % s.steps;
      current.nextTime += sd;
    }
  }

  function settle() {
    if (!unlocked || !enabled || !ctx) return;
    if (Date.now() < jingleUntil) return;
    if (!desired) {
      stopLoop(true);
      return;
    }
    if (current && current.name === desired) return;
    startLoop(desired);
  }

  function unlock() {
    const c = ensureCtx();
    if (!c) return;
    if (c.state === "suspended") c.resume().catch(() => {});
    if (!unlocked) {
      unlocked = true;
      settle();
    }
  }

  const Sound = {
    get on() {
      return enabled;
    },
    want(name) {
      desired = TRACKS[name] ? name : "";
      settle();
    },
    jingle(name, next) {
      if (next) desired = TRACKS[next] ? next : desired;
      if (!unlocked || !enabled || !ctx || !JINGLES[name]) return settle();
      stopLoop(false);
      const len = playOnce(song(JINGLES, name), 1);
      jingleUntil = Date.now() + len * 1000 + 120;
      clearTimeout(jingleTimer);
      jingleTimer = setTimeout(() => {
        jingleUntil = 0;
        settle();
      }, len * 1000 + 140);
    },
    sfx(name) {
      if (!unlocked || !enabled || !ctx || !SFX[name]) return;
      playOnce(song(SFX, name), 0.8);
    },
    state() {
      let level = 0;
      if (ctx && master) {
        if (!meter) {
          meter = ctx.createAnalyser();
          meter.fftSize = 1024;
          master.connect(meter);
        }
        const buf = new Float32Array(meter.fftSize);
        meter.getFloatTimeDomainData(buf);
        let sum = 0;
        for (const v of buf) sum += v * v;
        level = Math.sqrt(sum / buf.length);
      }
      return { on: enabled, unlocked, ctx: ctx ? ctx.state : "none", track: current ? current.name : "", desired, level };
    },
    toggle() {
      enabled = !enabled;
      localStorage.setItem(STORE_KEY, enabled ? "on" : "off");
      if (!enabled) {
        clearTimeout(jingleTimer);
        jingleUntil = 0;
        if (ctx) stopLoop(true);
      } else {
        unlock();
        settle();
      }
      return enabled;
    },
  };

  for (const type of ["pointerdown", "touchend", "keydown"]) {
    document.addEventListener(type, unlock, { passive: true });
  }

  document.addEventListener("visibilitychange", () => {
    if (!ctx) return;
    if (document.visibilityState === "hidden") {
      ctx.suspend().catch(() => {});
    } else if (unlocked && enabled) {
      ctx.resume().catch(() => {});
      if (current) current.nextTime = ctx.currentTime + 0.05;
    }
  });

  window.Sound = Sound;
})();
