// Local npm registry proxy: npmmirror rejects %2f-encoded scoped package paths,
// which npm 11 sends. Rewrite %2f back to "/" and forward.
const http = require('http');
const https = require('https');

const UPSTREAM = 'registry.npmmirror.com';
const PORT = Number(process.env.PORT || 4873);

const agent = new https.Agent({ keepAlive: true, maxSockets: 32 });

http
  .createServer((req, res) => {
    const path = req.url.replace(/%2f/gi, '/');
    const headers = { ...req.headers, host: UPSTREAM };
    delete headers.connection;

    const upstream = https.request(
      { host: UPSTREAM, port: 443, path, method: req.method, headers, agent },
      (up) => {
        res.writeHead(up.statusCode || 502, up.headers);
        up.pipe(res);
      }
    );
    upstream.on('error', (err) => {
      res.writeHead(502, { 'content-type': 'text/plain' });
      res.end(`proxy error: ${err.message}`);
    });
    req.pipe(upstream);
  })
  .listen(PORT, '127.0.0.1', () => {
    console.log(`npm registry proxy on http://127.0.0.1:${PORT} -> https://${UPSTREAM}`);
  });