// JSON hasil panggang -> modul ES ringkas (base64: Int16 posisi 0,1 mm, Uint16 indeks, Uint16 warna, Uint8 bagian)
const fs = require('fs');
const src = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const b64 = (ta) => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');
let out = '// Data mesh figur manusia realistis (dipanggang dari Quaternius Universal Base Characters + Modular Outfits, CC0).\n// Dibuat oleh skrip panggang; jangan disunting tangan.\nexport const MANUSIA_DATA = {\n';
for (const [k, d] of Object.entries(src)) {
  out += `  ${k}: { pal: ${JSON.stringify(d.pal)}, v: '${b64(Int16Array.from(d.v))}', t: '${b64(Uint16Array.from(d.t))}', c: '${b64(Uint16Array.from(d.c))}', p: '${Buffer.from(d.p, 'latin1').toString('base64')}' },\n`;
}
out += '};\n';
fs.writeFileSync(process.argv[3], out);
console.log('bytes', out.length);
