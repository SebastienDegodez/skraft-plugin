/*
 * Sélecteur de version de la documentation SKRAFT.
 *
 * Lit <racine du site>/versions.json (écrit par la construction du site sur main)
 * et propose, depuis l'en-tête, de passer d'une version à l'autre en restant sur
 * la même page. Sans manifeste (aperçu local), la pastille reste affichée, inactive.
 *
 * Les fonctions pures sont exposées sur window.SkraftVersionPicker pour les tests.
 */
(function (global) {
  'use strict';

  // Dernier segment d'un baseurl qui désigne un arbre de version publié :
  // un tag (v1.15.2, v2.0.0-alpha.19) ou une branche d'intégration (v2-next).
  var TREE_SEGMENT = /^(v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?|v\d+-next)$/;

  var I18N = {
    fr: {
      button: 'Version de la documentation',
      latest: 'Dernière',
      latestShort: 'Dernière',
      integration: 'intégration',
      prerelease: 'pré-version',
      line: 'ligne',
      filter: 'Filtrer les versions',
      filterPlaceholder: 'Filtrer… (ex. 1.14)',
      all: 'Toutes les versions',
      fewer: 'Versions récentes seulement',
      empty: 'Aucune version ne correspond.',
      pinned: 'Accès rapide',
      lines: 'Versions publiées',
      current: 'version affichée',
      unavailable: 'Liste des versions indisponible dans cet aperçu',
      bannerText: "Vous lisez la documentation de la branche d'intégration V2, pas encore publiée.",
      bannerLink: 'Voir la version publiée',
      bannerClose: 'Masquer ce bandeau'
    },
    en: {
      button: 'Documentation version',
      latest: 'Latest',
      latestShort: 'Latest',
      integration: 'integration',
      prerelease: 'pre-release',
      line: 'line',
      filter: 'Filter versions',
      filterPlaceholder: 'Filter… (e.g. 1.14)',
      all: 'All versions',
      fewer: 'Recent versions only',
      empty: 'No version matches.',
      pinned: 'Quick access',
      lines: 'Published versions',
      current: 'version shown',
      unavailable: 'Version list unavailable in this preview',
      bannerText: 'You are reading the documentation of the V2 integration branch, not released yet.',
      bannerLink: 'See the released version',
      bannerClose: 'Dismiss this banner'
    }
  };

  function strings(lang) {
    return I18N[lang === 'en' ? 'en' : 'fr'];
  }

  /** Sépare le baseurl Jekyll en racine du site et arbre de version courant. */
  function splitBase(baseurl) {
    var clean = String(baseurl || '').replace(/\/+$/, '');
    var i = clean.lastIndexOf('/');
    var seg = clean.slice(i + 1);
    if (i >= 0 && TREE_SEGMENT.test(seg)) return { root: clean.slice(0, i), tree: seg + '/' };
    return { root: clean, tree: '' };
  }

  /** Chemin de la page relatif à son arbre de version (« fr/explanation/pipeline/ »). */
  function relPath(pathname, base) {
    var prefix = base.root + '/' + base.tree;
    var p = String(pathname || '');
    if (p.indexOf(prefix) === 0) return p.slice(prefix.length);
    if (p + '/' === prefix) return '';
    return '';
  }

  function manifestUrl(base) {
    return base.root + '/versions.json';
  }

  function targetUrl(base, targetPath, rel, hash) {
    return base.root + '/' + (targetPath || '') + (rel || '') + (hash || '');
  }

  function fallbackUrl(base, targetPath, lang) {
    return base.root + '/' + (targetPath || '') + (lang === 'en' ? 'en' : 'fr') + '/';
  }

  /** Valide et normalise le manifeste ; null s'il est inutilisable. */
  function buildModel(manifest) {
    if (!manifest || !Array.isArray(manifest.lines)) return null;
    var lines = manifest.lines
      .filter(function (l) { return l && Array.isArray(l.versions) && l.versions.length; })
      .map(function (l) {
        return {
          line: String(l.line),
          prerelease: !!l.prerelease,
          versions: l.versions
            .filter(function (v) { return v && v.tag && typeof v.path === 'string'; })
            .map(function (v) { return { tag: String(v.tag), path: v.path }; })
        };
      })
      .filter(function (l) { return l.versions.length; });
    var integration = manifest.integration && typeof manifest.integration.path === 'string'
      ? { branch: String(manifest.integration.branch || ''), path: manifest.integration.path }
      : null;
    return { latest: manifest.latest ? String(manifest.latest) : null, lines: lines, integration: integration };
  }

  function integrationName(model) {
    return model.integration.path.replace(/\/$/, '');
  }

  /** Libellé court de l'arbre courant, pour la pastille. */
  function currentLabel(model, tree, t) {
    if (!tree) return model && model.latest ? model.latest : t.latestShort;
    return tree.replace(/\/$/, '');
  }

  function isIntegrationTree(tree, model) {
    if (!tree) return false;
    if (model && model.integration) return model.integration.path === tree;
    return /-next\/$/.test(tree);
  }

  /** Vrai si l'arbre courant est un patch qui n'est pas le plus récent de sa ligne. */
  function isOlderPatch(model, tree) {
    return model.lines.some(function (l) {
      return l.versions.slice(1).some(function (v) { return v.path === tree; });
    });
  }

  /**
   * Liste à afficher : entrées épinglées, puis une entrée par ligne (patch le plus
   * récent) ou tous les patches. Un filtre non vide cherche dans toutes les versions.
   */
  function listEntries(model, opts) {
    var t = opts.t;
    var q = String(opts.query || '').trim().toLowerCase();
    var all = !!opts.all || q !== '';
    var out = [];
    var match = function (e) {
      if (!q) return true;
      return [e.label, e.meta, e.badge && e.badge.text, e.keywords].join(' ').toLowerCase().indexOf(q) !== -1;
    };

    var pinned = [];
    if (model.latest) {
      pinned.push({ id: 'latest', path: '', label: t.latest + ' — ' + model.latest, meta: '', keywords: 'latest dernière stable', badge: null });
    }
    if (model.integration) {
      pinned.push({
        id: 'integration', path: model.integration.path, label: integrationName(model),
        meta: model.integration.branch, keywords: 'next', badge: { kind: 'int', text: t.integration }
      });
    }
    pinned = pinned.filter(match);
    if (pinned.length) {
      out.push({ kind: 'heading', text: t.pinned });
      pinned.forEach(function (e) { e.kind = 'option'; out.push(e); });
    }

    var rows = [];
    model.lines.forEach(function (l) {
      var versions = all ? l.versions : l.versions.slice(0, 1);
      versions.forEach(function (v, i) {
        rows.push({
          kind: 'option',
          id: 'v-' + v.tag,
          path: v.path,
          label: v.tag,
          meta: all && i > 0 ? '' : t.line + ' ' + l.line,
          keywords: l.line,
          badge: l.prerelease ? { kind: 'pre', text: t.prerelease } : null,
          nested: all && i > 0
        });
      });
    });
    rows = rows.filter(match);
    if (rows.length) {
      out.push({ kind: 'heading', text: t.lines });
      Array.prototype.push.apply(out, rows);
    }
    return out;
  }

  /** HEAD sur la cible : faux seulement si le serveur répond une erreur (404…). */
  function probe(url) {
    if (typeof fetch !== 'function') return Promise.resolve(true);
    return fetch(url, { method: 'HEAD', cache: 'no-store' })
      .then(function (r) { return r.ok; })
      .catch(function () { return true; });
  }

  function resolveTarget(base, targetPath, rel, hash, lang) {
    var url = targetUrl(base, targetPath, rel, hash);
    if (!rel) return Promise.resolve(url);
    return probe(targetUrl(base, targetPath, rel, '')).then(function (ok) {
      return ok ? url : fallbackUrl(base, targetPath, lang);
    });
  }

  var api = {
    splitBase: splitBase,
    relPath: relPath,
    manifestUrl: manifestUrl,
    targetUrl: targetUrl,
    fallbackUrl: fallbackUrl,
    buildModel: buildModel,
    listEntries: listEntries,
    currentLabel: currentLabel,
    isIntegrationTree: isIntegrationTree,
    resolveTarget: resolveTarget,
    strings: strings,
    // Point d'entrée de navigation, remplaçable par les tests.
    navigate: function (url) { global.location.assign(url); }
  };
  global.SkraftVersionPicker = api;

  if (typeof document === 'undefined') return;

  /* ------------------------------------------------------------------ UI -- */

  var uid = 0;

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function storageGet(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function storageSet(key, value) {
    try { global.localStorage.setItem(key, value); } catch (e) { /* stockage indisponible */ }
  }

  function mount(root) {
    if (root.__vpick) return;
    root.__vpick = true;
    uid += 1;

    var lang = root.getAttribute('data-lang') === 'en' ? 'en' : 'fr';
    var t = strings(lang);
    var base = splitBase(root.getAttribute('data-baseurl'));
    var rel = relPath(global.location.pathname, base);
    var btn = root.querySelector('.vpick__btn');
    var label = root.querySelector('.vpick__label');
    var pop = root.querySelector('.vpick__pop');
    if (!btn || !label || !pop) return;

    var model = null;
    var showAll = false;
    var entries = [];
    var active = -1;
    var listId = 'vpick-list-' + uid;

    function setLabel(text) {
      label.textContent = text;
      btn.setAttribute('aria-label', t.button + ' : ' + text);
    }

    setLabel(currentLabel(null, base.tree, t));
    btn.setAttribute('aria-disabled', 'true');
    btn.title = t.unavailable;
    root.classList.add('is-disabled');

    // Popover : filtre + liste + bascule « toutes les versions ».
    pop.textContent = '';
    var search = el('div', 'vpick__search');
    var input = el('input', 'vpick__filter');
    input.type = 'search';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.placeholder = t.filterPlaceholder;
    input.setAttribute('aria-label', t.filter);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', listId);
    input.setAttribute('aria-autocomplete', 'list');
    search.appendChild(input);
    var list = el('ul', 'vpick__list');
    list.id = listId;
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', t.button);
    var empty = el('p', 'vpick__empty', t.empty);
    empty.hidden = true;
    var toggle = el('button', 'vpick__all');
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    pop.appendChild(search);
    pop.appendChild(list);
    pop.appendChild(empty);
    pop.appendChild(toggle);
    btn.setAttribute('aria-controls', pop.id);

    function isCurrent(e) { return e.path === base.tree; }

    function render() {
      entries = listEntries(model, { t: t, all: showAll, query: input.value });
      list.textContent = '';
      var options = [];
      entries.forEach(function (e, i) {
        if (e.kind === 'heading') {
          var h = el('li', 'vpick__heading', e.text);
          h.setAttribute('role', 'presentation');
          list.appendChild(h);
          return;
        }
        var li = el('li', 'vpick__option' + (e.nested ? ' is-nested' : ''));
        li.id = listId + '-' + i;
        li.setAttribute('role', 'option');
        li.setAttribute('data-path', e.path);
        li.setAttribute('aria-selected', isCurrent(e) ? 'true' : 'false');
        if (isCurrent(e)) li.classList.add('is-current');
        var check = el('span', 'vpick__check');
        check.setAttribute('aria-hidden', 'true');
        li.appendChild(check);
        li.appendChild(el('span', 'vpick__name', e.label));
        if (e.badge) li.appendChild(el('span', 'vpick__badge vpick__badge--' + e.badge.kind, e.badge.text));
        if (e.meta) li.appendChild(el('span', 'vpick__meta', e.meta));
        if (isCurrent(e)) {
          var sr = el('span', 'vpick__sr', ' (' + t.current + ')');
          li.appendChild(sr);
        }
        li.addEventListener('pointerdown', function (ev) { ev.preventDefault(); });
        li.addEventListener('click', function () { choose(e); });
        li.addEventListener('pointermove', function () { setActive(options.indexOf(li)); });
        list.appendChild(li);
        options.push(li);
      });
      list.__options = options;
      empty.hidden = options.length > 0;
      toggle.hidden = input.value.trim() !== '';
      toggle.textContent = showAll ? t.fewer : t.all;
      toggle.setAttribute('aria-expanded', showAll ? 'true' : 'false');
      var cur = options.findIndex(function (o) { return o.classList.contains('is-current'); });
      setActive(input.value.trim() ? (options.length ? 0 : -1) : (cur >= 0 ? cur : 0));
    }

    function setActive(i) {
      var options = list.__options || [];
      options.forEach(function (o) { o.classList.remove('is-active'); });
      active = options.length ? Math.max(-1, Math.min(i, options.length - 1)) : -1;
      if (active >= 0) {
        options[active].classList.add('is-active');
        input.setAttribute('aria-activedescendant', options[active].id);
        if (options[active].scrollIntoView) options[active].scrollIntoView({ block: 'nearest' });
      } else {
        input.removeAttribute('aria-activedescendant');
      }
    }

    function open() {
      if (!model || root.classList.contains('is-open')) return;
      input.value = '';
      showAll = isOlderPatch(model, base.tree);
      render();
      pop.hidden = false;
      root.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      input.focus();
    }

    function close(restoreFocus) {
      if (!root.classList.contains('is-open')) return;
      pop.hidden = true;
      root.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      if (restoreFocus) btn.focus();
    }

    function choose(e) {
      if (isCurrent(e)) { close(true); return; }
      root.setAttribute('aria-busy', 'true');
      resolveTarget(base, e.path, rel, global.location.hash, lang).then(function (url) {
        root.removeAttribute('aria-busy');
        api.navigate(url);
      });
    }

    btn.addEventListener('click', function () {
      if (!model) return;
      if (root.classList.contains('is-open')) close(false); else open();
    });
    btn.addEventListener('keydown', function (ev) {
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); open(); }
    });
    input.addEventListener('input', render);
    input.addEventListener('keydown', function (ev) {
      var n = (list.__options || []).length;
      if (ev.key === 'ArrowDown') { ev.preventDefault(); if (n) setActive((active + 1) % n); }
      else if (ev.key === 'ArrowUp') { ev.preventDefault(); if (n) setActive((active - 1 + n) % n); }
      else if (ev.key === 'Enter') {
        ev.preventDefault();
        var opts = entries.filter(function (x) { return x.kind === 'option'; });
        if (active >= 0 && opts[active]) choose(opts[active]);
      }
    });
    toggle.addEventListener('click', function () { showAll = !showAll; render(); input.focus(); });
    root.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && root.classList.contains('is-open')) { ev.preventDefault(); close(true); }
    });
    root.addEventListener('focusout', function (ev) {
      if (ev.relatedTarget && !root.contains(ev.relatedTarget)) close(false);
    });
    document.addEventListener('pointerdown', function (ev) {
      if (!root.contains(ev.target)) close(false);
    });

    function enable(m) {
      model = m;
      setLabel(currentLabel(model, base.tree, t));
      btn.removeAttribute('aria-disabled');
      btn.removeAttribute('title');
      root.classList.remove('is-disabled');
    }

    if (isIntegrationTree(base.tree, null)) banner(root, base, rel, lang, t);

    if (typeof fetch === 'function') {
      fetch(manifestUrl(base), { cache: 'no-cache' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (m) { var built = buildModel(m); if (built) enable(built); })
        .catch(function () { /* aperçu local : pas de manifeste */ });
    }
  }

  /* -------------------------------------------- bandeau « intégration » -- */

  function banner(root, base, rel, lang, t) {
    var key = 'skraft:version-banner:' + base.tree;
    if (storageGet(key) === 'dismissed') return;
    var nav = root.closest('.site-nav');
    var b = el('div', 'vbanner' + (nav ? ' vbanner--nav' : ''));
    b.setAttribute('role', 'note');
    b.setAttribute('lang', lang);
    var inner = el('div', 'vbanner__inner');
    var text = el('span', 'vbanner__text', t.bannerText + ' ');
    var link = el('a', 'vbanner__link', t.bannerLink);
    link.href = targetUrl(base, '', rel, '');
    link.addEventListener('click', function (ev) {
      if (ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button) return;
      ev.preventDefault();
      resolveTarget(base, '', rel, global.location.hash, lang).then(api.navigate);
    });
    text.appendChild(link);
    var x = el('button', 'vbanner__close');
    x.type = 'button';
    x.setAttribute('aria-label', t.bannerClose);
    x.innerHTML = '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
    inner.appendChild(text);
    inner.appendChild(x);
    b.appendChild(inner);

    var html = document.documentElement;
    function measure() { html.style.setProperty('--vbanner-h', b.offsetHeight + 'px'); }
    if (nav) {
      nav.appendChild(b);
      html.classList.add('has-vbanner');
      measure();
      global.addEventListener('resize', measure);
    } else {
      var host = root.parentElement;
      host.parentNode.insertBefore(b, host.nextSibling);
    }
    x.addEventListener('click', function () {
      storageSet(key, 'dismissed');
      b.remove();
      html.classList.remove('has-vbanner');
      html.style.removeProperty('--vbanner-h');
      global.removeEventListener('resize', measure);
    });
  }

  function init() {
    var roots = document.querySelectorAll('.vpick[data-skraft-version-switcher]');
    Array.prototype.forEach.call(roots, mount);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(typeof window !== 'undefined' ? window : globalThis);
