import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import picomatch from "picomatch";

async function globFiles(pattern, cwd) {
  const isMatch = picomatch(pattern, { dot: true });
  const entries = await readdir(cwd, { recursive: true, withFileTypes: true });
  return entries.filter(e => e.isFile())
    .map(e => path.relative(cwd, path.join(e.parentPath, e.name)).split(path.sep).join("/"))
    .filter((fp) => isMatch(fp)).sort();
}
function rx(p){const m=/^\(\?([ims]+)\)/.exec(p); if(m) return new RegExp(p.slice(m[0].length), m[1]); return new RegExp(p);}

const [,, cwd, glob, pattern] = process.argv;
const files = await globFiles(glob, cwd);
console.log(`GLOB '${glob}' -> ${files.length} files`);
for (const f of files) console.log("   ", f);
if (pattern) {
  const r = rx(pattern);
  let anyMatch = false;
  for (const f of files) {
    const c = (await readFile(path.join(cwd, f), "utf-8")).replace(/\r\n/g,"\n");
    if (r.test(c)) { anyMatch = true; console.log(`  MATCH in ${f}: ${JSON.stringify(c.match(r)[0])}`); }
  }
  console.log(anyMatch ? "=> regex MATCHED (file-matches PASS / file-not-matches FAIL)" : "=> regex NOT matched (file-matches FAIL / file-not-matches PASS)");
}
