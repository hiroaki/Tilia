import { describe, expect, it, vi } from "vitest";
import { createScopeController } from "../src/ownership/scope.js";
import { createDropTarget } from "../src/ui/drop-target.js";
import { documentFixture, settle } from "./helpers/scoped-dom.js";
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return{promise,resolve};};
describe("Drop resource ownership and residuals",()=>{
 it("joins an actual invocation resource disposer while leaving plain callback settlement unjoined",async()=>{
  const host=createScopeController(),contributor=createScopeController();await host.commit();await contributor.commit();const container=documentFixture().body,work=deferred(),cleanup=deferred(),started=deferred();
  const bind=createDropTarget({container,hostScope:host.scope})({scope:contributor.scope});
  const lease=bind({id:"resource",onDrop({scope}){scope.defer(async()=>{started.resolve();await cleanup.promise;},{retry:"safe"});return work.promise;}});
  const event=new Event("drop",{cancelable:true});Object.defineProperty(event,"dataTransfer",{value:{types:["Files"],files:[new File(["x"],"x")]}});container.dispatchEvent(event);
  let finished=false;const closing=lease.dispose().then(()=>{finished=true;});await started.promise;await settle();expect(finished).toBe(false);cleanup.resolve();await closing;expect(finished).toBe(true);work.resolve();await contributor.close();await host.close();
 });
 it("revokes immediately on listener cleanup failure and joins safe residual retry",async()=>{
  const host=createScopeController(),contributor=createScopeController();await host.commit();await contributor.commit();const container=documentFixture().body;let fail=true;const remove=container.removeEventListener.bind(container);container.removeEventListener=(...args)=>{if(fail)throw new Error("listener cleanup");return remove(...args);};
  const callback=vi.fn(),errors=[];const lease=createDropTarget({container,hostScope:host.scope,onError:e=>errors.push(e)})({scope:contributor.scope})({id:"failed",onDrop:callback});
  await expect(lease.dispose()).rejects.toMatchObject({code:"SCOPE_DISPOSAL_FAILED"});const event=new Event("drop");Object.defineProperty(event,"dataTransfer",{value:{types:["Files"],files:[new File(["x"],"x")]}});container.dispatchEvent(event);expect(callback).not.toHaveBeenCalled();fail=false;await lease.dispose();await contributor.close();await host.close();
 });
 it("rollback never activates the staged reservation",async()=>{
  const host=createScopeController(),contributor=createScopeController();await host.commit();const container=documentFixture().body,queue=[],callback=vi.fn();
  createDropTarget({container,hostScope:host.scope})({scope:contributor.scope,stage:v=>contributor.stage(v),enqueuePostCommit:f=>queue.push(f),isInstalling:()=>true,isActive:()=>false})({id:"rollback",onDrop:callback});await contributor.abort();queue.forEach(f=>f());const event=new Event("drop");Object.defineProperty(event,"dataTransfer",{value:{types:["Files"],files:[new File(["x"],"x")]}});container.dispatchEvent(event);expect(callback).not.toHaveBeenCalled();await host.close();
 });
});
