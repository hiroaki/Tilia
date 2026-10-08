import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { execFileSync } from "node:child_process";
import { init, parse } from "es-module-lexer";
import { builtinPluginCatalog } from "../src/builtins.js";
import { phase4dPluginClassification } from "../src/plugins/migration-allowlist.js";
const root=resolve(import.meta.dirname,".."),source=p=>readFileSync(resolve(root,p),"utf8");
const disabled=["x-milestone"];
const exceptions=new Set(disabled.map(id=>`plugins/${id}/loader.js`));
function files(directory){return readdirSync(resolve(root,directory),{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(`${directory}/${item.name}`):[`${directory}/${item.name}`]);}
async function edges(path){await init;const text=source(path);const modules=path.endsWith(".html")?[...text.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]):[text];return modules.flatMap(module=>parse(module)[0].filter(item=>item.d!==-2).map(item=>{expect(item.n,`nonliteral import: ${path}:${module.slice(item.ss,item.se)}`).toBeTypeOf("string");return{target:item.n.startsWith(".")?relative(root,resolve(dirname(resolve(root,path)),item.n)):item.n,lazy:item.d>=0};}));}
async function graph(roots,{lazy=true}={}){const seen=new Set(),queue=[...roots];while(queue.length){const path=queue.shift();if(seen.has(path))continue;seen.add(path);for(const edge of await edges(path)){if(!lazy&&edge.lazy)continue;if(edge.target.startsWith("src/")||edge.target.startsWith("plugins/")){expect(existsSync(resolve(root,edge.target)),`${path} -> ${edge.target}`).toBe(true);queue.push(edge.target);}}}return seen;}
describe("Phase 4I qualified architecture audits",()=>{
 it("keeps exact disabled baselines and has no additional forbidden-symbol exceptions",()=>{
  const forbidden=/\b(?:refreshView|addRefreshHandler|subscribeInteractions|buildGpxOverlay|buildPhotoOverlay)\b|app\.(?:core|state)\b|core\.state\b|state\.(?:entries|sources|layers)\b|entry\.(?:source|layer|interactions)\b|selection-hub|interaction-hub/;
  for(const path of exceptions)expect(readFileSync(resolve(root,path)).equals(execFileSync("git",["show",`b4dbb30d3c914ffb6e970a481840c7a914936aea:${path}`]))).toBe(true);
  const matches=[];for(const directory of ["src","plugins","samples"])for(const path of files(directory).filter(p=>/\.(?:js|mjs|html|css|json)$/.test(p))){if(exceptions.has(path))continue;source(path).split("\n").forEach((line,index)=>{if(forbidden.test(line))matches.push(`${path}:${index+1}:${line}`);});}expect(matches).toEqual([]);
 });
 it("traverses parsed enabled/sample imports, excludes old helpers and disabled loader execution",async()=>{
  await init; const imports=parse(source("src/builtins.js"))[0].filter(item=>item.d>=0); expect(imports).toHaveLength(builtinPluginCatalog.length);
  const loadRoots=imports.map(item=>{expect(item.n).toBeTypeOf("string");return relative(root,resolve(root,"src",item.n));});
  const all=await graph(["src/index.js",...loadRoots,...files("samples").filter(p=>/\.(js|html)$/.test(p))]);
  for(const path of exceptions)expect(all.has(path)).toBe(false);
  for(const path of ["src/core/input-processing.js","src/core/remote-url-import.js","src/ui/styles.js","src/ui/surfaces.js"]){expect(all.has(path)).toBe(false);expect(existsSync(resolve(root,path))).toBe(false);}
  expect(phase4dPluginClassification.enabled).toHaveLength(25);expect([...phase4dPluginClassification.disabled].sort()).toEqual([...disabled].sort());
 });
 it("keeps the public eager graph free of Photo implementation and EXIF",async()=>{const eager=await graph(["src/index.js"],{lazy:false});expect([...eager].filter(p=>p.startsWith("src/photo/")||/plugins\/(?:domains\/photo|renderers\/photo|ui\/photo)/.test(p))).toEqual([]);});
 it("keeps generic hosts domain-neutral and prevents foreign renderer readback",async()=>{
  const hosts=[...files("src/ui").filter(p=>p.endsWith(".js")),...['panel','toolbar','layers-control','settings-panel','status-control','base-map-control','map-selection-presenter'].map(n=>`src/plugins/ui/${n}.js`)];
  for(const path of hosts){for(const edge of await edges(path))expect(edge.target,`${path} -> ${edge.target}`).not.toMatch(/^src\/(?:gpx|photo)\/|^src\/plugins\/(?:domains|renderers)\//);expect(source(path)).not.toMatch(/\bsemanticSnapshot\b|snapshot\.(?:data|preferences|derived)/);}
  for(const path of [...hosts,...files("src/plugins/input").filter(p=>p.endsWith(".js")),"src/plugins/ui/elevation-panel.js","src/gpx/ui.js","src/photo/ui.js"])expect(source(path)).not.toMatch(/\b(?:getLayers|eachLayer|getLatLng|getLatLngs|advancedLeafletMap)\b|entry\.(?:layer|interactions)/);
 });
 it("leases every standard feature sheet and leaves only shell primitives in shared CSS",()=>{
  expect(source("src/ui/styles.css")).not.toMatch(/\.tilia-(?:side-panel|elevation|layer-|photo|gpx|url-|file-|status-|popup|info-|time-mode)/);
  for(const [module,sheet] of [["ui/toolbar","toolbar"],["ui/panel","panel"],["ui/layers-control","layers"],["ui/settings-panel","settings"],["ui/status-control","status"],["ui/elevation-panel","elevation"],["input/file-import","file"],["input/url-import","url"],["input/dropzone","drop"]]){expect(source(`src/plugins/${module}.js`)).toContain("context.styles.use");expect(source(`src/plugins/${module}.js`)).toContain(`./${sheet}.css`);}
 });
});
