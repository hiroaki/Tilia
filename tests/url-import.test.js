import { describe, expect, it } from "vitest";
import { getContentLength, parseHttpUrl, resolveRemoteFileName } from "../src/core/input-utils.js";
describe("remote metadata", () => {
  it("resolves HTTP URLs and rejects other schemes", () => { expect(parseHttpUrl("https://example.com/a").href).toBe("https://example.com/a"); expect(parseHttpUrl("javascript:alert(1)")).toBeNull(); });
  it("does not turn XML MIME or unnamed downloads into GPX", () => { expect(resolveRemoteFileName("https://example.com/",new Response("",{headers:{"content-type":"application/xml"}}))).toBe("remote"); expect(resolveRemoteFileName("https://example.com/data",new Response("",{headers:{"content-disposition":'attachment; filename="track.xml"'}}))).toBe("track.xml"); });
  it.each([["12",12],["invalid",null],["-2",null],["",null]])("validates Content-Length %s",(value,expected)=>{expect(getContentLength(new Response("",{headers:{"content-length":value}}))).toBe(expected);});
});
