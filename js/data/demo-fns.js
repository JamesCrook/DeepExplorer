// demo-fns.js

import { FunctionData} from './csv-data.js'

function randomMatrix(size = 'medium') {
  const sizes = { small: 10, medium: 50, large: 200 };
  const n = sizes[size];

  let csv = ',';
  for (let c = 0; c < n; c++) csv += 'C' + (c+1) + (c < n-1 ? ',' : '\n');

  for (let r = 0; r < n; r++) {
    csv += 'R' + (r+1);
    for (let c = 0; c < n; c++) {
      csv += ',' + (Math.random() * 200 - 100).toFixed(2);
    }
    csv += '\n';
  }
  return new CSVData(csv);
}

function waveMatrix(size = 'medium') {
  const sizes = { small: 50, medium: 200, large: 1000 };
  const n = sizes[size];
  return new FunctionData(n, n,
    (r, c) => Math.sin(r * 0.15) * Math.cos(c * 0.15) * 10,
    { range: { min: -10, max: 10 } }
  );
}

function multiplicationTable(size = 'medium') {
  const sizes = { small: 12, medium: 50, large: 200 };
  const n = sizes[size];
  return new FunctionData(n, n,
    (r, c) => (r + 1) * (c + 1),
    {
      rowNameFn: r => String(r + 1),
      colNameFn: c => String(c + 1),
      range: { min: 1, max: n * n }
    }
  );
}

function gradientMatrix(size = 'medium') {
  const sizes = { small: 50, medium: 200, large: 500 };
  const n = sizes[size];
  return new FunctionData(n, n,
    (r, c) => r + c - n,
    { range: { min: -n, max: n } }
  );
}

function registerFunctionSources(registrar){
  registrar('random', 'Random Matrix', randomMatrix, true);
  registrar('wave', 'Wave Pattern', waveMatrix, true);
  registrar('multiplication', 'Multiplication Table', multiplicationTable, true);
  registrar('gradient', 'Diagonal Gradient', gradientMatrix, true);
}

export {registerFunctionSources}

// Auto-generated exports
if (typeof window !== 'undefined') window.gradientMatrix = gradientMatrix;
export { gradientMatrix };
if (typeof window !== 'undefined') window.multiplicationTable = multiplicationTable;
export { multiplicationTable };
if (typeof window !== 'undefined') window.randomMatrix = randomMatrix;
export { randomMatrix };
if (typeof window !== 'undefined') window.waveMatrix = waveMatrix;
export { waveMatrix };
