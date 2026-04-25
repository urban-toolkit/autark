/**
 * @module BufferTypes
 * Shared binary-buffer type aliases for core numeric data handling.
 *
 * This module centralizes the TypedArray views and constructors accepted by
 * color processing, raster and transfer-function code, and GPU-facing buffer
 * utilities. It keeps buffer-oriented APIs aligned on the same supported
 * numeric types when reading, writing, or wrapping binary data.
 */

/**
 * Supported TypedArray views for shared binary data buffers.
 *
 * Use this alias for APIs that accept existing numeric buffer views across
 * color processing, raster payloads, and GPU upload paths.
 */
export type TypedArray =
  | Float32Array
  | Float64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Uint32Array;

/**
 * Constructors for the supported TypedArray views.
 *
 * Use this alias when code needs to allocate or re-create buffer views from a
 * shared binary source without narrowing to a single numeric representation.
 */
export type TypedArrayConstructor =
  | Float32ArrayConstructor
  | Float64ArrayConstructor
  | Int8ArrayConstructor
  | Int16ArrayConstructor
  | Int32ArrayConstructor
  | Uint8ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor;
