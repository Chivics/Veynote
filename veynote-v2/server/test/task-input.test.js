const test=require('node:test'), assert=require('node:assert/strict');
const {taskInput,validateTaskBody}=require('../src/utils/taskInput');
test('task validation permits partial edits and explicit field clearing',()=>{
  assert.deepEqual(taskInput({title:'  Review plan ',tags:['work','review'],priority:'',description:null}),{title:'Review plan',tags:'work,review',priority:null,description:null});
  assert.deepEqual(taskInput({dueDate:''}),{dueDate:null});
  assert.deepEqual(taskInput({status:'DONE'}),{status:'DONE'});
});
test('invalid titles, statuses and field types are rejected before database writes',()=>{
  for(const input of [{title:''},{title:123},{title:'x'.repeat(192)},{status:'UNKNOWN'},{tags:[{}]},{description:{}},{priority:false}])assert.throws(()=>taskInput(input));
  assert.throws(()=>taskInput({}, {create:true}));
  assert.throws(()=>taskInput([]));
});
test('due dates reject rollover dates and preserve valid dates',()=>{
  for(const value of ['2026-02-30','2026-13-01','bad','0000-01-01',123])assert.throws(()=>taskInput({dueDate:value}));
  assert.equal(taskInput({dueDate:'2028-02-29'}).dueDate.toISOString(),'2028-02-29T00:00:00.000Z');
  assert.equal(taskInput({dueDate:'2026-09-14T00:00:00.000Z'}).dueDate.toISOString(),'2026-09-14T00:00:00.000Z');
});
test('subtask booleans and comments are validated and ownership fields cannot be injected',()=>{
  assert.throws(()=>taskInput({done:'false'},{kind:'subtask'}));
  assert.deepEqual(taskInput({done:false,userId:'other',taskId:'other'},{kind:'subtask'}),{done:false});
  assert.deepEqual(taskInput({body:' hello ',taskId:'other'},{kind:'comment'}),{body:'hello'});
  assert.throws(()=>taskInput({body:' '},{kind:'comment'}));
  assert.deepEqual(taskInput({title:'Task',userId:'other',id:'other'},{create:true}),{title:'Task'});
});
test('validation middleware returns actionable HTTP 400 without continuing',()=>{
  let status,body,continued=false;
  validateTaskBody()({body:{status:'bad'}},{status(n){status=n;return this;},json(value){body=value;}},()=>{continued=true;});
  assert.equal(status,400);assert.match(body.error,/Choose/);assert.equal(continued,false);
});
