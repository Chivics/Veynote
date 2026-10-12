import { calendarDayKey, localDayKey } from "./todayWorkspace.js";
export function taskWorkspace(tasks, { view="all", query="", priority="all", now=new Date() }={}) {
  const today=localDayKey(now), search=query.trim().toLocaleLowerCase();
  const open=tasks.filter(task=>task.status!=="DONE");
  const overdue=open.filter(task=>calendarDayKey(task.dueDate) && calendarDayKey(task.dueDate)<today);
  const dueToday=open.filter(task=>calendarDayKey(task.dueDate)===today);
  const upcoming=open.filter(task=>calendarDayKey(task.dueDate)>today);
  const completed=tasks.filter(task=>task.status==="DONE");
  const source={all:tasks,today:dueToday,overdue,upcoming,completed}[view] || tasks;
  const rank=task=>({HIGH:0,MEDIUM:1,LOW:2}[task.priority?.toUpperCase()] ?? 3);
  const visible=source.filter(task=>(priority==="all" || task.priority?.toUpperCase()===priority) && `${task.title} ${task.description || ""} ${task.tags || ""}`.toLocaleLowerCase().includes(search))
    .sort((a,b)=>(calendarDayKey(a.dueDate)||"9999").localeCompare(calendarDayKey(b.dueDate)||"9999") || rank(a)-rank(b) || a.title.localeCompare(b.title));
  return {visible,counts:{all:tasks.length,today:dueToday.length,overdue:overdue.length,upcoming:upcoming.length,completed:completed.length},today};
}
