export function tradingMonthReview(rows = [], year, month) {
  const ordered = [...rows].sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const trades = ordered.reduce((sum, row) => sum + number(row.tradeCount), 0);
  const closed = ordered.reduce((sum, row) => sum + number(row.wins) + number(row.losses) + number(row.breakEven), 0);
  const wins = ordered.reduce((sum, row) => sum + number(row.wins), 0);
  const evidence = ordered.reduce((sum, row) => sum + number(row.documented), 0);
  const best = ordered.reduce((leader, row) => !leader || number(row.netR) > number(leader.netR) ? row : leader, null);
  return {
    rows: ordered,
    days: ordered.length,
    trades,
    netR: fixed(ordered.reduce((sum, row) => sum + number(row.netR), 0)),
    positive: ordered.filter(row => number(row.netR) > 0).length,
    wins,
    closed,
    winRate: closed ? Math.round((wins / closed) * 100) : 0,
    evidencePercent: trades ? Math.round((evidence / trades) * 100) : 0,
    best,
    weeks: tradingWeeks(ordered, year, month),
  };
}

export function tradingWeeks(rows = [], year, month) {
  const days = new Date(year, month, 0).getDate();
  const firstWeekday = new Date(year, month - 1, 1).getDay();
  const byDay = Object.fromEntries(rows.map(row => [new Date(row.date).getUTCDate(), row]));
  const weeks = [];
  let start = 1;
  let end = Math.min(days, 7 - firstWeekday);
  while (start <= days) {
    const active = [];
    for (let day = start; day <= end; day += 1) if (byDay[day]) active.push(byDay[day]);
    const trades = active.reduce((sum, row) => sum + number(row.tradeCount), 0);
    const documented = active.reduce((sum, row) => sum + number(row.documented), 0);
    weeks.push({
      start,
      end,
      active,
      trades,
      netR: fixed(active.reduce((sum, row) => sum + number(row.netR), 0)),
      positiveDays: active.filter(row => number(row.netR) > 0).length,
      evidencePercent: trades ? Math.round((documented / trades) * 100) : 0,
    });
    start = end + 1;
    end = Math.min(days, start + 6);
  }
  return weeks;
}

function number(value) { return Number(value) || 0; }
function fixed(value) { return Number(value.toFixed(2)); }
