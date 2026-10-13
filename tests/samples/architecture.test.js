import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve, relative } from "node:path";
import { init, parse } from "es-module-lexer";
import { builtinPluginCatalog } from "../../src/builtins.js";
import { root, source, files, externalRoots, graph } from "../helpers/module-audit.js";
describe("Sample architecture validation",()=>{
 it("rejects forbidden legacy symbols without migration exceptions",()=>{
  const forbidden=/\b(?:refreshView|addRefreshHandler|subscribeInteractions|buildGpxOverlay|buildPhotoOverlay)\b|app\.(?:core|state)\b|core\.state\b|state\.(?:entries|sources|layers)\b|entry\.(?:source|layer|interactions)\b|selection-hub|interaction-hub/;
  for (const fixture of ["app.core", "entry.source", "refreshView()", 'import "./selection-hub.js"']) expect(forbidden.test(fixture)).toBe(true);
  const matches=[];for(const directory of ["src","plugins","samples"])for(const path of files(directory).filter(p=>/\.(?:js|mjs|html|css|json)$/.test(p))){source(path).split("\n").forEach((line,index)=>{if(forbidden.test(line))matches.push(`${path}:${index+1}:${line}`);});}expect(matches).toEqual([]);
 });
 it("traverses every parsed plugin/sample import and excludes removed helpers",async()=>{
  await init; const imports=parse(source("src/builtins.js"))[0].filter(item=>item.d>=0); expect(imports).toHaveLength(builtinPluginCatalog.length);
  const loadRoots=imports.map(item=>{expect(item.n).toBeTypeOf("string");return relative(root,resolve(root,"src",item.n));});
  const all=await graph(["src/index.js",...loadRoots,...externalRoots(),...files("samples").filter(p=>/\.(js|html)$/.test(p))]);
  for(const path of ["src/core/input-processing.js","src/core/remote-url-import.js","src/ui/styles.js","src/ui/surfaces.js","src/gpx/source.js"]){expect(all.has(path)).toBe(false);expect(existsSync(resolve(root,path))).toBe(false);}
 });
});
