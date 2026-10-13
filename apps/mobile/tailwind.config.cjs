const path = require('node:path');
const desktop = require('../desktop/src/renderer/tailwind.config.cjs');
module.exports = { ...desktop, content: [
  path.join(__dirname, 'src/**/*.{ts,tsx}'),
  path.join(__dirname, '../desktop/src/renderer/src/**/*.{ts,tsx}'),
  path.join(__dirname, '../../packages/editor/src/**/*.{ts,tsx}'),
] };
