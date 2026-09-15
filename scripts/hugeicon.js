#!/usr/bin/env node
// Convierte un icono de @hugeicons/core-free-icons a SVG inline listo para
// pegar en popup.html. No se usa en runtime, solo como herramienta de dev.
//
// Uso: node scripts/hugeicon.js <NombreIcon>
// Ej.: node scripts/hugeicon.js FlashIcon
// Lista de nombres disponibles: node_modules/@hugeicons/core-free-icons/dist/esm

const fs = require('fs');
const path = require('path');

const name = process.argv[2];
if (!name) {
  console.error('Uso: node scripts/hugeicon.js <NombreIcon>  (ej. FlashIcon)');
  process.exit(1);
}

// El paquete es ESM-only (sin build cjs por icono), así que en vez de
// require()/import leemos el array literal directamente del código fuente.
const modPath = path.join(
  __dirname,
  '..',
  'node_modules',
  '@hugeicons',
  'core-free-icons',
  'dist',
  'esm',
  `${name}.js`
);

let source;
try {
  source = fs.readFileSync(modPath, 'utf8');
} catch (err) {
  console.error(`No se encontró el icono "${name}" (${modPath}).`);
  console.error('Revisa el nombre exacto en node_modules/@hugeicons/core-free-icons/dist/esm');
  process.exit(1);
}

const match = source.match(/=\s*(\[[\s\S]*?\]);\s*\n\s*export/);
if (!match) {
  console.error(`No se pudo leer la definición del icono "${name}".`);
  process.exit(1);
}
const icon = new Function(`return ${match[1]};`)();

function attrsToString(attrs) {
  return Object.entries(attrs)
    .filter(([k]) => k !== 'key')
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}="${v}"`)
    .join(' ');
}

const inner = icon.map(([tag, attrs]) => `  <${tag} ${attrsToString(attrs)} />`).join('\n');

const svg = `<svg class="section-icon" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">\n${inner}\n</svg>`;

console.log(svg);
