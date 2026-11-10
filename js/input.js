// Mouse interaction
  // ---------------------------------------------------------------
  el.gridCanvas.addEventListener('contextmenu', (e)=>{
    e.preventDefault();
    const hit = hitTest(e.offsetX, e.offsetY + (el.scrollWrap ? el.scrollWrap.scrollTop : 0));
    if(hit) deleteNoteById(hit.note.id);
  });

  el.gridCanvas.addEventListener('mousedown', (e)=>{
    if(e.button!==0) return;
    const x=e.offsetX, y=e.offsetY + (el.scrollWrap ? el.scrollWrap.scrollTop : 0);
    for(const n of (chart?.notes||[]))if(n.type==='flip' && selectedIds.has(n.id)){
      const route=flipDisplayRoute(n);
      if(route && Math.abs(y-tickToY(n.tick))<12 && Math.abs(x-(laneToX(route.toDisplay)+LANE_W/2))<18){
        drag={mode:'flip-target',id:n.id,targetSlot:route.toDisplay};return;
      }
    }
    const waveformLeft = laneToX(laneCount) + 30;
    if(x >= waveformLeft && x <= waveformLeft + 80){
      seekAudioToTick(yToTick(y));
      return;
    }
    if(drag && drag.mode === 'paste') {
      commitPaste();
      return;
    }
    if(x < RULER_W){
      if(audio.src){
        seekAudioToTick(yToTick(y));
      }
      return;
    }

    if(pointerMode==='place' && (selectedType==='pair_swap' || selectedType==='flip')){
      const tick=snapTick(yToTick(y)),slot=xToLane(x);
      if(slot<0 || slot>5)return;
      if(!pendingGimmick || pendingGimmick.type!==selectedType || pendingGimmick.tick!==tick){
        pendingGimmick={type:selectedType,tick,slot};
        draw();return;
      }
      if(slot===pendingGimmick.slot)return;
      const first=getInternalLaneForNewNote(pendingGimmick.slot,selectedType,tick);
      const second=getInternalLaneForNewNote(slot,selectedType,tick);
      const preserve=!!(e.shiftKey||el.preserveVisualToggle?.checked);
      if(selectedType==='pair_swap')placePair(tick,first,second,preserve);
      else {
        rebuildLaneStates();
        const mapping=getLaneMappingBeforeTick(tick).normal;
        const from=mapping.indexOf(first),to=mapping.indexOf(second);
        placeFlip(tick,first,to<from?'left':'right',Math.abs(to-from),preserve);
      }
      pendingGimmick=null;draw();return;
    }

    let hit = hitTest(x,y);
    if(pointerMode==='place' && hit){
      const tick=snapTick(yToTick(y));
      const lane=getInternalLaneForNewNote(xToLane(x),selectedType,tick);
      if((selectedType==='scramble' && hit.note.type!=='scramble') ||
         (hit.note.type==='scramble' && selectedType!=='scramble' && !isNoteOccupied(tick,lane,selectedType))){
        hit=null;
      }
    }

    if(pointerMode==='select'){
      if(hit){
        if(e.altKey){ selectSameType(hit.note.type); lastClickedId=hit.note.id; }
        else if(e.shiftKey){ selectRange(hit.note.id); }
        else if(e.ctrlKey || e.metaKey){ toggleSelect(hit.note.id); }
        else {
          if(!selectedIds.has(hit.note.id)) selectOnly(hit.note.id);
          if((hit.note.type==='hold' || hit.note.type==='shift') && hit.zone==='end' && selectedIds.size<=1){
            drag = {mode:'resize-hold', note:hit.note, originalEndTick:hit.note.endTick, snapshotTaken:false};
          } else {
            beginGroupDrag(x,y,hit.note);
          }
        }
        updateInspector(); draw();
        return;
      } else {
        if(!(e.shiftKey||e.ctrlKey||e.metaKey)) clearSelection();
        drag = {mode:'rect-select', x0:x,y0:y,x1:x,y1:y, additive:(e.shiftKey||e.ctrlKey||e.metaKey)};
        updateInspector(); draw();
        return;
      }
    } else {
      // placement mode
      if(hit){
        if(hit.note.type==='pair_swap')chart.notes.filter(n=>n.type==='pair_swap'&&n.tick===hit.note.tick).forEach(n=>selectedIds.add(n.id));
        selectOnly(hit.note.id);
        if(hit.note.type==='pair_swap')chart.notes.filter(n=>n.type==='pair_swap'&&n.tick===hit.note.tick).forEach(n=>selectedIds.add(n.id));
        updateInspector();
        if((hit.note.type==='hold' || hit.note.type==='shift') && hit.zone==='end'){
          drag = {mode:'resize-hold', note:hit.note, originalEndTick:hit.note.endTick, snapshotTaken:false};
        } else {
          beginGroupDrag(x,y,hit.note);
        }
        draw();
        return;
      }
      const rawLane = xToLane(x);
      const tick = snapTick(yToTick(y));
      const lane = getInternalLaneForNewNote(rawLane, selectedType, tick);
      if (!isValidPlacement(selectedType, lane)) return;
      if (isNoteOccupied(tick, lane, selectedType)) return;
      if(selectedType==='hold' || selectedType==='shift'){
        drag = { mode:'create-hold', type: selectedType, lane, startTick:tick, currentTick:tick+snapTicks() };
        draw();
      } else {
        placeNote(selectedType, tick, lane,!!(e.shiftKey||el.preserveVisualToggle?.checked));
      }
    }
  });

  function beginGroupDrag(x,y,grabNote){
    if(grabNote.type==='pair_swap')chart.notes.filter(n=>n.type==='pair_swap'&&n.tick===grabNote.tick).forEach(n=>selectedIds.add(n.id));
    const items = new Map();
    selectedIds.forEach(id=>{
      const n = chart.notes.find(n=>n.id===id);
      if(n) items.set(id, {tick:n.tick, lane:n.lane, rawLane: getVisualLane(n, n.tick), endTick:n.endTick});
    });
    drag = {
      mode:'group-move', snapshotTaken:false,
      grabStartTick: grabNote.tick, grabStartLane: grabNote.lane, grabRawLane: getVisualLane(grabNote, grabNote.tick),
      items
      ,beforeNotes:JSON.parse(JSON.stringify(chart.notes)),preserve:!!el.preserveVisualToggle?.checked
    };
  }

  window.addEventListener('mousemove', (e)=>{
    if(!chart) return;
    const rect = el.gridCanvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    const y = localY + (el.scrollWrap ? el.scrollWrap.scrollTop : 0);
    const withinX = x>=0 && x<=rect.width;
    const withinY = localY>=0 && localY<=rect.height;

    if(withinX && withinY && x >= RULER_W && x < laneToX(laneCount)){
      const rawLane = xToLane(x);
      const rawTick = yToTick(y);
      const snapped = snapTick(rawTick);
      const internalLane = getInternalLaneForNewNote(rawLane, selectedType, snapped);

      hoverPos = {x,y,lane:rawLane,snappedTick:snapped};
      el.statTick.textContent = Math.round(rawTick);
      el.statBeat.textContent = (rawTick/resolution).toFixed(2);
      el.statLane.textContent = isSwapVisualizeMode ? `${internalLane} (Vis: ${rawLane})` : rawLane;
      if(drag && drag.mode === 'paste'){
        drag.snapTick = snapped;
        drag.lane = rawLane;
      }
    } else {
      hoverPos = null;
    }

    if(drag){
      if(drag.mode==='flip-target'){
        drag.targetSlot=Math.max(0,Math.min(5,xToLane(x)));
        draw();return;
      }
      if(drag.mode==='rect-select'){
        drag.x1 = x; drag.y1 = y;
        draw();
        return;
      }
      if(!drag.snapshotTaken && drag.mode!=='create-hold'){ pushHistory(); drag.snapshotTaken=true; }
      const lane = xToLane(x);
      const tick = snapTick(yToTick(y));

      if(drag.mode==='create-hold'){
        drag.currentTick = Math.max(drag.startTick+snapTicks(), tick);
      } else if(drag.mode==='resize-hold'){
        drag.note.endTick = Math.max(drag.note.tick+snapTicks(), tick);
      } else if(drag.mode==='group-move'){
        drag.rejected=false;
        const currentRawLane = xToLane(x);
        const startRawLane = drag.grabRawLane !== undefined ? drag.grabRawLane : currentRawLane; 
        const deltaLane = drag.grabRawLane === 6 ? 0 : currentRawLane - startRawLane;
        const deltaTick = tick - drag.grabStartTick;

        const occupiedPositions = new Set();
        const plannedNotes = [];
        drag.items.forEach((orig,id)=>{
          const n = chart.notes.find(n=>n.id===id);
          if(!n) return;
          const targetTick = Math.max(0, orig.tick+deltaTick);
          
          let targetRawLane = clampLane(orig.rawLane + deltaLane);
          let targetLane = getInternalLaneForNewNote(targetRawLane, n.type, targetTick, n.id);

          if (n.type === 'scramble') {
            targetLane = 6;
          }
          const positionKey = notePositionKey(targetTick, getRuntimeVisualLane({tick:targetTick, lane:targetLane, type:n.type}));
          const targetEndTick = (n.type==='hold' || n.type==='shift') && orig.endTick!=null ? targetTick + (orig.endTick-orig.tick) : n.endTick;
          if (isValidPlacement(n.type, targetLane) && !doesHoldCrossScramble(n.type, targetTick, targetEndTick) && !isNoteOccupied(targetTick, targetLane, n.type, selectedIds, plannedNotes) && !occupiedPositions.has(positionKey)) {
            n.tick = targetTick;
            n.lane = targetLane;
            occupiedPositions.add(positionKey);
            plannedNotes.push({tick:targetTick,lane:targetLane,type:n.type});
            if((n.type==='hold' || n.type==='shift') && orig.endTick!=null){
              n.endTick = targetEndTick;
            }
          } else drag.rejected=true;
        });
      }
      resizeCanvas();
      draw();
    } else {
      draw();
    }
  });

  window.addEventListener('mouseup', ()=>{
    if(!drag) return;
    if(drag.mode==='flip-target'){
      const n=chart.notes.find(n=>n.id===drag.id);
      if(n){
        const mapping=getLaneMappingBeforeTick(n.tick).normal;
        const from=mapping.indexOf(n.lane);
        const targetLogical=isSwapVisualizeMode?mapping[drag.targetSlot]:drag.targetSlot;
        const to=mapping.indexOf(targetLogical);
        if(from!==to)changeSelectedFlips(to<from?'left':'right',Math.abs(to-from));
      }
      drag=null;draw();return;
    }
    if(drag.mode==='group-move' && drag.snapshotTaken){
      const moved=chart.notes.filter(n=>drag.items.has(n.id)&&['pair_swap','flip','scramble'].includes(n.type));
      const tick=Math.min(...moved.map(n=>n.tick),...Array.from(drag.items.values()).map(n=>n.tick));
      const errors=drag.preserve&&moved.length?PairFlipRules.preserveLater(drag.beforeNotes,chart.notes,tick,[...drag.items.keys()]):validateGimmickNotes(chart.notes);
      const allErrors=drag.rejected?['選択ノーツの一部を移動できません。操作を取り消しました。']:errors.length?errors:validateGimmickNotes(chart.notes);
      if(allErrors.length){chart.notes=drag.beforeNotes;history.pop();rebuildLaneStates();showAppMessage(allErrors[0]);}
    }
    if(drag.mode==='create-hold'){
      const len = Math.max(snapTicks()*MIN_HOLD_LEN_UNITS, drag.currentTick-drag.startTick);
      const endTick = drag.startTick + len;
      if(doesHoldCrossScramble(drag.type, drag.startTick, endTick)){
        showAppMessage('HOLD/SHIFTはSCRAMBLEをまたぐように配置できません。');
        drag = null;
        draw();
        return;
      }
      pushHistory();
      // ここのノーツ作成時もflagsを削除してるよ
      const n = { id: nextId(), tick:drag.startTick, endTick, lane:drag.lane, type:drag.type || 'hold', size:1 };
      chart.notes.push(n);
      selectOnly(n.id);
      updateNoteCounts(); updateInspector(); updateFooterCounts();
    } else if(drag.mode==='resize-hold' && doesHoldCrossScramble(drag.note.type, drag.note.tick, drag.note.endTick)){
      drag.note.endTick = drag.originalEndTick;
      showAppMessage('HOLD/SHIFTはSCRAMBLEをまたぐように変更できません。');
    } else if(drag.mode==='rect-select'){
      const x0=Math.min(drag.x0,drag.x1), x1=Math.max(drag.x0,drag.x1);
      const y0=Math.min(drag.y0,drag.y1), y1=Math.max(drag.y0,drag.y1);
      const rect = {x0,x1,y0,y1};
      if(!drag.additive) clearSelection();
      (chart.notes||[]).forEach(n=>{
        if(isSelectableInRect(n, rect)) selectedIds.add(n.id);
      });
      updateInspector();
    }
    drag = null;
    resizeCanvas();
    draw();
  });

  el.scrollWrap.addEventListener('mouseleave', ()=>{ hoverPos=null; draw(); });

  // ---------------------------------------------------------------
