#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runAudit, formatReport } from '../src/index.js';

const HELP = `Usage: shopify-speed-audit <store-url> [options]

Checks one Shopify storefront page for the usual speed problems: render-blocking
scripts, app bloat, heavy or lazy hero images, layout shift, fonts and page size.

Options
  --desktop      audit as a desktop browser (default: phone)
  --images <n>   how many images to weigh (default: 12)
  --no-assets    skip asset size lookups (faster, fewer findings)
  --json         print the full result as JSON
  --fail-under <score>
                 exit with code 1 when the score is below this (for CI)
  -h, --help     show this help
  -v, --version  show the version

Examples
  npx github:Necromancervbh/shopify-speed-audit mystore.com
  shopify-speed-audit https://mystore.com/products/hoodie --desktop
  shopify-speed-audit mystore.com --json > report.json`;

const args = process.argv.slice(2);
const has = flag => args.includes(flag);
const value = flag => { const i = args.indexOf(flag); return i >= 0 ? args[i + 1] : undefined; };

if (has('-h') || has('--help') || !args.length) {
  console.log(HELP);
  process.exit(args.length ? 0 : 1);
}
if (has('-v') || has('--version')) {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  console.log(pkg.version);
  process.exit(0);
}

const takesValue = new Set(['--images', '--fail-under']);
const url = args.find((a, i) => !a.startsWith('-') && !takesValue.has(args[i - 1]));

try {
  const result = await runAudit(url, {
    device: has('--desktop') ? 'desktop' : 'mobile',
    images: Number(value('--images') ?? 12),
    assets: !has('--no-assets'),
  });
  console.log(has('--json') ? JSON.stringify(result, null, 2) : formatReport(result));
  const failUnder = value('--fail-under');
  if (failUnder !== undefined && result.score < Number(failUnder)) process.exit(1);
} catch (e) {
  console.error(`shopify-speed-audit: ${e.cause?.code === 'ENOTFOUND' ? `could not reach ${url}` : e.message}`);
  process.exit(2);
}
