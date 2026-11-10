// Grid / bpm drawing
  // ---------------------------------------------------------------
  function ticksPerBeatAt(numerator, denominator){ return ReInverseChartFormat.ticksPerDenominatorNote(resolution, denominator); }

  function validTimeSignature(entry){
    return entry && Number.isInteger(entry.tick) && entry.tick >= 0 &&
      Number.isInteger(entry.numerator) && entry.numerator > 0 &&
      Number.isInteger(entry.denominator) && entry.denominator > 0;
  }

  function timeSignatureSegments(maxTick){
    const events = (chart.timing.timeSignatures || []).filter(validTimeSignature)
      .slice().sort((a,b) => a.tick - b.tick);
    const segments = [];
    let startTick = 0;
    let signature = { numerator: 4, denominator: 4 };

    events.forEach(event => {
      if(event.tick === 0){
        signature = event;
        return;
      }
      if(event.tick <= startTick || event.tick >= maxTick) return;
      segments.push({ startTick, endTick: event.tick, ...signature });
      startTick = event.tick;
      signature = event;
    });
    if(startTick < maxTick) segments.push({ startTick, endTick: maxTick, ...signature });
    return segments;
  }

  function drawGridLines(maxTick, viewTop, viewBottom){
    const w = contentWidth();
    const gridOffset = ReInverseChartFormat.normalizeGridOffset(chart.metadata && chart.metadata.grid_offset);

    timeSignatureSegments(maxTick).forEach(segment => {
      const { startTick: segStart, endTick: segEnd, numerator, denominator } = segment;
      const beatTicks = ticksPerBeatAt(numerator, denominator);
      const measureTicks = beatTicks * numerator;
      if(measureTicks<=0) return;

      ctx.strokeStyle = getVar('--grid-beat');
      ctx.lineWidth = 1;
      for(let t=segStart; t<segEnd; t+=beatTicks){
        const y = Math.round(tickToY(t))+0.5;
        if (isTimelineInverted ? y > viewBottom : y < viewTop) continue;
        if (isTimelineInverted ? y < viewTop : y > viewBottom) break;
        ctx.beginPath(); ctx.moveTo(RULER_W,y); ctx.lineTo(w,y); ctx.stroke();
      }
      ctx.strokeStyle = getVar('--grid-measure');
      ctx.fillStyle = getVar('--text-faint');
      ctx.font = '10px '+getVar('--mono');
      let measureNo = 1;
      const firstMeasureTick = ReInverseChartFormat.firstBarTick(segStart, numerator, denominator, resolution, gridOffset);
      for(let t=firstMeasureTick; t<segEnd; t+=measureTicks){
        const y = Math.round(tickToY(t))+0.5;
        if (isTimelineInverted ? y > viewBottom : y < viewTop) { measureNo++; continue; }
        if (isTimelineInverted ? y < viewTop : y > viewBottom) break;
        ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(RULER_W,y); ctx.lineTo(w,y); ctx.stroke();
        ctx.fillText(String(measureNo), 8, y+3);
        measureNo++;
      }
    });

    ctx.strokeStyle = getVar('--panel-border');
    ctx.lineWidth = 1;
    for(let i=0;i<=laneCount;i++){
      const x = Math.round(laneToX(i))+0.5;
      ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x, contentHeight()); ctx.stroke();
    }
    const rx = Math.round(RULER_W)+0.5;
    ctx.beginPath(); ctx.moveTo(rx,0); ctx.lineTo(rx, contentHeight()); ctx.stroke();
  }

  function drawBpmLines(maxTick, viewTop, viewBottom){
    const w = contentWidth();
    const bpms = sortedBpms();
    ctx.font = '10px '+getVar('--mono');
    bpms.forEach(b=>{
      const y = tickToY(b.tick);
      if (y < viewTop || y > viewBottom) return;
      ctx.strokeStyle = getVar('--bpm-line');
      ctx.setLineDash([4,3]); ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(RULER_W,Math.round(y)+0.5); ctx.lineTo(w,Math.round(y)+0.5); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = getVar('--bpm-line');
      ctx.fillText('♩='+b.bpm, RULER_W+4, y>10? y-4 : y+12);
    });
  }
  function drawScrollLines(viewTop, viewBottom){
    const w = contentWidth();
    ctx.font = '10px '+getVar('--mono');
    (chart.timing.scrolls || []).forEach(event => {
      if(!Number.isInteger(event.tick) || event.tick < 0) return;
      const y = tickToY(event.tick);
      if(y < viewTop || y > viewBottom) return;
      ctx.strokeStyle = getVar('--scroll-line');
      ctx.setLineDash([2,4]);
      ctx.beginPath(); ctx.moveTo(RULER_W,y+0.5); ctx.lineTo(w,y+0.5); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = getVar('--scroll-line');
      ctx.fillText('Scroll ×'+event.speed+(event.endTick > event.tick ? ` → ${event.endTick} ${event.easing || 'linear'}` : ''), RULER_W+100, y>10 ? y-4 : y+12);
      if(event.endTick > event.tick){
        const endY = tickToY(event.endTick);
        if(endY >= viewTop && endY <= viewBottom){
          ctx.strokeStyle = getVar('--scroll-line');
          ctx.beginPath(); ctx.moveTo(RULER_W,endY+0.5); ctx.lineTo(w,endY+0.5); ctx.stroke();
        }
      }
    });
  }

  // ---------------------------------------------------------------
  // Note drawing
  // ---------------------------------------------------------------
  function noteColor(type){ return (TYPE_META[type]||{}).color || '#888'; }

  function drawNote(n){
    const visualLane = getVisualLane(n, n.tick);
    const x = n.type === 'scramble' ? RULER_W : laneToX(visualLane);
    const drawWidth = n.type === 'scramble' ? laneCount*LANE_W : LANE_W;
    const y = tickToY(n.tick);
    const cx = x + drawWidth/2;
    const isSelected = selectedIds.has(n.id);
    const color = noteColor(n.type);

    if(n.type==='hold' || n.type==='shift'){
      const y2 = tickToY(n.endTick!=null ? n.endTick : n.tick);
      ctx.fillStyle = n.type==='shift' ? color.replace(')', ', 0.3)').replace('rgb', 'rgba') : getVar('--hold-fill');
      if(n.type==='shift' && color.startsWith('#')) ctx.fillStyle = color + '4D';
      ctx.fillRect(x+6, Math.min(y,y2), drawWidth-12, Math.max(2,Math.abs(y2-y)));
      ctx.strokeStyle = color;
      ctx.lineWidth = isSelected? 3:2;
      ctx.strokeRect(x+6, Math.min(y,y2), drawWidth-12, Math.max(2,Math.abs(y2-y)));
      ctx.fillStyle = color;
      ctx.fillRect(x+6, y2-3, drawWidth-12, 3);
    }

    ctx.fillStyle = (n.type==='trace') ? 'rgba(0,0,0,0)' : color;
    ctx.strokeStyle = color;
    ctx.lineWidth = isSelected ? 3 : 2;

    if(n.type==='trace'){
      ctx.beginPath();
      ctx.moveTo(cx, y-NOTE_H/2);
      ctx.lineTo(cx+drawWidth/2-8, y);
      ctx.lineTo(cx, y+NOTE_H/2);
      ctx.lineTo(cx-drawWidth/2+8, y);
      ctx.closePath();
      ctx.stroke();
    } else if(n.type==='scramble'){
      ctx.fillStyle = color + '30';
      ctx.fillRect(x+6,y-NOTE_H/2,drawWidth-12,NOTE_H);
      ctx.strokeRect(x+6,y-NOTE_H/2,drawWidth-12,NOTE_H);
    } else if(n.type==='swap'){
      ctx.beginPath();
      ctx.arc(cx, y, NOTE_H/2, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(255,92,138,0.25)'; // 透明度が必要なため固定値だが、CSS変数を使ってもOK
      ctx.fill();
      ctx.stroke();
    } else {
      const rw = drawWidth-16, rh = NOTE_H;
      roundRect(ctx, cx-rw/2, y-rh/2, rw, rh, 3);
      ctx.fillStyle = color;
      ctx.fill();
    }

    if(isSelected){
      ctx.strokeStyle = getVar('--text'); // 白あるいはテキスト色
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      if(n.type === 'scramble') ctx.strokeRect(x+3,y-NOTE_H/2-3,drawWidth-6,NOTE_H+6);
      else { ctx.arc(cx, y, NOTE_H/2+5, 0, Math.PI*2); ctx.stroke(); }
    }
  }

  function roundRect(c,x,y,w,h,r){
    c.beginPath();
    c.moveTo(x+r,y);
    c.arcTo(x+w,y,x+w,y+h,r);
    c.arcTo(x+w,y+h,x,y+h,r);
    c.arcTo(x,y+h,x,y,r);
    c.arcTo(x,y,x+w,y,r);
    c.closePath();
  }

  // ---------------------------------------------------------------
  // Main draw
  // ---------------------------------------------------------------
  let hoverPos = null;

  function drawMinimap(maxTick, viewTop, viewBottom, clientH) {
    if (!el.minimapCanvas) return;
    const mCtx = el.minimapCanvas.getContext('2d');
    const w = el.minimapWrap.clientWidth;
    const h = el.minimapWrap.clientHeight;

    // Resize canvas if needed
    const dpr = window.devicePixelRatio || 1;
    if (el.minimapCanvas.width !== Math.round(w * dpr) || el.minimapCanvas.height !== Math.round(h * dpr)) {
      el.minimapCanvas.width = Math.round(w * dpr);
      el.minimapCanvas.height = Math.round(h * dpr);
    }

    mCtx.setTransform(1, 0, 0, 1, 0, 0);
    mCtx.clearRect(0, 0, el.minimapCanvas.width, el.minimapCanvas.height);
    mCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const totalH = contentHeight();
    if (totalH <= 0) return;
    const scaleY = h / totalH;
    const laneW = w / laneCount;

    mCtx.fillStyle = getVar('--text-faint') || 'rgba(255,255,255,0.2)';
    const notes = chart.notes || [];
    for (let i=0; i<notes.length; i++) {
      const n = notes[i];
      const visLane = getVisualLane(n, n.tick);
      if (n.type === 'scramble'){
        mCtx.fillRect(0,tickToY(n.tick)*scaleY,w,3);
        continue;
      }
      if (visLane < 0 || visLane >= laneCount) continue;
      const nx = visLane * laneW;
      const ny = tickToY(n.tick) * scaleY;
      let nh = 2;
      if (n.type === 'hold' || n.type === 'shift') {
        const endY = tickToY(n.endTick != null ? n.endTick : n.tick) * scaleY;
        nh = Math.max(2, Math.abs(endY - ny));
        mCtx.fillRect(nx, Math.min(ny,endY), laneW - 1, nh);
        continue;
      }
      mCtx.fillRect(nx, ny, laneW - 1, nh);
    }

    // Draw viewport rect
    mCtx.fillStyle = 'rgba(255, 255, 255, 0.1)';
    mCtx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    mCtx.lineWidth = 1;
    const vy = Math.max(0, viewTop) * scaleY;
    const vh = clientH * scaleY;
    mCtx.fillRect(0, vy, w, vh);
    mCtx.strokeRect(0, vy, w, vh);
  }

  // Handle minimap click
  if (el.minimapWrap && !el.minimapWrap.dataset.eventsBound) {
    el.minimapWrap.dataset.eventsBound = "true";
    let isDragging = false;
    const jumpToY = (e) => {
      const rect = el.minimapWrap.getBoundingClientRect();
      const my = e.clientY - rect.top;
      const maxTick = maxContentTick();
      const scaleY = el.minimapWrap.clientHeight / contentHeight();
      const targetScroll = (my / scaleY) - (el.scrollWrap.clientHeight / 2);
      el.scrollWrap.scrollTop = Math.max(0, targetScroll);
      draw();
    };
    el.minimapWrap.addEventListener('mousedown', (e) => { isDragging = true; jumpToY(e); });
    window.addEventListener('mousemove', (e) => { if(isDragging) jumpToY(e); });
    window.addEventListener('mouseup', () => { isDragging = false; });
  }

  function draw(){
    rebuildLaneStates();
    if(!chart) return;
    const w = contentWidth();
    const maxTick = maxContentTick();
    const h = contentHeight();

    // Viewport Culling logic
    const wrap = el.scrollWrap;
    const scrollTop = wrap ? wrap.scrollTop : 0;
    const clientH = (wrap && wrap.clientHeight > 0) ? wrap.clientHeight : 800;
    const viewTop = scrollTop - 200;
    const viewBottom = scrollTop + clientH + 200;

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, el.gridCanvas.width, el.gridCanvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, -scrollTop * dpr);
    for(let i=0;i<laneCount;i++){
      if(i%2===1){
        ctx.fillStyle = getVar('--lane-alt');
        ctx.fillRect(laneToX(i), 0, LANE_W, h);
      }
    }

    // Lane separators (vertical lines)
    ctx.strokeStyle = getVar('--grid-measure');
    ctx.lineWidth = 1;
    ctx.beginPath();
    for(let i=1;i<=laneCount;i++){
      const x = Math.round(laneToX(i)) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
    }
    ctx.stroke();

    drawGridLines(maxTick, viewTop, viewBottom);
    drawBpmLines(maxTick, viewTop, viewBottom);
    drawScrollLines(viewTop, viewBottom);
    // Waveform
    if (waveformData && waveformData.length > 0) {
      const startX = laneToX(laneCount) + 30; // 30px margin
      const waveWidth = 80; // width of waveform lane

      // Draw background for waveform lane
      ctx.fillStyle = getVar('--lane-alt') || 'rgba(255,255,255,0.02)';
      ctx.fillRect(startX, 0, waveWidth, h);

      ctx.beginPath();
      ctx.strokeStyle = getVar('--primary') || '#00e5ff';
      ctx.lineWidth = 1;

      const topTick = Math.max(0, yToTick(viewTop));
      const bottomTick = Math.max(0, yToTick(viewBottom));
      const topTime = audioTimeForTick(Math.min(topTick,bottomTick));
      const bottomTime = audioTimeForTick(Math.max(topTick,bottomTick));

      let startIndex = Math.max(0, Math.floor(topTime / 0.01));
      let endIndex = Math.min(waveformData.length, Math.ceil(bottomTime / 0.01) + 1);

      for (let i = startIndex; i < endIndex; i++) {
        const time = i * 0.01;
        const tick = tickForAudioTime(time);
        if (tick > maxTick + 1000) break;
        const y = tickToY(tick);

        const minX = startX + waveWidth/2 + (waveformData[i].min * waveWidth/2);
        const maxX = startX + waveWidth/2 + (waveformData[i].max * waveWidth/2);

        ctx.moveTo(minX, y);
        ctx.lineTo(maxX, y);
      }
      ctx.stroke();
    }

    const notes = chart.notes||[];
    const visibleNotes = notes.filter(n => {
       const y = tickToY(n.tick);
       const endY = n.endTick != null ? tickToY(n.endTick) : y + NOTE_H;
       return (Math.max(endY,y) >= viewTop && Math.min(endY,y) <= viewBottom);
    });
    visibleNotes.filter(n=>n.type==='scramble').forEach(drawNote);
    visibleNotes.filter(n=>n.type==='hold' || n.type==='shift').forEach(drawNote);
    visibleNotes.filter(n=>n.type!=='hold' && n.type!=='shift' && n.type!=='scramble').forEach(drawNote);
    const swapsByTick = new Map();
    visibleNotes.filter(n=>n.type==='swap').forEach(n=>{
      if(!swapsByTick.has(n.tick)) swapsByTick.set(n.tick,new Set());
      swapsByTick.get(n.tick).add(n.lane);
    });
    ctx.fillStyle = getVar('--swap');
    ctx.font = 'bold 14px '+getVar('--mono');
    swapsByTick.forEach((lanes,tick)=>{
      if(lanes.has(0) && lanes.has(5)) ctx.fillText('↔',laneToX(3)-7,tickToY(tick)-8);
    });

    if(drag && drag.mode==='create-hold'){
      ctx.globalAlpha = 0.6;
      drawNote({type:drag.type || 'hold', lane:drag.lane, tick:drag.startTick, endTick:drag.currentTick, id:-999});
      ctx.globalAlpha = 1;
    }

    if(drag && drag.mode==='rect-select'){
      const x0=Math.min(drag.x0,drag.x1), x1=Math.max(drag.x0,drag.x1);
      const y0=Math.min(drag.y0,drag.y1), y1=Math.max(drag.y0,drag.y1);
      ctx.fillStyle = getVar('--select-box');
      ctx.strokeStyle = getVar('--select-box-border');
      ctx.lineWidth = 1;
      ctx.fillRect(x0,y0,x1-x0,y1-y0);
      ctx.strokeRect(x0,y0,x1-x0,y1-y0);
    }

    if(hoverPos && pointerMode === 'place'){
      const y = tickToY(hoverPos.snappedTick);
      ctx.strokeStyle = getVar('--text-dim');
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(RULER_W, Math.round(y)+0.5); ctx.lineTo(w,Math.round(y)+0.5); ctx.stroke();
      ctx.fillStyle = getVar('--select-box');
      const hWidth = selectedType === 'scramble' ? laneCount*LANE_W : LANE_W;
      const hX = selectedType === 'scramble' ? RULER_W : laneToX(hoverPos.lane);
      if(isValidPlacement(selectedType, selectedType === 'scramble' ? 6 : hoverPos.lane)) {
        ctx.fillRect(hX, y-NOTE_H/2-2, hWidth, NOTE_H+4);
      }
    }

    if(audio.src){
      const curTick = tickForAudioTime(typeof currentAudioTime !== 'undefined' ? currentAudioTime : (audio.currentTime||0));
      const py = Math.round(tickToY(curTick));
      ctx.strokeStyle = getVar('--playhead');
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, py + 0.5); ctx.lineTo(w, py + 0.5); ctx.stroke();
      ctx.fillStyle = getVar('--playhead');
      ctx.beginPath();
      ctx.moveTo(0, py - 6); ctx.lineTo(10, py); ctx.lineTo(0, py + 6); ctx.closePath(); ctx.fill();
    }

    // Draw the paste preview after the waveform and playhead so audio
    // rendering cannot obscure it.
    if(drag && drag.mode==='paste' && drag.items){
      ctx.save();
      ctx.globalAlpha = 0.5;
      drag.items.forEach(item => {
        const t = drag.snapTick + item.dTick;
        const rawLane = getPasteDestinationLane(item, drag.lane, drag.sourceAnchorLane, drag.flipped);
        if(t < 0 || !isValidPlacement(item.type, rawLane)) return;
        const lane = getInternalLaneForNewNote(rawLane, item.type, t);
        if(!isValidPlacement(item.type, lane)) return;
        const fakeNote = { type: item.type, lane, tick: t, size: item.size || 1 };
        if (item.dEndTick != null) fakeNote.endTick = drag.snapTick + item.dEndTick;
        drawNote(fakeNote);
      });
      ctx.restore();
    }
    drawMinimap(maxTick, viewTop, viewBottom, clientH);
  }

  // ---------------------------------------------------------------
  // Hit testing / sorted order
  // ---------------------------------------------------------------
  function sortedNotes(){
    return (chart.notes||[]).slice().sort((a,b)=>{
      if(a.tick!==b.tick) return a.tick-b.tick;
      if(a.lane!==b.lane) return a.lane-b.lane;
      return a.id-b.id;
    });
  }

  function hitTest(x,y){
    const hitTick = yToTick(y);
    const notes = chart.notes||[];
    for(let pass=0;pass<2;pass++) for(let i=notes.length-1;i>=0;i--){
      const n = notes[i];
      if((n.type==='scramble') !== (pass===1)) continue;
      if(n.type==='hold' || n.type==='shift'){
        const y1 = tickToY(n.tick), y2 = tickToY(n.endTick!=null?n.endTick:n.tick);
        const nearHead = Math.abs(y-y1) <= NOTE_H/2+3;
        const nearEnd = Math.abs(y-y2) <= NOTE_H/2+3;
        if(!nearHead && !nearEnd) continue;
        const visLane = getVisualLane(n, hitTick);
        const cx = laneToX(visLane) + LANE_W/2;
        if(Math.abs(x-cx) <= LANE_W/2-4){
          return {note:n, zone:nearEnd ? 'end' : 'head'};
        }
      } else {
        const ny = tickToY(n.tick);
        if(Math.abs(y-ny) <= NOTE_H/2+3){
          if(n.type === 'scramble' && x >= RULER_W+6 && x <= laneToX(laneCount)-6) return {note:n, zone:'body'};
          const visLane = getVisualLane(n, n.tick);
          const cx = laneToX(visLane) + LANE_W/2;
          if(Math.abs(x-cx) <= LANE_W/2-4){
            return {note:n, zone:'body'};
          }
        }
      }
    }
    return null;
  }

  function noteBounds(n){
    const visLane = getVisualLane(n, n.tick);
    const drawWidth = n.type === 'scramble' ? laneCount*LANE_W : LANE_W;
    const x = n.type === 'scramble' ? RULER_W : laneToX(visLane);
    const x0 = x+6, x1 = x+drawWidth-6;
    let y0,y1;
    if(n.type==='hold' || n.type==='shift'){
      const headY=tickToY(n.tick), tailY=tickToY(n.endTick!=null?n.endTick:n.tick);
      y0=Math.min(headY,tailY)-NOTE_H/2; y1=Math.max(headY,tailY)+NOTE_H/2;
    }
    else { y0=tickToY(n.tick)-NOTE_H/2; y1=tickToY(n.tick)+NOTE_H/2; }
    return {x0,x1,y0,y1};
  }
  function rectsIntersect(a,b){ return a.x0<=b.x1 && a.x1>=b.x0 && a.y0<=b.y1 && a.y1>=b.y0; }
  function isSelectableInRect(n, rect){
    if(n.type!=='hold' && n.type!=='shift') return rectsIntersect(noteBounds(n), rect);
    const visualLane = getVisualLane(n, n.tick);
    const x0 = laneToX(visualLane)+6;
    const x1 = laneToX(visualLane)+LANE_W-6;
    const headY = tickToY(n.tick);
    const tailY = tickToY(n.endTick!=null ? n.endTick : n.tick);
    const endpointBounds = y => ({x0, x1, y0:y-NOTE_H/2-3, y1:y+NOTE_H/2+3});
    return rectsIntersect(endpointBounds(headY), rect) || rectsIntersect(endpointBounds(tailY), rect);
  }

  // ---------------------------------------------------------------
