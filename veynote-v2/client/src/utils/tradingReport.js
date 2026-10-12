export function summarizeTrades(records = []) {
  const trades = records.filter(item => item.isTrade !== false);
  const closed = trades.filter(item => item.result && item.result !== "OPEN");
  const wins = closed.filter(item => item.result === "WIN");
  const losses = closed.filter(item => item.result === "LOSS");
  const rs = closed.map(item => Number(item.achievedR) || 0);
  const netR = rs.reduce((sum,value)=>sum+value,0);
  const pnl = closed.reduce((sum,item)=>sum+(Number(item.profitLoss)||0),0);
  const grossWin = wins.reduce((sum,item)=>sum+Math.max(0,Number(item.achievedR)||0),0);
  const grossLoss = Math.abs(losses.reduce((sum,item)=>sum+Math.min(0,Number(item.achievedR)||0),0));
  let curve=0, peak=0, maxDrawdown=0;
  [...closed].sort((a,b)=>new Date(a.entryDate)-new Date(b.entryDate)).forEach(item=>{ curve += Number(item.achievedR)||0; peak=Math.max(peak,curve); maxDrawdown=Math.max(maxDrawdown,peak-curve); });
  const grouped = key => Object.values(closed.reduce((map,item)=>{
    const value = (item[key] || "Unclassified").split?.(",")[0] || "Unclassified";
    const row=map[value] ||= { key:value,count:0,wins:0,totalR:0 }; row.count++; row.wins += item.result === "WIN" ? 1 : 0; row.totalR += Number(item.achievedR)||0; return map;
  },{})).map(row=>({ ...row, winRate:row.count?Math.round(row.wins/row.count*100):0,totalR:Number(row.totalR.toFixed(2)) })).sort((a,b)=>b.totalR-a.totalR);
  return {
    total:trades.length, closed:closed.length, wins:wins.length, losses:losses.length,
    netR:Number(netR.toFixed(2)), pnl:Number(pnl.toFixed(2)), winRate:closed.length?Math.round(wins.length/closed.length*100):0,
    averageR:closed.length?Number((netR/closed.length).toFixed(2)):0,
    expectancy:closed.length?Number((netR/closed.length).toFixed(2)):0,
    profitFactor:grossLoss?Number((grossWin/grossLoss).toFixed(2)):grossWin?Infinity:0,
    maxDrawdown:Number(maxDrawdown.toFixed(2)), documented:closed.length?Math.round(closed.filter(item=>item.postTradeLesson || item.psychologyAfter).length/closed.length*100):0,
    setup:grouped("setupTypes"), session:grouped("session"), instrument:grouped("asset"),
  };
}

export function reportCsv(records = []) {
  const cells = value => `"${String(value ?? "").replaceAll('"','""')}"`;
  const headings=["Date","Account","Instrument","Direction","Setup","Session","Result","Planned R:R","Achieved R","P&L","Lesson"];
  return [headings.map(cells).join(","), ...records.map(item=>[
    String(item.entryDate||"").slice(0,10),item.account?.name||"Unassigned",item.asset,item.direction,item.setupTypes,item.session,item.result,item.riskReward,item.achievedR,item.profitLoss,item.postTradeLesson,
  ].map(cells).join(","))].join("\r\n");
}
