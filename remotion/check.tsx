import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {Runner} from './src/puppet/Runner';
import fs from 'fs';
for (const f of [0, 6, 12, 18]) {
  const svg = renderToStaticMarkup(<Runner frame={f} />);
  fs.writeFileSync(`../puppet_check_${f}.svg`, svg);
}
console.log('ssr ok');
