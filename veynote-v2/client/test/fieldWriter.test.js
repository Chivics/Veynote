import test from 'node:test';
import assert from 'node:assert/strict';
import { createFieldWriter } from '../src/utils/fieldWriter.js';
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; };

test('older acknowledgement preserves newer typing, including a revert', async () => {
  const request=deferred(), writer=createFieldWriter(() => request.promise);
  writer.set({title:'A'}); const save=writer.save();
  writer.set({title:'B'}); writer.set({title:'A'});
  request.resolve({task:{title:'A'}}); await save;
  assert.equal(writer.hasChanges(),true);
  assert.deepEqual(writer.draft(),{title:'A'});
});
test('queued partial updates persist in order and keep unrelated fields', async () => {
  const first=deferred(), calls=[];
  const writer=createFieldWriter(async fields => { calls.push(fields); if(calls.length===1)await first.promise; return {task:fields}; });
  writer.set({title:'First'}); const a=writer.save(); await Promise.resolve();
  writer.set({description:'New context',title:'Second'}); const b=writer.save();
  assert.equal(calls.length,1); first.resolve(); await Promise.all([a,b]);
  assert.deepEqual(calls,[{title:'First'},{title:'Second',description:'New context'}]);
  assert.equal(writer.hasChanges(),false);
});
test('failed dropdown saves remain dirty and can be retried', async () => {
  let fail=true; const writer=createFieldWriter(async fields => {if(fail)throw Error('offline');return {task:fields};});
  writer.set({status:'DONE'}); await assert.rejects(writer.save(),/offline/);
  await writer.idle(); assert.deepEqual(writer.draft(),{status:'DONE'});
  fail=false; await writer.save(); assert.equal(writer.hasChanges(),false);
});
test('one field acknowledgement does not discard another unblurred field', async () => {
  const request=deferred(), writer=createFieldWriter(() => request.promise);
  writer.set({title:'Saved title'}); const saving=writer.save();
  writer.set({tags:'important'}); request.resolve({}); await saving;
  assert.deepEqual(writer.draft(),{tags:'important'});
});
test('separate record writers never share drafts or failures', async () => {
  const a=createFieldWriter(async()=>{throw Error('unavailable');});
  const b=createFieldWriter(async fields=>fields);
  a.set({title:'A'}); b.set({title:'B'});
  await assert.rejects(a.save()); await b.save();
  assert.equal(a.hasChanges(),true); assert.equal(b.hasChanges(),false);
});
