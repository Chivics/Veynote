function summarizeTradingPerformance(records = [], { showPnl = false } = {}) {
  const closed = records.filter((item) => item.isTrade !== false && item.result && item.result !== "OPEN");
  const wins = closed.filter((item) => item.result === "WIN");
  const losses = closed.filter((item) => item.result === "LOSS");
  const values = closed.map((item) => Number(item.achievedR) || 0);
  const netR = values.reduce((sum, value) => sum + value, 0);
  const grossWin = wins.reduce((sum, item) => sum + Math.max(0, Number(item.achievedR) || 0), 0);
  const grossLoss = Math.abs(losses.reduce((sum, item) => sum + Math.min(0, Number(item.achievedR) || 0), 0));
  const average = rows => rows.length ? Number((rows.reduce((sum, item) => sum + Math.abs(Number(item.achievedR) || 0), 0) / rows.length).toFixed(2)) : null;
  const averageWin = average(wins);
  const averageLoss = average(losses);
  let running = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const curve = [...closed].sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate)).map((item) => {
    running += Number(item.achievedR) || 0;
    peak = Math.max(peak, running);
    maxDrawdown = Math.max(maxDrawdown, peak - running);
    return { date: item.entryDate, value: Number(running.toFixed(2)) };
  });
  const grouped = (key) => Object.values(closed.reduce((groups, item) => {
    const label = String(item[key] || "Unclassified").split(",")[0] || "Unclassified";
    const row = groups[label] ||= { key: label, count: 0, wins: 0, totalR: 0 };
    row.count += 1;
    row.wins += item.result === "WIN" ? 1 : 0;
    row.totalR += Number(item.achievedR) || 0;
    return groups;
  }, {})).map((row) => ({ ...row, winRate: row.count ? Math.round(row.wins / row.count * 100) : 0, totalR: Number(row.totalR.toFixed(2)) }))
    .sort((a, b) => b.totalR - a.totalR).slice(0, 8);

  const hasDecisionEvidence = (item) => Boolean(
    item.content && item.invalidationSignal && item.confirmationSignal &&
    (item.analysisBlocks?.length || item._count?.analysisBlocks || item.hasAnalysis)
  );

  return {
    closed: closed.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: closed.length - wins.length - losses.length,
    netR: Number(netR.toFixed(2)),
    winRate: closed.length ? Math.round(wins.length / closed.length * 100) : 0,
    expectancy: closed.length ? Number((netR / closed.length).toFixed(2)) : 0,
    profitFactor: grossLoss ? Number((grossWin / grossLoss).toFixed(2)) : grossWin ? null : 0,
    averageWin,
    averageLoss,
    payoffRatio: averageWin != null && averageLoss ? Number((averageWin / averageLoss).toFixed(2)) : null,
    bestR: values.length ? Number(Math.max(...values).toFixed(2)) : null,
    worstR: values.length ? Number(Math.min(...values).toFixed(2)) : null,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    reviewCoverage: closed.length ? Math.round(closed.filter((item) => item.postTradeLesson || item.psychologyAfter).length / closed.length * 100) : 0,
    evidenceCoverage: closed.length ? Math.round(closed.filter(hasDecisionEvidence).length / closed.length * 100) : 0,
    ...(showPnl ? { pnl: Number(closed.reduce((sum, item) => sum + (Number(item.profitLoss) || 0), 0).toFixed(2)) } : {}),
    curve,
    setup: grouped("setupTypes"),
    session: grouped("session"),
    instrument: grouped("asset"),
    regime: grouped("marketRegime"),
    evidenceMaturity: closed.length < 20 ? "EARLY" : closed.length < 50 ? "DEVELOPING" : "ESTABLISHED",
  };
}

module.exports = { summarizeTradingPerformance };
