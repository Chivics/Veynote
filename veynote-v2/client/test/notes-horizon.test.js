import test from "node:test";import assert from "node:assert/strict";import {notesHorizon} from "../src/utils/notesHorizon.js";
test("Overview horizon shows near-term connected work without duplicating writing and tasks",()=>{
 const now=new Date(2026,9,28,12),items=[{type:"business",date:"2026-10-28",id:"b"},{type:"note",date:"2026-10-28",id:"n"},{type:"task",date:"2026-10-29",id:"t"},{type:"trade",date:"2026-11-02",id:"r"},{type:"reminder",date:"2026-11-03",id:"m"},{type:"business",date:"2026-11-04",id:"later"}];
 assert.deepEqual(notesHorizon(items,now).map(x=>x.id),["b","r","m"]);
});
