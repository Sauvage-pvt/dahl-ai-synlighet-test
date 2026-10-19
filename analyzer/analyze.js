// Analysator for AI-synlighet. Samme sjekker som den gamle Cloudflare-versjonen,
// men llms.txt og robots.txt sjekkes nå faktisk (tidligere var de hardkodet til false).
// Brukes av både Worker (default export) og den lokale kjøringen (run.mjs).

export function analyze(html, url, extras = {}) {
  const lower = html.toLowerCase();
  const title = (html.match(/<title[^>]*>([^<]+)/i) || [, ''])[1].trim();
  const metaDesc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || [, ''])[1];
  const hasSchema = lower.includes('application/ld+json');
  const hasLocalSchema = hasSchema && (lower.includes('localbusiness') || lower.includes('professionalservice'));
  const hasCanonical = lower.includes('rel="canonical"') || lower.includes("rel='canonical'");
  const hasFaq = lower.includes('"@type": "faqpage"') || lower.includes('"@type":"faqpage"');
  const hasContact = /tel:|mailto:/i.test(html);
  const hasH1 = /<h1[^>]*>/i.test(html);

  // extras.llms / extras.robots: true | false | undefined (undefined = ikke sjekket, telles ikke)
  const checks = [
    { label: 'Tittel', ok: !!title && title.length > 10, points: 8 },
    { label: 'Meta-beskrivelse', ok: !!metaDesc && metaDesc.length > 50, points: 10 },
    { label: 'H1', ok: hasH1, points: 6 },
    { label: 'Schema (JSON-LD)', ok: hasSchema, points: 12 },
    { label: 'Lokal schema (LocalBusiness el.)', ok: hasLocalSchema, points: 15 },
    { label: 'Canonical', ok: hasCanonical, points: 5 },
    { label: 'FAQ-schema', ok: hasFaq, points: 8 },
    { label: 'Kontakt (tel/mailto)', ok: hasContact, points: 6 },
    { label: 'llms.txt', ok: extras.llms, points: 15 },
    { label: 'AI-boter tillatt (robots.txt)', ok: extras.robots, points: 15 },
  ];

  let score = 0;
  let maxScore = 0;
  const points = checks.map(c => {
    if (c.ok === undefined) {
      return { label: c.label, status: 'ukjent', value: 'Ikke sjekket', points: c.points };
    }
    maxScore += c.points;
    if (c.ok) score += c.points;
    return { label: c.label, status: c.ok ? 'ok' : 'mangler', value: c.ok ? 'På plass' : 'Mangler', points: c.points };
  });

  return { url, title: title || '(ingen tittel)', score, maxScore, points };
}

// robots.txt: gir AI-botene lov? Ingen Disallow: / for GPTBot, ClaudeBot, PerplexityBot (eller *).
export function aiBotsAllowed(txt) {
  const groups = [];
  let cur = null;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.split('#')[0].trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const val = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!cur || cur.rules.length) { cur = { agents: [], rules: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
    } else if (cur && (key === 'allow' || key === 'disallow')) {
      cur.rules.push({ type: key, path: val });
    }
  }
  const bots = ['gptbot', 'claudebot', 'perplexitybot'];
  return bots.every(b => {
    const g = groups.find(x => x.agents.includes(b)) || groups.find(x => x.agents.includes('*'));
    if (!g) return true;
    return !g.rules.some(r => r.type === 'disallow' && r.path === '/');
  });
}

// Cloudflare Worker: POST /analyze  { "url": "https://..." }
export default {
  async fetch(request) {
    const url = new URL(request.url);
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
      status, headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
    if (request.method !== 'POST' || url.pathname !== '/analyze') return json({ error: 'Kun POST til /analyze' }, 405);
    let body;
    try { body = await request.json(); } catch { return json({ error: 'Ugyldig JSON' }, 400); }
    if (!body.url) return json({ error: 'Mangler url' }, 400);

    try {
      const target = new URL(body.url);
      const resp = await fetch(target.href, { headers: { 'User-Agent': 'Dahl-Analyzer/1.0' }, redirect: 'follow' });
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      const html = await resp.text();

      const origin = target.origin;
      const llmsResp = await fetch(origin + '/llms.txt', { headers: { 'User-Agent': 'Dahl-Analyzer/1.0' } }).catch(() => null);
      const robotsResp = await fetch(origin + '/robots.txt', { headers: { 'User-Agent': 'Dahl-Analyzer/1.0' } }).catch(() => null);
      const llms = !!llmsResp && llmsResp.ok;
      const robots = robotsResp && robotsResp.ok ? aiBotsAllowed(await robotsResp.text()) : true;

      return json(analyze(html, target.href, { llms, robots }));
    } catch (err) {
      return json({ error: 'Kunne ikke hente siden: ' + err.message }, 500);
    }
  }
};
