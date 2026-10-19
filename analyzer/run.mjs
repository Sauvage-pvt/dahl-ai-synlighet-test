// Kjør: node analyzer/run.mjs
// Analyserer alle versjonene lokalt og skriver data/data.js (brukes av index.html).
import { readFileSync, writeFileSync } from 'node:fs';
import { analyze } from './analyze.js';

const versjoner = [
  { id: 'original', navn: 'Original', fil: 'data/original-observert.html',
    merk: 'Basert på observert kildeinnhold. H1 og kontaktlenker er ikke verifisert og telles ikke.',
    extras: { llms: undefined, robots: undefined }, ukjent: ['H1', 'Kontakt (tel/mailto)'] },
  { id: 'v1', navn: 'V1 – forbedret', fil: 'sider/1-v1-forbedret.html',
    extras: { llms: false, robots: undefined } },
  { id: 'v2', navn: 'V2 – utvidet', fil: 'sider/2-v2-utvidet.html',
    extras: { llms: false, robots: undefined } },
  { id: 'v3', navn: 'V3 – ferdig', fil: 'sider/3-ferdig.html',
    merk: 'llms.txt må legges i rotmappen på nettstedet for å telle.',
    extras: { llms: false, robots: undefined } },
];

const resultater = versjoner.map(v => {
  const html = readFileSync(v.fil, 'utf8');
  const r = analyze(html, v.fil, v.extras);
  if (v.ukjent) {
    r.points = r.points.map(p => v.ukjent.includes(p.label) ? { ...p, status: 'ukjent', value: 'Ikke verifisert' } : p);
  }
  const ukjentPoeng = r.points.filter(p => v.ukjent && v.ukjent.includes(p.label)).reduce((s, p) => s + p.points, 0);
  return {
    id: v.id, navn: v.navn, merk: v.merk || null,
    score: r.score, maxScore: r.maxScore - (v.ukjent ? ukjentPoeng : 0),
    checks: r.points,
  };
});

const data = { generert: new Date().toISOString(), versjoner: resultater };
writeFileSync('data/data.js', 'window.DATA = ' + JSON.stringify(data, null, 2) + ';\n');
writeFileSync('data/resultater.json', JSON.stringify(data, null, 2) + '\n');
for (const r of resultater) console.log(r.navn.padEnd(18), `${r.score}/${r.maxScore}`);
