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
  function flipDisplayRoute(note){
    const mapping=getLaneMappingBeforeTick(note.tick).normal;
    const fromPhysical=mapping.indexOf(note.lane);
    const toPhysical=fromPhysical+(note.direction==='left'?-1:1)*note.steps;
    if(fromPhysical<0||toPhysical<0||toPhysical>=laneCount)return null;
    return {
      fromPhysical,toPhysical,
      fromDisplay:isSwapVisualizeMode?fromPhysical:note.lane,
      toDisplay:isSwapVisualizeMode?toPhysical:mapping[toPhysical]
    };
  }

  function drawGimmickLinks(visibleNotes){
    const pairs=new Map();
    visibleNotes.filter(n=>n.type==='pair_swap').forEach(n=>{
      if(!pairs.has(n.tick))pairs.set(n.tick,[]);
      pairs.get(n.tick).push(n);
    });
    ctx.save();ctx.lineWidth=2;
    pairs.forEach(group=>{
      if(group.length!==2)return;
      const y=tickToY(group[0].tick),a=laneToX(getVisualLane(group[0]))+LANE_W/2,b=laneToX(getVisualLane(group[1]))+LANE_W/2;
      ctx.strokeStyle=getVar('--swap');ctx.beginPath();ctx.moveTo(a,y);ctx.lineTo(b,y);ctx.stroke();
    });
    for(const n of visibleNotes.filter(note=>note.type==='flip')){
      const route=flipDisplayRoute(n);if(!route)continue;
      const y=tickToY(n.tick),x0=laneToX(route.fromDisplay)+LANE_W/2,x1=laneToX(route.toDisplay)+LANE_W/2;
      const sign=x1>x0?1:-1,color=getVar('--flip');
      ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1-sign*8,y);ctx.stroke();
      ctx.beginPath();ctx.moveTo(x1-sign*7,y);ctx.lineTo(x1-sign*16,y-5);ctx.lineTo(x1-sign*16,y+5);ctx.closePath();ctx.fill();
      const label=`${n.direction==='left'?'左':'右'}${n.steps}`;
      ctx.font='bold 11px '+getVar('--sans');
      const mid=(x0+x1)/2,labelW=ctx.measureText(label).width+10;
      ctx.fillStyle=getVar('--panel-raised');ctx.fillRect(mid-labelW/2,y-24,labelW,17);
      ctx.fillStyle=color;ctx.fillText(label,mid-labelW/2+5,y-11);
      if(selectedIds.has(n.id)){
        ctx.globalAlpha=.45;ctx.fillStyle=color;ctx.beginPath();ctx.arc(x1,y,11,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
        ctx.strokeStyle=color;ctx.beginPath();ctx.arc(x1,y,11,0,Math.PI*2);ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawPairPlacementGhost(start,target,y,color){
    const x0=laneToX(start)+LANE_W/2;
    ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;
    if(target!=null&&target>=0&&target<laneCount&&target!==start){
      const x1=laneToX(target)+LANE_W/2;
      ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1,y);ctx.stroke();ctx.setLineDash([]);
      ctx.globalAlpha=.2;ctx.beginPath();ctx.arc(x1,y,14,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
      ctx.beginPath();ctx.arc(x1,y,12,0,Math.PI*2);ctx.stroke();
      ctx.font='bold 11px '+getVar('--sans');ctx.fillText('2',x1-3,y+4);
    }
    ctx.globalAlpha=.2;ctx.beginPath();ctx.arc(x0,y,14,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
    ctx.beginPath();ctx.arc(x0,y,12,0,Math.PI*2);ctx.stroke();
    ctx.font='bold 11px '+getVar('--sans');ctx.fillText('1',x0-3,y+4);
    ctx.restore();
  }

  function drawFlipPlacementGhost(start,target,y,color,steps){
    const x0=laneToX(start)+LANE_W/2;
    ctx.save();ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=2;
    ctx.globalAlpha=.24;ctx.fillRect(laneToX(start)+7,y-12,LANE_W-14,24);ctx.globalAlpha=1;
    ctx.strokeRect(laneToX(start)+7,y-12,LANE_W-14,24);
    ctx.font='bold 11px '+getVar('--sans');ctx.fillText('FLIP',x0-13,y+4);
    if(target!=null&&target>=0&&target<laneCount&&target!==start){
      const x1=laneToX(target)+LANE_W/2,sign=x1>x0?1:-1;
      ctx.globalAlpha=.14;ctx.fillRect(laneToX(target)+6,y-13,LANE_W-12,26);ctx.globalAlpha=1;
      ctx.setLineDash([5,4]);ctx.beginPath();ctx.moveTo(x0,y);ctx.lineTo(x1-sign*9,y);ctx.stroke();ctx.setLineDash([]);
      const count=Math.max(1,Math.min(5,steps||1));
      for(let i=1;i<=count;i++){
        const x=x0+(x1-x0)*i/(count+1);
        ctx.beginPath();ctx.moveTo(x+sign*4,y);ctx.lineTo(x-sign*4,y-4);ctx.lineTo(x-sign*4,y+4);ctx.closePath();ctx.fill();
      }
      ctx.beginPath();ctx.moveTo(x1,y);ctx.lineTo(x1-sign*10,y-6);ctx.lineTo(x1-sign*10,y+6);ctx.closePath();ctx.fill();
      ctx.strokeRect(laneToX(target)+6,y-13,LANE_W-12,26);
    }
    ctx.restore();
  }

  function drawScramblePlacementGhost(tick){
    const y=tickToY(tick),blocked=chart.notes.some(n=>n.tick===tick||(['hold','shift'].includes(n.type)&&n.tick<=tick&&n.endTick>=tick));
    const color=getVar(blocked?'--danger':'--scramble');
    ctx.save();ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=2;
    ctx.globalAlpha=.18;ctx.fillRect(RULER_W+4,y-17,laneCount*LANE_W-8,34);ctx.globalAlpha=1;
    ctx.strokeRect(RULER_W+4,y-17,laneCount*LANE_W-8,34);
    ctx.font='bold 12px '+getVar('--sans');
    for(let slot=0;slot<laneCount;slot++){
      const x=laneToX(slot)+LANE_W/2;
      ctx.fillText(slot<3?'›':'‹',x-3,y+4);
    }
    ctx.fillStyle=getVar('--panel-raised');ctx.fillRect(RULER_W+5,y-46,210,22);
    ctx.fillStyle=color;ctx.fillText(blocked?'SCRAMBLE · 同Tick / 長押しと競合':'SCRAMBLE · 6レーンを反転',RULER_W+13,y-30);
    ctx.restore();
  }

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
    } else if(n.type==='pair_swap' || n.type==='flip'){
      ctx.beginPath();
      ctx.arc(cx, y, NOTE_H/2, 0, Math.PI*2);
      ctx.fillStyle = color + '44';
      ctx.fill();
      ctx.stroke();
      if(n.type==='flip'){
        ctx.fillStyle=color;ctx.font='bold 11px '+getVar('--sans');
        ctx.fillText(n.direction==='left'?'‹':'›',cx-3,y+4);
      }
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
    drawGimmickLinks(visibleNotes);
    visibleNotes.filter(n=>n.type==='scramble').forEach(drawNote);
    visibleNotes.filter(n=>n.type==='hold' || n.type==='shift').forEach(drawNote);
    visibleNotes.filter(n=>n.type!=='hold' && n.type!=='shift' && n.type!=='scramble').forEach(drawNote);
    if(pointerMode==='place' && (selectedType==='pair_swap'||selectedType==='flip')){
      const active=pendingGimmick&&pendingGimmick.type===selectedType?pendingGimmick:null;
      const tick=active?active.tick:hoverPos?.snappedTick;
      const start=active?active.slot:hoverPos?.lane;
      const target=active&&hoverPos?hoverPos.lane:null;
      if(Number.isInteger(tick)&&start>=0&&start<6){
        const y=tickToY(tick),x0=laneToX(start)+LANE_W/2;
        const slots=getLaneMappingBeforeTick(tick).normal;
        const startLogical=isSwapVisualizeMode?slots[start]:start;
        const startPhysical=slots.indexOf(startLogical);
        const targetLogical=target==null?null:isSwapVisualizeMode?slots[target]:target;
        const targetPhysical=targetLogical==null?-1:slots.indexOf(targetLogical);
        let reason='',valid=true;
        if(!active){
          if(chart.notes.some(n=>n.tick===tick&&n.lane===startLogical))reason='開始位置にノーツあり';
          else if(chart.notes.some(n=>n.tick===tick&&n.type==='scramble'))reason='Scrambleと同Tick不可';
          else if(selectedType==='pair_swap'&&chart.notes.some(n=>n.tick===tick&&n.type==='pair_swap'))reason='Pairは同Tickに1組';
          valid=!reason;
        }
        if(active&&target!=null){
          if(hoverPos.snappedTick!==tick)reason='同じ Tick を選択';
          else if(target===start)reason='別のレーンを選択';
          else if(target<0||target>=6)reason='6入力レーン内で選択';
          else {
            const id=nextId(), candidate=selectedType==='pair_swap'
              ?[{id,tick,lane:startLogical,type:'pair_swap'},{id:id+1,tick,lane:targetLogical,type:'pair_swap'}]
              :[{id,tick,lane:startLogical,type:'flip',direction:targetPhysical<startPhysical?'left':'right',steps:Math.abs(targetPhysical-startPhysical)}];
            const group=chart.notes.filter(n=>n.tick===tick&&['pair_swap','flip','scramble'].includes(n.type));
            const result=PairFlipRules.step(slots,[...group,...candidate],tick);
            if(result.errors.length)reason='移動区間が重複';
            const touched=new Set(result.footprints.filter(f=>f.ids.includes(id)).flatMap(f=>f.slots));
            if(!reason&&chart.notes.some(n=>n.tick===tick&&n.type!=='scramble'&&
              ((selectedType==='pair_swap'&&(n.lane===startLogical||n.lane===targetLogical))||
               (selectedType==='flip'&&n.lane===startLogical))))reason='開始位置にノーツあり';
            if(!reason&&chart.notes.some(n=>(n.type==='hold'||n.type==='shift')&&n.tick<=tick&&n.endTick>=tick&&touched.has(slots.indexOf(n.lane))))reason='長押し区間と重複';
          }
          valid=!reason;
        }
        const color=!valid?getVar('--danger'):selectedType==='flip'?getVar('--flip'):getVar('--swap');
        if(selectedType==='pair_swap')drawPairPlacementGhost(start,target,y,color);
        else drawFlipPlacementGhost(start,target,y,color,Math.abs(targetPhysical-startPhysical));
        ctx.save();
        ctx.font='12px '+getVar('--sans');
        const label=active?(reason||(target==null
          ? `${selectedType==='flip'?'FLIP':'PAIR'} · 移動先を選択`
          : selectedType==='flip'
            ? `FLIP · ${targetPhysical<startPhysical?'左':'右'}へ${Math.abs(targetPhysical-startPhysical)}レーン`
            : `PAIR · レーン${target+1}を相方に`))
          :(reason||`${selectedType==='flip'?'FLIP':'PAIR'} · 始点を選択`);
        const labelX=Math.min(laneToX(6)-180,Math.max(RULER_W+6,x0-55));
        ctx.fillStyle=getVar('--panel-raised');ctx.fillRect(labelX,y-43,180,22);
        ctx.fillStyle=color;ctx.fillText(label,labelX+8,y-27);
        ctx.restore();
      }
    }

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

    if(hoverPos && pointerMode === 'place' && selectedType==='scramble'){
      drawScramblePlacementGhost(hoverPos.snappedTick);
    }
    if(hoverPos && pointerMode === 'place' && !['pair_swap','flip','scramble'].includes(selectedType)){
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
