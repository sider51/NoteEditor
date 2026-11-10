// Selection helpers
  // ---------------------------------------------------------------
  function clearSelection(){ selectedIds.clear(); lastClickedId=null; }
  function selectOnly(id){ selectedIds.clear(); selectedIds.add(id); lastClickedId=id; }
  function toggleSelect(id){
    if(selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
    lastClickedId = id;
  }
  function selectRange(id){
    const order = sortedNotes().map(n=>n.id);
    const anchor = lastClickedId!=null ? order.indexOf(lastClickedId) : order.indexOf(id);
    const target = order.indexOf(id);
    const lo = Math.min(anchor,target), hi = Math.max(anchor,target);
    selectedIds.clear();
    for(let i=lo;i<=hi;i++) selectedIds.add(order[i]);
    lastClickedId = id;
  }
  function selectSameType(type){
    selectedIds.clear();
    (chart.notes||[]).forEach(n=>{ if(n.type===type) selectedIds.add(n.id); });
  }

  // ---------------------------------------------------------------
  // History (undo/redo)
  // ---------------------------------------------------------------
  function pushHistory(){
    history.push(JSON.stringify({notes:chart.notes, timing:chart.timing, metadata:chart.metadata}));
    if(history.length>HISTORY_LIMIT) history.shift();
    redoStack = [];
    updateHistoryButtons();
  }
  function undo(){
    if(history.length===0) return;
    redoStack.push(JSON.stringify({notes:chart.notes, timing:chart.timing, metadata:chart.metadata}));
    const prior = JSON.parse(history.pop());
    chart.notes = prior.notes;
    chart.timing = prior.timing;
    chart.metadata = prior.metadata;
    resolution = Number.isInteger(chart.metadata.resolution) && chart.metadata.resolution > 0 ? chart.metadata.resolution : 960;
    clearSelection();
    drag = null;
    resizeCanvas(); draw(); updateMetaStats(); updateNoteCounts(); updateInspector(); updateFooterCounts();
    updateHistoryButtons();
  }
  function redo(){
    if(redoStack.length===0) return;
    history.push(JSON.stringify({notes:chart.notes, timing:chart.timing, metadata:chart.metadata}));
    const next = JSON.parse(redoStack.pop());
    chart.notes = next.notes;
    chart.timing = next.timing;
    chart.metadata = next.metadata;
    resolution = Number.isInteger(chart.metadata.resolution) && chart.metadata.resolution > 0 ? chart.metadata.resolution : 960;
    clearSelection();
    drag = null;
    resizeCanvas(); draw(); updateMetaStats(); updateNoteCounts(); updateInspector(); updateFooterCounts();
    updateHistoryButtons();
  }
  function updateHistoryButtons(){
    el.btnUndo.disabled = history.length===0;
    el.btnRedo.disabled = redoStack.length===0;
  }

  // ---------------------------------------------------------------
  // Note mutation
  // ---------------------------------------------------------------
  function nextId(){ let m=0; (chart.notes||[]).forEach(n=>{ if(n.id>m) m=n.id; }); return m+1; }
  function notePositionKey(tick, lane){ return `${tick}:${lane}`; }
  function isNoteOccupied(tick, lane, type, ignoredIds, pendingNotes=[]){
    rebuildLaneStates();
    const candidate = {tick, lane, type};
    const candidateVisualLane = getRuntimeVisualLane(candidate);
    const atTick=[...(chart.notes||[]).filter(n=>n.tick===tick && !(ignoredIds && ignoredIds.has(n.id))),
      ...pendingNotes.filter(n=>n.tick===tick)];
    if(type==='scramble') return atTick.length>0;
    if(atTick.some(n=>n.type==='scramble')) return true;
    if(atTick.some(n=>n.type!=='scramble' && getRuntimeVisualLane(n)===candidateVisualLane)) return true;
    return false;
  }

  function applyGimmickEdit(mutator, tick, preserve){
    const original=JSON.parse(JSON.stringify(chart.notes));
    const proposed=JSON.parse(JSON.stringify(chart.notes));
    const baselineTimeline=new Set(PairFlipRules.timeline(original).errors);
    const baselineValidation=new Set(validateGimmickNotes(original));
    const result=mutator(proposed);
    if(result===false) return false;
    const oldById=new Map(original.map(n=>[n.id,n]));
    const editedIds=proposed.filter(n=>oldById.has(n.id)&&JSON.stringify(n)!==JSON.stringify(oldById.get(n.id))).map(n=>n.id);
    const errors=(preserve ? PairFlipRules.preserveLater(original,proposed,tick,editedIds) : PairFlipRules.timeline(proposed).errors)
      .filter(issue=>!baselineTimeline.has(issue));
    if(errors.length){showAppMessage(errors[0]);return false;}
    const validation=validateGimmickNotes(proposed).filter(issue=>!baselineValidation.has(issue));
    if(validation.length){showAppMessage(validation[0]);return false;}
    pushHistory();chart.notes=proposed;
    rebuildLaneStates();resizeCanvas();draw();updateNoteCounts();updateInspector();updateFooterCounts();
    return true;
  }

  function placePair(tick,firstLane,secondLane,preserve){
    if(firstLane===secondLane) return false;
    const id=nextId();
    const ok=applyGimmickEdit(notes=>notes.push(
      {id,tick,lane:firstLane,type:'pair_swap',size:1},
      {id:id+1,tick,lane:secondLane,type:'pair_swap',size:1}
    ),tick,preserve);
    if(ok){clearSelection();selectedIds.add(id);selectedIds.add(id+1);updateInspector();draw();}
    return ok;
  }

  function placeFlip(tick,lane,direction,steps,preserve){
    const id=nextId();
    const ok=applyGimmickEdit(notes=>notes.push({id,tick,lane,type:'flip',direction,steps,size:1}),tick,preserve);
    if(ok){selectOnly(id);updateInspector();draw();}
    return ok;
  }

  function changeSelectedFlips(direction,steps){
    const targets=(chart.notes||[]).filter(n=>selectedIds.has(n.id)&&n.type==='flip');
    if(!targets.length)return;
    const tick=Math.min(...targets.map(n=>n.tick));
    applyGimmickEdit(notes=>notes.forEach(n=>{if(selectedIds.has(n.id)&&n.type==='flip'){n.direction=direction;n.steps=steps;}}),tick,!!el.preserveVisualToggle?.checked);
  }

  // flagsは使わなくなったから削除しておいたよ
  function placeNote(type, tick, lane, preserve=false){
    if (!isValidPlacement(type, lane)) return null;
    if (isNoteOccupied(tick, lane, type)) return null;
    if(type==='scramble'){
      const id=nextId();
      if(!applyGimmickEdit(notes=>notes.push({id,tick,lane:6,type,size:1}),tick,preserve))return null;
      selectOnly(id);updateInspector();return chart.notes.find(n=>n.id===id);
    }
    pushHistory();
    const n = { id: nextId(), tick, lane, type, size:1 };
    if(type==='hold' || type==='shift'){ n.endTick = tick + snapTicks()*MIN_HOLD_LEN_UNITS; }
    chart.notes.push(n);
    selectOnly(n.id);
    resizeCanvas(); draw(); updateNoteCounts(); updateInspector(); updateFooterCounts();
    return n;
  }

  function deleteNoteById(id){
    const target=chart.notes.find(n=>n.id===id);
    if(target && ['pair_swap','flip','scramble'].includes(target.type)){
      const ids=target.type==='pair_swap'?chart.notes.filter(n=>n.type==='pair_swap'&&n.tick===target.tick).map(n=>n.id):[id];
      if(applyGimmickEdit(notes=>{for(let i=notes.length-1;i>=0;i--)if(ids.includes(notes[i].id))notes.splice(i,1);},target.tick,!!el.preserveVisualToggle?.checked))ids.forEach(i=>selectedIds.delete(i));
      return;
    }
    pushHistory();
    chart.notes = chart.notes.filter(n=>n.id!==id);
    selectedIds.delete(id);
    resizeCanvas(); draw(); updateNoteCounts(); updateInspector(); updateFooterCounts();
  }

  function deleteSelected(){
    if(selectedIds.size===0) return;
    const ids=new Set(selectedIds);
    for(const n of chart.notes)if(ids.has(n.id)&&n.type==='pair_swap')chart.notes.filter(p=>p.type==='pair_swap'&&p.tick===n.tick).forEach(p=>ids.add(p.id));
    const gimmicks=chart.notes.filter(n=>ids.has(n.id)&&['pair_swap','flip','scramble'].includes(n.type));
    if(gimmicks.length){
      const tick=Math.min(...gimmicks.map(n=>n.tick));
      if(!applyGimmickEdit(notes=>{for(let i=notes.length-1;i>=0;i--)if(ids.has(notes[i].id))notes.splice(i,1);},tick,!!el.preserveVisualToggle?.checked))return;
      clearSelection();return;
    }
    pushHistory();
    chart.notes = chart.notes.filter(n=>!selectedIds.has(n.id));
    clearSelection();
    resizeCanvas(); draw(); updateNoteCounts(); updateInspector(); updateFooterCounts();
  }

  // ---------------------------------------------------------------
  function getPasteDestinationLane(item, targetAnchorLane, sourceAnchorLane, flipped) {
    const sourceLane = item.visualLane != null ? item.visualLane : item.lane;
    const laneOffset = item.dVisualLane != null ? item.dVisualLane : item.dLane;
    if(item.type === 'scramble') return 6;
    if(sourceAnchorLane === 6) return flipped ? 5-sourceLane : sourceLane;
    if (!flipped) {
      return targetAnchorLane + laneOffset;
    }
    const mirroredLane = sourceLane === 6 ? 6 : 5 - sourceLane;
    const mirroredAnchorLane = sourceAnchorLane === 6 ? 6 : 5 - sourceAnchorLane;
    return targetAnchorLane + (mirroredLane - mirroredAnchorLane);
  }

  function commitPaste() {
    if(!drag || drag.mode!=='paste' || !drag.items) return;
    const proposed=JSON.parse(JSON.stringify(chart.notes)),newIds=[];
    let failure='';
    drag.items.forEach(item => {
      if(failure)return;
      const t = drag.snapTick + item.dTick;
      const rawLane = getPasteDestinationLane(item, drag.lane, drag.sourceAnchorLane, drag.flipped);
      if(t < 0 || !isValidPlacement(item.type, item.type === 'scramble' ? 6 : rawLane)){failure='貼り付け先のTickまたはレーンが不正です。';return;}
      const newId = Math.max(0,...proposed.map(n=>n.id))+1;
      const l = getInternalLaneForNewNote(rawLane, item.type, t, newId);
      if (!isValidPlacement(item.type, l)){failure='貼り付け先の論理レーンが不正です。';return;}
      
      const n = { id: newId, tick: t, lane: l, type: item.type, size: item.size || 1 };
      if(item.dEndTick != null) {
        n.endTick = drag.snapTick + item.dEndTick;
      }
      if(doesHoldCrossScramble(n.type, n.tick, n.endTick)){failure='Hold / Shift が Scramble をまたぎます。';return;}
      if(item.direction) n.direction = drag.flipped ? (item.direction==='left'?'right':'left') : item.direction;
      if(item.steps!=null) n.steps=item.steps;
      if(item.mutatorData) n.mutatorData=JSON.parse(JSON.stringify(item.mutatorData));
      
      proposed.push(n);
      newIds.push(n.id);
    });
    const errors=failure?[failure]:validateGimmickNotes(proposed);
    if(errors.length){showAppMessage(errors[0]);return;}
    pushHistory();chart.notes=proposed;
    drag = null;
    clearSelection();
    newIds.forEach(id => selectedIds.add(id));
    if(isSwapVisualizeMode) rebuildLaneStates();
    updateNoteCounts();
    updateInspector();
    draw();
  }

  async function runSwapSimulator() {
    if(!chart)return;
    if(!await showAppConfirm('現在の物理レーン番号で作った譜面を、v2 の論理レーン番号へ変換します。Undo で戻せます。','Lane Simulator','変換する'))return;
    const proposed=JSON.parse(JSON.stringify(chart.notes));
    let slots=PairFlipRules.normal();
    const ticks=[...new Set(proposed.map(n=>n.tick))].sort((a,b)=>a-b);
    for(const tick of ticks){
      const group=proposed.filter(n=>n.tick===tick);
      for(const n of group)if(n.type!=='scramble'){
        if(!PairFlipRules.isLane(n.lane)){showAppMessage(`ID ${n.id}: レーンが不正です。`);return;}
        n.lane=slots[n.lane];
      }
      const result=PairFlipRules.step(slots,group.filter(n=>['pair_swap','flip','scramble'].includes(n.type)),tick);
      if(result.errors.length){showAppMessage(result.errors[0]);return;}
      slots=result.after;
    }
    const issues=validateGimmickNotes(proposed);if(issues.length){showAppMessage(issues[0]);return;}
    pushHistory();chart.notes=proposed;rebuildLaneStates();resizeCanvas();draw();updateNoteCounts();updateInspector();showAppToast('論理レーンへ変換しました。');
  }

  function mirrorSelected() {
    if(selectedIds.size === 0) return;
    for(const n of chart.notes)if(selectedIds.has(n.id)&&n.type==='pair_swap')chart.notes.filter(p=>p.type==='pair_swap'&&p.tick===n.tick).forEach(p=>selectedIds.add(p.id));
    const before=JSON.parse(JSON.stringify(chart.notes));
    pushHistory();
    const occupied = new Set();
    let rejected=false;
    chart.notes.forEach(n => {
      if(selectedIds.has(n.id)) {
        const visualLane = getVisualLane(n);
        const mirroredVisualLane = visualLane === 6 ? 6 : 5 - visualLane;
        const mirroredLane = getInternalLaneForNewNote(mirroredVisualLane, n.type, n.tick, n.id);
        const position = notePositionKey(n.tick, getRuntimeVisualLane({tick:n.tick, lane:mirroredLane, type:n.type}));
        if(isValidPlacement(n.type, mirroredLane) && !isNoteOccupied(n.tick, mirroredLane, n.type, selectedIds) && !occupied.has(position)) {
          n.lane = mirroredLane;
          if(n.type==='flip')n.direction=n.direction==='left'?'right':'left';
          occupied.add(position);
        } else rejected=true;
      }
    });
    if(isSwapVisualizeMode) rebuildLaneStates();
    const errors=validateGimmickNotes(chart.notes);
    if(errors.length||rejected){chart.notes=before;history.pop();showAppMessage(errors[0]||'左右反転先のレーンが競合しています。');rebuildLaneStates();draw();return;}
    updateInspector();
    draw();
  }
