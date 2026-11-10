// One-time, deterministic repair of the supplied high.json fixture.
// Keeps every note's ID, Tick, type and length; moves only the twelve Tap lanes
// that overlap a Hold in the current editor validation.
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const fixturePath=path.join(__dirname,'fixtures/high.json');
const backupPath=path.join(__dirname,'fixtures/high.original.json');
if(fs.existsSync(backupPath))throw new Error('Original backup already exists; refusing to run twice.');
const raw=fs.readFileSync(fixturePath,'utf8');
const chart=JSON.parse(raw);
const context=vm.createContext({});context.window=context;
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/gimmicks.js'),'utf8'),context);
const rules=context.PairFlipRules;
const line=rules.timeline(chart.notes);
if(line.errors.length)throw new Error('Gimmick timeline is invalid: '+line.errors[0]);
const ids=[456,467,498,637,638,640,642,644,646,1589,1598,1601];
const moved=[];
for(const id of ids){
  const note=chart.notes.find(n=>n.id===id);
  if(!note||note.type!=='tap')throw new Error(`Expected Tap ID ${id}`);
  const slots=rules.before(line.history,note.tick);
  const oldSlot=slots.indexOf(note.lane);
  const blocked=new Set();
  for(const other of chart.notes){
    if(other.id===id||other.type==='scramble')continue;
    if(other.tick===note.tick || (['hold','shift'].includes(other.type)&&other.tick<=note.tick&&other.endTick>=note.tick)){
      blocked.add(slots.indexOf(other.lane));
    }
  }
  const choices=[0,1,2,3,4,5].filter(slot=>!blocked.has(slot));
  choices.sort((a,b)=>Math.abs(a-oldSlot)-Math.abs(b-oldSlot)||a-b);
  if(!choices.length)throw new Error(`No free physical slot for ID ${id}`);
  note.lane=slots[choices[0]];
  moved.push({id,tick:note.tick,from:slots[oldSlot],to:note.lane});
}
fs.writeFileSync(backupPath,raw);
fs.writeFileSync(fixturePath,JSON.stringify(chart,null,2)+'\n');
console.log(JSON.stringify(moved,null,2));
