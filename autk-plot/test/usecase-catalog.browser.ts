/**
 * The transforms drawer of the provenance use case agrees with the registry
 * and with the charts of the page: every transform it lists is registered,
 * the 12 built-in ones are exactly those of the package, and the charts it
 * names are the charts that run them, plot defaults included.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import * as next from '../src';

import { TRANSFORMS, chartsByTransform } from '../../usecases/src/provenance/catalog';
import { BUILT_IN_TRANSFORM_TEMPLATES } from '../../usecases/src/provenance/lab-builtin-templates';
import { evaluateChart } from '../../usecases/src/provenance/lab-scope';
import { LAB_TEMPLATES } from '../../usecases/src/provenance/lab-transform-templates';
import { movingAverage } from '../../usecases/src/provenance/moving-average';
import { PLOTS, transformOfChart } from '../../usecases/src/provenance/plot';

describe('transforms drawer of the use case', () => {
    beforeAll(() => next.registerTransform(movingAverage));
    afterAll(() => next.unregisterTransform(movingAverage.name));

    test('lists the 12 built-in transforms of the package and the one the page registers, all in the registry', () => {
        const builtIns = BUILT_IN_TRANSFORM_TEMPLATES.map(template => (evaluateChart(template.code) as next.TransformDefinition).name);
        expect(TRANSFORMS.filter(entry => entry.origin === 'built-in').map(entry => entry.name).sort()).toEqual([...builtIns].sort());
        expect(TRANSFORMS.filter(entry => entry.origin === 'page').map(entry => entry.name)).toEqual([movingAverage.name]);
        for (const entry of TRANSFORMS) expect(() => next.registeredTransform(entry.name), entry.name).not.toThrow();
        // A built-in one cannot be removed; the page's one can.
        expect(() => next.unregisterTransform('sort')).toThrow(/built-in/);
    });

    test('names the charts that run each transform, the table sorting by default included', () => {
        const users = chartsByTransform();
        expect(users.get('sort')).toEqual(['table']);
        expect(users.get('moving-average')).toEqual(['area']);
        // Every chart that runs a transform is named under it, once.
        const named = [...users.values()].flat().sort();
        expect(named).toEqual(PLOTS.filter(plot => transformOfChart(plot)).map(plot => plot.div.slice(1)).sort());
        // Only reduce-series is unused here: the complaints carry no numeric series.
        expect([...users].filter(([, charts]) => charts.length === 0).map(([name]) => name)).toEqual(['reduce-series']);
    });

    test('each built-in transform has its code in Try it Yourself', () => {
        for (const entry of TRANSFORMS.filter(candidate => candidate.origin === 'built-in')) {
            const template = LAB_TEMPLATES.find(candidate => candidate.name === entry.name);
            expect(template, entry.name).toBeDefined();
            expect((evaluateChart(template!.code) as next.TransformDefinition).name).toBe(entry.name);
        }
    });
});
