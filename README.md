# Dahl – AI-synlighet (testrepo)

Ett sted for testene av AI-synlighet og nettside. Viser hvordan siden endrer seg fra første versjon til den ferdige, og hva som kan gjøres for kunden.

## Åpne
- `index.html` – fem faner: før og etter, tiltak for kunden, tekstforslag, AI-anbefalinger, om testen.

## Innhold
- `sider/` – versjonene som testes
  - `1-v1-forbedret.html` – første forbedring
  - `2-v2-utvidet.html` – utvidet med FAQ (uten FAQPage-skjema)
  - `3-ferdig.html` – ferdig versjon: FAQPage-skjema og lenke til llms.txt
  - `llms.txt` – må ligge i rotmappen på nettstedet
  - `be-om-anmeldelse/`, `priser-google-tripadvisor.md` – støttemateriell
- `data/original-observert.html` – baseline for den originale siden (bygget fra observert innhold, se begrensning under)
- `analyzer/analyze.js` – analysator (også Cloudflare Worker, `POST /analyze`)
- `analyzer/run.mjs` – kjører analysatoren på alle versjonene og skriver `data/data.js`
- `analyzer/ai-sjekk.mjs` – spør ChatGPT om anbefalinger og sjekker om bedriften nevnes. Koster API-kall.
- `eksempler/` – Per Frisør-testene (eget kundeeksempel)

## ChatGPT-sjekk
```
OPENAI_API_KEY=sk-... node analyzer/ai-sjekk.mjs --bransje "elektriker" --sted "Steinkjer" --url https://eksempel.no --navn "Firma AS"
```
Skriver `data/ai-sjekk.js`, som fane 4 viser. 3 kall til OpenAI per kjøring.

## Kjør på nytt
```
node analyzer/run.mjs
```
Oppdaterer `data/data.js`, som `index.html` leser fra.

## Begrensning
Den originale siden (`bedriftssok.lenkemotor.workers.dev/dahl`) kunne ikke hentes rå fra testmiljøet. Baseline er bygget fra observert innhold: tittel, manglende meta-beskrivelse, canonical og JSON-LD. H1 og kontaktlenker er ikke verifisert og telles ikke i den originale versjonen.

## Deploy
Cloudflare Pages/Workers. For at llms.txt skal telle, må `sider/llms.txt` ligge i rotmappen på det publiserte nettstedet.
