import { BoundingBox } from '../../../../shared/interfaces';
import { GetBoundingBoxFromAreaParams } from './interfaces';

interface OverpassBoundingBox {
  minlat: number;
  minlon: number;
  maxlat: number;
  maxlon: number;
}

export class GetBoundingBoxFromAreaUseCase {
  async exec(params: GetBoundingBoxFromAreaParams): Promise<BoundingBox> {
    const { geocodeArea, areas } = params.queryArea;

    let globalMinLat: number | undefined;
    let globalMinLon: number | undefined;
    let globalMaxLat: number | undefined;
    let globalMaxLon: number | undefined;

    const bboxPromises = areas.map((areaName) => this.fetchBoundingBoxForArea(geocodeArea, areaName));
    const allBboxes = await Promise.all(bboxPromises);

    for (const bbox of allBboxes) {
      if (bbox) {
        globalMinLat = globalMinLat !== undefined ? Math.min(globalMinLat, bbox.minlat) : bbox.minlat;
        globalMinLon = globalMinLon !== undefined ? Math.min(globalMinLon, bbox.minlon) : bbox.minlon;
        globalMaxLat = globalMaxLat !== undefined ? Math.max(globalMaxLat, bbox.maxlat) : bbox.maxlat;
        globalMaxLon = globalMaxLon !== undefined ? Math.max(globalMaxLon, bbox.maxlon) : bbox.maxlon;
      }
    }

    if (
      globalMinLat === undefined ||
      globalMinLon === undefined ||
      globalMaxLat === undefined ||
      globalMaxLon === undefined
    ) {
      throw new Error('Could not determine bounding box for provided areas');
    }

    return {
      minLon: globalMinLon,
      minLat: globalMinLat,
      maxLon: globalMaxLon,
      maxLat: globalMaxLat,
    };
  }

  private async fetchBoundingBoxForArea(
    geocodeArea: string,
    areaName: string,
  ): Promise<OverpassBoundingBox | undefined> {
    const query = `
      [out:json][timeout:25];
      area["name"="${geocodeArea}"]->.searchArea;
      rel["name"="${areaName}"](area.searchArea);
      out bb;
    `;

    const url = 'https://overpass-api.de/api/interpreter?data=' + encodeURIComponent(query);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status} ${response.statusText}`);
    }

    const json = (await response.json()) as {
      elements?: Array<{ bounds?: OverpassBoundingBox }>;
    };

    // Overpass returns bounds inside each element. We pick the first element
    // (there should be exactly one per query). If nothing is found we return
    // undefined so that the caller can ignore this area.
    return json.elements?.[0]?.bounds;
  }
}
