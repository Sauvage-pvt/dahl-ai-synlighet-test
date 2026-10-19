// Spør ChatGPT om anbefalinger og sjekker om bedriften nevnes.
// Kjør: OPENAI_API_KEY=sk-... node analyzer/ai-sjekk.mjs --bransje "elektriker" --sted "Steinkjer" --url https://eksempel.no [--navn "Firma AS"]
// Koster penger (3 kall til OpenAI). Skriver data/ai-sjekk.js som index.html leser.
import { writeFileSync } from 'node:fs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, arr) => {
  if (a.startsWith('--')) acc.push([a.slice(2), arr[i + 1]]);
  return acc;
}, []));

const bransje = (args.bransje || '').trim();
const sted = (args.sted || '').trim();
const navn = (args.navn || '').trim();
const apiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

if (!apiKey) { console.error('Mangler OPENAI_API_KEY'); process.exit(1); }
if (!bransje || !sted || !args.url) { console.error('Bruk: --bransje, --sted, --url (og valgfritt --navn)'); process.exit(1); }

const domene = new URL(args.url.startsWith('http') ? args.url : 'https://' + args.url).hostname.replace(/^www\./, '');

const sporsmal = [
  `Hvilke bedrifter tilbyr ${bransje} i ${sted}?`,
  `Jeg trenger ${bransje} i nærheten av ${sted}. Hvem anbefaler du?`,
  `Hva er de beste ${bransje}-bedriftene i ${sted} og omegn?`,
];

async function spor(q) {
  const r = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Du er en hjelpsom assistent som svarer en norsk forbruker. Svar på spørsmålet med de konkrete bedriftene du ville anbefalt, i prioritert rekkefølge (maks 8). Svar KUN med JSON: {"bedrifter":[{"navn":"...","nettside":"domene eller null"}]}. Ikke finn på bedrifter du ikke kjenner til.' },
        { role: 'user', content: q },
      ],
    }),
    signal: AbortSignal.timeout(25000),
  });
  if (!r.ok) throw new Error(`OpenAI svarte ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const data = await r.json();
  try {
    const parsed = JSON.parse(data.choices[0].message.content);
    return (parsed.bedrifter || []).filter(b => b && b.navn).map(b => ({ navn: String(b.navn), nettside: b.nettside ? String(b.nettside).toLowerCase() : null }));
  } catch { return []; }
}

const forenkle = s => String(s).toLowerCase().replace(/\b(as|asa|da|ans|enk)\b/g, '').replace(/[^a-z0-9æøå]/g, '');
const svar = await Promise.all(sporsmal.map(spor));

const nokler = [domene.split('.')[0], navn].filter(x => x && x.length > 2).map(forenkle);
const treff = b => {
  const s = forenkle(`${b.navn} ${b.nettside || ''}`);
  return nokler.some(n => s.includes(n)) || (b.nettside || '').includes(domene);
};

const resultater = sporsmal.map((q, i) => {
  const liste = svar[i];
  const idx = liste.findIndex(treff);
  return { sporsmal: q, nevnt: idx >= 0, plass: idx >= 0 ? idx + 1 : null, antall: liste.length, bedrifter: liste.map(b => b.navn) };
});

const teller = {};
svar.flat().forEach(b => { if (treff(b)) return; teller[b.navn.trim()] = (teller[b.navn.trim()] || 0) + 1; });
const konkurrenter = Object.entries(teller).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([navn, ganger]) => ({ navn, ganger }));

const data = {
  generert: new Date().toISOString(), modell: model, bransje, sted, domene,
  nevntAntall: resultater.filter(r => r.nevnt).length, totalt: sporsmal.length,
  resultater, konkurrenter,
};
writeFileSync('data/ai-sjekk.js', 'window.AI_SJEKK = ' + JSON.stringify(data, null, 2) + ';\n');
console.log(`Nevnt i ${data.nevntAntall} av ${data.totalt} spørsmål. Skrev data/ai-sjekk.js`);
