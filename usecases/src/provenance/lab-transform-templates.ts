/**
 * Starting points of Try it Yourself (transform). Each one is the body of a
 * function of `d3`, `autk` and `core` (`lab-scope.ts`) that returns a
 * transform definition. Two groups:
 * - examples: transforms a developer might write, built from the public
 *   blocks of the package (`collectBuckets`, `binnedProvenance`…);
 * - the 12 built-in transforms: the very code autk-plot registers
 *   (`lab-builtin-templates.ts`, generated from `src/transforms/presets`),
 *   with the fields and options of a chart of this page that reads them. They
 *   use the same contract and the same blocks: a developer's transform is
 *   written like them.
 */

import type { PlotTransformConfig } from '@urban-toolkit/autk-plot';

import { BUILT_IN_TRANSFORM_TEMPLATES } from './lab-builtin-templates';
import { evaluateChart } from './lab-scope';
import { PLOTS, transformOfChart } from './plot';

/** One transform lab template: its code and the inputs it runs with. */
export type LabTemplate = {
    title: string;
    /** Group of the Start from list. */
    group: 'example' | 'built-in';
    /** Name of the built-in transform whose code the template holds. */
    name?: string;
    columns: string;
    options: string;
    /** Chart of the page (`LinkedPlot.name`) that draws the rows first. */
    plot: string;
    code: string;
    /** Shown when the template is loaded, when it needs a word of explanation. */
    note?: string;
};

const BY_INITIAL = `// Groups the regions by the first letter of their name: many regions per bar (N:1).
// Built from the public blocks of the package, like the built-in transforms.
const { binnedProvenance, collectBuckets, indexedBins } = autk; // import { binnedProvenance, collectBuckets, indexedBins } from '@urban-toolkit/autk-plot';

return {
  name: 'by-initial',
  // Row shape: { label, value } is read by bars, pie and donut.
  shape: 'category-value',

  // rows: one row per region, with its columns and autkIds = [region index].
  // options: the "Options (JSON)" field. columns: the "Fields" field.
  run(rows, options, columns) {
    const attr = columns[0];

    // One bucket per initial, with the regions that fall in it.
    const buckets = collectBuckets({
      rows,
      bucketOf: row => String(row[attr] ?? '').charAt(0).toUpperCase() || null,
      valueOf: undefined, // count: each region is worth 1
      reducer: 'count',
    });
    buckets.sort((a, b) => a.key.localeCompare(b.key));
    const keys = buckets.map(b => b.key);

    return {
      rows: buckets.map(b => ({ label: b.key, value: b.value, autkIds: b.autkIds })),
      // Provenance: D0 regions → D1 initials → D2 bars.
      provenance: binnedProvenance({
        rows,
        buckets,
        bins: indexedBins(keys, keys, 'initial'),
        binLabel: 'initials',
        rowKeys: keys,
        reducer: 'count',
      }),
    };
  },
};
`;

const BY_WEEKDAY = `// Noise complaints per weekday. Each region opens into many complaints (1:N),
// and the complaints gather by day (N:1): regions and days relate N:N.
const { collectBuckets, unnestedProvenance } = autk; // import { collectBuckets, unnestedProvenance } from '@urban-toolkit/autk-plot';

return {
  name: 'by-weekday',
  // Row shape: { bucket, value } is read by the line and area charts.
  shape: 'series',

  run(rows, options, columns) {
    const path = columns[0].split('.');
    // The leading number keeps the axis in week order.
    const names = ['1 Sun', '2 Mon', '3 Tue', '4 Wed', '5 Thu', '6 Fri', '7 Sat'];

    // D1: one unit per complaint, which keeps the region it came from.
    const units = [];
    const unitIds = [];
    rows.forEach((row, i) => {
      const events = path.reduce((value, key) => value?.[key], row) ?? [];
      events.forEach((event, k) => {
        const day = new Date(event[options.timestamp]).getUTCDay();
        if (Number.isNaN(day)) return;
        units.push({ day: names[day], autkIds: row.autkIds });
        unitIds.push('complaint:' + i + '.' + k);
      });
    });

    const buckets = collectBuckets({
      rows: units,
      bucketOf: unit => unit.day,
      valueOf: undefined, // count: each complaint is worth 1
      reducer: 'count',
    });
    const keys = buckets.map(b => b.key);

    return {
      rows: buckets.map(b => ({ bucket: b.key, value: b.value, autkIds: b.autkIds })),
      // Provenance: D0 regions → D1 complaints → D2 weekdays.
      provenance: unnestedProvenance({
        units,
        unitIds,
        unitLabel: 'complaints',
        buckets,
        rowKeys: keys,
        reducer: 'count',
        bucketLabel: 'weekdays',
      }),
    };
  },
};
`;

