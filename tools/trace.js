const vtracer = require('@visioncortex/vtracer');
const fs = require('fs');
const palette = ['#ffffff','#686d75','#6b707c','#4e5561','#30303a','#f3e9d3','#e7decd','#bfb3a9','#d9cec4','#36374c','#dcdbde','#272a3e'];
const opts = { mode:'spline', hierarchical:'stacked', clustering:'color-cluster', filterSpeckle:8, colorPrecision:6, cornerThreshold:60, lengthThreshold:4, spliceThreshold:45, simplify:1.5, pathPrecision:2, optimize:2, palette };
const inp = process.argv[2], out = process.argv[3];
const svg = vtracer.convertBuffer(new Uint8Array(fs.readFileSync(inp)), opts);
fs.writeFileSync(out, svg);
console.log(out, (svg.length/1024).toFixed(0)+'KB', 'paths:', (svg.match(/<path/g)||[]).length);
