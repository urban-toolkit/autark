import { GeojsonCompute } from 'autk-compute';
import { FeatureCollection } from 'geojson';

export class PropertyArrayFunc {
  public async run(): Promise<void> {
    // Create synthetic GeoJSON with array properties
    const geojson: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [0, 0] },
          properties: {
            name: 'Location A',
            temperature: 20.0,
            measurements: [1.0, 2.0, 3.0, 4.0, 5.0],
            weights: [0.5, 1.5, 2.0],
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [1, 1] },
          properties: {
            name: 'Location B',
            temperature: 25.0,
            measurements: [2.0, 4.0, 6.0, 8.0, 10.0],
            weights: [1.0, 2.0, 3.0],
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [2, 2] },
          properties: {
            name: 'Location C',
            temperature: 30.0,
            measurements: [1.5, 2.5, 3.5, 4.5, 5.5],
            weights: [0.8, 1.2], // Shorter array - will be padded with zeros
          },
        },
      ],
    };

    console.log('Initial GeoJSON:', geojson);

    const geojsonCompute = new GeojsonCompute();

    // Example 1: Calculate average of measurements array
    console.log('\n=== Example 1: Array Average ===');
    let result1 = await geojsonCompute.computeFunctionIntoProperties({
      geojson,
      variableMapping: {
        values: 'measurements',
      },
      arrayVariables: {
        values: 5, // Fixed length of 5
      },
      outputColumnName: 'avg_measurement',
      wglsFunction: `
        var sum = 0.0;
        for (var i = 0u; i < values_length; i++) {
          sum += values[i];
        }
        return sum / f32(values_length);
      `,
    });
    console.log(
      'Result 1 (avg_measurement):',
      result1.features.map((f) => f.properties?.compute),
    );

    // Example 2: Weighted sum using scalar and array
    console.log('\n=== Example 2: Scalar * Array Sum ===');
    let result2 = await geojsonCompute.computeFunctionIntoProperties({
      geojson,
      variableMapping: {
        temp: 'temperature',
        values: 'measurements',
      },
      arrayVariables: {
        values: 5,
      },
      outputColumnName: 'weighted_by_temp',
      wglsFunction: `
        var sum = 0.0;
        for (var i = 0u; i < values_length; i++) {
          sum += values[i];
        }
        return temp * sum;
      `,
    });
    console.log(
      'Result 2 (weighted_by_temp):',
      result2.features.map((f) => f.properties?.compute),
    );

    // Example 3: Dot product of two arrays
    console.log('\n=== Example 3: Dot Product of Two Arrays ===');
    let result3 = await geojsonCompute.computeFunctionIntoProperties({
      geojson,
      variableMapping: {
        a: 'measurements',
        b: 'weights',
      },
      arrayVariables: {
        a: 5,
        b: 3,
      },
      outputColumnName: 'dot_product',
      wglsFunction: `
        var dot = 0.0;
        let minLen = min(a_length, b_length);
        for (var i = 0u; i < minLen; i++) {
          dot += a[i] * b[i];
        }
        return dot;
      `,
    });
    console.log(
      'Result 3 (dot_product):',
      result3.features.map((f) => f.properties?.compute),
    );

    // Example 4: Find maximum value in array
    console.log('\n=== Example 4: Maximum Value in Array ===');
    let result4 = await geojsonCompute.computeFunctionIntoProperties({
      geojson,
      variableMapping: {
        values: 'measurements',
      },
      arrayVariables: {
        values: 5,
      },
      outputColumnName: 'max_measurement',
      wglsFunction: `
        var maxVal = values[0];
        for (var i = 1u; i < values_length; i++) {
          let val = values[i];
          if (val > maxVal) {
            maxVal = val;
          }
        }
        return maxVal;
      `,
    });
    console.log(
      'Result 4 (max_measurement):',
      result4.features.map((f) => f.properties?.compute),
    );

    console.log('\n=== All Examples Complete ===');
  }

  public print(): void {
    const div = document.getElementById('output');
    if (div) {
      div.innerHTML = `
        <h2>Array Function Examples Complete!</h2>
        <p>Check the console for detailed results.</p>
        <p>Examples tested:</p>
        <ul>
          <li>✅ Array Average</li>
          <li>✅ Scalar * Array Sum</li>
          <li>✅ Dot Product of Two Arrays</li>
          <li>✅ Maximum Value in Array</li>
        </ul>
        <p><b>All array computations executed successfully on GPU!</b></p>
      `;
    }
  }
}

async function main() {
  const example = new PropertyArrayFunc();

  await example.run();
  example.print();
}

main();
