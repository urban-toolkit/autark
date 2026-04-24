/**
 * @module BufferTypes
 * Shared binary-buffer type aliases used across core color processing and GPU
 * compute pipelines.
 *
 * These types capture the supported TypedArray instances and constructors used
 * when reading, writing, and wrapping numeric buffer data.
 */

/**
 * Supported TypedArray views for binary data buffers.
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
 * Constructors for supported TypedArray views.
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
