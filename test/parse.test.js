import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseHtml, parseAttributes, isSizedShopifyImage } from '../src/parse.js';
import { identify } from '../src/apps.js';

const html = readFileSync(new URL('./fixtures/slow-store.html', import.meta.url), 'utf8');
const page = parseHtml(html, 'https://example-store.myshopify.com/');

test('reads attributes in all quoting styles', () => {
  assert.deepEqual(parseAttributes(`src="a.js" defer data-x='1' width=40`), { src: 'a.js', defer: '', 'data-x': '1', width: '40' });
});

test('decodes HTML entities so CDN size parameters survive', () => {
  const attrs = parseAttributes(`src="//s.myshopify.com/cdn/shop/files/a.png?v=1&amp;width=300" alt="Men&#39;s &quot;Cruiser&quot;"`);
  assert.equal(attrs.src, '//s.myshopify.com/cdn/shop/files/a.png?v=1&width=300');
  assert.equal(attrs.alt, `Men's "Cruiser"`);
});

test('picks the srcset or <picture> file a phone would download', async () => {
  const { chooseCandidate } = await import('../src/parse.js');
  const p = parseHtml(`<head></head><body>
    <img src="https://s.myshopify.com/cdn/shop/files/a.jpg" srcset="https://x/a-500.jpg 500w, https://x/a-1100.jpg 1100w, https://x/a-2000.jpg 2000w">
    <picture><source media="(min-width: 750px)" srcset="https://x/desk.jpg 2000w"><source srcset="https://x/phone.jpg 1080w"><img src="https://x/fallback.jpg"></picture>
  </body>`, 'https://s.myshopify.com/');
  assert.equal(chooseCandidate(p.images[0], 'mobile'), 'https://x/a-1100.jpg');
  assert.equal(chooseCandidate(p.images[0], 'desktop'), 'https://x/a-2000.jpg');
  assert.equal(chooseCandidate(p.images[1], 'mobile'), 'https://x/phone.jpg');
  assert.equal(chooseCandidate(p.images[1], 'desktop'), 'https://x/desk.jpg');
});

test('detects Shopify and the theme', () => {
  assert.equal(page.isShopify, true);
  assert.deepEqual(page.theme, { name: 'Dawn', schemaName: 'Dawn', schemaVersion: '15.3.0', themeStoreId: 887 });
});

test('finds external scripts, skips data scripts and commented-out tags', () => {
  assert.equal(page.scripts.length, 6);
  assert.ok(!page.scripts.some(s => s.src.includes('commented-out')));
  assert.equal(page.usesJquery, true);
});

test('marks only head scripts without async/defer as render-blocking', () => {
  const blocking = page.scripts.filter(s => s.blocking).map(s => new URL(s.src).hostname);
  assert.deepEqual(blocking, ['code.jquery.com', 'static.klaviyo.com']);
});

test('treats print stylesheets as non-blocking and resolves protocol-relative URLs', () => {
  assert.equal(page.stylesheets.length, 3);
  assert.equal(page.stylesheets.filter(s => s.blocking).length, 2);
  assert.ok(page.stylesheets[0].href.startsWith('https://example-store.myshopify.com/'));
});

test('collects images (ignoring data URIs), iframes, fonts and preloads', () => {
  assert.equal(page.images.length, 7);
  assert.equal(page.images[0].loading, 'lazy');
  assert.equal(page.images[0].hasSize, false);
  assert.equal(page.iframes.length, 1);
  assert.equal(page.fontFaces, 1);
  assert.deepEqual(page.preloads.map(p => p.as), ['font']);
  assert.equal(page.preconnects.length, 1);
});

test('knows which Shopify CDN image URLs are already resized', () => {
  assert.equal(isSizedShopifyImage('https://s.myshopify.com/cdn/shop/files/a.jpg?v=1&width=800'), true);
  assert.equal(isSizedShopifyImage('https://cdn.shopify.com/s/files/1/0/a_800x.jpg'), true);
  assert.equal(isSizedShopifyImage('https://s.myshopify.com/cdn/shop/files/hero.jpg?v=12'), false);
  assert.equal(isSizedShopifyImage('https://images.example.com/hero.jpg'), true);
});

test('names apps and separates them from the theme and platform', () => {
  const host = 'example-store.myshopify.com';
  assert.equal(identify('https://static.klaviyo.com/onsite/js/klaviyo.js', host).name, 'Klaviyo');
  assert.equal(identify('https://cdn.shopify.com/extensions/0193/reviews.js', host).kind, 'app');
  assert.equal(identify('https://cdn.shopify.com/shopifycloud/storefront/a.js', host).kind, 'platform');
  assert.equal(identify('https://example-store.myshopify.com/cdn/shop/t/4/assets/global.js', host).kind, 'theme');
  assert.equal(identify('https://unknown-widget.io/w.js', host).name, 'unknown-widget.io');
});
