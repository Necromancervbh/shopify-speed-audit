// Library entry point: fetch a storefront page, measure its assets and return the audit.
import { fetchPage, assetSize, mapLimit } from './fetch.js';
import { parseHtml, chooseCandidate } from './parse.js';
import { audit } from './checks.js';

export { parseHtml } from './parse.js';
export { audit } from './checks.js';
export { formatReport } from './report.js';

export function normalizeUrl(input) {
  const s = String(input || '').trim();
  if (!s) throw new Error('Give a store URL, for example: shopify-speed-audit mystore.com');
  const url = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`);
  if (!/^https?:$/.test(url.protocol)) throw new Error(`Unsupported URL: ${s}`);
  return url.href;
}

export async function runAudit(input, { device = 'mobile', images = 12, assets = true, timeout = 20000 } = {}) {
  const fetched = await fetchPage(normalizeUrl(input), { device, timeout });
  if (fetched.status >= 400) throw new Error(`The page answered with HTTP ${fetched.status}`);
  const page = parseHtml(fetched.html, fetched.url);

  // Weigh the file the browser would actually download for each image, not the fallback src
  for (const img of page.images) img.download = chooseCandidate(img, device);

  const sizes = {};
  if (assets) {
    const urls = [...new Set([
      ...page.scripts.map(s => s.src),
      ...page.stylesheets.map(s => s.href),
      ...page.images.slice(0, images).map(i => i.download),
    ])];
    const results = await mapLimit(urls, 8, url => assetSize(url));
    urls.forEach((u, i) => { sizes[u] = results[i]; });
  }
  return { ...audit(fetched, page, sizes), timing: { ttfb: fetched.ttfb, loadMs: fetched.loadMs }, device };
}
