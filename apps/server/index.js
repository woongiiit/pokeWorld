const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const rules = require("./rules");
const game = require("./game");
const store = require("./store");

const port = Number(process.env.PORT) || 3000;
const webRoot = path.resolve(__dirname, "..", "web");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
  ".woff2": "font/woff2",
};

let chain = Promise.resolve();

function enqueue(task) {
  const run = chain.then(task, task);
  chain = run.then(() => undefined, () => undefined);
  return run;
}

function send(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(json);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 100000) {
        reject(Object.assign(new Error("large"), { status: 400 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function readJson(req) {
  const text = await readBody(req);
  if (!text) return {};
  const body = JSON.parse(text);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw Object.assign(new Error("json"), { status: 400 });
  }
  return body;
}

function bearer(req) {
  const header = req.headers.authorization || "";
  const match = /^Bearer\s+(\S+)\s*$/i.exec(header);
  return match ? match[1] : null;
}

function newToken() {
  return crypto.randomBytes(24).toString("hex");
}

const STAGE = 2;
const MENUS = [
  { id: "status", name: "현황", save: false },
  { id: "spawn", name: "출현", save: true },
  { id: "players", name: "플레이어", save: false },
  { id: "plaza", name: "광장", save: false },
  { id: "battle", name: "대전", save: false },
  { id: "trade", name: "교환", save: false },
  { id: "boss", name: "보스", save: false },
  { id: "audit", name: "기록", save: false },
];

function cookieValue(req, name) {
  const raw = req.headers.cookie || "";
  for (const part of raw.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return "";
}

function adminSecure(req) {
  return req.headers["x-forwarded-proto"] === "https" || req.socket.encrypted === true;
}

function setAdminCookie(res, id, req, clear) {
  const parts = [
    `pw_admin=${clear ? "" : encodeURIComponent(id)}`,
    "HttpOnly",
    "SameSite=Strict",
    "Path=/admin",
    clear ? "Max-Age=0" : "Max-Age=43200",
  ];
  if (adminSecure(req)) parts.push("Secure");
  res.setHeader("Set-Cookie", parts.join("; "));
}

function tokenHash() {
  const raw = process.env.ADMIN_TOKEN_HASH || "";
  const split = raw.indexOf(":");
  if (split < 1) return null;
  const salt = Buffer.from(raw.slice(0, split), "hex");
  const hash = Buffer.from(raw.slice(split + 1), "hex");
  if (salt.length === 0 || hash.length === 0) return null;
  return { salt, hash };
}

function tokenMatches(token) {
  const stored = tokenHash();
  if (!stored || typeof token !== "string" || token.length < 8) return false;
  const got = crypto.scryptSync(token, stored.salt, stored.hash.length);
  return got.length === stored.hash.length && crypto.timingSafeEqual(got, stored.hash);
}

async function snapshot(now) {
  const ops = await store.loadOps();
  const players = await store.listPlayers();
  return {
    stage: STAGE,
    date: rules.kstDate(now),
    counts: {
      players: players.length,
      battles: players.filter((player) => player.inBattle).length,
    },
    today: {
      species: ops.todaySpecies,
      date: ops.todayDate,
      live: rules.freshToday(ops.todaySpecies, ops.todayDate, now),
    },
    choices: rules.spawnChoices(),
    players,
    audit: ops.audit,
    menus: MENUS,
  };
}

function payload(account, now, result, today) {
  const body = { state: game.view(account, now, today) };
  if (result.status !== 200 && result.error) body.error = result.error;
  return body;
}

async function currentToday(now) {
  const ops = await store.loadOps();
  return rules.freshToday(ops.todaySpecies, ops.todayDate, now);
}

async function withAccount(req, res, fn) {
  const token = bearer(req);
  if (!token) {
    send(res, 401, { error: "unauthorized" });
    return;
  }
  await enqueue(async () => {
    const account = await store.load(token);
    if (!account) {
      send(res, 401, { error: "unauthorized" });
      return;
    }
    const now = Date.now();
    const today = await currentToday(now);
    const rng = rules.defaultRng();
    const result = fn(account, now, rng, today);
    await store.save(account);
    send(res, result.status, payload(account, now, result, today));
  });
}

function staticFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch (error) {
    return null;
  }
  const rel = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  if (!rel) return null;
  const full = path.resolve(webRoot, rel);
  const diff = path.relative(webRoot, full);
  if (diff.startsWith("..") || path.isAbsolute(diff)) return null;
  return full;
}

function serveStatic(res, urlPath) {
  const file = staticFile(urlPath);
  if (!file) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
    return;
  }
  fs.readFile(file, (error, data) => {
    if (error) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    const type = MIME[path.extname(file).toLowerCase()] || "application/octet-stream";
    res.writeHead(200, { "content-type": type });
    res.end(data);
  });
}

async function handle(req, res) {
  const urlPath = (req.url || "/").split("?")[0];
  try {
    if (req.method === "GET" && urlPath === "/health") {
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && urlPath === "/api/join") {
      const body = await readJson(req);
      const nickname = rules.normalizeNickname(body.nickname);
      if (!nickname) {
        send(res, 400, { error: "nickname" });
        return;
      }
      await enqueue(async () => {
        const existingToken = bearer(req);
        if (existingToken && await store.load(existingToken)) {
          send(res, 400, { error: "nickname" });
          return;
        }
        const now = Date.now();
        const today = await currentToday(now);
        const account = game.createAccount({ token: newToken(), nickname });
        await store.save(account);
        send(res, 200, { token: account.token, state: game.view(account, now, today) });
      });
      return;
    }
    if (req.method === "POST" && urlPath === "/api/starter") {
      const body = await readJson(req);
      await withAccount(req, res, (account, now, rng) => game.handleStarter(account, body.species, now, rng));
      return;
    }
    if (req.method === "GET" && urlPath === "/api/state") {
      await withAccount(req, res, (account, now, rng) => game.handleState(account, now, rng));
      return;
    }
    if (req.method === "POST" && urlPath === "/api/move") {
      const body = await readJson(req);
      await withAccount(req, res, (account, now, rng) => game.handleMove(account, body.dir, now, rng));
      return;
    }
    if (req.method === "POST" && urlPath === "/api/act") {
      const body = await readJson(req);
      await withAccount(req, res, (account, now, rng) => game.handleAct(account, body, now, rng));
      return;
    }
    if (req.method === "GET" && (urlPath === "/admin" || urlPath === "/admin/")) {
      serveStatic(res, "/admin.html");
      return;
    }
    if (req.method === "POST" && urlPath === "/admin/login") {
      const body = await readJson(req);
      if (!tokenHash()) {
        send(res, 503, { error: "unconfigured" });
        return;
      }
      if (!tokenMatches(body.token)) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      const id = newToken();
      const now = Date.now();
      await enqueue(() => store.createSession(id, now + 12 * 60 * 60 * 1000));
      setAdminCookie(res, id, req, false);
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === "POST" && urlPath === "/admin/logout") {
      const id = cookieValue(req, "pw_admin");
      await enqueue(() => store.dropSession(id));
      setAdminCookie(res, "", req, true);
      send(res, 200, { ok: true });
      return;
    }
    if (req.method === "GET" && urlPath === "/admin/api/snapshot") {
      if (!(await store.readSession(cookieValue(req, "pw_admin")))) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      const body = await enqueue(() => snapshot(Date.now()));
      send(res, 200, body);
      return;
    }
    if (req.method === "POST" && urlPath === "/admin/api/spawn") {
      if (!(await store.readSession(cookieValue(req, "pw_admin")))) {
        send(res, 401, { error: "unauthorized" });
        return;
      }
      const body = await readJson(req);
      const result = await enqueue(() => store.setSpawn(body.species || "", Date.now()));
      if (result.status !== 200) {
        send(res, result.status, { error: result.error });
        return;
      }
      const snap = await enqueue(() => snapshot(Date.now()));
      send(res, 200, snap);
      return;
    }
    if (req.method === "GET") {
      serveStatic(res, urlPath);
      return;
    }
    send(res, 404, { ok: false });
  } catch (error) {
    if (res.headersSent) return;
    const status = error instanceof SyntaxError ? 400 : error.status || 500;
    if (status === 500) console.error(error);
    send(res, status, { ok: false });
  }
}

async function main() {
  await store.init();
  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => {
      console.error(error);
      if (!res.headersSent) send(res, 500, { ok: false });
    });
  });
  server.listen(port, "0.0.0.0");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
