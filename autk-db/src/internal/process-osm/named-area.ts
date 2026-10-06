import { booleanPointInPolygon, booleanValid, featureCollection, lineString, polygonize } from '@turf/turf';
import type { MultiPolygon, Position } from 'geojson';
import type { OsmElement, OsmNamedArea } from '../../use-cases/load-osm-overpass/interfaces';

/**
 * Matches exact OSM boundary names (including boundary=place) with a member node inside the named region,
 * like Overpass relation(area). If the extract lacks usable region geometry,
 * warns and falls back to exact area names within the PBF (including homonyms).
 */
export function selectScopedBoundaryRelations(elements: OsmElement[], queryArea: OsmNamedArea): OsmElement[] {
  const relations = elements.filter(element => element.type === 'relation' && !!element.tags?.boundary);
  const regions = relations.filter(element => element.tags?.name === queryArea.geocodeArea);
  const ways = new Map(elements.filter(element => element.type === 'way').map(element => [element.id, element]));
  const nodes = new Map(elements.filter(element => element.type === 'node').map(element => [element.id, element]));
  let scopes: MultiPolygon[] | undefined;
  try {
    if (regions.length === 0) throw new Error('region not found in the extract');
    scopes = [];
    for (const region of regions) {
      const rings: Position[][][] = [];
      for (const role of ['outer', 'inner']) {
        const members = (region.members ?? []).filter(member => member.type === 'way' && (member.role || 'outer') === role);
        const lines = [];
        const degree = new Map<number, number>();
        for (const member of members) {
          const way = ways.get(member.ref);
          if (!way?.nodes || way.nodes.length < 2 || way.geometry?.length !== way.nodes.length) {
            throw new Error('incomplete region boundary ways/nodes');
          }
          for (const ref of [way.nodes[0], way.nodes[way.nodes.length - 1]]) degree.set(ref, (degree.get(ref) ?? 0) + 1);
          lines.push(lineString(way.geometry.map(point => [point.lon, point.lat])));
        }
        if ([...degree.values()].some(count => count !== 2)) throw new Error('unclosed region boundary');
        rings.push(polygonize(featureCollection(lines)).features.map(feature => feature.geometry.coordinates[0]));
      }
      const polygons = rings[0].map(ring => [ring]);
      for (const hole of rings[1]) {
        const owner = polygons.find(polygon => booleanPointInPolygon(hole[0], { type: 'Polygon', coordinates: [polygon[0]] }, { ignoreBoundary: true }));
        if (!owner) throw new Error('invalid inner region boundary');
        owner.push(hole);
      }
      const scope: MultiPolygon = { type: 'MultiPolygon', coordinates: polygons };
      if (polygons.length === 0 || !booleanValid(scope)) throw new Error('invalid region boundary');
      scopes.push(scope);
    }
  } catch (error) {
    scopes = undefined;
    console.warn(`[autk-db] Cannot apply PBF geocodeArea "${queryArea.geocodeArea}": ${error instanceof Error ? error.message : String(error)}; falling back to exact area names without region scoping. Homonymous areas in the extract may be included.`);
  }
  const selected = relations.filter(relation => queryArea.areas.includes(relation.tags!.name) && (!scopes || (relation.members ?? []).some(member => {
    const coordinates = member.type === 'way'
      ? ways.get(member.ref)?.geometry?.map(point => [point.lon, point.lat]) ?? []
      : member.type === 'node' && nodes.get(member.ref)?.lon !== undefined && nodes.get(member.ref)?.lat !== undefined
        ? [[nodes.get(member.ref)!.lon!, nodes.get(member.ref)!.lat!]] : [];
    return coordinates.some(position => scopes?.some(scope => booleanPointInPolygon(position, scope)));
  })));
  const missing = queryArea.areas.filter(name => !selected.some(relation => relation.tags?.name === name));
  if (missing.length > 0) {
    const location = scopes ? ` inside "${queryArea.geocodeArea}"` : '';
    throw new Error(`No area boundary found in PBF${location} for: ${missing.map(name => `"${name}"`).join(', ')}. Verify names and include the requested boundaries in the extract.`);
  }
  return selected;
}
