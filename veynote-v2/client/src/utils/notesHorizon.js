import { localDayKey } from "./todayWorkspace.js";
export function notesHorizon(entries, now=new Date()) {
  const start=localDayKey(now), end=localDayKey(new Date(now.getFullYear(),now.getMonth(),now.getDate()+6));
  return entries.filter(item=>["reminder","trade","business"].includes(item.type) && item.date>=start && item.date<=end).slice(0,4);
}
