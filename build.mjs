#!/usr/bin/env node
/**
 * Production build for Rise Component Builder.
 *
 * This project is intentionally framework-free and bundler-free (see
 * docs/ARCHITECTURE.md). "Build" therefore means: assemble exactly the
 * static files the browser needs into dist/, and verify every local
 * reference (index.html's <script>/<link> tags, and every relative ES
 * module import inside the copied JS) resolves to a file that was
 * actually copied — so a broken/missing file is caught here, before
 * deployment, rather than as a blank page on GitHub Pages.
 *
 * No bundling, minification, or transpilation is performed.
 */

import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { computeStampedIndex } from './scripts/stamp-cache-busting.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const distDir = join(root, 'dist');

const ROOT_FILES = ['index.html', 'styles.css', 'app.js', 'fonts.css', 'favicon.svg'];
const ROOT_DIRS = ['js', 'components'];

// Individual files outside the repo root that index.html references and that must
// ship in dist/ at the same relative path.
const NESTED_FILES = [
  'design/att-tokens.css',
  'design/landing.css',
  'design/post-publish.css',
  'design/dashboard.css',
  'design/project-overview.css'
];

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copySources() {
  await rm(distDir, { recursive: true, force: true });
  await mkdir(distDir, { recursive: true });

  for (const file of ROOT_FILES) {
    const source = join(root, file);
    if (!(await exists(source))) throw new Error(`Build source file is missing: ${file}`);
    await cp(source, join(distDir, file));
  }
  for (const dir of ROOT_DIRS) {
    const source = join(root, dir);
    if (!(await exists(source))) throw new Error(`Build source directory is missing: ${dir}`);
    await cp(source, join(distDir, dir), { recursive: true });
  }
  for (const file of NESTED_FILES) {
    const source = join(root, file);
    if (!(await exists(source))) throw new Error(`Build source file is missing: ${file}`);
    await mkdir(dirname(join(distDir, file)), { recursive: true });
    await cp(source, join(distDir, file));
  }

  // Deploy the cache-busted index.html: ?v=<token> on every local asset URL and
  // a generated import map covering the ES module graph (scripts/
  // stamp-cache-busting.mjs). This is derived from the root index.html, so the
  // build stays correct whether or not `npm run stamp` was run against the tree
  // first.
  const { token, stamped } = await computeStampedIndex();
  await writeFile(join(distDir, 'index.html'), stamped);
  return { token };
}

async function verifyHtmlReferences() {
  const html = await readFile(join(distDir, 'index.html'), 'utf8');
  const localRefs = [...html.matchAll(/(?:src|href)="(?!https?:|\/\/|data:|mailto:|#)([^"]+)"/g)].map(match => match[1]);
  const missing = [];
  for (const ref of localRefs) {
    // Strip the cache-busting ?v=<token> (and any hash) before resolving to a
    // real file on disk — stamp-cache-busting.mjs adds it to fonts.css /
    // styles.css / app.js.
    const path = ref.replace(/[?#].*$/, '');
    if (!(await exists(join(distDir, path)))) missing.push(ref);
  }
  return { checked: localRefs.length, missing };
}

async function collectJsFiles(dir, found = []) {
  const { readdir } = await import('node:fs/promises');
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) await collectJsFiles(full, found);
    else if (entry.name.endsWith('.js')) found.push(full);
  }
  return found;
}

async function verifyModuleImports() {
  const jsFiles = [
    join(distDir, 'app.js'),
    ...(await collectJsFiles(join(distDir, 'js'))),
    ...(await collectJsFiles(join(distDir, 'components')))
  ];
  const missing = [];
  let checked = 0;
  for (const file of jsFiles) {
    const source = await readFile(file, 'utf8');
    const specifiers = [...source.matchAll(/from\s+['"](\.[^'"]+)['"]/g)].map(match => match[1]);
    for (const specifier of specifiers) {
      checked += 1;
      const resolved = resolve(dirname(file), specifier);
      if (!(await exists(resolved))) missing.push(`${specifier} (imported by ${file.slice(distDir.length + 1)})`);
    }
  }
  return { checked, missing };
}

async function main() {
  const { token } = await copySources();
  const htmlCheck = await verifyHtmlReferences();
  const importCheck = await verifyModuleImports();

  const missing = [...htmlCheck.missing, ...importCheck.missing];
  if (missing.length) {
    console.error('Build verification failed. Missing local references:');
    missing.forEach(ref => console.error(`  - ${ref}`));
    process.exitCode = 1;
    return;
  }

  console.log(`Build assembled at ${distDir}`);
  console.log(`  ${ROOT_FILES.length} root files + ${ROOT_DIRS.length} directories copied`);
  console.log(`  cache-busting token: ?v=${token}`);
  console.log(`  ${htmlCheck.checked} index.html reference(s) verified`);
  console.log(`  ${importCheck.checked} local ES module import(s) verified`);
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
