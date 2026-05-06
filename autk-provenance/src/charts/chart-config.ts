import type { FeatureCollection } from 'geojson';
import { discoverFeatureFields } from './feature-extraction';
import type { CategoricalFieldDescriptor, InsightsChartSchema, NumericFieldDescriptor } from './types';

const AREA_RE = /(shape_area|area)/i;
const PERIMETER_RE = /(shape_leng|perimeter|perim|length)/i;
const GROUP_RE = /(district|cdta|borough|zone|class|category|type|group|landuse|name)/i;

function scoreField(field: NumericFieldDescriptor): number {
  let score = field.coverage * 100 + Math.min(field.distinctCount, 40);
  if (AREA_RE.test(field.key)) score += 30;
  if (PERIMETER_RE.test(field.key)) score += 24;
  if (/compactness/i.test(field.key)) score += 28;
  if (/density/i.test(field.key)) score += 16;
  if (field.source === 'derived') score += 10;
  return score;
}

function selectPrimaryMetrics(fields: NumericFieldDescriptor[]): NumericFieldDescriptor[] {
  return [...fields].sort((a, b) => scoreField(b) - scoreField(a));
}

function buildGroupedCollection(
  collection: FeatureCollection,
  groupField: CategoricalFieldDescriptor | null,
  histogramField: NumericFieldDescriptor
): { collection: FeatureCollection; axisField: string; label: string; subtitle: string } {
  const groups = new Map<string, { autkIds: number[]; count: number }>();
  const axisField = 'group';
  const features = collection.features;

  features.forEach((feature, index) => {
    const properties = feature.properties ?? {};
    let groupValue: string;

    if (groupField) {
      groupValue = String((properties as Record<string, unknown>)[groupField.key] ?? 'Unknown');
    } else {
      const numericValue = Number((properties as Record<string, unknown>)[histogramField.key]);
      groupValue = Number.isFinite(numericValue) ? String(Math.round(numericValue)) : 'Unknown';
    }

    const bucket = groups.get(groupValue) ?? { autkIds: [], count: 0 };
    bucket.autkIds.push(index);
    bucket.count += 1;
    groups.set(groupValue, bucket);
  });

  return {
    axisField,
    label: groupField?.label ?? `${histogramField.label} Bucket`,
    subtitle: groupField
      ? `${groupField.label} groups with linked underlying feature ids`
      : `Aggregated by ${histogramField.label} buckets with linked underlying feature ids`,
    collection: {
      type: 'FeatureCollection',
      features: [...groups.entries()].map(([groupValue, bucket]) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [0, 0] },
        properties: {
          [axisField]: groupValue,
          count: bucket.count,
          autkIds: bucket.autkIds,
          memberIds: bucket.autkIds,
        },
      })),
    },
  };
}

function selectGroupField(fields: CategoricalFieldDescriptor[]): CategoricalFieldDescriptor | null {
  const sorted = [...fields].sort((a, b) => {
    const aScore = (GROUP_RE.test(a.key) ? 50 : 0) + (24 - a.distinctCount) + a.coverage * 20;
    const bScore = (GROUP_RE.test(b.key) ? 50 : 0) + (24 - b.distinctCount) + b.coverage * 20;
    return bScore - aScore;
  });
  return sorted[0] ?? null;
}

export function buildInsightsChartSchema(collection: FeatureCollection): InsightsChartSchema {
  const discovered = discoverFeatureFields(collection);
  const ranked = selectPrimaryMetrics(discovered.numericFields);

  if (ranked.length < 2) {
    throw new Error('Insights workspace requires at least two numeric fields.');
  }

  const scatterX = ranked.find((field) => AREA_RE.test(field.key)) ?? ranked[0];
  const scatterY = ranked.find((field) => field.key !== scatterX.key && PERIMETER_RE.test(field.key)) ?? ranked.find((field) => field.key !== scatterX.key) ?? ranked[1];
  const histogramField = ranked.find((field) => field.key !== scatterY.key && AREA_RE.test(field.key)) ?? scatterX;
  const parallelFields = [scatterX, scatterY, histogramField, ...ranked]
    .filter((field, index, all) => all.findIndex((candidate) => candidate.key === field.key) === index)
    .slice(0, Math.min(5, ranked.length));
  const grouped = buildGroupedCollection(discovered.collection, selectGroupField(discovered.categoricalFields), histogramField);

  return {
    collection: discovered.collection,
    numericFields: ranked,
    categoricalFields: discovered.categoricalFields,
    thematicFields: ranked.slice(0, 8),
    scatter: {
      x: scatterX,
      y: scatterY,
      title: 'Scatterplot',
      subtitle: `${scatterX.label} vs ${scatterY.label} · click or brush to select`,
    },
    histogram: {
      field: histogramField,
      title: 'Histogram',
      subtitle: `${histogramField.label} distribution · click bins to select`,
    },
    parallel: {
      fields: parallelFields,
      title: 'Parallel Coordinates',
      subtitle: `${parallelFields.map((field) => field.label).join(' · ')} · brush any axis`,
    },
    bar: {
      collection: grouped.collection,
      axisField: grouped.axisField,
      valueField: 'count',
      groupFieldLabel: grouped.label,
      title: 'Bar Chart',
      subtitle: grouped.subtitle,
    },
  };
}
