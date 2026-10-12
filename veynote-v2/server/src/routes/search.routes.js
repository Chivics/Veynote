const express=require("express");
const {requireAuth}=require("../middleware/auth");
const {asyncHandler}=require("../middleware/asyncHandler");

function clean(value=""){return String(value).replace(/<[^>]*>/g," ").replace(/\s+/g," ").trim().slice(0,240);}
function createSearchRoutes({db}){
  const router=express.Router();router.use(requireAuth);router.use((_req,res,next)=>{res.set("Cache-Control","no-store");next();});
  router.get("/",asyncHandler(async(req,res)=>{
    const q=String(req.query.q||"").trim().slice(0,120);const scope=String(req.query.scope||"all");
    if(!["all","writing","tasks","library","trading","business"].includes(scope))return res.status(400).json({error:"Choose a valid search scope."});
    if(q.length<2)return res.json({query:q,results:[],counts:{},limited:false});
    const contains=value=>({contains:value});
    const searches={
      writing:()=>db.note.findMany({where:{userId:req.userId,isLocked:false,isWill:false,isTrashed:false,OR:[{title:contains(q)},{contentPreview:contains(q)}]},select:{id:true,title:true,kind:true,contentPreview:true,updatedAt:true,folder:{select:{name:true}}},orderBy:{updatedAt:"desc"},take:12}),
      tasks:()=>db.task.findMany({where:{userId:req.userId,deletedAt:null,OR:[{title:contains(q)},{description:contains(q)},{tags:contains(q)}]},select:{id:true,title:true,description:true,status:true,priority:true,dueDate:true,updatedAt:true},orderBy:{updatedAt:"desc"},take:10}),
      library:()=>db.libraryItem.findMany({where:{userId:req.userId,deletedAt:null,OR:[{title:contains(q)},{category:contains(q)},{notes:contains(q)}]},select:{id:true,title:true,database:true,category:true,status:true,notes:true,updatedAt:true},orderBy:{updatedAt:"desc"},take:10}),
      trading:()=>db.tradingEntry.findMany({where:{userId:req.userId,OR:[{title:contains(q)},{asset:contains(q)},{content:contains(q)},{setupTypes:contains(q)}]},select:{id:true,title:true,asset:true,direction:true,result:true,content:true,entryDate:true,updatedAt:true,account:{select:{name:true}}},orderBy:{updatedAt:"desc"},take:10}),
      business:()=>db.businessCustomer.findMany({where:{workspace:{members:{some:{userId:req.userId}}},isArchived:false,OR:[{name:contains(q)},{company:contains(q)},{email:contains(q)},{notes:contains(q)}]},select:{id:true,workspaceId:true,name:true,company:true,stage:true,notes:true,updatedAt:true},orderBy:{updatedAt:"desc"},take:10}),
    };
    const selected=scope==="all"?Object.keys(searches):[scope];const settled=await Promise.all(selected.map(async key=>[key,await searches[key]()]));
    const groups=Object.fromEntries(settled);const results=[];
    for(const row of groups.writing||[])results.push({id:row.id,type:row.kind==="JOURNAL"?"journal":"note",workspace:row.kind==="JOURNAL"?"Journal":"Notes",title:row.title,context:clean(row.contentPreview)||row.folder?.name||"Writing",meta:row.folder?.name||"Unfiled",updatedAt:row.updatedAt,href:row.kind==="JOURNAL"?`/journal/entries/${row.id}`:`/notes/${row.id}`});
    for(const row of groups.tasks||[])results.push({id:row.id,type:"task",workspace:"Tasks",title:row.title,context:clean(row.description)||"Task",meta:[row.status?.replaceAll("_"," "),row.priority].filter(Boolean).join(" · "),updatedAt:row.updatedAt,href:`/notes/tasks/${row.id}`});
    const libraryPaths={READING:"reading",FILMS:"films",LIFE_GOALS:"goals",TRAVEL_PLANS:"travel",BUCKET_LIST:"bucket",IDEAS:"ideas",PROJECTS:"projects"};
    for(const row of groups.library||[])results.push({id:row.id,type:"library",workspace:"Library",title:row.title,context:clean(row.notes)||row.category||"Library record",meta:[row.database?.replaceAll("_"," "),row.status].filter(Boolean).join(" · "),updatedAt:row.updatedAt,href:`/notes/library/${libraryPaths[row.database]||"projects"}/${row.id}`});
    for(const row of groups.trading||[])results.push({id:row.id,type:"trade",workspace:"Trading",title:row.title,context:clean(row.content)||[row.asset,row.direction].filter(Boolean).join(" · ")||"Trading decision",meta:[row.account?.name,row.result].filter(Boolean).join(" · "),updatedAt:row.updatedAt,href:`/trading/entries/${row.id}`});
    for(const row of groups.business||[])results.push({id:row.id,type:"business",workspace:"Business",title:row.name,context:clean(row.notes)||row.company||"Customer relationship",meta:[row.company,row.stage].filter(Boolean).join(" · "),updatedAt:row.updatedAt,href:`/business/customers/${row.id}?workspace=${encodeURIComponent(row.workspaceId)}`});
    results.sort((a,b)=>new Date(b.updatedAt)-new Date(a.updatedAt));
    res.json({query:q,results:results.slice(0,40),counts:Object.fromEntries(Object.entries(groups).map(([key,rows])=>[key,rows.length])),limited:results.length>40});
  }));return router;
}
module.exports={createSearchRoutes};
