# shopify-speed-audit

A small command-line tool that checks a Shopify storefront page for the usual speed problems and tells you, in plain English, what to fix first.

It looks at what a phone actually downloads: render-blocking scripts, app and tracking scripts, the hero image, image weight and sizing, layout shift, iframes, fonts and page size. It names common Shopify apps (Klaviyo, Judge.me, Meta Pixel and others) so you can see which ones cost the most.

No install and no dependencies. Node 18.17 or newer.

```bash
npx github:Necromancervbh/shopify-speed-audit yourstore.com
```

## Example

Shopify's own Dawn demo store, which is built to be fast:

```text
Shopify speed audit  https://theme-dawn-demo.myshopify.com/
  Theme: Dawn (Dawn 15.0.0)
  17 scripts, 42 stylesheets, 25 images, 1 iframes

  Score 99/100 (A)  heuristic, for prioritising fixes; not a Lighthouse score

  ! Embedded iframes  1 load immediately
      · youtube.com/embed/yXWXFzjVnt8
      Video and map embeds load a lot of code. Add loading="lazy", or show a thumbnail that
      loads the player on click.

  ✓ Render-blocking scripts  0 in <head> without async or defer
  ✓ App and third-party scripts  1 scripts from 1 sources, 0.9 KB
  ✓ Server response time  424 ms to first byte
  ✓ Hero image loading  first images load eagerly
  ✓ HTML size  40 KB compressed (242 KB raw)
  ✓ Render-blocking stylesheets  2 files, 12 KB
  ✓ Image weight  largest of 12 checked: 199 KB
  ...

  Start with
  1. Embedded iframes (1 load immediately)
```

On a typical customised store the same run surfaces things like a 4.6 MB PNG near the top of the page, a lazy-loaded hero image, two theme scripts blocking the first paint and 4,000 HTML elements, each with the file names involved and the fix.

## What it checks

| Check | Why it matters |
|---|---|
| Server response time | A slow first byte on Shopify usually means heavy Liquid or apps injecting into `content_for_header` |
| HTML size and page complexity | Large inline JSON and stacked sections slow every later step |
| Render-blocking scripts | Scripts in `<head>` without `async`/`defer` stop the page from drawing |
| Render-blocking stylesheets | Count and total size of CSS the browser must load first |
| App and third-party scripts | Grouped by app, with the transfer size of each |
| jQuery | Modern themes don't need it; old apps and snippets often still load it |
| Hero image loading | Lazy-loading the first large image delays Largest Contentful Paint |
| Image weight | Measures the file a phone downloads, following `srcset` and `<picture>` |
| Images without width and height | The cause of layout shift (CLS) |
| Responsive images | Shopify CDN images served without a size or `srcset` |
| Below-the-fold images, iframes | Things that should be lazy-loaded but aren't |
| Web fonts, inline CSS | Too many font files, missing `font-display: swap`, oversized inline styles |

## Options

```text
shopify-speed-audit <store-url> [options]

  --desktop             audit as a desktop browser (default: phone)
  --images <n>          how many images to weigh (default: 12)
  --no-assets           skip asset size lookups (faster, fewer findings)
  --json                print the full result as JSON
  --fail-under <score>  exit with code 1 when the score is below this
```

Audit any page, not just the homepage:

```bash
npx github:Necromancervbh/shopify-speed-audit yourstore.com/products/linen-shirt --desktop
```

### In CI

Fail a theme deploy when the homepage drops below a score:

```bash
npx github:Necromancervbh/shopify-speed-audit yourstore.com --fail-under 80
```

### From code

```bash
npm install github:Necromancervbh/shopify-speed-audit
```

```js
import { runAudit, formatReport } from 'shopify-speed-audit';

const result = await runAudit('yourstore.com', { device: 'mobile' });
console.log(result.score, result.findings.filter(f => f.status !== 'pass'));
```

## How the score works

Each check has a weight. A failed check loses its full weight and a warning loses half. The score is a quick way to rank what to fix. It is **not** a Lighthouse score or a Core Web Vitals measurement: for those, use PageSpeed Insights and the Web Performance report in Shopify admin.

## Limitations

- It reads the HTML the server sends. Scripts that a tag manager or another script injects later aren't counted.
- Asset sizes come from `HEAD` requests; a few hosts don't report them.
- It checks one page per run. Product, collection and cart pages often behave differently from the homepage, so audit those too.
- Password-protected stores return the password page.

## Development

```bash
npm test
```

The tests run against a fixture store page and a local HTTP server, so they don't need the internet.

## Need the fixes done?

I'm a Shopify and frontend developer, and I fix the issues this tool finds: speed, mobile layout, custom sections and full store builds. You can hire me on [Fiverr](https://www.fiverr.com/vaibhavshukl11) or [Upwork](https://www.upwork.com/freelancers/~01e34c5fa04da53175).

## License

MIT © Vaibhav Shukla
