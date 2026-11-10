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
    if(type==='scramble') return atTick.some(n=>n.type==='scramble') || atTick.filter(n=>n.type!=='scramble').length>=6;
    if(atTick.some(n=>n.type!=='scramble' && getRuntimeVisualLane(n)===candidateVisualLane)) return true;
    return atTick.some(n=>n.type==='scramble') && atTick.filter(n=>n.type!=='scramble').length>=5;
  }

  // flagsは使わなくなったから削除しておいたよ
  function placeNote(type, tick, lane){
    if (!isValidPlacement(type, lane)) return null;
    if (isNoteOccupied(tick, lane, type)) return null;
    pushHistory();
    const n = { id: nextId(), tick, lane, type, size:1 };
    if(type==='hold' || type==='shift'){ n.endTick = tick + snapTicks()*MIN_HOLD_LEN_UNITS; }
    chart.notes.push(n);
    selectOnly(n.id);
    resizeCanvas(); draw(); updateNoteCounts(); updateInspector(); updateFooterCounts();
    return n;
  }

  function deleteNoteById(id){
    pushHistory();
    chart.notes = chart.notes.filter(n=>n.id!==id);
    selectedIds.delete(id);
    resizeCanvas(); draw(); updateNoteCounts(); updateInspector(); updateFooterCounts();
  }

  function deleteSelected(){
    if(selectedIds.size===0) return;
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
    pushHistory();
    const newIds = [];
    drag.items.forEach(item => {
      const t = drag.snapTick + item.dTick;
      const rawLane = getPasteDestinationLane(item, drag.lane, drag.sourceAnchorLane, drag.flipped);
      if(t < 0) return;
      if (!isValidPlacement(item.type, item.type === 'scramble' ? 6 : rawLane)) return;
      const newId = nextId();
      const l = getInternalLaneForNewNote(rawLane, item.type, t, newId);
      if (!isValidPlacement(item.type, l)) return;
      if (isNoteOccupied(t, l, item.type)) return;

      const n = { id: newId, tick: t, lane: l, type: item.type, size: item.size || 1 };
      if(item.dEndTick != null) {
        n.endTick = drag.snapTick + item.dEndTick;
      }
      if(doesHoldCrossScramble(n.type, n.tick, n.endTick)) return;
      if(item.mutatorData) n.mutatorData = JSON.parse(JSON.stringify(item.mutatorData));

      chart.notes.push(n);
      newIds.push(n.id);
    });
    drag = null;
    clearSelection();
    newIds.forEach(id => selectedIds.add(id));
    if(isSwapVisualizeMode) rebuildLaneStates();
    updateNoteCounts();
    updateInspector();
    draw();
  }

  async function runSwapSimulator() {
    if (!chart || !Array.isArray(chart.notes)) return;
    const crossingHold = findHoldCrossingScramble();
    if(crossingHold){
      showAppMessage(`ID ${crossingHold.id} の${crossingHold.type.toUpperCase()}がSCRAMBLEをまたいでいます。先に譜面を修正してください。`);
      return;
    }
    const invalidPlacement = findInvalidNotePlacement();
    if(invalidPlacement){
      showAppMessage(`ID ${invalidPlacement.id} の${invalidPlacement.type.toUpperCase()}は、このレーンへ配置できません。先に譜面を修正してください。`);
      return;
    }
    const message = `この譜面を「Swap Visualize ONの見た目で作成された譜面」として、ゲームで同じ見た目になる内部レーンへ変換します。\n\nこの操作はUndoで元に戻せます。実行しますか？`;
    if (!await showAppConfirm(message,'Swap Simulator','変換する')) return;

    const nextLanes = new Map();
    let mapping = createLaneMapping();
    const notesByTick = new Map();
    chart.notes.forEach(n => {
      if(!notesByTick.has(n.tick)) notesByTick.set(n.tick, []);
      notesByTick.get(n.tick).push(n);
    });
    const ticks = [...notesByTick.keys()].sort((a,b)=>a-b);
    for(const tick of ticks){
      const notesAtTick = notesByTick.get(tick).slice().sort(compareGameOrder);
      const gimmicks = notesAtTick.filter(n => n.type === 'swap' || n.type === 'scramble');
      const normalNotes = notesAtTick.filter(n => n.type !== 'swap' && n.type !== 'scramble');

      // Same-tick notes intentionally use the mapping before any gimmick at
      // this tick. The gimmicks below only change later ticks.
      normalNotes.forEach(n => {
        nextLanes.set(n.id, mapping[mappingNameForType(n.type)][n.lane]);
      });

      for(const gimmick of gimmicks){
        if(gimmick.type === 'scramble' && gimmick.lane !== 6){
          showAppMessage(`ID ${gimmick.id} のSCRAMBLEは7レーンに配置してください。変換を中止しました。`);
          return;
        }
        nextLanes.set(gimmick.id, gimmick.type === 'scramble' ? 6 : mapping.normal[gimmick.lane]);
      }

      const outputGimmicks = gimmicks.slice().sort((a,b) => {
        const laneDiff = nextLanes.get(a.id) - nextLanes.get(b.id);
        return laneDiff || a.id - b.id;
      });
      if(outputGimmicks.some(g=>g.type === 'scramble')) applyScrambleMapping(mapping);
      else if(outputGimmicks.some(g=>g.type === 'swap' && nextLanes.get(g.id)===0) && outputGimmicks.some(g=>g.type === 'swap' && nextLanes.get(g.id)===5)) swapVisualPositions(mapping,2,3,'normal');
      else outputGimmicks.forEach(gimmick => applySwapMapping(mapping, nextLanes.get(gimmick.id)));

    }

    pushHistory();
    let changed = 0;
    chart.notes.forEach(n => {
      const originalLane = n.lane;
      const mappedLane = nextLanes.get(n.id);
      if (mappedLane !== originalLane) {
        n.lane = mappedLane;
        changed++;
      }
    });

    rebuildLaneStates();
    updateNoteCounts();
    updateInspector();
    resizeCanvas();
    draw();
    showAppToast(`${changed} 件のノーツを変換しました`);
  }

  function mirrorSelected() {
    if(selectedIds.size === 0) return;
    pushHistory();
    const occupied = new Set();
    chart.notes.forEach(n => {
      if(selectedIds.has(n.id)) {
        const visualLane = getVisualLane(n);
        const mirroredVisualLane = visualLane === 6 ? 6 : 5 - visualLane;
        const mirroredLane = getInternalLaneForNewNote(mirroredVisualLane, n.type, n.tick, n.id);
        const position = notePositionKey(n.tick, getRuntimeVisualLane({tick:n.tick, lane:mirroredLane, type:n.type}));
        if(isValidPlacement(n.type, mirroredLane) && !isNoteOccupied(n.tick, mirroredLane, n.type, selectedIds) && !occupied.has(position)) {
          n.lane = mirroredLane;
          occupied.add(position);
        }
      }
    });
    if(isSwapVisualizeMode) rebuildLaneStates();
    updateInspector();
    draw();
  }
