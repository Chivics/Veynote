const express = require("express");
const prisma = require("../lib/prisma");
const { requireAuth } = require("../middleware/auth");
const { calculateTradingAnalytics } = require("../utils/tradingAnalytics");

const router = express.Router();
router.use(requireAuth);

const TEXT_LIMITS = {
  title:140, description:6000, market:120, preferredDirection:32,
  sessions:255, timeframes:255, entryCriteria:12000,
  confirmationCriteria:12000, invalidationCriteria:12000,
  riskPlan:12000, reviewNotes:12000, status:24,
};
const STATUSES = new Set(["ACTIVE", "TESTING", "RETIRED"]);

function input(body, partial = false) {
  const data = {};
  for (const [field, limit] of Object.entries(TEXT_LIMITS)) {
    if (!(field in body)) continue;
    if (body[field] !== null && typeof body[field] !== "string") throw new Error(`${field} must be text.`);
    const value = String(body[field] || "").trim();
    if (value.length > limit) throw new Error(`${field} is too long.`);
    data[field] = value || (field === "title" ? "" : null);
  }
  if (!partial && !data.title) throw new Error("Setup name is required.");
  if (partial && data.title === "") throw new Error("Setup name is required.");
  if (data.status && !STATUSES.has(data.status.toUpperCase())) throw new Error("Choose a valid playbook status.");
  if (data.status) data.status = data.status.toUpperCase();
  return data;
}

function present(playbook) {
  const analytics = calculateTradingAnalytics(playbook.entries || []);
  const completed = [playbook.description, playbook.entryCriteria, playbook.confirmationCriteria, playbook.invalidationCriteria, playbook.riskPlan].filter(Boolean).length;
  return {
    ...playbook,
    entries: undefined,
    tradeCount: playbook.entries?.length || 0,
    completeness: Math.round(completed / 5 * 100),
    performance: analytics.hasData ? {
      closed:analytics.totalTrades, winRate:analytics.winRate, totalR:analytics.totalR,
      expectancy:analytics.expectancy, maximumDrawdown:analytics.maximumDrawdown,
    } : null,
  };
}

router.get("/", async (req, res) => {
  const playbooks = await prisma.tradingPlaybook.findMany({
    where:{ userId:req.userId },
    orderBy:[{ status:"asc" },{ updatedAt:"desc" }],
    include:{ entries:{ where:{ isTrade:true, isDraft:false, archivedAt:null, deletedAt:null }, orderBy:{ entryDate:"asc" } } },
  });
  res.json({ playbooks:playbooks.map(present) });
});

router.post("/", async (req, res) => {
  let data;
  try { data=input(req.body); } catch(error) { return res.status(400).json({error:error.message}); }
  try {
    const playbook=await prisma.tradingPlaybook.create({data:{userId:req.userId,status:"ACTIVE",...data},include:{entries:true}});
    res.status(201).json({playbook:present(playbook)});
  } catch(error) {
    if(error.code === "P2002") return res.status(409).json({error:"A playbook setup with this name already exists."});
    throw error;
  }
});

router.patch("/:id", async (req, res) => {
  const existing=await prisma.tradingPlaybook.findFirst({where:{id:req.params.id,userId:req.userId},select:{id:true}});
  if(!existing) return res.status(404).json({error:"Playbook setup not found."});
  let data;
  try { data=input(req.body,true); } catch(error) { return res.status(400).json({error:error.message}); }
  try {
    const playbook=await prisma.tradingPlaybook.update({where:{id:existing.id},data,include:{entries:{where:{isTrade:true,isDraft:false,archivedAt:null,deletedAt:null},orderBy:{entryDate:"asc"}}}});
    res.json({playbook:present(playbook)});
  } catch(error) {
    if(error.code === "P2002") return res.status(409).json({error:"A playbook setup with this name already exists."});
    throw error;
  }
});

router.delete("/:id", async (req, res) => {
  const existing=await prisma.tradingPlaybook.findFirst({where:{id:req.params.id,userId:req.userId},select:{id:true}});
  if(!existing) return res.status(404).json({error:"Playbook setup not found."});
  await prisma.$transaction([
    prisma.tradingEntry.updateMany({where:{playbookId:existing.id,userId:req.userId},data:{playbookId:null}}),
    prisma.tradingPlaybook.delete({where:{id:existing.id}}),
  ]);
  res.json({ok:true});
});

module.exports=router;
