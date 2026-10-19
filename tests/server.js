/**
 * Minimal zero-dependency static file server used by Playwright's webServer.
 *
 * Serves the project root (index.html, css/styles.css, js/main.js, assets/) on
 * http://localhost:3000 so that integration / accessibility / performance
 * tests can load the real page in a browser. Uses only Node.js built-ins
 * (http, fs, path) — no npm dependencies — keeping with the project's
 * zero-dependency philosophy.
 *
 * Usage:
 *   node tests/server.js            # default port 3000
 *   PORT=4000 node tests/server.js  # custom port
 *
 * Playwright starts and stops this process automatically via playwright.config.js.
 * Requirement references: 19.2, 19.3 (test infrastructure).
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.resolve(__dirname, '..');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(function (req, res) {
  // Strip query string and decode percent-encoding, then default "/" to index.html.
  let urlPath = decodeURIComponent((req.url || '').split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';

  // Resolve and guard against path traversal outside the project root.
  const filePath = path.normalize(path.join(ROOT, urlPath));
  const rootWithSep = ROOT + path.sep;
  if (filePath !== ROOT && !filePath.startsWith(rootWithSep)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, function (err, stat) {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, 'localhost', function () {
  console.log('Static server running at http://localhost:' + PORT + ' (serving ' + ROOT + ')');
});
