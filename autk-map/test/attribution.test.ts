import { describe, expect, it } from 'vitest';
import { createAttributionElement, isHttpUrl, mergeCredits, normalizeAttribution } from '../src/attribution';
import type { AttributionDocument } from '../src/attribution';

// A document that builds a plain object tree, enough to read back what was created.
interface FakeNode { tag?: string; text?: string; textContent?: string; className?: string; href?: string; target?: string; rel?: string; style: Record<string, string>; children: FakeNode[]; appendChild(n: FakeNode): FakeNode }
function fakeDocument(): AttributionDocument {
  const node = (props: Partial<FakeNode>): FakeNode => ({
    style: {}, children: [], ...props,
    appendChild(child) { this.children.push(child); return child; },
  });
  return {
    createElement: (tag: string) => node({ tag }) as unknown as HTMLElement,
    createTextNode: (text: string) => node({ text }) as unknown as Node,
  };
}
const asNode = (el: HTMLElement | null) => el as unknown as FakeNode;

describe('isHttpUrl', () => {
  it.each(['https://www.openstreetmap.org/copyright', 'http://example.org/a?b=1'])('accepts %s', (url) => {
    expect(isHttpUrl(url)).toBe(true);
  });
  it.each(['javascript:alert(1)', 'data:text/html,<b>x', 'ftp://example.org', '//example.org', 'example.org', '', 'not a url'])('rejects %s', (url) => {
    expect(isHttpUrl(url)).toBe(false);
  });
});

describe('normalizeAttribution', () => {
  it('turns every accepted form into a list', () => {
    expect(normalizeAttribution('© A')).toEqual([{ text: '© A' }]);
    expect(normalizeAttribution({ text: '© A', url: 'https://a.example' })).toEqual([{ text: '© A', url: 'https://a.example' }]);
    expect(normalizeAttribution(['© A', { text: '© B' }])).toEqual([{ text: '© A' }, { text: '© B' }]);
  });

  it('rejects missing text and unsafe links', () => {
    expect(() => normalizeAttribution('')).toThrow(/attribution/);
    expect(() => normalizeAttribution([])).toThrow(/attribution/);
    expect(() => normalizeAttribution({ text: 'x', url: 'javascript:alert(1)' })).toThrow(/http or https/);
    expect(() => normalizeAttribution(undefined as never)).toThrow(/attribution/);
  });
});

describe('mergeCredits', () => {
  it('drops repeats and keeps the first order', () => {
    const merged = mergeCredits([[{ text: 'A' }, { text: 'B', url: 'https://b.example' }], [{ text: 'B', url: 'https://b.example' }, { text: 'C' }]]);
    expect(merged.map((c) => c.text)).toEqual(['A', 'B', 'C']);
  });
});

describe('createAttributionElement', () => {
  it('shows nothing for no credits', () => {
    expect(createAttributionElement(fakeDocument(), [])).toBeNull();
  });

  it('makes a link for a credit with a URL and text for one without, separated by bars', () => {
    const root = asNode(createAttributionElement(fakeDocument(), [
      { text: '© OpenStreetMap contributors', url: 'https://www.openstreetmap.org/copyright' },
      { text: 'Source: Esri' },
    ]));
    expect(root.className).toBe('autk-map-attribution');
    expect(root.children.map((c) => c.tag ?? c.text)).toEqual(['a', ' | ', 'Source: Esri']);
    const link = root.children[0]!;
    expect(link).toMatchObject({
      textContent: '© OpenStreetMap contributors',
      href: 'https://www.openstreetmap.org/copyright',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
  });

  it('takes pointer events itself, because the overlay around it ignores them', () => {
    expect(asNode(createAttributionElement(fakeDocument(), [{ text: 'x' }])).style.pointerEvents).toBe('auto');
  });

  it('shows a credit whose link is not http(s) as plain text', () => {
    const root = asNode(createAttributionElement(fakeDocument(), [{ text: 'bad', url: 'javascript:alert(1)' }]));
    expect(root.children).toHaveLength(1);
    expect(root.children[0]).toMatchObject({ text: 'bad' });
    expect(root.children[0]!.href).toBeUndefined();
  });

  it('passes credit text as text, never as markup', () => {
    const root = asNode(createAttributionElement(fakeDocument(), [{ text: '<img src=x onerror=alert(1)>' }]));
    expect(root.children[0]!.tag).toBeUndefined();
    expect(root.children[0]!.text).toBe('<img src=x onerror=alert(1)>');
  });
});