const BROKEN = `// The same grouping by initial, with a common mistake on purpose.
// Click "Check and draw" to see the contract refuse it, then fix it.
const { binnedProvenance, collectBuckets, indexedBins } = autk; // import { binnedProvenance, collectBuckets, indexedBins } from '@urban-toolkit/autk-plot';

return {
  name: 'by-initial-sorted',
  shape: 'category-value',

  run(rows, options, columns) {
    const attr = columns[0];
    const buckets = collectBuckets({
      rows,
      bucketOf: row => String(row[attr] ?? '').charAt(0).toUpperCase() || null,
      valueOf: undefined,
      reducer: 'count',
    });
    const keys = buckets.map(b => b.key);
    const provenance = binnedProvenance({
      rows,
      buckets,
      bins: indexedBins(keys, keys, 'initial'),
      binLabel: 'initials',
      rowKeys: keys,
      reducer: 'count',
    });

    // MISTAKE: sorts the bars by value AFTER building the provenance.
    // Row k no longer matches rowId k, so each bar would paint the part of
    // another bar. Fix: sort "buckets" before computing "keys".
    const sorted = buckets.slice().sort((a, b) => b.value - a.value);
    return {
      rows: sorted.map(b => ({ label: b.key, value: b.value, autkIds: b.autkIds })),
      provenance,
    };
  },
};
`;

/** Transforms a developer might write. */
const EXAMPLES: LabTemplate[] = [
    { group: 'example', title: 'Regions by the initial of their name (N:1)', columns: 'ntaname', options: '{}', plot: 'histogram', code: BY_INITIAL },
    { group: 'example', title: 'Complaints per weekday (N:N)', columns: 'sjoin.collect.noise', options: '{ "timestamp": "date" }', plot: 'linechart', code: BY_WEEKDAY },
    { group: 'example', title: 'A common mistake (the contract refuses it)', columns: 'ntaname', options: '{}', plot: 'histogram', code: BROKEN },
];

/**
 * Inputs of a built-in transform that no chart of the page uses.
 * `reduce-series` reduces numeric series (a timestamp and a value per point);
 * the complaints have only a date, so it reads the daily series of each
 * region (`noise_daily`, built in `data.ts`) and averages it per day.
 */
const UNUSED: Record<string, { columns: string; transform: PlotTransformConfig; plot: string; note: string }> = {
    'reduce-series': {
        columns: 'noise_daily',
        transform: { preset: 'reduce-series', options: { timestamp: 'day', value: 'complaints', reducer: 'avg' } },
        plot: 'linechart',
        note: 'No chart of this page uses reduce-series. Here it averages the daily complaints of the regions (noise_daily).',
    },
};

/** The definition a built-in template returns. */
const definitionOf = (code: string) => evaluateChart(code) as { name: string; label?: string };

/** The 12 built-in transforms, in the order they are registered, each with the inputs of a chart of this page that reads it. */
const BUILT_INS: LabTemplate[] = BUILT_IN_TRANSFORM_TEMPLATES.map(template => {
    const { name, label } = definitionOf(template.code);
    const chart = PLOTS.find(plot => transformOfChart(plot)?.preset === name);
    const inputs = chart
        ? { columns: (chart.config.attributes?.axis ?? []).filter(field => field !== '@transform').join(', '), transform: transformOfChart(chart)!, plot: chart.name }
        : UNUSED[name];
    if (!inputs) throw new Error(`No chart of the page reads the built-in transform ${name}.`);
    return {
        group: 'built-in',
        name,
        title: `${label ?? name} (${name})`,
        columns: inputs.columns,
        options: JSON.stringify(inputs.transform.options ?? {}),
        plot: inputs.plot,
        code: template.code,
        ...('note' in inputs ? { note: inputs.note } : {}),
    };
});

/** Every template: the examples first (the page starts from the first one), then the built-in transforms. */
export const LAB_TEMPLATES: LabTemplate[] = [...EXAMPLES, ...BUILT_INS];
