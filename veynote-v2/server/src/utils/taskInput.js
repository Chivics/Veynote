function text(value, label, max, required = false) {
  if (typeof value !== 'string' || (required && !value.trim())) throw Error(`${label} is required and must be text.`);
  if (value.length > max) throw Error(`${label} must be ${max} characters or fewer.`);
  return required ? value.trim() : value;
}
function taskInput(body, {create = false, kind = 'task'} = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error('Send task fields as an object.');
  const data = {};
  if (kind === 'comment') {
    data.body = text(body.body, 'Comment', 15000, true);
    return data;
  }
  if (create || body.title !== undefined) data.title = text(body.title, 'Title', 191, true);
  if (kind === 'subtask') {
    if (body.done !== undefined) {
      if (typeof body.done !== 'boolean') throw Error('Subtask completion must be true or false.');
      data.done = body.done;
    }
    return data;
  }
  if (body.status !== undefined) {
    if (!['TODO','IN_PROGRESS','DONE'].includes(body.status)) throw Error('Choose To Do, In progress, or Done.');
    data.status=body.status;
  }
  for (const [key,label,max] of [['priority','Priority',191],['description','Description',15000],['tags','Tags',191]]) {
    if (body[key] === undefined) continue;
    let value=body[key];
    if (key === 'tags' && Array.isArray(value)) {
      if (value.some(tag => typeof tag !== 'string')) throw Error('Every tag must be text.');
      value=value.join(',');
    }
    data[key]=value === null || value === '' ? null : text(value,label,max);
  }
  if (body.dueDate !== undefined) {
    const value=body.dueDate;
    if (value === '' || value === null) data.dueDate=null;
    else {
      if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(value)) throw Error('Choose a valid due date.');
      const date=new Date(value), day=new Date(value.slice(0,10)+'T00:00:00Z');
      if (!Number.isFinite(+date) || !Number.isFinite(+day) || day.toISOString().slice(0,10)!==value.slice(0,10) || day.getUTCFullYear()<1000) throw Error('Choose a valid due date.');
      data.dueDate=date;
    }
  }
  return data;
}
function validateTaskBody(options) {
  return (req,res,next) => {
    try { req.taskData=taskInput(req.body,options); next(); }
    catch (error) { res.status(400).json({error:error.message}); }
  };
}
module.exports={taskInput,validateTaskBody};
