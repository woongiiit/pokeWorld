const http = require("http");

const port = Number(process.env.PORT) || 3000;

const server = http.createServer((req, res) => {
  const path = (req.url || "/").split("?")[0];
  if (path === "/" || path === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ ok: false }));
});

server.listen(port, "0.0.0.0");
