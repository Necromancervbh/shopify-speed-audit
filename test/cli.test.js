import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { runAudit, normalizeUrl } from '../src/index.js';

const run = promisify(execFile);
const bin = fileURLToPath(new URL('../bin/shopify-speed-audit.js', import.meta.url));
const html = readFileSync(new URL('./fixtures/slow-store.html', import.meta.url), 'utf8');

// A local "store" so the whole pipeline runs without the internet
let server, base;
before(async () => {
  server = createServer((req, res) => {
    if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html); return; }
    res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': req.url.includes('hero') ? '600000' : '20000' });
    res.end(req.method === 'HEAD' ? undefined : Buffer.alloc(10));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/`;
});
after(() => server.close());

test('normalizes bare domains to https', () => {
  assert.equal(normalizeUrl('mystore.com'), 'https://mystore.com/');
  assert.throws(() => normalizeUrl(''), /store URL/);
});

test('audits a page end to end', async () => {
  // Rewrite the fixture's store host to the local server so image sizes are measured too
  const local = html.replaceAll('//example-store.myshopify.com', base.replace(/^http:|\/$/g, ''));
  server.removeAllListeners('request');
  server.on('request', (req, res) => {
    if (req.url === '/') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(local); return; }
    res.writeHead(200, { 'content-type': 'image/jpeg', 'content-length': req.url.includes('hero') ? '600000' : '20000' });
    res.end();
  });
  const r = await runAudit(base, { timeout: 5000 });
  assert.equal(r.status, 200);
  assert.equal(r.findings.find(f => f.id === 'heavy-images').status, 'fail');
  assert.equal(r.theme.name, 'Dawn');
});

test('CLI prints help and JSON, and exits 1 under --fail-under', async () => {
  const help = await run(process.execPath, [bin, '--help']);
  assert.match(help.stdout, /Usage: shopify-speed-audit/);
  const json = await run(process.execPath, [bin, base, '--json', '--no-assets']);
  assert.equal(JSON.parse(json.stdout).url, base);
  await assert.rejects(run(process.execPath, [bin, base, '--no-assets', '--fail-under', '101']), e => e.code === 1);
});
