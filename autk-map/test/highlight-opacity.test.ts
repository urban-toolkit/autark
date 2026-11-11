import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The fragment shaders cannot run in these tests (they need a GPU), so this only guards the source: each shader that
// draws a highlight must draw it opaque, and use that opacity for its output. The behavior itself was checked in
// Chrome by rendering a translucent layer with and without a highlight.
const shaders = ['triangle-01.frag.wgsl', 'buildings-01.frag.wgsl', 'sprite.frag.wgsl'];

describe.each(shaders)('%s', (file) => {
    const source = readFileSync(new URL(`../src/shaders/${file}`, import.meta.url), 'utf8');

    it('draws a highlighted feature at full opacity', () => {
        const branch = source.slice(source.indexOf('showHighlight >'));
        expect(branch.slice(0, branch.indexOf('}'))).toMatch(/drawOpacity\s*=\s*1\.0/);
    });

    it('outputs the draw opacity, not the layer opacity, for every feature', () => {
        expect(source).toMatch(/var drawOpacity\s*=\s*opacity;/);
        expect(source).toMatch(/\*\s*drawOpacity,\s*drawOpacity\)/);
        expect(source).not.toMatch(/\*\s*opacity,\s*opacity\)/);
    });
});
