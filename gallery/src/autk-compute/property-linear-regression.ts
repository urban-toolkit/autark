import { GeojsonCompute } from 'autk-compute';
import { FeatureCollection } from 'geojson';

export class PropertyLinearRegression {
  public async run(): Promise<void> {
    // Create synthetic GeoJSON with training data for linear regression
    const geojson: FeatureCollection = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-73.935242, 40.73061] }, // NYC
          properties: {
            name: 'Dataset A - House Prices',
            description: 'Predict house price based on size',
            // Training data: house sizes in sqft
            x_train: [1000, 1500, 2000, 2500, 3000, 3500, 4000],
            // Training data: prices in thousands of dollars
            y_train: [200, 250, 300, 350, 400, 450, 500],
            // Value to predict for (e.g., 2750 sqft house)
            x_predict: 2750,
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-118.243683, 34.052235] }, // LA
          properties: {
            name: 'Dataset B - Temperature vs Ice Cream Sales',
            description: 'Predict ice cream sales based on temperature',
            // Training data: temperature in Celsius
            x_train: [20, 22, 25, 28, 30, 32, 35],
            // Training data: sales in units
            y_train: [50, 60, 80, 100, 120, 140, 170],
            // Predict sales for 27°C
            x_predict: 27,
          },
        },
        {
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [-87.629798, 41.878113] }, // Chicago
          properties: {
            name: 'Dataset C - Study Hours vs Test Score',
            description: 'Predict test score based on study hours',
            // Training data: study hours
            x_train: [1, 2, 3, 4, 5, 6, 7],
            // Training data: test scores
            y_train: [55, 62, 68, 75, 81, 87, 93],
            // Predict score for 4.5 hours of study
            x_predict: 4.5,
          },
        },
      ],
    };

    console.log('=== Linear Regression Example ===');
    console.log('Initial GeoJSON with training data:', geojson);
    console.log('\nEach feature contains:');
    console.log('  - x_train: array of independent variable values');
    console.log('  - y_train: array of dependent variable values');
    console.log('  - x_predict: value to predict for');

    const geojsonCompute = new GeojsonCompute();

    // Linear Regression - Predict Value
    console.log('\n=== Running Linear Regression Prediction on GPU ===');
    const result = await geojsonCompute.computeFunctionIntoProperties({
      geojson,
      attributes: {
        x_values: 'x_train',
        y_values: 'y_train',
        x_pred: 'x_predict',
      },
      attributeArrays: {
        x_values: 7, // 7 training points
        y_values: 7,
      },
      outputColumnName: 'predicted_value',
      wgslFunction: `
        // Simple Linear Regression: y = mx + b
        // Formulas:
        // slope (m) = (n*Σ(xy) - Σx*Σy) / (n*Σ(x²) - (Σx)²)
        // intercept (b) = (Σy - m*Σx) / n
        
        let n = f32(x_values_length);
        
        // Calculate sums
        var sum_x = 0.0;
        var sum_y = 0.0;
        var sum_xy = 0.0;
        var sum_x2 = 0.0;
        
        for (var i = 0u; i < x_values_length; i++) {
          let x = x_values[i];
          let y = y_values[i];
          sum_x += x;
          sum_y += y;
          sum_xy += x * y;
          sum_x2 += x * x;
        }
        
        // Calculate slope and intercept
        let slope = (n * sum_xy - sum_x * sum_y) / (n * sum_x2 - sum_x * sum_x);
        let intercept = (sum_y - slope * sum_x) / n;
        
        // Predict value for x_pred
        return slope * x_pred + intercept;
      `,
    });

    console.log('\n=== Predictions ===');
    result.features.forEach((f) => {
      const name = f.properties?.name;
      const description = f.properties?.description;
      const x_pred = f.properties?.x_predict;
      const predicted = f.properties?.compute?.predicted_value;
      
      console.log(`\n${name}`);
      console.log(`  ${description}`);
      console.log(`  Input: ${x_pred}`);
      console.log(`  Predicted: ${predicted?.toFixed(2)}`);
    });

    console.log('\n=== Linear Regression Complete ===');
    
    // Store result for the print function
    this.result = result;
  }

  private result: FeatureCollection | null = null;

  public print(): void {
    const div = document.getElementById('output');
    if (div && this.result) {
      let resultsHtml = '<h3>Prediction Results:</h3><ul>';
      
      this.result.features.forEach((f) => {
        const name = f.properties?.name;
        const description = f.properties?.description;
        const x_pred = f.properties?.x_predict;
        const predicted = f.properties?.compute?.predicted_value;
        
        resultsHtml += `
          <li>
            <strong>${name}</strong><br>
            ${description}<br>
            Input: ${x_pred} → Predicted: <b>${predicted?.toFixed(2)}</b>
          </li>
        `;
      });
      
      resultsHtml += '</ul>';
      
      div.innerHTML = `
        <h2>Linear Regression Example Complete! ✅</h2>
        <p>Check the console for detailed computation steps.</p>
        ${resultsHtml}
        <h3>How it works:</h3>
        <ul>
          <li>Computes linear regression coefficients (slope & intercept)</li>
          <li>Uses least squares method on GPU</li>
          <li>Makes predictions for new values</li>
          <li>All computations executed in parallel on WebGPU</li>
        </ul>
        <p><b>Three datasets processed simultaneously on GPU!</b></p>
      `;
    }
  }
}

async function main() {
  const example = new PropertyLinearRegression();

  await example.run();
  example.print();
}

main();

