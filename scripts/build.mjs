// scripts/build.mjs
import fs from 'node:fs/promises';
import path from 'node:path';
import JavaScriptObfuscator from 'javascript-obfuscator';

const src = path.resolve('src/tracker.js');
const rawOut = path.resolve('dist/oonly.raw.js');
const obfuscatedOut = path.resolve('dist/oonly.min.js');

// Read the obfuscator config
const configPath = path.resolve('obfuscator.config.json');
const config = JSON.parse(await fs.readFile(configPath, 'utf8'));

const code = await fs.readFile(src, 'utf8');

// Create dist directory
await fs.mkdir(path.dirname(rawOut), { recursive: true });

// Save raw version
await fs.writeFile(rawOut, code, 'utf8');
console.log('Saved raw version:', rawOut);

// Obfuscate using config
const result = JavaScriptObfuscator.obfuscate(code, config);
await fs.writeFile(obfuscatedOut, result.getObfuscatedCode(), 'utf8');

console.log('Built obfuscated version:', obfuscatedOut);
console.log('Build complete!');
