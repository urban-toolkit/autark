/** Shared CRS conversions; aliases preserve the existing tile projection API. */
export {
    isSupportedCrs as isTileCrs,
    EARTH_RADIUS,
    WEB_MERCATOR_MAX_LAT,
    WEB_MERCATOR_EXTENT,
    clampLatitude,
    latToMercatorY,
    mercatorYToLat,
    lonLatToCrs,
    crsToLonLat,
} from '@urban-toolkit/autk-core';
/** A CRS name, PROJ string, or WKT definition understood by Proj4js. */
export type TileCrs = string;
