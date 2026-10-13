import { describe, expect, it } from 'vitest';
import { valueAtPath } from '../src/utils-data';

describe('valueAtPath', () => {
    it('resolves literal dotted join keys through nested namespaces', () => {
        const row = { sjoin: { avg: { 'shadows.jun': 12, 'lst.band_1': 0 } } };
        expect(valueAtPath(row, 'sjoin.avg.shadows.jun')).toBe(12);
        expect(valueAtPath(row, 'sjoin.avg.lst.band_1')).toBe(0);
        expect(valueAtPath({ properties: row }, 'properties.sjoin.avg.shadows.jun')).toBe(12);
        expect(valueAtPath(row, 'sjoin.avg.shadows.sep')).toBeUndefined();
    });

    it('preserves ordinary nested paths, array indices, null, false and zero', () => {
        const row = { a: { values: [0, false, null, 42] } };
        expect(valueAtPath(row, 'a.values.0')).toBe(0);
        expect(valueAtPath(row, 'a.values.1')).toBe(false);
        expect(valueAtPath(row, 'a.values.2')).toBeNull();
        expect(valueAtPath(row, 'a.values.3')).toBe(42);
        expect(valueAtPath(row, 'a.values.length')).toBe(4);
    });

    it('prefers fully resolved nested paths when literal dotted keys are ambiguous', () => {
        expect(valueAtPath({ a: { b: 2 }, 'a.b': 1 }, 'a.b')).toBe(2);
        expect(valueAtPath({ a: { b: undefined }, 'a.b': 1 }, 'a.b')).toBeUndefined();
    });

    it('can resolve an own literal suffix when an ordinary branch is incomplete', () => {
        expect(valueAtPath({ a: { b: null, 'b.c': 3 } }, 'a.b.c')).toBe(3);
        expect(valueAtPath({ 'a.b': 4 }, 'a.b')).toBe(4);
    });

    it.each([null, undefined, 0, 'text', {}, { a: null }])('returns undefined for missing paths in %j', row => {
        expect(valueAtPath(row, 'a.b')).toBeUndefined();
    });
});
