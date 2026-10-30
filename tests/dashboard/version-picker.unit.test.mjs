// Règles pures du sélecteur de version (docs/site/assets/js/version-picker.js),
// chargé dans un contexte isolé sans DOM.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { buildManifest } from '../../eng/docs/versions.mjs';

const source = readFileSync(new URL('../../docs/site/assets/js/version-picker.js', import.meta.url), 'utf8');
const sandbox = {};
vm.runInNewContext(source, { window: sandbox, globalThis: sandbox });
const P = sandbox.SkraftVersionPicker;
const t = P.strings('fr');

const manifest = buildManifest(['v1.13.0', 'v1.14.0', 'v1.14.1', 'v1.15.0', 'v1.15.1', 'v1.15.2', 'v2.0.0-alpha.18', 'v2.0.0-alpha.19']);
const model = P.buildModel(manifest);
const names = (entries) => [...entries].filter((e) => e.kind === 'option').map((e) => e.label);

test('le baseurl donne la racine du site et l\'arbre de version', () => {
  assert.deepEqual({ ...P.splitBase('/skraft-plugin/v2-next') }, { root: '/skraft-plugin', tree: 'v2-next/' });
  assert.deepEqual({ ...P.splitBase('/skraft-plugin/v2-next/') }, { root: '/skraft-plugin', tree: 'v2-next/' });
  assert.deepEqual({ ...P.splitBase('/skraft-plugin/v1.15.2') }, { root: '/skraft-plugin', tree: 'v1.15.2/' });
  assert.deepEqual({ ...P.splitBase('/skraft-plugin/v2.0.0-alpha.19') }, { root: '/skraft-plugin', tree: 'v2.0.0-alpha.19/' });
  assert.deepEqual({ ...P.splitBase('/skraft-plugin') }, { root: '/skraft-plugin', tree: '' });
  assert.deepEqual({ ...P.splitBase('') }, { root: '', tree: '' });
});

test('versions.json est lu à la racine du site, quel que soit l\'arbre', () => {
  assert.equal(P.manifestUrl(P.splitBase('/skraft-plugin/v2-next')), '/skraft-plugin/versions.json');
  assert.equal(P.manifestUrl(P.splitBase('/skraft-plugin')), '/skraft-plugin/versions.json');
});

test('la cible garde le chemin relatif de la page ; le repli vise l\'accueil de la langue', () => {
  const base = P.splitBase('/skraft-plugin/v2-next');
  const rel = P.relPath('/skraft-plugin/v2-next/fr/explanation/pipeline/', base);
  assert.equal(rel, 'fr/explanation/pipeline/');
  assert.equal(P.targetUrl(base, '', rel, '#a'), '/skraft-plugin/fr/explanation/pipeline/#a');
  assert.equal(P.targetUrl(base, 'v1.14.1/', rel, ''), '/skraft-plugin/v1.14.1/fr/explanation/pipeline/');
  assert.equal(P.fallbackUrl(base, 'v1.14.1/', 'en'), '/skraft-plugin/v1.14.1/en/');
  assert.equal(P.relPath('/skraft-plugin/v2-next', base), '');
});

test('le manifeste produit par la construction est accepté tel quel', () => {
  assert.equal(model.latest, 'v1.15.2');
  assert.equal(model.integration.path, 'v2-next/');
  assert.deepEqual([...model.lines].map((l) => l.line), ['2.0', '1.15', '1.14', '1.13']);
  assert.equal(P.buildModel(null), null);
  assert.equal(P.buildModel({ latest: 'v1' }), null);
});

test('liste repliée : épinglés puis le patch le plus récent de chaque ligne', () => {
  const entries = P.listEntries(model, { t });
  assert.deepEqual(names(entries), ['Dernière — v1.15.2', 'v2-next', 'v2.0.0-alpha.19', 'v1.15.2', 'v1.14.1', 'v1.13.0']);
  const pre = entries.find((e) => e.label === 'v2.0.0-alpha.19');
  assert.equal(pre.badge.text, 'pré-version');
  assert.equal(entries.find((e) => e.label === 'v2-next').badge.text, 'intégration');
  assert.equal(entries.find((e) => e.label === 'v1.15.2').badge, null);
});

test('« Toutes les versions » déplie chaque patch ; le filtre cherche partout', () => {
  assert.equal(names(P.listEntries(model, { t, all: true })).length, 2 + 8);
  assert.deepEqual(names(P.listEntries(model, { t, query: '1.14' })), ['v1.14.1', 'v1.14.0']);
  assert.deepEqual(names(P.listEntries(model, { t, query: 'NEXT' })), ['v2-next']);
  assert.deepEqual(names(P.listEntries(model, { t, query: 'zzz' })), []);
});

test('libellé de la pastille et détection de l\'arbre d\'intégration', () => {
  assert.equal(P.currentLabel(null, '', t), 'Dernière');
  assert.equal(P.currentLabel(model, '', t), 'v1.15.2');
  assert.equal(P.currentLabel(model, 'v2-next/', t), 'v2-next');
  assert.equal(P.isIntegrationTree('v2-next/', null), true);
  assert.equal(P.isIntegrationTree('v2-next/', model), true);
  assert.equal(P.isIntegrationTree('v1.15.2/', model), false);
  assert.equal(P.isIntegrationTree('', model), false);
  assert.equal(P.strings('en').bannerLink, 'See the released version');
});

test('une page qui rend le sélecteur n\'en reçoit pas un second à la construction', async () => {
  const { injectInto, switcherSnippet } = await import('../../eng/docs/inject-switcher.mjs');
  const { renderInclude } = await import('../site/version-picker.harness.mjs');
  const html = `<html><body><nav class="site-nav">${renderInclude('/skraft-plugin/v2-next', 'fr')}</nav></body></html>`;
  assert.equal(injectInto(html, switcherSnippet('/skraft-plugin', 'v2-next/')), html);
});
