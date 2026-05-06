import type { FeatureCollection, GeoJsonProperties } from 'geojson';
import type { NumericFieldDescriptor } from './types';

const AREA_RE = /(shape_area|area|sq.?m|sq.?km|acres?)/i;
const PERIMETER_RE = /(shape_leng|perimeter|perim|length)/i;
const COUNT_RE = /(count|total|num|n_)/i;

function cloneProperties(properties: GeoJsonProperties | null | undefined): GeoJsonProperties {
  return properties ? { ...properties } : {};
}

function pickField(fields: NumericFieldDescriptor[], matcher: RegExp): NumericFieldDescriptor | null {
  const matches = fields.filter((field) => matcher.test(field.key));
  return matches.length > 0 ? matches[0] : null;
}

function roundMetric(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function deriveNumericMetrics(
  collection: FeatureCollection,
  nativeFields: NumericFieldDescriptor[]
): { collection: FeatureCollection; derivedFields: NumericFieldDescriptor[] } {
  const areaField = pickField(nativeFields, AREA_RE);
  const perimeterField = pickField(nativeFields, PERIMETER_RE);
  const countField = pickField(nativeFields, COUNT_RE);
  const features = collection.features.map((feature) => ({
    ...feature,
    properties: cloneProperties(feature.properties),
  }));
  const derivedFields: NumericFieldDescriptor[] = [];

  if (areaField && perimeterField) {
    let validCount = 0;
    const distinct = new Set<number>();

    features.forEach((feature) => {
      const area = Number(feature.properties?.[areaField.key]);
      const perimeter = Number(feature.properties?.[perimeterField.key]);
      if (!Number.isFinite(area) || !Number.isFinite(perimeter) || area <= 0 || perimeter <= 0) return;
      const compactness = roundMetric((4 * Math.PI * area) / (perimeter * perimeter));
      feature.properties!.compactness = compactness;
      validCount += 1;
      distinct.add(compactness);
    });

    if (validCount > 0) {
      derivedFields.push({
        key: 'compactness',
        label: 'Compactness',
        coverage: validCount / Math.max(features.length, 1),
        distinctCount: distinct.size,
        source: 'derived',
        description: `Derived from ${areaField.label} and ${perimeterField.label}: 4πA / P².`,
      });
    }
  }

  if (countField && areaField) {
    let validCount = 0;
    const distinct = new Set<number>();

    features.forEach((feature) => {
      const count = Number(feature.properties?.[countField.key]);
      const area = Number(feature.properties?.[areaField.key]);
      if (!Number.isFinite(count) || !Number.isFinite(area) || area <= 0) return;
      const density = roundMetric(count / area);
      feature.properties!.density = density;
      validCount += 1;
      distinct.add(density);
    });

    if (validCount > 0) {
      derivedFields.push({
        key: 'density',
        label: 'Density',
        coverage: validCount / Math.max(features.length, 1),
        distinctCount: distinct.size,
        source: 'derived',
        description: `Derived from ${countField.label} divided by ${areaField.label}.`,
      });
    }
  }

  return {
    collection: { ...collection, features },
    derivedFields,
  };
}
