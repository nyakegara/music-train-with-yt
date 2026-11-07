import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('keyboard focus styles', () => {
  it('shows a visible focus ring around the YouTube link field', () => {
    const stylesheet = readFileSync('src/renderer/ui/styles.css', 'utf8');

    expect(stylesheet).toMatch(/\.link-entry:focus-within\s*\{[^}]*outline\s*:\s*2px\s+solid\s+var\(--mint\)/);
  });
});
