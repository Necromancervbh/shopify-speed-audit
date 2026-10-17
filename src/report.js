// Formats an audit for the terminal: problems first, each with its evidence and the fix.
const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = code => s => (useColor ? `\x1b[${code}m${s}\x1b[0m` : s);
const red = paint('31'), yellow = paint('33'), green = paint('32'), dim = paint('2'), bold = paint('1');

const MARK = { fail: red('✗'), warn: yellow('!'), pass: green('✓') };
const ORDER = { fail: 0, warn: 1, pass: 2 };

function wrap(text, width, indent) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > width) { lines.push(line); line = w; } else line = (line + ' ' + w).trim();
  }
  if (line) lines.push(line);
  return lines.map(l => indent + l).join('\n');
}

export function formatReport(r) {
  const out = [];
  const gradeColor = r.grade === 'A' || r.grade === 'B' ? green : r.grade === 'C' ? yellow : red;
  out.push('');
  out.push(bold('Shopify speed audit') + dim(`  ${r.url}`));
  if (!r.isShopify) out.push(yellow('  This page does not look like a Shopify storefront; Shopify-specific advice may not apply.'));
  if (r.theme) out.push(dim(`  Theme: ${r.theme.name}${r.theme.schemaName ? ` (${r.theme.schemaName}${r.theme.schemaVersion ? ' ' + r.theme.schemaVersion : ''})` : ''}`));
  out.push(dim(`  ${r.counts.scripts} scripts, ${r.counts.stylesheets} stylesheets, ${r.counts.images} images, ${r.counts.iframes} iframes`));
  out.push('');
  out.push(`  Score ${gradeColor(bold(`${r.score}/100 (${r.grade})`))}  ${dim('heuristic, for prioritising fixes; not a Lighthouse score')}`);
  out.push('');

  const sorted = [...r.findings].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.weight - a.weight);
  for (const f of sorted) {
    out.push(`  ${MARK[f.status]} ${bold(f.title)}  ${dim(f.value)}`);
    if (f.status !== 'pass') {
      for (const d of f.detail.slice(0, 6)) out.push(dim(`      · ${d}`));
      out.push(wrap(f.fix, 86, '      '));
      out.push('');
    }
  }

  const todo = sorted.filter(f => f.status !== 'pass').slice(0, 3);
  if (todo.length) {
    out.push('');
    out.push(bold('  Start with'));
    todo.forEach((f, i) => out.push(`  ${i + 1}. ${f.title} ${dim(`(${f.value})`)}`));
  } else {
    out.push('', green('  Nothing obvious to fix. Check real-user Core Web Vitals in Shopify Analytics next.'));
  }
  out.push('');
  return out.join('\n');
}
