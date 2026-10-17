// Network helpers: load the page with a phone or desktop browser's user agent, time it, and look up
// asset sizes without downloading more than needed.
import { gzipSync } from 'node:zlib';

const UA = {
  mobile: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
};

export async function fetchPage(url, { device = 'mobile', timeout = 20000 } = {}) {
  const started = performance.now();
  const res = await fetch(url, {
    headers: { 'user-agent': UA[device], accept: 'text/html,application/xhtml+xml', 'accept-language': 'en' },
    redirect: 'follow',
    signal: AbortSignal.timeout(timeout),
  });
  const ttfb = performance.now() - started;
  const html = await res.text();
  const total = performance.now() - started;
  return {
    url: res.url,
    status: res.status,
    ttfb: Math.round(ttfb),
    loadMs: Math.round(total),
    htmlBytes: Buffer.byteLength(html),
    htmlGzipBytes: gzipSync(html).length,
    poweredByShopify: /shopify/i.test(res.headers.get('powered-by') || '') || res.headers.has('x-shopid') || res.headers.has('x-shopify-stage'),
    html,
  };
}

// Transfer size of one asset. HEAD is enough on Shopify's CDN; some hosts ignore HEAD, so fall back to a
// ranged GET and read the total from Content-Range.
export async function assetSize(url, { timeout = 10000 } = {}) {
  try {
    const head = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(timeout), headers: { 'accept-encoding': 'gzip, br' } });
    const len = Number(head.headers.get('content-length'));
    if (head.ok && len > 0) return { bytes: len, type: head.headers.get('content-type') || '' };
    const ranged = await fetch(url, { headers: { range: 'bytes=0-0' }, redirect: 'follow', signal: AbortSignal.timeout(timeout) });
    const total = Number((ranged.headers.get('content-range') || '').split('/')[1]);
    await ranged.body?.cancel();
    return { bytes: total > 0 ? total : null, type: ranged.headers.get('content-type') || '' };
  } catch {
    return { bytes: null, type: '' };
  }
}

// Run async jobs with a small concurrency cap, keeping the input order
export async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}
