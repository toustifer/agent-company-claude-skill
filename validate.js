// validate.js — leader.json schema & integrity checker
// Run: node .mycompany/scripts/validate.js
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const leader = JSON.parse(fs.readFileSync(path.join(ROOT, 'leader', 'leader.json'), 'utf8'));
const errors = [];

// 1. Required top-level fields
['sessionId','goal','createdAt','status','workers','dag'].forEach(f => {
  if (!leader[f]) errors.push(`Missing top-level field: ${f}`);
});
if (!Array.isArray(leader.workers)) errors.push('workers must be an array');
if (!Array.isArray(leader.dag)) errors.push('dag must be an array');

// 2. Worker required fields
const workerIds = new Set();
leader.workers.forEach((w, i) => {
  const prefix = `workers[${i}] (${w.id||'?'})`;
  ['id','title','scope','domain','files','status'].forEach(f => {
    if (w[f] === undefined) errors.push(`${prefix}: missing field "${f}"`);
  });
  if (w.id) {
    if (workerIds.has(w.id)) errors.push(`${prefix}: duplicate worker id`);
    workerIds.add(w.id);
  }
  if (!['idle','busy','merged'].includes(w.status)) errors.push(`${prefix}: invalid status "${w.status}"`);
  if (!Array.isArray(w.files)) errors.push(`${prefix}: files must be an array`);
  if (w.domain !== true && w.domain !== false) errors.push(`${prefix}: domain must be boolean`);
});

// 3. Task required fields
const taskIds = new Set();
leader.dag.forEach((t, i) => {
  const prefix = `dag[${i}] (${t.taskId||'?'})`;
  ['taskId','title','status','assignedWorker','dependencies','outputFiles'].forEach(f => {
    if (t[f] === undefined) errors.push(`${prefix}: missing field "${f}"`);
  });
  if (t.taskId) {
    if (taskIds.has(t.taskId)) errors.push(`${prefix}: duplicate task id`);
    taskIds.add(t.taskId);
    if (!/^[A-Z][A-Z0-9.-]*$/.test(t.taskId)) errors.push(`${prefix}: taskId should match pattern T1, T2, etc`);
  }
  if (!['pending','in_progress','completed'].includes(t.status)) errors.push(`${prefix}: invalid status "${t.status}"`);
  if (!Array.isArray(t.dependencies)) errors.push(`${prefix}: dependencies must be an array`);
  if (!Array.isArray(t.outputFiles)) errors.push(`${prefix}: outputFiles must be an array`);
  if (t.assignedWorker && !workerIds.has(t.assignedWorker)) errors.push(`${prefix}: assignedWorker "${t.assignedWorker}" not found in workers`);
  // Check dependencies point to valid tasks
  t.dependencies?.forEach(dep => {
    if (!taskIds.has(dep) && leader.dag.every(x => x.taskId !== dep)) {
      // Allow if it will be added OR it's a known external dep
      if (!leader.dag.some(x => x.taskId === dep)) errors.push(`${prefix}: dependency "${dep}" not found in dag`);
    }
  });
});

// 4. DAG circular dependency check
function hasCycle(tasks) {
  const visited = new Set(), stack = new Set();
  function dfs(id) { if(stack.has(id)) return true; if(visited.has(id)) return false; visited.add(id); stack.add(id); const t=tasks.find(x=>x.taskId===id); if(t) for(const d of(t.dependencies||[])) if(dfs(d)) return true; stack.delete(id); return false; }
  for(const t of tasks) if(!visited.has(t.taskId)) if(dfs(t.taskId)) return true;
  return false;
}
if (hasCycle(leader.dag)) errors.push('DAG has circular dependencies');

// 5. Worker handbook existence
const workersDir = path.join(ROOT, 'workers');
leader.workers.forEach(w => {
  const hbPath = path.join(workersDir, w.id, 'handbook.json');
  if (!fs.existsSync(hbPath)) errors.push(`Worker ${w.id}: missing handbook.json`);
  const expPath = path.join(workersDir, w.id, 'experience.json');
  if (!fs.existsSync(expPath)) errors.push(`Worker ${w.id}: missing experience.json`);
});

// 6. Templates exist
const tmplPath = path.join(ROOT, 'templates', 'handbook.json');
if (!fs.existsSync(tmplPath)) errors.push('Missing templates/handbook.json');

// Report
if (errors.length === 0) {
  console.log('PASS: leader.json is valid');
  console.log(`  ${leader.workers.length} workers, ${leader.dag.length} tasks`);
  console.log(`  ${leader.dag.filter(t=>t.status==='pending').length} pending, ${leader.dag.filter(t=>t.status==='completed').length} completed`);
} else {
  console.log(`FAIL: ${errors.length} validation errors:\n`);
  errors.forEach(e => console.log('  - ' + e));
  process.exit(1);
}
