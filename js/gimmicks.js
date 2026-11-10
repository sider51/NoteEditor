// Pure RICF-1 v2 lane rules. Slots 0..5 contain logical lanes 0..5.
(function(global){
  'use strict';
  const normal = () => [0,1,2,3,4,5];
  const isLane = lane => Number.isInteger(lane) && lane >= 0 && lane < 6;
  function eventsAt(notes){
    const byTick = new Map();
    for(const note of notes || []) if(['pair_swap','flip','scramble'].includes(note.type)){
      if(!byTick.has(note.tick)) byTick.set(note.tick, []);
      byTick.get(note.tick).push(note);
    }
    return [...byTick].sort((a,b)=>a[0]-b[0]);
  }
  function step(slots, notes, tick){
    const errors = [], pair = notes.filter(n=>n.type==='pair_swap');
    const flips = notes.filter(n=>n.type==='flip');
    const scrambles = notes.filter(n=>n.type==='scramble');
    if(scrambles.length){
      if(notes.length!==1 || scrambles[0].lane!==6) errors.push(`Tick ${tick}: Scramble は単独で配置してください。`);
      return {after:slots.slice().reverse(), errors, footprints:[]};
    }
    if(pair.length!==0 && pair.length!==2) errors.push(`Tick ${tick}: Pair Swap は2ノーツで1セット必要です。`);
    const footprints=[];
    if(pair.length===2){
      const a=slots.indexOf(pair[0].lane), b=slots.indexOf(pair[1].lane);
      if(a<0 || b<0 || a===b) errors.push(`Tick ${tick}: Pair Swap のレーンが不正です。`);
      else footprints.push({kind:'pair_swap', ids:pair.map(n=>n.id), slots:[a,b], a,b});
    }
    for(const flip of flips){
      const a=slots.indexOf(flip.lane), dir=flip.direction==='left'?-1:flip.direction==='right'?1:0;
      const validSteps=Number.isInteger(flip.steps) && flip.steps>=1 && flip.steps<=5;
      const b=a+dir*flip.steps;
      if(a<0 || !dir || !validSteps || b<0 || b>=6){
        errors.push(`ID ${flip.id} / Tick ${tick}: Flip の方向・歩数または移動先が不正です。`);
        continue;
      }
      const used=[]; for(let i=Math.min(a,b);i<=Math.max(a,b);i++) used.push(i);
      footprints.push({kind:'flip',ids:[flip.id],slots:used,a,b});
    }
    const occupied=new Map();
    for(const f of footprints) for(const slot of f.slots){
      if(occupied.has(slot)) errors.push(`Tick ${tick}: 移動区間がスロット ${slot+1} で重なります（ID ${occupied.get(slot)} / ${f.ids.join(', ')}）。`);
      occupied.set(slot,f.ids.join(', '));
    }
    const after=slots.slice();
    if(!errors.length) for(const f of footprints){
      if(f.kind==='pair_swap') [after[f.a],after[f.b]]=[slots[f.b],slots[f.a]];
      else {
        const moved=slots[f.a];
        if(f.b>f.a){for(let i=f.a;i<f.b;i++) after[i]=slots[i+1];}
        else {for(let i=f.a;i>f.b;i--) after[i]=slots[i-1];}
        after[f.b]=moved;
      }
    }
    return {after,errors,footprints};
  }
  function timeline(notes){
    let slots=normal(); const history=[{tick:-1,before:slots.slice(),after:slots.slice()}], errors=[];
    for(const [tick,group] of eventsAt(notes)){
      const result=step(slots,group,tick);
      errors.push(...result.errors);
      history.push({tick,before:slots.slice(),after:result.after.slice(),footprints:result.footprints});
      slots=result.after;
    }
    return {history,errors};
  }
  function before(history,tick){
    let result=history[0].after;
    for(const item of history){if(item.tick>=tick) break; result=item.after;}
    return result;
  }
  function after(history,tick){
    let result=history[0].after;
    for(const item of history){if(item.tick>tick) break; result=item.after;}
    return result;
  }
  function preserveLater(oldNotes,newNotes,editTick,excludedIds=[]){
    const oldLine=timeline(oldNotes);
    const oldById=new Map(oldNotes.map(n=>[n.id,n]));
    const excluded=new Set(excludedIds);
    const existing=newNotes.filter(n=>n.tick>editTick && oldById.has(n.id) && !excluded.has(n.id)).sort((a,b)=>a.tick-b.tick || a.id-b.id);
    for(const note of existing){
      if(note.type==='scramble') continue;
      const original=oldById.get(note.id);
      const oldSlot=before(oldLine.history,original.tick).indexOf(original.lane);
      const newSlot=before(timeline(newNotes).history,note.tick)[oldSlot];
      if(!isLane(newSlot)) return [`ID ${note.id}: 後続の表示位置を維持できません。`];
      note.lane=newSlot;
    }
    return timeline(newNotes).errors;
  }
  global.PairFlipRules=Object.freeze({normal,isLane,eventsAt,step,timeline,before,after,preserveLater});
})(typeof window==='undefined'?globalThis:window);
