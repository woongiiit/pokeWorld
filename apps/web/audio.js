// 야생광장 사운드. 음원 파일 없이 Web Audio로 4채널 칩튠을 직접 연주한다.
// 채널: 리드(디튠 사각파 2겹 + 비브라토), 화음(사각파 25%), 베이스(삼각파 + 서브 사인), 드럼(노이즈 + 몸통 톤).
// 리드/화음은 슬랩백 에코를 거치고, 마스터 끝에는 리미터(DynamicsCompressor)가 붙는다.
// 모든 곡은 이 게임을 위해 새로 쓴 오리지널이다. BGM은 A(8마디) + B(8마디) = 16마디 루프.
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
  // 각 곡: A섹션 8마디(기존) 뒤에 B섹션 8마디(상대조/IV도 전개 → 마지막 2마디 도미넌트)를 이어 16마디.

  const TRACKS = {
    // 하림마을: 따뜻한 다장조, 느긋한 걸음. B는 Am/F 쪽으로 기울었다가 Dm→G7로 돌아온다.
    town: {
      bpm: 104,
      lead: bars([
        // A
        "E5:4 G5:2 E5:2 D5:4 C5:4",
        "D5:2 E5:2 D5:4 A4:8",
        "C5:4 E5:2 C5:2 B4:4 A4:4",
        "G4:2 A4:2 B4:4 C5:8",
        "E5:4 G5:2 A5:2 G5:4 E5:4",
        "D5:2 E5:2 F5:4 E5:4 D5:4",
        "C5:4 D5:2 E5:2 G4:4 A4:4",
        "B4:2 C5:2 D5:4 C5:8",
        // B
        "A4:4 C5:2 D5:2 E5:4 C5:4",
        "F5:4 E5:2 D5:2 C5:8",
        "G4:4 C5:2 E5:2 G5:4 E5:4",
        "D5:2 E5:2 D5:4 B4:8",
        "A4:4 C5:2 E5:2 A5:4 G5:4",
        "F5:4 A5:2 G5:2 F5:4 E5:4",
        "D5:4 F5:2 E5:2 D5:4 C5:4",
        "B4:4 D5:4 G5:4 F5:2 D5:2",
      ]),
      harm: bars([
        // A
        "E4:8 G4:8",
        "D4:8 B3:8",
        "C4:8 E4:8",
        "F4:4 D4:4 E4:8",
        "G4:8 E4:8",
        "F4:8 B3:8",
        "E4:8 F4:8",
        "D4:4 G4:4 E4:8",
        // B
        "C4:8 E4:8",
        "A3:8 C4:8",
        "E4:8 G4:8",
        "D4:8 B3:8",
        "C4:8 E4:8",
        "A3:8 C4:8",
        "F4:8 A4:8",
        "G4:4 B3:4 D4:4 F4:4",
      ]),
      bass: bars([
        // A
        "C3:4 -:2 C3:2 G3:4 E3:4",
        "G2:4 -:2 G2:2 D3:4 B2:4",
        "A2:4 -:2 A2:2 E3:4 C3:4",
        "F2:4 F2:4 G2:4 G2:4",
        "C3:4 -:2 C3:2 G3:4 E3:4",
        "D3:4 -:2 D3:2 G2:4 B2:4",
        "A2:4 -:2 A2:2 F2:4 F2:4",
        "G2:4 G2:4 C3:8",
        // B
        "A2:4 -:2 A2:2 E3:4 C3:4",
        "F2:4 -:2 F2:2 C3:4 A2:4",
        "C3:4 -:2 C3:2 G3:4 E3:4",
        "G2:4 -:2 G2:2 D3:4 B2:4",
        "A2:4 -:2 A2:2 E3:4 C3:4",
        "F2:4 -:2 F2:2 C3:4 A2:4",
        "D3:4 -:2 D3:2 A2:4 F2:4",
        "G2:4 G2:4 B2:4 D3:4",
      ]),
      drum: repeat("..h...h...h...h.", 8) + repeat("k.h...h...h.s.h.", 7) + "k.h...h...h.s.ss",
      mix: { lead: 0.9, harm: 0.7, bass: 0.9, drum: 0.5 },
    },

    // 북쪽 들길: 사장조, 튀는 베이스와 엇박 스탭. B는 Em/C로 열렸다가 Am→D로 돌아온다.
    route: {
      bpm: 130,
      lead: bars([
        // A
        "D5:2 -:2 D5:2 E5:2 G5:4 A5:4",
        "B5:4 A5:2 G5:2 E5:8",
        "D5:2 -:2 D5:2 E5:2 G5:4 B5:4",
        "A5:4 G5:2 E5:2 D5:8",
        "C5:2 -:2 C5:2 D5:2 E5:4 G5:4",
        "A5:4 G5:2 E5:2 D5:8",
        "B4:2 -:2 B4:2 C5:2 D5:4 E5:4",
        "D5:2 E5:2 D5:2 B4:2 G4:8",
        // B
        "E5:2 -:2 E5:2 G5:2 B5:4 A5:4",
        "G5:4 E5:2 C5:2 E5:8",
        "D5:2 -:2 D5:2 G5:2 B5:4 D6:4",
        "C6:4 A5:2 F#5:2 D5:8",
        "E5:2 -:2 E5:2 G5:2 B5:4 G5:4",
        "A5:4 G5:2 E5:2 C5:8",
        "C5:2 -:2 C5:2 E5:2 A5:4 G5:4",
        "F#5:2 G5:2 A5:2 C6:2 A5:4 F#5:4",
      ]),
      harm: bars([
        // A
        "-:2 B4:2 -:2 B4:2 -:2 D5:2 -:2 D5:2",
        "-:2 G4:2 -:2 G4:2 -:2 B4:2 -:2 B4:2",
        "-:2 B4:2 -:2 B4:2 -:2 D5:2 -:2 D5:2",
        "-:2 A4:2 -:2 A4:2 -:2 F#4:2 -:2 F#4:2",
        "-:2 E4:2 -:2 E4:2 -:2 G4:2 -:2 G4:2",
        "-:2 A4:2 -:2 A4:2 -:2 F#4:2 -:2 F#4:2",
        "-:2 G4:2 -:2 G4:2 -:2 E4:2 -:2 E4:2",
        "-:2 A4:2 -:2 F#4:2 -:2 G4:2 -:2 B4:2",
        // B
        "-:2 G4:2 -:2 G4:2 -:2 B4:2 -:2 B4:2",
        "-:2 E4:2 -:2 E4:2 -:2 G4:2 -:2 G4:2",
        "-:2 B4:2 -:2 B4:2 -:2 D5:2 -:2 D5:2",
        "-:2 A4:2 -:2 A4:2 -:2 F#4:2 -:2 F#4:2",
        "-:2 G4:2 -:2 G4:2 -:2 B4:2 -:2 B4:2",
        "-:2 E4:2 -:2 E4:2 -:2 G4:2 -:2 G4:2",
        "-:2 A4:2 -:2 A4:2 -:2 C5:2 -:2 C5:2",
        "-:2 A4:2 -:2 F#4:2 -:2 A4:2 -:2 C5:2",
      ]),
      bass: bars([
        // A
        "G2:2 G2:2 -:2 G2:2 D3:2 -:2 G2:2 -:2",
        "E2:2 E2:2 -:2 E2:2 B2:2 -:2 E2:2 -:2",
        "G2:2 G2:2 -:2 G2:2 D3:2 -:2 G2:2 -:2",
        "D3:2 D3:2 -:2 D3:2 A2:2 -:2 D3:2 -:2",
        "C3:2 C3:2 -:2 C3:2 G2:2 -:2 C3:2 -:2",
        "D3:2 D3:2 -:2 D3:2 A2:2 -:2 D3:2 -:2",
        "E2:2 E2:2 -:2 E2:2 C3:2 C3:2 -:2 C3:2",
        "D3:2 D3:2 -:2 D3:2 G2:2 -:2 G2:2 -:2",
        // B
        "E2:2 E2:2 -:2 E2:2 B2:2 -:2 E2:2 -:2",
        "C3:2 C3:2 -:2 C3:2 G2:2 -:2 C3:2 -:2",
        "G2:2 G2:2 -:2 G2:2 D3:2 -:2 G2:2 -:2",
        "D3:2 D3:2 -:2 D3:2 A2:2 -:2 D3:2 -:2",
        "E2:2 E2:2 -:2 E2:2 B2:2 -:2 E2:2 -:2",
        "C3:2 C3:2 -:2 C3:2 G2:2 -:2 C3:2 -:2",
        "A2:2 A2:2 -:2 A2:2 E3:2 -:2 A2:2 -:2",
        "D3:2 D3:2 -:2 D3:2 A2:2 A2:2 C3:2 C3:2",
      ]),
      drum:
        repeat("k.h.s.hhk.h.s.h.", 7) + "k.h.s.hhk.h.s.ss" +
        repeat("k.h.s.hhk.h.s.h.", 7) + "k.h.s.hhk.s.s.ss",
      mix: { lead: 1, harm: 0.7, bass: 1, drum: 0.8 },
    },

    // 야생 전투: 가단조, 16분 아르페지오 위를 달리는 리드. B는 C장조로 밝아졌다가 Dm→E로 돌아온다.
    wild: {
      bpm: 162,
      lead: bars([
        // A
        "A4:2 A4:2 C5:2 A4:2 E5:4 D5:2 C5:2",
        "B4:2 C5:2 B4:2 G4:2 E4:8",
        "A4:2 A4:2 C5:2 A4:2 E5:4 G5:4",
        "A5:4 G5:2 E5:2 D5:4 C5:4",
        "F5:2 F5:2 E5:2 D5:2 C5:4 B4:4",
        "E5:2 E5:2 D5:2 C5:2 B4:4 G#4:4",
        "A4:2 C5:2 E5:2 A5:2 G5:2 E5:2 D5:2 C5:2",
        "B4:2 C5:2 D5:2 B4:2 A4:8",
        // B
        "C5:2 C5:2 E5:2 C5:2 G5:4 E5:2 D5:2",
        "D5:2 E5:2 D5:2 B4:2 G4:8",
        "A4:2 A4:2 C5:2 E5:2 A5:4 G5:4",
        "G5:4 E5:2 D5:2 B4:4 E5:4",
        "F5:2 F5:2 A5:2 F5:2 C6:4 A5:2 G5:2",
        "G5:2 G5:2 B5:2 G5:2 D6:4 B5:4",
        "D5:2 F5:2 A5:2 D6:2 C6:2 A5:2 F5:2 D5:2",
        "E5:2 G#5:2 B5:2 E6:2 D6:4 B5:2 G#5:2",
      ]),
      harm: bars([
        // A
        repeat("A3:1 C4:1 E4:1 C4:1", 4),
        repeat("G3:1 B3:1 D4:1 B3:1", 2) + " " + repeat("E3:1 G#3:1 B3:1 G#3:1", 2),
        repeat("A3:1 C4:1 E4:1 C4:1", 4),
        repeat("F3:1 A3:1 C4:1 A3:1", 2) + " " + repeat("G3:1 B3:1 D4:1 B3:1", 2),
        repeat("F3:1 A3:1 C4:1 A3:1", 2) + " " + repeat("G3:1 B3:1 D4:1 B3:1", 2),
        repeat("E3:1 G#3:1 B3:1 G#3:1", 4),
        repeat("A3:1 C4:1 E4:1 C4:1", 4),
        repeat("E3:1 G#3:1 B3:1 G#3:1", 2) + " " + repeat("A3:1 C4:1 E4:1 C4:1", 2),
        // B
        repeat("C4:1 E4:1 G4:1 E4:1", 4),
        repeat("G3:1 B3:1 D4:1 B3:1", 4),
        repeat("A3:1 C4:1 E4:1 C4:1", 4),
        repeat("E3:1 G3:1 B3:1 G3:1", 4),
        repeat("F3:1 A3:1 C4:1 A3:1", 4),
        repeat("G3:1 B3:1 D4:1 B3:1", 4),
        repeat("A3:1 D4:1 F4:1 D4:1", 4),
        repeat("E3:1 G#3:1 B3:1 G#3:1", 4),
      ]),
      bass: bars([
        // A
        repeat("A2:2 A3:2", 4),
        repeat("G2:2 G3:2", 2) + " " + repeat("E2:2 E3:2", 2),
        repeat("A2:2 A3:2", 4),
        repeat("F2:2 F3:2", 2) + " " + repeat("G2:2 G3:2", 2),
        repeat("F2:2 F3:2", 2) + " " + repeat("G2:2 G3:2", 2),
        repeat("E2:2 E3:2", 4),
        repeat("A2:2 A3:2", 4),
        repeat("E2:2 E3:2", 2) + " " + repeat("A2:2 A3:2", 2),
        // B
        repeat("C2:2 C3:2", 4),
        repeat("G2:2 G3:2", 4),
        repeat("A2:2 A3:2", 4),
        repeat("E2:2 E3:2", 4),
        repeat("F2:2 F3:2", 4),
        repeat("G2:2 G3:2", 4),
        repeat("D2:2 D3:2", 4),
        "E2:2 E3:2 E2:2 E3:2 E2:2 E2:2 E2:2 E2:2",
      ]),
      drum:
        repeat("k.h.s.h.k.h.s.hh", 7) + "k.h.s.h.s.s.s.s." +
        repeat("k.h.s.h.k.h.s.hh", 7) + "k.h.s.h.k.s.ssss",
      mix: { lead: 1, harm: 0.6, bass: 1, drum: 1 },
    },

    // 대전: 마단조, 트레몰로 화음과 쪼개진 베이스. B는 G장조/Am으로 갔다가 B7로 돌아온다.
    duel: {
      bpm: 152,
      lead: bars([
        // A
        "E5:2 -:2 E5:2 G5:2 F#5:2 E5:2 D5:4",
        "E5:2 -:2 E5:2 G5:2 A5:2 G5:2 F#5:4",
        "G5:2 -:2 G5:2 B5:2 A5:2 G5:2 F#5:4",
        "E5:2 D5:2 B4:2 D5:2 E5:8",
        "C5:2 -:2 C5:2 E5:2 D5:2 C5:2 B4:4",
        "D5:2 -:2 D5:2 F#5:2 E5:2 D5:2 C5:4",
        "B4:2 D5:2 E5:2 G5:2 F#5:2 E5:2 D5:2 B4:2",
        "C5:2 B4:2 A4:2 B4:2 E5:8",
        // B
        "G5:2 -:2 G5:2 B5:2 A5:2 G5:2 F#5:4",
        "F#5:2 -:2 F#5:2 A5:2 G5:2 F#5:2 E5:4",
        "E5:2 -:2 E5:2 G5:2 B5:2 G5:2 E5:4",
        "D5:2 F#5:2 B5:2 F#5:2 D5:8",
        "C5:2 -:2 E5:2 G5:2 C6:2 B5:2 G5:4",
        "A5:2 -:2 A5:2 C6:2 B5:2 A5:2 E5:4",
        "D#5:2 F#5:2 B5:2 F#5:2 D#5:2 F#5:2 A5:4",
        "B5:2 A5:2 F#5:2 D#5:2 B4:4 D#5:4",
      ]),
      harm: bars([
        // A
        repeat("E4:1 G4:1", 8),
        repeat("E4:1 G4:1", 8),
        repeat("C4:1 E4:1", 4) + " " + repeat("D4:1 F#4:1", 4),
        repeat("E4:1 G4:1", 8),
        repeat("A3:1 C4:1", 8),
        repeat("D4:1 F#4:1", 8),
        repeat("E4:1 G4:1", 4) + " " + repeat("C4:1 E4:1", 4),
        repeat("B3:1 D#4:1", 4) + " " + repeat("E4:1 G4:1", 4),
        // B
        repeat("B3:1 D4:1", 8),
        repeat("D4:1 F#4:1", 8),
        repeat("E4:1 G4:1", 8),
        repeat("B3:1 D4:1", 8),
        repeat("C4:1 E4:1", 8),
        repeat("A3:1 C4:1", 8),
        repeat("B3:1 D#4:1", 8),
        repeat("B3:1 D#4:1", 4) + " " + repeat("D#4:1 F#4:1", 4),
      ]),
      bass: bars([
        // A
        "E2:2 E2:2 E3:2 E2:2 E2:2 E3:2 E2:2 D3:2",
        "E2:2 E2:2 E3:2 E2:2 E2:2 E3:2 E2:2 D3:2",
        "C3:2 C3:2 C3:2 C3:2 D3:2 D3:2 D3:2 D3:2",
        "E2:2 E2:2 E3:2 E2:2 E2:2 E3:2 E2:2 E2:2",
        "A2:2 A2:2 A3:2 A2:2 A2:2 A3:2 A2:2 G2:2",
        "D3:2 D3:2 D3:2 D3:2 D3:2 D3:2 C3:2 C3:2",
        "E2:2 E2:2 E3:2 E2:2 C3:2 C3:2 C3:2 C3:2",
        "B2:2 B2:2 B2:2 B2:2 E2:2 E2:2 E3:2 E2:2",
        // B
        "G2:2 G2:2 G3:2 G2:2 G2:2 G3:2 G2:2 F#2:2",
        "D3:2 D3:2 D2:2 D3:2 D3:2 D2:2 D3:2 D3:2",
        "E2:2 E2:2 E3:2 E2:2 E2:2 E3:2 E2:2 D3:2",
        "B2:2 B2:2 B3:2 B2:2 B2:2 B3:2 B2:2 A2:2",
        "C3:2 C3:2 C3:2 C3:2 C3:2 C3:2 B2:2 B2:2",
        "A2:2 A2:2 A3:2 A2:2 A2:2 A3:2 A2:2 G2:2",
        "B2:2 B2:2 B3:2 B2:2 B2:2 B3:2 B2:2 B2:2",
        "B2:2 B2:2 B3:2 B2:2 F#2:2 F#2:2 B2:2 B2:2",
      ]),
      drum:
        repeat("k.hhs.h.k.hhs.hh", 7) + "k.hhs.h.s.s.ssss" +
        repeat("k.hhs.h.k.hhs.hh", 7) + "k.hhs.h.k.s.ssss",
      mix: { lead: 1, harm: 0.55, bass: 1, drum: 1 },
    },

    // 북쪽 보스: 라단조, 무거운 킥과 반음 긴장. B는 F장조/Gm으로 넓어졌다가 A(도미넌트)로 돌아온다.
    boss: {
      bpm: 138,
      lead: bars([
        // A
        "D5:4 -:2 D5:2 F5:2 E5:2 D5:2 C#5:2",
        "D5:4 -:2 A4:2 A#4:4 A4:4",
        "D5:4 -:2 D5:2 F5:2 G5:2 A5:2 A#5:2",
        "A5:4 G5:2 F5:2 E5:8",
        "F5:4 -:2 F5:2 E5:2 D5:2 C5:2 D5:2",
        "E5:4 -:2 E5:2 F5:2 E5:2 D5:2 C#5:2",
        "D5:2 F5:2 A5:2 D6:2 C6:2 A5:2 F5:2 D5:2",
        "C#5:2 D5:2 E5:2 C#5:2 D5:8",
        // B
        "F5:4 -:2 F5:2 A5:2 G5:2 F5:2 E5:2",
        "C5:4 -:2 E5:2 G5:4 E5:4",
        "G5:4 -:2 G5:2 A#5:2 A5:2 G5:2 F5:2",
        "E5:4 C#5:2 E5:2 A5:8",
        "A#5:4 -:2 A#5:2 A5:2 G5:2 F5:2 D5:2",
        "G5:2 A#5:2 D6:2 A#5:2 G5:4 F5:4",
        "A5:2 G5:2 F5:2 E5:2 C#5:2 D5:2 E5:2 F5:2",
        "E5:2 F5:2 E5:2 C#5:2 A4:4 C#5:4",
      ]),
      harm: bars([
        // A
        "D4:2 -:2 A3:2 -:2 D4:2 -:2 A3:2 -:2",
        "A3:2 -:2 C#4:2 -:2 A3:2 -:2 C#4:2 -:2",
        "D4:2 -:2 A3:2 -:2 D4:2 -:2 A3:2 -:2",
        "G3:2 -:2 A#3:2 -:2 A3:2 -:2 C#4:2 -:2",
        "A#3:2 -:2 D4:2 -:2 A#3:2 -:2 D4:2 -:2",
        "A3:2 -:2 C#4:2 -:2 A3:2 -:2 C#4:2 -:2",
        "D4:2 -:2 A3:2 -:2 D4:2 -:2 A3:2 -:2",
        "A3:2 -:2 C#4:2 -:2 D4:2 -:2 A3:2 -:2",
        // B
        "F4:2 -:2 C4:2 -:2 F4:2 -:2 C4:2 -:2",
        "E4:2 -:2 C4:2 -:2 E4:2 -:2 G4:2 -:2",
        "G3:2 -:2 A#3:2 -:2 D4:2 -:2 A#3:2 -:2",
        "A3:2 -:2 C#4:2 -:2 E4:2 -:2 C#4:2 -:2",
        "A#3:2 -:2 D4:2 -:2 F4:2 -:2 D4:2 -:2",
        "G3:2 -:2 A#3:2 -:2 D4:2 -:2 A#3:2 -:2",
        "A3:2 -:2 C#4:2 -:2 E4:2 -:2 G4:2 -:2",
        "A3:2 -:2 C#4:2 -:2 E4:2 -:2 C#4:2 -:2",
      ]),
      bass: bars([
        // A
        "D2:2 D2:2 D2:2 D3:2 D2:2 D2:2 D3:2 C#3:2",
        "A2:2 A2:2 A2:2 A3:2 A2:2 A2:2 A3:2 G2:2",
        "D2:2 D2:2 D2:2 D3:2 D2:2 D2:2 D3:2 C#3:2",
        "G2:2 G2:2 G2:2 G3:2 A2:2 A2:2 A2:2 A3:2",
        "A#2:2 A#2:2 A#2:2 A#3:2 A#2:2 A#2:2 A#3:2 A2:2",
        "A2:2 A2:2 A2:2 A3:2 A2:2 A2:2 A3:2 G2:2",
        "D2:2 D2:2 D2:2 D3:2 D2:2 D2:2 D3:2 C#3:2",
        "A2:2 A2:2 A2:2 A3:2 D2:2 D2:2 D3:2 D2:2",
        // B
        "F2:2 F2:2 F2:2 F3:2 F2:2 F2:2 F3:2 E2:2",
        "C3:2 C3:2 C3:2 G2:2 C3:2 C3:2 G2:2 A#2:2",
        "G2:2 G2:2 G2:2 G3:2 G2:2 G2:2 G3:2 F2:2",
        "A2:2 A2:2 A2:2 A3:2 A2:2 A2:2 A3:2 G2:2",
        "A#2:2 A#2:2 A#2:2 A#3:2 A#2:2 A#2:2 A#3:2 A2:2",
        "G2:2 G2:2 G2:2 G3:2 G2:2 G2:2 G3:2 F2:2",
        "A2:2 A2:2 A2:2 A3:2 A2:2 A2:2 A3:2 G2:2",
        "A2:2 A2:2 A3:2 A2:2 A2:2 A2:2 C#3:2 C#3:2",
      ]),
      drum:
        repeat("k...k...k.s.k...", 7) + "k...k...k.s.k.ss" +
        repeat("k...k...k.s.k...", 7) + "k...k...k.s.ssss",
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
    // 레벨업: 상행 4음 뒤에 코드. 15스텝 ≈ 1.5초.
    levelup: {
      bpm: 150,
      lead: "C5:2 E5:2 G5:2 C6:2 -:1 G6:6",
      harm: "-:2 C5:2 E5:2 G5:2 -:1 E6:6",
      bass: "C3:8 -:1 C3:6",
      drum: "k.k.k.k..k.....",
    },
    // 회복: 반짝이는 상행 아르페지오. 14스텝 ≈ 1.2초.
    heal: {
      bpm: 180,
      lead: "G5:1 C6:1 E6:1 G6:1 C6:1 E6:1 G6:1 C7:7",
      harm: "-:1 E5:1 G5:1 C6:1 E5:1 G5:1 C6:1 E6:7",
      bass: "C3:7 G3:7",
      drum: "",
    },
  };

  // BGM을 멈추지 않고 겹쳐 내는 효과음. 패턴형과 전용 합성형(synth)이 있다. 전부 0.5초 이하.
  const SFX = {
    blip: { bpm: 200, lead: "C6:1", harm: "", bass: "", drum: "" },
    ping: { bpm: 160, lead: "E6:1 A6:3", harm: "C#6:1 E6:3", bass: "", drum: "" },
    // 확정: 두 음.
    select: { bpm: 220, lead: "C6:1 G6:2", harm: "", bass: "", drum: "" },
    // 보통 타격: 노이즈 버스트 + 낮은 털썩.
    hit: {
      synth(at, out) {
        noise(out.dry, at, 0.09, 0.22, "bandpass", 900, { q: 0.8, freqEnd: 300 });
        sweep(out.dry, at, 0.12, 0.28, "triangle", 160, 55);
      },
    },
    // 효과 뛰어남: 밝고 날카로운 2톤 타격.
    super: {
      synth(at, out) {
        sweep(out.lead, at, 0.07, 0.16, "square", 1500, 1200);
        sweep(out.lead, at + 0.06, 0.12, 0.16, "square", 2200, 1800);
        noise(out.dry, at, 0.1, 0.2, "highpass", 3000);
        sweep(out.dry, at, 0.1, 0.25, "triangle", 200, 60);
      },
    },
    // 효과 별로: 둔한 털썩.
    weak: {
      synth(at, out) {
        sweep(out.dry, at, 0.13, 0.26, "triangle", 110, 50);
        noise(out.dry, at, 0.07, 0.14, "lowpass", 400);
      },
    },
    // 빗나감: 하행 휘익.
    miss: {
      synth(at, out) {
        sweep(out.lead, at, 0.28, 0.1, "square", 1400, 250, { attack: 0.02 });
        noise(out.dry, at, 0.28, 0.12, "bandpass", 2500, { q: 1.5, freqEnd: 400 });
      },
    },
    // 기절: 떨어지는 피치 0.5초.
    faint: {
      synth(at, out) {
        sweep(out.lead, at, 0.5, 0.12, "square", 660, 70, { attack: 0.01 });
        sweep(out.dry, at, 0.5, 0.18, "triangle", 330, 35, { attack: 0.01 });
      },
    },
    // 볼 던짐: 상행 블립.
    throw: {
      synth(at, out) {
        sweep(out.lead, at, 0.14, 0.12, "square", 420, 1300, { attack: 0.005 });
      },
    },
    // 볼 흔들림: 틱.
    shake: {
      synth(at, out) {
        sweep(out.dry, at, 0.05, 0.2, "triangle", 260, 180);
        noise(out.dry, at, 0.015, 0.14, "highpass", 4000);
      },
    },
    // 볼 잠김: 짧은 클릭 + 부드러운 코드.
    click: {
      synth(at, out) {
        noise(out.dry, at, 0.012, 0.3, "highpass", 2500);
        sweep(out.dry, at, 0.04, 0.2, "triangle", 900, 500);
        for (const midi of [72, 76, 79]) tone("harm", midi, at + 0.03, 0.32, 0.55, out);
      },
    },
    // 볼에서 탈출: 펑.
    break: {
      synth(at, out) {
        noise(out.dry, at, 0.16, 0.3, "lowpass", 1800, { freqEnd: 200 });
        sweep(out.dry, at, 0.14, 0.28, "triangle", 320, 90);
        noise(out.dry, at, 0.03, 0.2, "highpass", 2000);
      },
    },
    // 벽에 부딪힘: 짧고 낮게.
    bump: {
      synth(at, out) {
        sweep(out.dry, at, 0.07, 0.26, "triangle", 120, 70);
        noise(out.dry, at, 0.03, 0.08, "lowpass", 500);
      },
    },
    // 메뉴 이동: 부드러운 블립.
    menu: {
      synth(at, out) {
        sweep(out.harm, at, 0.06, 0.12, "sine", 880, 990);
      },
    },
    // HP 바 감소 틱: 아주 짧고 작게.
    hp: {
      synth(at, out) {
        sweep(out.dry, at, 0.018, 0.08, "square", 2100, 2100);
      },
    },
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
  let master = null; // 모든 버스가 모이는 곳. 뒤에 리미터가 붙는다.
  let limiter = null;
  let bus = null; // { lead, harm, dry } 버스. lead는 로우패스, lead/harm은 에코 센드.
  let pulse25 = null;
  let noiseBuf = null;
  let meter = null;
  let enabled = localStorage.getItem(STORE_KEY) !== "off";
  let unlocked = false;

  let desired = "";
  let current = null; // { name, song, step, nextTime, out }
  let jingleUntil = 0;
  let jingleTimer = 0;
  let loopTimer = 0;

  // 리드는 사각파 2개를 겹치므로 개당 게인은 절반쯤.
  const GAIN = { lead: 0.085, harm: 0.07, bass: 0.2, drum: 0.16 };
  const SUB_FLOOR = 36; // C2. 서브 사인은 이 아래로 내려가지 않는다.

  function hz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function ensureCtx() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();

    // 마스터 → 리미터 → 출력.
    limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -10;
    limiter.knee.value = 4;
    limiter.ratio.value = 12;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.1;
    limiter.connect(ctx.destination);

    master = ctx.createGain();
    master.gain.value = 0.85;
    master.connect(limiter);

    // 버스.
    bus = { lead: ctx.createGain(), harm: ctx.createGain(), dry: ctx.createGain() };
    const leadLp = ctx.createBiquadFilter();
    leadLp.type = "lowpass";
    leadLp.frequency.value = 7000;
    leadLp.Q.value = 0.5;
    bus.lead.connect(leadLp);
    leadLp.connect(master);
    bus.harm.connect(master);
    bus.dry.connect(master);

    // 슬랩백 에코: 리드/화음만. 드럼/베이스는 드라이.
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = 0.18;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.22;
    const echoTone = ctx.createBiquadFilter(); // 반복될수록 살짝 어두워지게.
    echoTone.type = "lowpass";
    echoTone.frequency.value = 4500;
    const wet = ctx.createGain();
    wet.gain.value = 0.16;
    leadLp.connect(delay);
    bus.harm.connect(delay);
    delay.connect(echoTone);
    echoTone.connect(feedback);
    feedback.connect(delay);
    echoTone.connect(wet);
    wet.connect(master);

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

  // 한 곡(또는 효과음)이 쓰는 출력 묶음. 세 버스로 나뉘지만 볼륨은 함께 움직인다.
  function makeOut(level) {
    const o = { lead: ctx.createGain(), harm: ctx.createGain(), dry: ctx.createGain() };
    o.all = [o.lead, o.harm, o.dry];
    o.lead.connect(bus.lead);
    o.harm.connect(bus.harm);
    o.dry.connect(bus.dry);
    for (const g of o.all) g.gain.value = level;
    return o;
  }

  // 음 하나의 공통 엔벨로프. 끝나는 시각을 돌려준다.
  function envelope(param, peak, at, dur, sustain) {
    const end = at + Math.max(0.03, dur - 0.02);
    param.setValueAtTime(0.0001, at);
    param.linearRampToValueAtTime(peak, at + 0.005);
    param.linearRampToValueAtTime(peak * sustain, Math.min(end, at + 0.08));
    param.setValueAtTime(peak * sustain, end);
    param.linearRampToValueAtTime(0.0001, end + 0.03);
    return end + 0.04;
  }

  // 리드: 사각파 ±5센트 2겹, 120ms 뒤부터 비브라토(5.5Hz, 약 6센트)가 스며든다.
  function leadTone(midi, at, dur, level, dest) {
    const g = ctx.createGain();
    const stopAt = envelope(g.gain, GAIN.lead * level, at, dur, 0.72);
    g.connect(dest);
    const f = hz(midi);
    const oscs = [];
    for (const cents of [-5, 5]) {
      const o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = f;
      o.detune.value = cents;
      o.connect(g);
      o.start(at);
      o.stop(stopAt);
      oscs.push(o);
    }
    if (dur > 0.16) {
      const lfo = ctx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = 5.5;
      const depth = ctx.createGain();
      depth.gain.setValueAtTime(0, at);
      depth.gain.setValueAtTime(0, at + 0.12);
      depth.gain.linearRampToValueAtTime(6, at + 0.32);
      lfo.connect(depth);
      for (const o of oscs) depth.connect(o.detune);
      lfo.start(at);
      lfo.stop(stopAt);
    }
  }

  // 화음: 사각파 25%.
  function harmTone(midi, at, dur, level, dest) {
    const g = ctx.createGain();
    const stopAt = envelope(g.gain, GAIN.harm * level, at, dur, 0.72);
    g.connect(dest);
    const o = ctx.createOscillator();
    o.setPeriodicWave(pulse25);
    o.frequency.value = hz(midi);
    o.connect(g);
    o.start(at);
    o.stop(stopAt);
  }

  // 베이스: 삼각파 + 한 옥타브 아래 사인 서브(0.5배). 2옥타브 미만으론 내려가지 않는다.
  function bassTone(midi, at, dur, level, dest) {
    const g = ctx.createGain();
    const stopAt = envelope(g.gain, GAIN.bass * level, at, dur, 0.8);
    g.connect(dest);
    const tri = ctx.createOscillator();
    tri.type = "triangle";
    tri.frequency.value = hz(midi);
    tri.connect(g);
    tri.start(at);
    tri.stop(stopAt);
    const subMidi = midi - 12 >= SUB_FLOOR ? midi - 12 : midi;
    const sub = ctx.createOscillator();
    sub.type = "sine";
    sub.frequency.value = hz(subMidi);
    const sg = ctx.createGain();
    sg.gain.value = 0.5;
    sub.connect(sg);
    sg.connect(g);
    sub.start(at);
    sub.stop(stopAt);
  }

  function tone(kind, midi, at, dur, level, out) {
    if (kind === "lead") leadTone(midi, at, dur, level, out.lead);
    else if (kind === "harm") harmTone(midi, at, dur, level, out.harm);
    else bassTone(midi, at, dur, level, out.dry);
  }

  // 필터 건 노이즈 버스트. opts: q, freqEnd(필터 주파수 램프 목표).
  function noise(dest, at, dur, peak, type, freq, opts) {
    opts = opts || {};
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.setValueAtTime(freq, at);
    if (opts.freqEnd) filt.frequency.exponentialRampToValueAtTime(opts.freqEnd, at + dur);
    if (opts.q) filt.Q.value = opts.q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(peak, at);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(filt);
    filt.connect(g);
    g.connect(dest);
    src.start(at);
    src.stop(at + dur + 0.01);
  }

  // 주파수 f0→f1로 미끄러지는 오실레이터 한 방. opts: attack, rampDur.
  function sweep(dest, at, dur, peak, type, f0, f1, opts) {
    opts = opts || {};
    const o = ctx.createOscillator();
    if (type === "pulse") o.setPeriodicWave(pulse25);
    else o.type = type;
    o.frequency.setValueAtTime(f0, at);
    o.frequency.exponentialRampToValueAtTime(f1, at + (opts.rampDur || dur));
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.linearRampToValueAtTime(peak, at + (opts.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g);
    g.connect(dest);
    o.start(at);
    o.stop(at + dur + 0.02);
  }

  // 드럼: k 킥(피치 스위프), s 스네어(노이즈 + 180Hz 몸통), h 하이햇(짧게).
  function hit(ch, at, level, dest) {
    const base = GAIN.drum * level;
    if (ch === "k") {
      noise(dest, at, 0.09, base * 1.6, "lowpass", 180);
      sweep(dest, at, 0.12, base * 1.8, "triangle", 150, 45, { rampDur: 0.1, attack: 0.002 });
    } else if (ch === "s") {
      noise(dest, at, 0.11, base * 1.1, "bandpass", 1900, { q: 0.7 });
      sweep(dest, at, 0.08, base * 1.2, "sine", 180, 150, { attack: 0.002 });
    } else {
      noise(dest, at, 0.025, base * 0.5, "highpass", 7000);
    }
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
    if (d && d !== ".") hit(d, at, s.mix.drum, out.dry);
  }

  function playOnce(s, level) {
    const out = makeOut(level);
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
    const out = current.out;
    const now = ctx.currentTime;
    for (const g of out.all) {
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(g.gain.value, now);
      g.gain.linearRampToValueAtTime(0.0001, now + (fade ? 0.25 : 0.03));
    }
    setTimeout(() => {
      for (const g of out.all) g.disconnect();
    }, fade ? 300 : 60);
    current = null;
  }

  function startLoop(name) {
    if (!ctx || !TRACKS[name]) return;
    stopLoop(true);
    const s = song(TRACKS, name);
    const out = makeOut(0.0001);
    for (const g of out.all) {
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(1, ctx.currentTime + 0.2);
    }
    current = { name, song: s, step: 0, nextTime: ctx.currentTime + 0.05, out };
    loopTimer = setInterval(pump, 30);
    pump();
  }

  function pump() {
    if (!current || !ctx) return;
    const s = current.song;
    const sd = stepDur(s);
    if (current.nextTime < ctx.currentTime - 0.5) current.nextTime = ctx.currentTime + 0.02;
    while (current.nextTime < ctx.currentTime + 0.16) {
      scheduleStep(s, current.step, current.nextTime, current.out);
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
      const def = SFX[name];
      if (def.synth) def.synth(ctx.currentTime + 0.02, makeOut(0.8));
      else playOnce(song(SFX, name), 0.8);
    },
    state() {
      let level = 0;
      if (ctx && limiter) {
        if (!meter) {
          meter = ctx.createAnalyser();
          meter.fftSize = 1024;
          limiter.connect(meter);
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
