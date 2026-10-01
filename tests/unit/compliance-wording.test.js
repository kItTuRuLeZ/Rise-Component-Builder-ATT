import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// 30 September 2026 audit, section 1: automated checks must not be presented as proof of
// compliance. "100% Compliant", "Pillars Verified" and "Built for WCAG 2.2 AA" read as a
// certificate that automated rules cannot give; the interface describes WCAG 2.2 AA as a design
// target and a passing check as "Automated checks passed". (The Course QA view was fixed the
// same way earlier, see readiness-no-percentage.test.js.)

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function sourceFiles(dir) {
  const entries = await readdir(join(repoRoot, dir), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await sourceFiles(rel));
    else if (entry.isFile() && /\.(js|mjs)$/.test(entry.name)) files.push(rel);
  }
  return files;
}

// Absolute claims an automated check cannot back up.
const BANNED = [
  [/100%\s*compliant/i, '"100% Compliant"'],
  [/pillars? verified/i, '"Pillars Verified"'],
  [/(?:built|designed) for WCAG/i, '"Built/Designed for WCAG" (it is a design target)'],
  [/fully (?:wcag[- ])?compliant/i, '"fully compliant"'],
  [/wcag[^.\n]{0,24}\b(?:certified|compliant)\b/i, 'a WCAG "certified/compliant" claim'],
  [/ready for rise\b/i, '"ready for Rise" (a clean automated pass is not Rise compatibility)']
];

describe('user-facing wording does not overclaim compliance', () => {
  test('no banned absolute claim appears in a user-facing string', async () => {
    const files = [...await sourceFiles('js'), ...await sourceFiles('components'), 'app.js'];
    const found = [];
    for (const file of files) {
      // Sample course content (presets) is demonstration text about fictional training, not a
      // claim this tool makes about its own checks.
      if (file === 'js/presets.js') continue;
      const lines = (await readFile(join(repoRoot, file), 'utf8')).split('\n');
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') || trimmed.startsWith('<!--')) return;
        for (const [pattern, label] of BANNED) {
          if (pattern.test(line)) found.push(`${file}:${index + 1}: ${label}`);
        }
      });
    }
    expect(found).toEqual([]);
  });

  test('the Preflight scope statement names what automated checks cannot certify', async () => {
    const app = await readFile(join(repoRoot, 'app.js'), 'utf8');
    expect(app).toContain('cannot certify WCAG conformance or Rise 360 compatibility');
    expect(app).toContain('Automated checks passed');
  });
});
