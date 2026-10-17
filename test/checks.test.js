import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHtml } from '../src/parse.js';
import { audit } from '../src/checks.js';
import { formatReport } from '../src/report.js';

const html = readFileSync(new URL('./fixtures/slow-store.html', import.meta.url), 'utf8');
const url = 'https://example-store.myshopify.com/';
const fetched = { url, status: 200, ttfb: 1400, loadMs: 1900, htmlBytes: 300_000, htmlGzipBytes: 90 * 1024, poweredByShopify: true };
const page = parseHtml(html, url);
const hero = 'https://example-store.myshopify.com/cdn/shop/files/hero.jpg';
const result = audit(fetched, page, { [hero]: { bytes: 520 * 1024 } });
const byId = Object.fromEntries(result.findings.map(f => [f.id, f]));

test('flags the problems planted in the fixture', () => {
  assert.equal(byId['server-response'].status, 'fail');
  assert.equal(byId['html-size'].status, 'warn');
  assert.equal(byId['blocking-scripts'].status, 'warn');
  assert.equal(byId['blocking-scripts'].detail.length, 2);
  assert.equal(byId['lcp-image-lazy'].status, 'fail');
  assert.equal(byId['heavy-images'].status, 'fail');
  assert.equal(byId['responsive-images'].status, 'warn');
  assert.equal(byId.jquery.status, 'warn');
  assert.equal(byId.iframes.status, 'warn');
  assert.equal(byId.fonts.status, 'warn'); // Google Fonts without display=swap
});

test('passes what the fixture does right', () => {
  assert.equal(byId['dom-size'].status, 'pass');
  assert.equal(byId['image-dimensions'].status, 'pass');
  assert.equal(byId['inline-css'].status, 'pass');
});

test('groups third-party and app scripts by source', () => {
  const names = result.thirdParty.map(g => g.name).sort();
  assert.deepEqual(names, ['Klaviyo', 'Meta Pixel', 'Shopify app embeds', 'jQuery']);
});

test('scores and grades consistently', () => {
  assert.ok(result.score >= 0 && result.score <= 100);
  assert.equal(result.grade, result.score >= 90 ? 'A' : result.score >= 80 ? 'B' : result.score >= 65 ? 'C' : result.score >= 50 ? 'D' : 'F');
  const clean = audit({ ...fetched, ttfb: 200, htmlGzipBytes: 30 * 1024 }, parseHtml('<html><head></head><body><img src="https://x.myshopify.com/cdn/shop/files/a.jpg?width=600" width="1" height="1"></body></html>', url), {});
  assert.equal(clean.score, 100);
});

test('formats a readable report with the worst problems first', () => {
  const text = formatReport(result);
  assert.match(text, /Score \S*\d+\/100/);
  assert.match(text, /Theme: Dawn \(Dawn 15\.3\.0\)/);
  assert.ok(text.indexOf('Server response time') < text.indexOf('Page complexity'));
  assert.match(text, /Start with/);
});
