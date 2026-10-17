// Reads the parts of a storefront's HTML that matter for speed: scripts, stylesheets, images, iframes,
// inline CSS, fonts and the Shopify theme. A small tag scanner is enough for this and keeps the tool
// dependency-free; it does not need to understand the whole document.

const TAG = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1\s*>|<(link|img|iframe|source)\b([^>]*?)\/?>/gi;
const ATTR = /([^\s=\/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;

const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
// Attribute values are HTML-escaped: "?v=1&amp;width=300" must become "?v=1&width=300" or Shopify's
// image CDN never sees the width parameter.
export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? all;
  });
}

export function parseAttributes(source) {
  const attrs = {};
  for (const m of source.matchAll(ATTR)) attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return attrs;
}

function resolve(url, base) {
  if (!url) return null;
  try { return new URL(url.trim(), base).href; } catch { return null; }
}

function readTheme(html) {
  const m = html.match(/Shopify\.theme\s*=\s*(\{[^;]*?\})\s*;/);
  if (!m) return null;
  try {
    const t = JSON.parse(m[1]);
    return { name: t.name ?? null, schemaName: t.schema_name ?? null, schemaVersion: t.schema_version ?? null, themeStoreId: t.theme_store_id ?? null };
  } catch { return null; }
}

export function parseHtml(rawHtml, pageUrl) {
  // Comments and <noscript> fallbacks never load in a normal browser, so leave them out
  const html = rawHtml.replace(/<!--[\s\S]*?-->/g, '').replace(/<noscript\b[\s\S]*?<\/noscript\s*>/gi, '');
  const headEnd = html.search(/<\/head\s*>/i);
  const inHead = index => headEnd === -1 || index < headEnd;

  const page = {
    isShopify: /cdn\.shopify\.com|Shopify\.theme|shopify-section/i.test(html),
    theme: readTheme(html),
    scripts: [],
    stylesheets: [],
    preloads: [],
    preconnects: [],
    images: [],
    iframes: [],
    inlineCssBytes: 0,
    inlineJsBytes: 0,
    fontFaces: 0,
    domNodes: (html.match(/<[a-zA-Z][^>]*>/g) || []).length,
    usesJquery: false,
  };

  let pictureSources = []; // <source> tags waiting for the <img> of their <picture>
  for (const m of html.matchAll(TAG)) {
    const tag = (m[1] || m[4]).toLowerCase();
    const attrs = parseAttributes(m[2] ?? m[5] ?? '');
    const body = m[3] ?? '';
    const head = inHead(m.index);

    if (tag === 'script') {
      const type = (attrs.type || '').toLowerCase();
      const isData = /json|template|text\/x-|speculationrules/.test(type);
      const src = resolve(attrs.src, pageUrl);
      if (src && /jquery/i.test(src)) page.usesJquery = true;
      if (!src) {
        if (!isData) page.inlineJsBytes += Buffer.byteLength(body);
        continue;
      }
      page.scripts.push({
        src,
        async: 'async' in attrs,
        defer: 'defer' in attrs,
        module: type === 'module',
        inHead: head,
        blocking: head && !('async' in attrs) && !('defer' in attrs) && type !== 'module' && !isData,
      });
    } else if (tag === 'style') {
      page.inlineCssBytes += Buffer.byteLength(body);
      page.fontFaces += (body.match(/@font-face/gi) || []).length;
    } else if (tag === 'link') {
      const rel = (attrs.rel || '').toLowerCase().split(/\s+/);
      const href = resolve(attrs.href, pageUrl);
      if (!href) continue;
      if (rel.includes('stylesheet')) {
        const media = (attrs.media || 'all').toLowerCase();
        page.stylesheets.push({ href, media, inHead: head, blocking: head && (media === 'all' || media === 'screen') && !('disabled' in attrs) });
      } else if (rel.includes('preload') || rel.includes('modulepreload')) {
        page.preloads.push({ href, as: attrs.as || (rel.includes('modulepreload') ? 'script' : '') });
      } else if (rel.includes('preconnect') || rel.includes('dns-prefetch')) {
        page.preconnects.push(href);
      }
    } else if (tag === 'source') {
      const set = attrs.srcset || attrs['data-srcset'];
      if (set) pictureSources.push({ media: (attrs.media || '').toLowerCase(), candidates: parseSrcset(set, pageUrl) });
    } else if (tag === 'img') {
      const src = resolve(attrs.src || attrs['data-src'], pageUrl);
      const sources = pictureSources;
      pictureSources = [];
      if (!src || src.startsWith('data:')) continue;
      page.images.push({
        src,
        order: page.images.length,
        srcset: Boolean(attrs.srcset || attrs['data-srcset'] || sources.length),
        candidates: parseSrcset(attrs.srcset || attrs['data-srcset'] || '', pageUrl),
        sources,
        hasSize: Boolean(attrs.width && attrs.height),
        width: parseInt(attrs.width, 10) || null,
        loading: (attrs.loading || '').toLowerCase(),
        fetchpriority: (attrs.fetchpriority || '').toLowerCase(),
        lazyByScript: Boolean(attrs['data-src'] || attrs['data-srcset']) || /lazyload/.test(attrs.class || ''),
      });
    } else if (tag === 'iframe') {
      const src = resolve(attrs.src || attrs['data-src'], pageUrl);
      if (src) page.iframes.push({ src, loading: (attrs.loading || '').toLowerCase() });
    }
  }
  return page;
}

// "a.jpg 400w, b.jpg 800w" → [{ url, width }]; density descriptors ("2x") keep width null
export function parseSrcset(srcset, base) {
  return srcset.split(/,\s+(?=\S)/).map(part => {
    const [url, desc = ''] = part.trim().split(/\s+/);
    const width = /^\d+w$/.test(desc) ? parseInt(desc, 10) : null;
    return { url: resolve(url, base), width };
  }).filter(c => c.url);
}

// The file a browser would pick for a full-width image. With width descriptors: the smallest that
// covers the target (about 1080px for a phone at 2.6x density, 1920px for desktop), else the largest.
// With density descriptors: the highest density, since phones are 2-3x screens.
function pick(candidates, device) {
  const target = device === 'desktop' ? 1920 : 1080;
  const sized = candidates.filter(c => c.width).sort((a, b) => a.width - b.width);
  if (sized.length) return (sized.find(c => c.width >= target) || sized[sized.length - 1]).url;
  return candidates[candidates.length - 1]?.url;
}

export function chooseCandidate(image, device = 'mobile') {
  // In a <picture>, the first <source> whose media query fits the device wins
  if (image.sources?.length) {
    const fits = s => !s.media || (device === 'desktop' ? !/max-width/.test(s.media) : !/min-width/.test(s.media));
    const source = image.sources.find(fits) || image.sources[0];
    const url = pick(source.candidates, device);
    if (url) return url;
  }
  return (image.candidates?.length && pick(image.candidates, device)) || image.src;
}

// Shopify's image CDN resizes on request. A URL with a width parameter or a size suffix is already
// scaled; one without may be the full original upload.
export function isSizedShopifyImage(src) {
  try {
    const u = new URL(src);
    if (!/cdn\.shopify\.com|\/cdn\/shop\//.test(u.href)) return true; // not Shopify's CDN, nothing to infer
    return u.searchParams.has('width') || u.searchParams.has('height') || /_(\d+x\d*|\d*x\d+)(?:_crop_\w+)?(?:@\dx)?\.\w+$/i.test(u.pathname);
  } catch { return true; }
}
