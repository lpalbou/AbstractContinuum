#!/usr/bin/env node
/**
 * Every URL this app builds for its OWN origin must be relative, so the one
 * build works at `/` on its own port and at `/apps/<id>/` behind the gateway
 * (where a root-absolute "/api/…" or "/assets/…" escapes the app to the
 * gateway's root).
 *
 * Usage: node scripts/check_relative_urls.mjs <dir>...   (src, dist)
 * Prints one line per root-absolute URL found and exits 1; exits 0 when
 * clean. A directory that does not exist is an error, never a pass.
 *
 * Flagged, in .ts/.tsx/.js/.mjs/.html/.css files (tests excluded):
 *   - a string literal that starts with "/api/", "/assets/", "/app/" or "/demo/"
 *     ('…', "…", `…`, or a CSS url(…));
 *   - an HTML src/href attribute that is root-absolute ("/x", not "//x");
 *   - a template `${expr}/api/…` whose base is not `apiBase(…)` (a base that
 *     may be "" builds "/api/…" at run time).
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { extname, join, relative } from 'path';
import { pathToFileURL } from 'url';

const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.html', '.css']);
const LITERAL = /(["'`(])\/(api|assets|app|demo)\//g;
const HTML_ATTR = /\b(src|href)=["']\/(?!\/)[^"']*["']/g;
const TEMPLATE_BASE = /\$\{(?!apiBase\()[^}]*\}\/api\//g;

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules') continue;
      yield* files(p);
    } else if (EXTENSIONS.has(extname(name)) && !/\.test\.[a-z]+$/.test(name) && !name.endsWith('.map')) {
      yield p;
    }
  }
}

export function findRootAbsoluteUrls(dirs, cwd = process.cwd()) {
  const found = [];
  for (const dir of dirs) {
    if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new Error(`${dir}: no such directory (build first?)`);
    for (const file of files(dir)) {
      const text = readFileSync(file, 'utf8');
      const lines = text.split('\n');
      const patterns = extname(file) === '.html' ? [LITERAL, HTML_ATTR, TEMPLATE_BASE] : [LITERAL, TEMPLATE_BASE];
      lines.forEach((line, i) => {
        for (const re of patterns) {
          re.lastIndex = 0;
          let m;
          while ((m = re.exec(line))) {
            found.push(`${relative(cwd, file)}:${i + 1}: ${line.slice(Math.max(0, m.index - 30), m.index + 60).trim()}`);
          }
        }
      });
    }
  }
  return found;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dirs = process.argv.slice(2);
  if (!dirs.length) {
    console.error('usage: check_relative_urls.mjs <dir>...');
    process.exit(2);
  }
  let found;
  try {
    found = findRootAbsoluteUrls(dirs);
  } catch (e) {
    console.error(`check_relative_urls: ${e.message}`);
    process.exit(2);
  }
  for (const f of found) console.error(`FAIL root-absolute same-origin URL: ${f}`);
  if (found.length) {
    console.error(`${found.length} root-absolute URL(s): make them relative (see docs/architecture.md, "Serving under the gateway").`);
    process.exit(1);
  }
  console.log(`relative URLs only: ${dirs.join(', ')}`);
}
