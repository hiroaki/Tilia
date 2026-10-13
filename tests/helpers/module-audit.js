import { expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { init, parse } from "es-module-lexer";
const root=resolve(import.meta.dirname,"../.."),source=p=>readFileSync(resolve(root,p),"utf8");
function files(directory){return readdirSync(resolve(root,directory),{withFileTypes:true}).flatMap(item=>item.isDirectory()?files(`${directory}/${item.name}`):[`${directory}/${item.name}`]);}
const externalRoots = () => readdirSync(resolve(root, "plugins"), {withFileTypes:true})
 .filter(item => item.isDirectory()).map(item => `plugins/${item.name}/loader.js`);
function parsedEdges(module, path) {
 const imports = parse(module)[0].filter(item => item.d !== -2);
 const dynamic = imports.filter(item => item.n === undefined);
 if (path === "src/plugins/runtime/discovery.js") {
  expect(dynamic).toHaveLength(1);
  expect(module.slice(dynamic[0].ss, dynamic[0].se)).toBe("import(url.href)");
 } else expect(dynamic, `nonliteral imports: ${path}`).toEqual([]);
 return imports.filter(item => item.n !== undefined).map(item => ({
  target:item.n.startsWith(".")?relative(root,resolve(dirname(resolve(root,path)),item.n)):item.n,
  lazy:item.d>=0,
 }));
}
async function edges(path){await init;const text=source(path);const modules=path.endsWith(".html")?[...text.matchAll(/<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]):[text];return modules.flatMap(module=>parsedEdges(module,path));}
async function graph(roots,{lazy=true}={}){const seen=new Set(),queue=[...roots];while(queue.length){const path=queue.shift();if(seen.has(path))continue;seen.add(path);for(const edge of await edges(path)){if(!lazy&&edge.lazy)continue;if(edge.target.startsWith("src/")||edge.target.startsWith("plugins/")){expect(existsSync(resolve(root,edge.target)),`${path} -> ${edge.target}`).toBe(true);queue.push(edge.target);}}}return seen;}

export { root, source, files, externalRoots, parsedEdges, edges, graph };
