const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const context=vm.createContext({});context.window=context;
vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/gimmicks.js'),'utf8'),context);
const rules=context.PairFlipRules;
const plain=value=>JSON.parse(JSON.stringify(value));
test('same-tick Pair and disjoint Flips apply simultaneously',()=>{
  const notes=[{id:1,tick:10,lane:0,type:'pair_swap'},{id:2,tick:10,lane:1,type:'pair_swap'},
    {id:3,tick:10,lane:2,type:'flip',direction:'right',steps:2}];
  const line=rules.timeline(notes);
  assert.deepEqual(plain(line.errors),[]);
  assert.deepEqual(plain(line.history.at(-1).after),[1,0,3,4,2,5]);
  assert.deepEqual(plain(rules.timeline(notes.slice().reverse()).history.at(-1).after),[1,0,3,4,2,5]);
});
test('overlapping paths, second Pair, and lane 6 Flip are rejected',()=>{
  const flip=(id,lane,steps)=>({id,tick:10,lane,type:'flip',direction:'right',steps});
  assert.ok(rules.timeline([flip(1,1,2),flip(2,3,1)]).errors.length);
  assert.ok(rules.timeline([0,1,4,5].map((lane,i)=>({id:i+1,tick:10,lane,type:'pair_swap'}))).errors.length);
  assert.ok(rules.timeline([flip(1,5,1)]).errors.length);
  assert.ok(rules.timeline([flip(1,6,1)]).errors.length);
});
test('two disjoint Flips share a Tick and Mirror keeps their paths in range',()=>{
  const notes=[{id:1,tick:10,lane:0,type:'flip',direction:'right',steps:1},
    {id:2,tick:10,lane:4,type:'flip',direction:'right',steps:1}];
  assert.deepEqual(plain(rules.timeline(notes).errors),[]);
  assert.deepEqual(plain(rules.timeline(notes).history.at(-1).after),[1,0,2,3,5,4]);
  const mirrored=notes.map(n=>({...n,lane:5-n.lane,direction:'left'}));
  assert.deepEqual(plain(rules.timeline(mirrored).errors),[]);
  assert.deepEqual(plain(rules.timeline(mirrored).history.at(-1).after),[1,0,2,3,5,4]);
});
test('preserving later visual positions remaps logical lane IDs',()=>{
  const old=[{id:1,tick:20,lane:0,type:'tap'}];
  const next=plain(old);next.push({id:2,tick:10,lane:0,type:'flip',direction:'right',steps:1});
  assert.deepEqual(plain(rules.preserveLater(old,next,10)),[]);
  assert.equal(next[0].lane,1);
  assert.equal(rules.before(rules.timeline(next).history,20).indexOf(next[0].lane),0);
});
test('preservation keeps a later Flip path and following note position',()=>{
  const old=[{id:1,tick:20,lane:2,type:'flip',direction:'right',steps:2},
    {id:2,tick:30,lane:4,type:'tap'}];
  const next=plain(old);next.push({id:3,tick:10,lane:2,type:'flip',direction:'right',steps:1});
  assert.deepEqual(plain(rules.preserveLater(old,next,10)),[]);
  const oldLine=rules.timeline(old).history,newLine=rules.timeline(next).history;
  assert.equal(rules.before(oldLine,20).indexOf(old[0].lane),rules.before(newLine,20).indexOf(next[0].lane));
  assert.equal(rules.before(oldLine,30).indexOf(old[1].lane),rules.before(newLine,30).indexOf(next[1].lane));
});
test('preservation leaves the edited gimmick at its chosen destination',()=>{
  const old=[{id:1,tick:10,lane:0,type:'flip',direction:'right',steps:1},{id:2,tick:30,lane:0,type:'tap'}];
  const next=plain(old);next[0].tick=20;next[0].lane=2;
  assert.deepEqual(plain(rules.preserveLater(old,next,10,[1])),[]);
  assert.equal(next[0].lane,2);
  assert.equal(rules.before(rules.timeline(next).history,30).indexOf(next[1].lane),rules.before(rules.timeline(old).history,30).indexOf(old[1].lane));
});
test('editor validation rejects long notes on a moved physical interval',()=>{
  const ctx=vm.createContext({document:{getElementById:()=>({getContext:()=>({})}),querySelectorAll:()=>[]},AudioContext:class{}});
  ctx.window=ctx;ctx.PairFlipRules=rules;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/state.js'),'utf8'),ctx);
  const problems=vm.runInContext("validateGimmickNotes([{id:1,tick:0,endTick:20,lane:2,type:'hold'},{id:2,tick:10,lane:1,type:'flip',direction:'right',steps:2}])",ctx);
  assert.ok(problems.some(x=>x.includes('判定区間')));
});
