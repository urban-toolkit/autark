import type { FeatureCollection } from 'geojson';
import { deriveNumericMetrics } from './derived-metrics';
import type { CategoricalFieldDescriptor, NumericFieldDescriptor } from './types';

function prettifyLabel(key: string): string {
  return key
    .split('.')
    .pop()!
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function walkObject(value: unknown, path: string[], visit: (key: string, value: unknown) => void): void {
  if (Array.isArray(value) || value == null) return;
  if (typeof value !== 'object') {
    if (path.length > 0) visit(path.join('.'), value);
    return;
  }

  Object.entries(value).forEach(([key, child]) => {
    if (Array.isArray(child) || child == null) return;
    if (typeof child === 'object') {
      walkObject(child, [...path, key], visit);
      return;
    }
    visit([...path, key].join('.'), child);
  });
}

function getValueByPath(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((value, key) => (
    value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined
  ), source);
}

export function discoverFeatureFields(collection: FeatureCollection): {
  collection: FeatureCollection;
  numericFields: NumericFieldDescriptor[];
  categoricalFields: CategoricalFieldDescriptor[];
} {
  const featureCount = collection.features.length;
  const fieldKeys = new Set<string>();

  collection.features.forEach((feature) => {
    walkObject(feature.properties ?? {}, [], (key) => fieldKeys.add(key));
  });

  const numericFields: NumericFieldDescriptor[] = [];
  const categoricalFields: CategoricalFieldDescriptor[] = [];

  fieldKeys.forEach((key) => {
    let presentCount = 0;
    let numericCount = 0;
    const numericDistinct = new Set<number>();
    const categoricalDistinct = new Set<string>();

    collection.features.forEach((feature) => {
      const properties = (feature.properties ?? {}) as Record<string, unknown>;
      const rawValue = getValueByPath(properties, key);
      if (rawValue == null || rawValue === '') return;
      presentCount += 1;

      const numericValue = typeof rawValue === 'number' ? rawValue : Number(rawValue);
      if (Number.isFinite(numericValue)) {
        numericCount += 1;
        numericDistinct.add(numericValue);
      } else {
        categoricalDistinct.add(String(rawValue));
      }
    });

    const coverage = presentCount / Math.max(featureCount, 1);
    if (numericCount > 1 && coverage >= 0.4 && numericDistinct.size > 1) {
      numericFields.push({
        key,
        label: prettifyLabel(key),
        coverage,
        distinctCount: numericDistinct.size,
        source: 'native',
        description: `Native numeric field discovered from "${key}".`,
      });
    }

    if (categoricalDistinct.size > 1 && categoricalDistinct.size <= Math.min(24, Math.max(6, featureCount - 1)) && coverage >= 0.4) {
      categoricalFields.push({
        key,
        label: prettifyLabel(key),
        coverage,
        distinctCount: categoricalDistinct.size,
      });
    }
  });

  const enriched = deriveNumericMetrics(collection, numericFields);
  const mergedNumericFields = [...numericFields, ...enriched.derivedFields]
    .sort((a, b) => b.coverage - a.coverage || b.distinctCount - a.distinctCount);

  return {
    collection: enriched.collection,
    numericFields: mergedNumericFields,
    categoricalFields: categoricalFields.sort((a, b) => a.distinctCount - b.distinctCount || b.coverage - a.coverage),
  };
}
