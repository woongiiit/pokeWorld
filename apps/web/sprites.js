// 32x32 픽셀 아트를 SVG 로 그린다. 데이터는 mons.js 의 window.PIX.
// sprite(name, px, extra) 는 HTML 문자열을 돌려준다. 이름은 종 이름 또는 "트레이너".

// 모르는 이름일 때 그리는 회색 물음표 실루엣.
const UNKNOWN_PIX = {
  motion: "breathe",
  pal: { k: "#6b6f6a", g: "#b8bcb6", w: "#e6e8e4" },
  front: [
    "................................",
    "................................",
    "................................",
    "...........kkkkkkkkkk...........",
    ".........kkggggggggggkk.........",
    "........kggggggggggggggk........",
    ".......kgggggggggggggggk........",
    ".......kggggkkkkkkkggggk........",
    ".......kgggkwwwwwwwkgggk........",
    ".......kgggkwwkkkwwkgggk........",
    ".......kgggkkkk.kwwkgggk........",
    ".......kggggggg.kwwkgggk........",
    ".......kgggggggkwwkggggk........",
    ".......kggggggkwwkgggggk........",
    ".......kgggggkwwkggggggk........",
    ".......kgggggkwwkggggggk........",
    ".......kgggggkkkkggggggk........",
    ".......kggggggggggggggk.........",
    ".......kgggggkkkkggggggk........",
    ".......kgggggkwwkggggggk........",
    ".......kgggggkwwkggggggk........",
    ".......kgggggkkkkggggggk........",
    "........kggggggggggggggk........",
    ".........kkggggggggggkk.........",
    "...........kkkkkkkkkk...........",
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
    "................................",
  ],
};

function pixSpec(name) {
  const pix = typeof window !== "undefined" ? window.PIX : null;
  if (!pix) return UNKNOWN_PIX;
  if (name === "트레이너") {
    const person = pix.people.trainer;
    return { motion: "breathe", pal: person.pal, keys: person.keys, front: person.frames.down[0] };
  }
  return pix.mons[name] || UNKNOWN_PIX;
}

// 같은 색이 가로로 이어지면 rect 하나로 합친다.
function pixRects(spec, rows, dx) {
  const pix = typeof window !== "undefined" ? window.PIX : null;
  const color = (ch) => {
    if (ch === ".") return null;
    if (pix && pix.colorOf) return pix.colorOf(spec, ch);
    return spec.pal[ch] || null;
  };
  const rects = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      const fill = color(row[x]);
      if (!fill) { x += 1; continue; }
      let end = x + 1;
      while (end < row.length && color(row[end]) === fill) end += 1;
      rects.push(`<rect x="${x + dx}" y="${y}" width="${end - x}" height="1" fill="${fill}"/>`);
      x = end;
    }
  });
  return rects.join("");
}

function sprite(name, px, extra) {
  const spec = pixSpec(name);
  const rows = spec.front;
  const w = rows[0].length;
  const h = rows.length;
  const box = Math.max(w, h);
  const dx = Math.floor((box - w) / 2);
  const body = pixRects(spec, rows, dx);
  const motion = spec.motion || "breathe";
  // wag/flicker 는 두 프레임을 번갈아 보여 주므로 1px 들린 프레임을 하나 더 넣는다.
  const second = motion === "wag" || motion === "flicker"
    ? `<g class="f1" transform="translate(0,-1)">${body}</g>`
    : "";
  const dim = extra ? ` ${extra}` : "";
  return `<span class="sprite-slot ${motion}${dim}" style="width:${px}px;height:${px}px"><svg class="sprite" width="${px}" height="${px}" viewBox="0 0 ${box} ${box}" shape-rendering="crispEdges" aria-hidden="true"><g class="f0">${body}</g>${second}</svg><i class="sprite-shadow"></i></span>`;
}

if (typeof module !== "undefined") module.exports = { UNKNOWN_PIX, sprite };
