function calendarEventPublic(event, userId) {
  const note = event.linkedNote;
  const trade = event.linkedTrade;
  const noteVisible = note && note.userId === userId && !note.isLocked && !note.isWill && !note.isTrashed;
  const tradeVisible = trade && trade.userId === userId;
  return {
    ...event,
    linkedNoteId: noteVisible ? note.id : null,
    linkedNote: noteVisible ? { id: note.id, title: note.title } : null,
    linkedTradeId: tradeVisible ? trade.id : null,
    linkedTrade: tradeVisible ? { id: trade.id, title: trade.title } : null,
  };
}

module.exports = { calendarEventPublic };
