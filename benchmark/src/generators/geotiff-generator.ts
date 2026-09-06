import type { BoundingBox2D, GeoTiffGeneratorOptions } from './types';

const DEFAULT_BBOX: BoundingBox2D = {
  minLon: -74.02,
  minLat: 40.70,
  maxLon: -73.97,
  maxLat: 40.76,
};

export interface SyntheticRasterMatrix {
  width: number;
  height: number;
  bands: number;
  bbox: BoundingBox2D;
  data: Float32Array[];
  minValue: number;
  maxValue: number;
}

export function generateSyntheticRasterMatrix(options: GeoTiffGeneratorOptions = {}): SyntheticRasterMatrix {
  const width = options.width ?? 64;
  const height = options.height ?? 64;
  const bands = options.bands ?? 1;
  const bbox = options.bbox ?? DEFAULT_BBOX;
  const minVal = options.minValue ?? 0;
  const maxVal = options.maxValue ?? 100;
  const dataArrays: Float32Array[] = [];

  for (let b = 0; b < bands; b++) {
    const arr = new Float32Array(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const nx = x / width;
        const ny = y / height;
        const v = Math.sin(nx * Math.PI * 2 + b * 0.5) * Math.cos(ny * Math.PI * 2) * 0.5 + 0.5;
        arr[y * width + x] = minVal + v * (maxVal - minVal);
      }
    }
    dataArrays.push(arr);
  }

  return {
    width,
    height,
    bands,
    bbox,
    data: dataArrays,
    minValue: minVal,
    maxValue: maxVal,
  };
}

export function createMinimalTiffArrayBuffer(width: number, height: number, raster: Float32Array): ArrayBuffer {
  const pixelBytes = width * height * 4;
  const headerSize = 8;
  const numTags = 12;
  const ifdSize = 2 + numTags * 12 + 4;
  const totalSize = headerSize + ifdSize + pixelBytes + 128;
  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // Little Endian header 'II'
  view.setUint16(0, 0x4949, true);
  view.setUint16(2, 42, true);
  view.setUint32(4, 8, true); // IFD offset

  let offset = 8;
  view.setUint16(offset, numTags, true);
  offset += 2;

  const writeTag = (tag: number, type: number, count: number, valOrOffset: number) => {
    view.setUint16(offset, tag, true);
    view.setUint16(offset + 2, type, true);
    view.setUint32(offset + 4, count, true);
    view.setUint32(offset + 8, valOrOffset, true);
    offset += 12;
  };

  const dataOffset = headerSize + ifdSize;
  writeTag(256, 4, 1, width); // ImageWidth
  writeTag(257, 4, 1, height); // ImageLength
  writeTag(258, 3, 1, 32); // BitsPerSample
  writeTag(259, 3, 1, 1); // Compression (none)
  writeTag(262, 3, 1, 1); // PhotometricInterpretation (BlackIsZero)
  writeTag(273, 4, 1, dataOffset); // StripOffsets
  writeTag(277, 3, 1, 1); // SamplesPerPixel
  writeTag(278, 4, 1, height); // RowsPerStrip
  writeTag(279, 4, 1, pixelBytes); // StripByteCounts
  writeTag(339, 3, 1, 3); // SampleFormat (3 = IEEEFP / float)
  writeTag(33550, 12, 3, dataOffset + pixelBytes); // ModelPixelScaleTag
  writeTag(33922, 12, 6, dataOffset + pixelBytes + 32); // ModelTiepointTag

  view.setUint32(offset, 0, true); // End of IFD

  // Copy raster data
  const floatView = new Float32Array(buffer, dataOffset, width * height);
  floatView.set(raster);

  return buffer;
}
