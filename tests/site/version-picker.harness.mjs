// Banc d'essai autonome du sélecteur de version : rend l'include Jekyll
// (_includes/version-picker.html) dans une page statique, avec les feuilles de style
// et le script du site, et sert un faux site versionné via page.route — sans Jekyll.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'site');
export const ORIGIN = 'http://site.test';
export const ROOT = '/skraft-plugin';

export const MANIFEST = {
  latest: 'v1.15.2',
  lines: [
    { line: '2.0', prerelease: true, current: false, versions: [
      { tag: 'v2.0.0-alpha.19', path: 'v2.0.0-alpha.19/' },
      { tag: 'v2.0.0-alpha.18', path: 'v2.0.0-alpha.18/' },
    ] },
    { line: '1.15', prerelease: false, current: true, versions: [
      { tag: 'v1.15.2', path: 'v1.15.2/' },
      { tag: 'v1.15.1', path: 'v1.15.1/' },
      { tag: 'v1.15.0', path: 'v1.15.0/' },
    ] },
    { line: '1.14', prerelease: false, current: false, versions: [
      { tag: 'v1.14.1', path: 'v1.14.1/' },
      { tag: 'v1.14.0', path: 'v1.14.0/' },
    ] },
    { line: '1.13', prerelease: false, current: false, versions: [{ tag: 'v1.13.0', path: 'v1.13.0/' }] },
  ],
  integration: { branch: 'integration/v2-next', path: 'v2-next/' },
};

// Pages présentes dans chaque arbre : la page « pipeline » manque à v1.14.x (repli).
const PAGES = ['fr/', 'en/', 'fr/explanation/pipeline/', 'en/explanation/pipeline/'];
const exists = (tree, rel) => PAGES.includes(rel) && !(tree.startsWith('v1.14') && rel.includes('pipeline'));

/** Rend l'include comme le ferait Jekyll pour un baseurl et une langue donnés. */
export function renderInclude(baseurl, lang) {
  const src = readFileSync(join(SITE, '_includes', 'version-picker.html'), 'utf8');
  const out = src
    .replace(/\{%-? comment -?%\}[\s\S]*?\{%-? endcomment -?%\}\n?/g, '')
    .replace(/\{%-? assign [^%]*-?%\}\n?/g, '')
    .replace(/\{\{\s*'([^']+)'\s*\|\s*relative_url\s*\}\}/g, (_, p) => `${baseurl}${p}`)
    .replace(/\{\{\s*site\.baseurl\s*\}\}/g, baseurl)
    .replace(/\{\{\s*vpick_lang\s*\}\}/g, lang);
  if (/\{\{|\{%/.test(out)) throw new Error(`Liquid non rendu dans l'include :\n${out}`);
  return out;
}

/** Page complète : en-tête du site (même structure que site-nav.html) + contenu. */
export function renderPage({ baseurl, lang = 'fr', title = 'Pipeline' }) {
  const css = ['design-tokens.css', 'site.css', 'doc.css']
    .map((f) => `<link rel="stylesheet" href="${baseurl}/assets/css/${f}" />`).join('\n');
  const doors = lang === 'en'
    ? ['The handbook', 'For executives', 'Get started', 'Dashboard', 'Presentation']
    : ['Le handbook', 'Pour décideurs', 'Démarrer', 'Tableau de bord', 'Présentation'];
  return `<!DOCTYPE html>
<html lang="${lang}">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${title} — SKRAFT</title>${css}</head>
<body>
<nav class="site-nav" aria-label="nav">
  <a class="site-nav__brand" href="${baseurl}/">SK<span>RAFT</span></a>
  ${renderInclude(baseurl, lang)}
  <button class="site-nav__burger" id="navBurger" aria-label="Menu" aria-expanded="false">≡</button>
  <div class="site-nav__links" id="navLinks">
    ${doors.map((d) => `<a href="#">${d}</a>`).join('\n    ')}
    <span class="site-nav__lang"><a href="#">${lang === 'en' ? 'FR' : 'EN'}</a></span>
  </div>
</nav>
<div class="doc-layout">
  <aside class="doc-sidebar" id="doc-sidebar"><p style="color:var(--color-dimmed);font-size:.85rem">Sommaire</p></aside>
  <main class="doc-content content"><h1>${title}</h1>
    <p>Le pipeline SKRAFT enchaîne cinq phases : DISCOVER, DISCUSS, DESIGN, DISTILL, DELIVER.</p>
    <p>Chaque phase produit un artefact relu avant la suivante.</p>
  </main>
</div>
</body></html>`;
}

/**
 * Sert le faux site sur la page Playwright.
 * manifest: objet servi à <racine>/versions.json, ou null pour une réponse 404.
 */
export async function serveSite(page, { manifest = MANIFEST, lang = 'fr' } = {}) {
  const requests = [];
  await page.route(`${ORIGIN}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    requests.push({ method: req.method(), path: url.pathname });
    const path = url.pathname;
    if (path === `${ROOT}/versions.json`) {
      return manifest
        ? route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(manifest) })
        : route.fulfill({ status: 404, body: 'not found' });
    }
    const asset = /\/assets\/(css|js)\/([\w.-]+)$/.exec(path);
    if (asset) {
      return route.fulfill({
        status: 200,
        contentType: asset[1] === 'css' ? 'text/css' : 'application/javascript',
        body: readFileSync(join(SITE, 'assets', asset[1], asset[2]), 'utf8'),
      });
    }
    if (!path.startsWith(`${ROOT}/`)) return route.fulfill({ status: 404, body: '' });
    const rest = path.slice(ROOT.length + 1);
    const m = /^(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?\/|v\d+-next\/)?(.*)$/.exec(rest);
    const tree = m[1] || '';
    const rel = m[2];
    if (!exists(tree, rel)) return route.fulfill({ status: 404, contentType: 'text/html', body: '<h1>404</h1>' });
    const pageLang = rel.startsWith('en/') ? 'en' : lang;
    return route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: renderPage({ baseurl: `${ROOT}${tree ? `/${tree.replace(/\/$/, '')}` : ''}`, lang: pageLang }),
    });
  });
  return requests;
}
