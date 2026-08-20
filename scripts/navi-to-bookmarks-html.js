#!/usr/bin/env node
/**
 * Fetch navi tabs/groups and write a Netscape Bookmark HTML file
 * suitable for Chrome → Bookmarks → Import.
 *
 * Usage:
 *   node scripts/navi-to-bookmarks-html.js
 *   node scripts/navi-to-bookmarks-html.js -o /tmp/navi-bookmarks.html
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { toNetscapeHtml } from '../lib/navi-import.js';
import { fetchNaviTree } from '../lib/navi-fetch.js';

function parseArgs(argv) {
  let out = resolve('dist/navi-bookmarks.html');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '-o' || argv[i] === '--out') {
      out = resolve(argv[++i] || out);
    }
  }
  return { out };
}

async function main() {
  const { out } = parseArgs(process.argv.slice(2));
  console.log('Fetching navi API…');
  const tree = await fetchNaviTree();
  const html = toNetscapeHtml(tree);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, 'utf8');
  console.log(
    `Wrote ${out} — tabs=${tree.stats.tabs} groups=${tree.stats.groups} items=${tree.stats.items} skipped=${tree.skipped.length}`
  );
  if (tree.skipped.length) {
    /** @type {Record<string, number>} */
    const byReason = {};
    for (const s of tree.skipped) {
      byReason[s.reason] = (byReason[s.reason] || 0) + 1;
    }
    console.log('Skipped:', byReason);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
