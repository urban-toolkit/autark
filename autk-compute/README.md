# AUTK-COMPUTE

GPU-accelerated GeoJSON computation library using WebGPU and WGSL shaders.

## Overview

AUTK-COMPUTE enables high-performance computations on GeoJSON feature collections by leveraging WebGPU. Write custom WGSL (WebGPU Shading Language) functions to process feature properties and compute new values in parallel on the GPU.

## API Reference

### `ComputeFunctionIntoPropertiesParams`

Configuration object for computing values into GeoJSON feature properties.

#### Parameters

##### `geojson`

- **Type:** `FeatureCollection`
- **Description:** The GeoJSON FeatureCollection to process.

##### `variableMapping`

- **Type:** `Record<string, string>`
- **Description:** Maps WGSL variable names to GeoJSON property paths.
- **Example:** `{ x: "population", y: "area" }`

##### `arrayVariables` (Optional)

- **Type:** `Record<string, number>`
- **Description:** Declares which variables are arrays and their fixed length. All features must have arrays of this length (or will be padded with zeros).
- **Example:** `{ myArray: 10, embeddings: 128 }`

##### `matrixVariables` (Optional)

- **Type:** `Record<string, { rows: number; cols: number }>`
- **Description:** Declares which variables are matrices and their dimensions (rows × cols). All features must have matrices of these dimensions (or will be padded with zeros).
- **Example:** `{ transformMatrix: { rows: 3, cols: 3 }, heatmap: { rows: 10, cols: 10 } }`

##### `outputColumnName`

- **Type:** `string`
- **Description:** The property name where the computed result will be stored in each feature.

##### `wglsFunction`

- **Type:** `string`
- **Description:** WGSL function body that returns an `f32` value. The function receives the mapped variables as parameters.

## Variable Types in WGSL Functions

### Scalar Variables

Scalar variables are passed as `f32` values directly.

**Example:**

```wgsl
return x * y;
```

### Array Variables

Array variables are passed with three parameters:

- `{arrayName}_data` - `ptr<storage, array<f32>>` - pointer to the array data
- `{arrayName}_offset` - `u32` - starting offset in the buffer
- `{arrayName}_length` - `u32` - length of the array

**Example:**

```wgsl
var sum = 0.0;
for (var i = 0u; i < myArray_length; i++) {
  sum += myArray_data[myArray_offset + i];
}
return x * sum;
```

### Matrix Variables

Matrix variables are passed with four parameters:

- `{matrixName}_data` - `ptr<storage, array<f32>>` - pointer to the matrix data (row-major)
- `{matrixName}_offset` - `u32` - starting offset in the buffer
- `{matrixName}_rows` - `u32` - number of rows
- `{matrixName}_cols` - `u32` - number of columns

**Example (calculating trace):**

```wgsl
// Calculate trace (sum of diagonal elements)
var trace = 0.0;
for (var i = 0u; i < matrix_rows; i++) {
  let idx = matrix_offset + i * matrix_cols + i;
  trace += matrix_data[idx];
}
return trace;
```

## Usage Examples

### Simple Scalar Computation

```typescript
const result = await computeFunctionIntoProperties({
  geojson: myFeatureCollection,
  variableMapping: {
    x: 'width',
    y: 'height',
  },
  outputColumnName: 'area',
  wglsFunction: 'return x * y;',
});
```

### Array Processing

```typescript
const result = await computeFunctionIntoProperties({
  geojson: myFeatureCollection,
  variableMapping: {
    embedding: 'embedding',
    scalar: 'weight',
  },
  arrayVariables: {
    embedding: 128,
  },
  outputColumnName: 'weighted_sum',
  wglsFunction: `
    var sum = 0.0;
    for (var i = 0u; i < embedding_length; i++) {
      sum += embedding_data[embedding_offset + i];
    }
    return sum * scalar;
  `,
});
```

### Matrix Operations

```typescript
const result = await computeFunctionIntoProperties({
  geojson: myFeatureCollection,
  variableMapping: {
    matrix: 'transformMatrix',
  },
  matrixVariables: {
    matrix: { rows: 3, cols: 3 },
  },
  outputColumnName: 'determinant_trace',
  wglsFunction: `
    var trace = 0.0;
    for (var i = 0u; i < matrix_rows; i++) {
      let idx = matrix_offset + i * matrix_cols + i;
      trace += matrix_data[idx];
    }
    return trace;
  `,
});
```

## Return Type

### `ComputeResult`

The computation result containing the updated GeoJSON.

#### Properties

##### `geojson`

- **Type:** `FeatureCollection`
- **Description:** The input GeoJSON FeatureCollection with computed values added to the specified output column in each feature's properties.
