const express = require("express");
const { requireAuth } = require("../middleware/auth");
const { asyncHandler } = require("../middleware/asyncHandler");

function createSharingRoutes({ db }) {
  const router = express.Router();
  router.use(requireAuth);
  router.use((_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });

  router.get("/", asyncHandler(async (req, res) => {
    const status = String(req.query.status || "all");
    const q = String(req.query.q || "").trim().slice(0, 160);
    if (!["all", "public", "discussion"].includes(status)) return res.status(400).json({ error: "Choose a valid sharing view." });
    const where = {
      userId: req.userId,
      isLocked: false,
      isWill: false,
      isTrashed: false,
      ...(status === "public" ? { shareEnabled: true } : status === "discussion" ? { comments: { some: {} } } : { OR: [{ shareEnabled: true }, { comments: { some: {} } }] }),
      ...(q ? { AND: [{ OR: [{ title: { contains: q } }, { contentPreview: { contains: q } }] }] } : {}),
    };
    const notes = await db.note.findMany({
      where,
      select: {
        id:true, title:true, kind:true, contentPreview:true, wordCount:true,
        shareEnabled:true, shareToken:true, updatedAt:true,
        _count:{ select:{ comments:true } },
        comments:{ select:{ id:true, body:true, quote:true, resolvedAt:true, createdAt:true, user:{ select:{ name:true } } }, orderBy:{ createdAt:"desc" }, take:3 },
      },
      orderBy:{ updatedAt:"desc" },
      take:100,
    });
    const openRows = await db.noteComment.groupBy({
      by:["noteId"], where:{ note:{ userId:req.userId, isLocked:false, isWill:false, isTrashed:false }, resolvedAt:null }, _count:{ _all:true },
    });
    const openByNote = new Map(openRows.map(row => [row.noteId, row._count._all]));
    const documents = notes.map(note => ({
      id:note.id, title:note.title, kind:note.kind, preview:note.contentPreview, wordCount:note.wordCount,
      shareEnabled:note.shareEnabled, publicPath:note.shareEnabled && note.shareToken ? `/shared/${note.shareToken}` : null,
      commentCount:note._count.comments, openCommentCount:openByNote.get(note.id) || 0, updatedAt:note.updatedAt,
      recentComments:note.comments.map(comment => ({ id:comment.id, body:comment.body, quote:comment.quote, resolvedAt:comment.resolvedAt, createdAt:comment.createdAt, authorName:comment.user?.name || "Veynote member" })),
    }));
    res.json({
      documents,
      summary:{
        publicDocuments:documents.filter(item => item.shareEnabled).length,
        documentsInDiscussion:documents.filter(item => item.commentCount > 0).length,
        openComments:documents.reduce((sum, item) => sum + item.openCommentCount, 0),
        resolvedComments:documents.reduce((sum, item) => sum + item.commentCount - item.openCommentCount, 0),
      },
    });
  }));
  return router;
}

module.exports = { createSharingRoutes };
