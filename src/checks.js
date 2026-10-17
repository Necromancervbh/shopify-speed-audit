// Turns a fetched and parsed storefront page into findings, each with a status, the evidence and a fix.
// The score is a weighted heuristic for prioritising work, not a Lighthouse or Core Web Vitals score.
import { identify } from './apps.js';
import { isSizedShopifyImage } from './parse.js';

const kb = n => (n / 1024).toFixed(n < 10240 ? 1 : 0) + ' KB';
const short = url => { try { const u = new URL(url); return (u.hostname + u.pathname).replace(/^www\./, '').slice(0, 90); } catch { return url.slice(0, 90); } };

function grade(score) {
  return score >= 90 ? 'A' : score >= 80 ? 'B' : score >= 65 ? 'C' : score >= 50 ? 'D' : 'F';
}

// pass, warn or fail against two thresholds (lower values are better)
const band = (value, warnAt, failAt) => (value > failAt ? 'fail' : value > warnAt ? 'warn' : 'pass');

export function audit(fetched, page, sizes = {}) {
  const host = new URL(fetched.url).hostname;
  const findings = [];
  const add = (id, weight, status, title, value, fix, detail = []) => findings.push({ id, weight, status, title, value, fix, detail });

  add('server-response', 10, band(fetched.ttfb, 600, 1200), 'Server response time', `${fetched.ttfb} ms to first byte`,
    'Shopify serves pages from its own CDN, so a slow first byte usually means heavy Liquid: long loops over products, many sections on one page, or apps that inject into content_for_header. Trim the template and remove unused apps.');

  add('html-size', 8, band(fetched.htmlGzipBytes, 60 * 1024, 120 * 1024), 'HTML size', `${kb(fetched.htmlGzipBytes)} compressed (${kb(fetched.htmlBytes)} raw)`,
    'Big HTML usually comes from inline JSON (product data, app settings) and stacked sections. Remove sections and apps you no longer use, and avoid rendering every variant or collection on one page.');

  add('dom-size', 6, band(page.domNodes, 1500, 3000), 'Page complexity', `${page.domNodes.toLocaleString()} HTML elements`,
    'A large DOM slows rendering and every script that touches the page. Cut duplicate desktop and mobile markup, mega-menus with hundreds of links and hidden sections.');

  const blockingJs = page.scripts.filter(s => s.blocking);
  add('blocking-scripts', 14, band(blockingJs.length, 0, 2), 'Render-blocking scripts', `${blockingJs.length} in <head> without async or defer`,
    'Each of these stops the browser from drawing the page until it downloads and runs. Add defer to theme scripts, and move app scripts to app embeds or load them after the page is interactive.',
    blockingJs.map(s => short(s.src)));

  const blockingCss = page.stylesheets.filter(s => s.blocking);
  const cssBytes = blockingCss.reduce((t, s) => t + (sizes[s.href]?.bytes || 0), 0);
  const cssStatus = blockingCss.length > 6 || cssBytes > 250 * 1024 ? 'fail' : blockingCss.length > 3 || cssBytes > 100 * 1024 ? 'warn' : 'pass';
  add('blocking-css', 8, cssStatus, 'Render-blocking stylesheets', `${blockingCss.length} files${cssBytes ? `, ${kb(cssBytes)}` : ''}`,
    'Combine theme stylesheets, load section-specific CSS only on the templates that use it, and drop app CSS for apps that are disabled.',
    blockingCss.map(s => short(s.href) + (sizes[s.href]?.bytes ? `  ${kb(sizes[s.href].bytes)}` : '')));

  // Third-party and app scripts, grouped by who ships them
  const groups = new Map();
  for (const s of page.scripts) {
    const who = identify(s.src, host);
    if (who.kind !== 'third-party' && who.kind !== 'app') continue;
    const g = groups.get(who.name) || { name: who.name, category: who.category, scripts: 0, bytes: 0 };
    g.scripts++;
    g.bytes += sizes[s.src]?.bytes || 0;
    groups.set(who.name, g);
  }
  const thirdParty = [...groups.values()].sort((a, b) => b.bytes - a.bytes || b.scripts - a.scripts);
  const tpScripts = thirdParty.reduce((t, g) => t + g.scripts, 0);
  const tpBytes = thirdParty.reduce((t, g) => t + g.bytes, 0);
  add('third-party', 14, band(tpScripts, 6, 15), 'App and third-party scripts', `${tpScripts} scripts from ${thirdParty.length} sources${tpBytes ? `, ${kb(tpBytes)}` : ''}`,
    'Apps are the most common cause of slow Shopify stores. Uninstall apps you no longer use (uninstalling does not always remove their code, so check the theme too), and replace overlapping apps with one.',
    thirdParty.slice(0, 10).map(g => `${g.name} (${g.category}): ${g.scripts} script${g.scripts > 1 ? 's' : ''}${g.bytes ? `, ${kb(g.bytes)}` : ''}`));

  add('jquery', 3, page.usesJquery ? 'warn' : 'pass', 'jQuery', page.usesJquery ? 'loaded' : 'not loaded',
    'Current Shopify themes do not need jQuery. If an app or old snippet loads it, removing it saves a download and its parse time.');

  const imgs = page.images;
  const noSize = imgs.filter(i => !i.hasSize);
  add('image-dimensions', 6, noSize.length <= 2 ? 'pass' : noSize.length / Math.max(imgs.length, 1) > 0.25 ? 'fail' : 'warn',
    'Images without width and height', `${noSize.length} of ${imgs.length}`,
    'Without width and height the page jumps as images load (layout shift). Shopify\'s image_tag filter adds them for you.',
    noSize.slice(0, 6).map(i => short(i.src)));

  // The hero is one of the first large images; small ones early in the HTML are usually logos or
  // mega-menu thumbnails that are rightly lazy.
  const hero = imgs.filter(i => !i.width || i.width >= 400).slice(0, 2).filter(i => i.loading === 'lazy' || i.lazyByScript);
  add('lcp-image-lazy', 10, hero.length ? 'fail' : 'pass', 'Hero image loading', hero.length ? 'an image at the top of the page is lazy-loaded' : 'first images load eagerly',
    'If this is the large image shoppers see first (usually the Largest Contentful Paint), lazy-loading it delays the moment the page looks ready. Load it eagerly with fetchpriority="high"; keep lazy-loading for images further down.',
    hero.map(i => short(i.src)));

  const offscreen = imgs.slice(4).filter(i => i.loading !== 'lazy' && !i.lazyByScript);
  add('offscreen-lazy', 5, offscreen.length <= 2 ? 'pass' : 'warn', 'Below-the-fold images', `${offscreen.length} load eagerly`,
    'Images further down the page should use loading="lazy" so they do not compete with what the shopper sees first.');

  const unsized = imgs.filter(i => !i.srcset && !isSizedShopifyImage(i.src));
  add('responsive-images', 5, unsized.length ? 'warn' : 'pass', 'Responsive images', unsized.length ? `${unsized.length} without srcset or a size` : 'all sized or responsive',
    'Shopify can resize any image on request. Use image_url with a width and a srcset so phones download a phone-sized file instead of the original upload.',
    unsized.slice(0, 6).map(i => short(i.src)));

  const measured = imgs.map(i => ({ ...i, src: i.download || i.src, bytes: sizes[i.download || i.src]?.bytes })).filter(i => i.bytes);
  const heaviest = measured.sort((a, b) => b.bytes - a.bytes);
  const top = heaviest[0]?.bytes || 0;
  add('heavy-images', 8, band(top, 200 * 1024, 400 * 1024), 'Image weight', heaviest.length ? `largest of ${heaviest.length} checked: ${kb(top)}` : 'not measured',
    'Compress images before upload and serve them at the size they display. A hero rarely needs more than 200 KB on a phone.',
    heaviest.slice(0, 5).filter(i => i.bytes > 150 * 1024).map(i => `${short(i.src)}  ${kb(i.bytes)}`));

  const eagerFrames = page.iframes.filter(f => f.loading !== 'lazy');
  add('iframes', 3, eagerFrames.length ? 'warn' : 'pass', 'Embedded iframes', eagerFrames.length ? `${eagerFrames.length} load immediately` : `${page.iframes.length} found, all lazy`,
    'Video and map embeds load a lot of code. Add loading="lazy", or show a thumbnail that loads the player on click.',
    eagerFrames.slice(0, 4).map(f => short(f.src)));

  const fontPreloads = page.preloads.filter(p => p.as === 'font').length;
  const gFonts = page.stylesheets.filter(s => /fonts\.googleapis\.com/.test(s.href));
  const gNoSwap = gFonts.filter(s => !/display=swap/.test(s.href)).length;
  const fontStatus = fontPreloads > 4 || page.fontFaces > 10 || gNoSwap ? 'warn' : 'pass';
  add('fonts', 4, fontStatus, 'Web fonts', `${page.fontFaces} @font-face rules, ${fontPreloads} preloaded${gFonts.length ? `, ${gFonts.length} Google Fonts stylesheet${gFonts.length > 1 ? 's' : ''}` : ''}`,
    'Use two font families at most, preload only the one used above the fold, and make sure text shows while fonts load (font-display: swap).');

  add('inline-css', 3, band(page.inlineCssBytes, 50 * 1024, 120 * 1024), 'Inline CSS', kb(page.inlineCssBytes),
    'Some inline CSS is good for the first paint, but sections that each inline their own styles add up. Move repeated styles into the theme stylesheet.');

  const lost = findings.reduce((t, f) => t + (f.status === 'fail' ? f.weight : f.status === 'warn' ? f.weight / 2 : 0), 0);
  const score = Math.max(0, Math.round(100 - lost));
  return {
    url: fetched.url,
    status: fetched.status,
    isShopify: page.isShopify || fetched.poweredByShopify,
    theme: page.theme,
    score,
    grade: grade(score),
    counts: { scripts: page.scripts.length, stylesheets: page.stylesheets.length, images: imgs.length, iframes: page.iframes.length },
    thirdParty,
    findings,
  };
}
