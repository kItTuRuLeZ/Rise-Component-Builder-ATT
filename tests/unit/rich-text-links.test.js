import { describe, expect, test } from 'vitest';
import { sanitizeRichText } from '../../js/utilities.js';

// A link whose address contains "id=", "name=" or a word starting "on" ("?online=1") was treated as an
// unsafe attribute and printed as literal text. The check must look at attribute names, not at the text
// inside a quoted value.

const link = href => `<a href="${href}" target="_blank" rel="noopener noreferrer">t</a>`;

describe('links keep working whatever their query string says', () => {
  test.each([
    'https://example.org/page?id=5',
    'https://example.org/page?name=a&online=1',
    'https://example.org/page?section=2&onboarding=yes',
    'https://example.sharepoint.com/:w:/r/sites/x/doc.aspx?d=w123&csf=1&web=1'
  ])('%s stays a link that opens in a new tab', href => {
    const out = sanitizeRichText(link(href));
    expect(out.startsWith('<a href="')).toBe(true);
    expect(out).toContain('target="_blank"');
    expect(out).toContain('rel="noopener noreferrer"');
    expect(out).not.toContain('&lt;a');
  });
});

describe('unsafe markup is still neutralised', () => {
  test.each([
    '<a href="https://example.org/" onclick="alert(1)">t</a>',
    '<a href="https://example.org/" id="x">t</a>',
    '<a href="https://example.org/" name="x">t</a>',
    '<span id="x">t</span>',
    '<span onclick="x()">t</span>',
    '<span onmouseover="x()">t</span>'
  ])('%s is escaped, not rendered', markup => {
    const out = sanitizeRichText(markup);
    expect(out).toContain('&lt;');
    expect(out).not.toMatch(/<(?:a|span)\s[^>]*(?:onclick|onmouseover|id=|name=)/i);
  });

  test('a javascript: address never becomes a link', () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">t</a>')).not.toContain('href=');
  });
});
