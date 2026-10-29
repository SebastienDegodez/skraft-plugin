// Adds a version switcher to every built HTML page of a version, whatever the
// layouts of the tag it was built from. The switcher reads <base>/versions.json.
//   node eng/docs/inject-switcher.mjs <dir> <baseurl> <currentPath>
import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export function switcherSnippet(baseurl, currentPath) {
  const base = JSON.stringify(baseurl.replace(/\/$/, ''));
  const cur = JSON.stringify(currentPath);
  return `<script data-skraft-version-switcher>(function(){var b=${base},c=${cur};
fetch(b+'/versions.json').then(function(r){return r.json()}).then(function(m){
var s=document.createElement('select');s.setAttribute('aria-label','Documentation version');
s.style.cssText='position:fixed;right:12px;bottom:12px;z-index:1000;padding:4px 8px';
function add(l,p){var o=document.createElement('option');o.value=p;o.textContent=l;if(p===c)o.selected=true;s.appendChild(o)}
add('latest ('+m.latest+')','');
m.lines.forEach(function(l){l.versions.forEach(function(v){add(v.tag+(l.prerelease?' (pre-release)':''),v.path)})});
if(m.integration)add(m.integration.branch+' (integration)',m.integration.path);
s.onchange=function(){location.href=b+'/'+s.value};document.body.appendChild(s)}).catch(function(){})})();</script>`;
}

export function injectInto(html, snippet) {
  if (html.includes('data-skraft-version-switcher')) return html;
  return html.includes('</body>') ? html.replace('</body>', `${snippet}</body>`) : html + snippet;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : p.endsWith('.html') && out.push(p);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [dir, baseurl = '', currentPath = ''] = process.argv.slice(2);
  const snippet = switcherSnippet(baseurl, currentPath);
  for (const f of walk(dir)) writeFileSync(f, injectInto(readFileSync(f, 'utf8'), snippet));
}
