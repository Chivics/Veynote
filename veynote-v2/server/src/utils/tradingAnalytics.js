function rounded(value, digits = 2) {
  return Number((Number(value) || 0).toFixed(digits));
}

function summarizeGroup(trades, getKeys) {
  const groups = new Map();
  for (const trade of trades) {
    const keys = getKeys(trade).filter(Boolean);
    for (const key of keys) {
      const current = groups.get(key) || { key, count: 0, wins: 0, totalR: 0 };
      current.count += 1;
      current.wins += trade.result === "WIN" ? 1 : 0;
      current.totalR += trade.achievedR || 0;
      groups.set(key, current);
    }
  }
  return [...groups.values()]
    .map((group) => ({
      ...group,
      winRate: group.count ? Math.round((group.wins / group.count) * 100) : 0,
      totalR: rounded(group.totalR),
    }))
    .sort((a, b) => b.totalR - a.totalR || b.count - a.count);
}

function calculateTradingAnalytics(entries = []) {
  const trades = entries.filter((entry) => entry.isTrade && entry.result !== "OPEN");
  if (!trades.length) return { hasData: false, totalTrades: 0 };

  const ordered = [...trades].sort((a, b) => new Date(a.entryDate) - new Date(b.entryDate));
  const wins = ordered.filter((trade) => trade.result === "WIN");
  const losses = ordered.filter((trade) => trade.result === "LOSS");
  const breakEven = ordered.filter((trade) => trade.result === "BREAKEVEN");
  const withPlannedRisk = ordered.filter((trade) => Number.isFinite(trade.riskReward));
  const withMoney = ordered.filter((trade) => Number.isFinite(trade.profitLoss));

  let runningR = 0;
  let runningPnl = 0;
  let peakR = 0;
  let maximumDrawdown = 0;
  const cumulativeR = ordered.map((trade) => {
    runningR += trade.achievedR || 0;
    runningPnl += trade.profitLoss || 0;
    peakR = Math.max(peakR, runningR);
    maximumDrawdown = Math.max(maximumDrawdown, peakR - runningR);
    return {
      date: trade.entryDate,
      value: rounded(runningR),
      pnl: rounded(runningPnl),
      tradeId: trade.id,
    };
  });

  const average = (rows, selector) => rows.length
    ? rounded(rows.reduce((sum, row) => sum + selector(row), 0) / rows.length)
    : null;
  const ranked = [...ordered].sort((a, b) => (b.achievedR || 0) - (a.achievedR || 0));
  const setupBreakdown = summarizeGroup(ordered, (trade) => (trade.setupTypes || "").split(",").map((item) => item.trim()));
  const instrumentBreakdown = summarizeGroup(ordered, (trade) => [trade.asset]);
  const directionBreakdown = summarizeGroup(ordered, (trade) => [trade.direction]);

  return {
    hasData: true,
    totalTrades: ordered.length,
    wins: wins.length,
    losses: losses.length,
    breakEven: breakEven.length,
    winRate: Math.round((wins.length / ordered.length) * 100),
    totalR: rounded(runningR),
    realizedPnl: withMoney.length ? rounded(withMoney.reduce((sum, trade) => sum + trade.profitLoss, 0)) : null,
    avgRiskReward: average(withPlannedRisk, (trade) => trade.riskReward),
    averageWin: average(wins, (trade) => trade.achievedR || 0),
    averageLoss: average(losses, (trade) => Math.abs(trade.achievedR || 0)),
    maximumDrawdown: rounded(maximumDrawdown),
    bestTrade: ranked[0] || null,
    worstTrade: ranked.at(-1) || null,
    cumulativeR,
    setupBreakdown,
    instrumentBreakdown,
    directionBreakdown,
  };
}

module.exports = { calculateTradingAnalytics };
