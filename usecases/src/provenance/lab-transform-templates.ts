/**
 * Starting points of Try it Yourself (transform): plain JavaScript that a
 * developer edits in the page. Each one is the body of a function that
 * receives `lib` (the public building blocks) and returns a transform definition.
 */

/** One lab template: its code and the inputs it runs with. */
export type LabTemplate = {
    title: string;
    columns: string;
    options: string;
    plot: string;
    code: string;
};

const BY_INITIAL = `// Groups the regions by the first letter of their name: many regions per bar (N:1).
// "lib" holds the public building blocks of the package: collectBuckets, binnedProvenance,
// unnestedProvenance, cumulativeProvenance, hierarchyProvenance, indexedBins and featureId.
return {
  // Row shape: { label, value } is read by bars, pie and donut.
  shape: 'category-value',

  // rows: one row per region, with its columns and autkIds = [region index].
  // options: the "Options (JSON)" field. columns: the "Fields" field.
  run(rows, options, columns) {
    const attr = columns[0];

    // One bucket per initial, with the regions that fall in it.
    const buckets = lib.collectBuckets({
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
      provenance: lib.binnedProvenance({
        rows,
        buckets,
        bins: lib.indexedBins(keys, keys, 'initial'),
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
return {
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

    const buckets = lib.collectBuckets({
      rows: units,
      bucketOf: unit => unit.day,
      valueOf: undefined, // count: each complaint is worth 1
      reducer: 'count',
    });
    const keys = buckets.map(b => b.key);

    return {
      rows: buckets.map(b => ({ bucket: b.key, value: b.value, autkIds: b.autkIds })),
      // Provenance: D0 regions → D1 complaints → D2 weekdays.
      provenance: lib.unnestedProvenance({
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
// Click "Check and draw" to see the validator refuse it, then fix it.
return {
  shape: 'category-value',

  run(rows, options, columns) {
    const attr = columns[0];
    const buckets = lib.collectBuckets({
      rows,
      bucketOf: row => String(row[attr] ?? '').charAt(0).toUpperCase() || null,
      valueOf: undefined,
      reducer: 'count',
    });
    const keys = buckets.map(b => b.key);
    const provenance = lib.binnedProvenance({
      rows,
      buckets,
      bins: lib.indexedBins(keys, keys, 'initial'),
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

export const LAB_TEMPLATES: LabTemplate[] = [
    { title: 'Regions by the initial of their name (N:1)', columns: 'ntaname', options: '{}', plot: 'barchart', code: BY_INITIAL },
    { title: 'Complaints per weekday (N:N)', columns: 'sjoin.collect.noise', options: '{ "timestamp": "date" }', plot: 'linechart', code: BY_WEEKDAY },
    { title: 'A common mistake (the validator refuses it)', columns: 'ntaname', options: '{}', plot: 'barchart', code: BROKEN },
];
