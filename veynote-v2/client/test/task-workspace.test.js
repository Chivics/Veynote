import test from "node:test";
import assert from "node:assert/strict";
import { taskWorkspace } from "../src/utils/taskWorkspace.js";
const now=new Date(2026,9,3,12);
const tasks=[{id:"a",title:"Draft",status:"TODO",dueDate:"2026-10-02T00:00:00Z",priority:"High"},{id:"b",title:"Review",status:"IN_PROGRESS",dueDate:"2026-10-03",priority:"Medium",description:"contract"},{id:"c",title:"Sent",status:"DONE",dueDate:"2026-10-02"},{id:"d",title:"Plan",status:"TODO",dueDate:"2026-10-08"},{id:"e",title:"Someday",status:"TODO"}];
test("deadline views distinguish overdue, today, upcoming and completed without including undated tasks",()=>{const result=taskWorkspace(tasks,{now});assert.deepEqual(result.counts,{all:5,today:1,overdue:1,upcoming:1,completed:1});for(const [view,id] of [["overdue","a"],["today","b"],["upcoming","d"],["completed","c"]])assert.deepEqual(taskWorkspace(tasks,{now,view}).visible.map(x=>x.id),[id]);});
test("search includes descriptions and combines with case-independent priority",()=>{assert.deepEqual(taskWorkspace(tasks,{now,query:"contract",priority:"MEDIUM"}).visible.map(x=>x.id),["b"]);assert.equal(taskWorkspace(tasks,{now,query:"contract",priority:"HIGH"}).visible.length,0);});
