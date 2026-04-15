import type { UrbanSpec } from 'urban-grammar';
import type { AutkMap } from 'autk-map';
import type { FeatureCollection } from 'geojson';

export type Targets = {
    compute?: string,
    db?: string,
    map?: string[] | string,
    plot?: string
}

export type MapRegistry = Map<string, AutkMap>;
export type GeoJsonCache = Map<string, FeatureCollection>;
export type ComputeCache = Map<string, FeatureCollection>;

export type AutkGrammarSpec = UrbanSpec;

export { ColorMapInterpolator, NormalizationMode } from 'urban-grammar';

