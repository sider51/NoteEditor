// Timing event editor and a separate scroll-speed playback preview.
function appendTimingRow(kind, tick, value, source){
  const row = document.createElement('div');
  row.className = 'timing-row';
  row.dataset.kind = kind;
  row.innerHTML = '<div class="timing-row-main"><span class="timing-kind"></span><label>Tick<input class="timing-tick" type="number" min="0" step="1"></label><label class="timing-value-label"><input class="timing-value" type="number" min="0" step="any"></label><label class="scroll-mode-label">変化<select class="timing-mode"><option value="step">瞬時</option><option value="fade">フェード</option></select></label><button type="button" class="timing-delete">削除</button></div><div class="timing-row-extra"><label class="scroll-end-label">終了Tick<input class="timing-end" type="number" min="1" step="1"></label><label class="scroll-easing-label">補間<select class="timing-easing"><option value="linear">Linear</option><option value="inQuad">In Quad</option><option value="outQuad">Out Quad</option></select></label></div>';
  row.querySelector('.timing-kind').textContent = kind === 'bpms' ? 'BPM' : 'Scroll';
  row.querySelector('.timing-value-label').prepend(document.createTextNode(kind === 'bpms' ? 'BPM' : '倍率'));
  row.querySelector('.timing-tick').value = String(tick);
  row.querySelector('.timing-value').value = String(value);
  if(kind === 'scrolls'){
    const mode = row.querySelector('.timing-mode');
    mode.value = source && source.endTick > 0 ? 'fade' : 'step';
    row.querySelector('.timing-end').value = mode.value === 'fade' ? String(source.endTick) : '';
    row.querySelector('.timing-easing').value = source && source.easing || 'linear';
    mode.addEventListener('change', () => {
      row.classList.toggle('timing-fade', mode.value === 'fade');
      if(mode.value === 'fade' && !row.querySelector('.timing-end').value) row.querySelector('.timing-end').value = String(Number(row.querySelector('.timing-tick').value) + resolution);
    });
    row.classList.toggle('timing-fade', mode.value === 'fade');
  }
  const remove = row.querySelector('.timing-delete');
  if(kind === 'bpms' && tick === 0) remove.disabled = true;
  remove.addEventListener('click', () => row.remove());
  const group = el.timingRows.querySelector(`.timing-group[data-kind="${kind}"]`);
  (group || el.timingRows).appendChild(row);
}

function openTimingEditor(){
  if(!chart) return;
  el.timingRows.replaceChildren();
  for(const [kind,title] of [['bpms','BPM'],['scrolls','SCROLL']]){
    const group = document.createElement('div');
    group.className = 'timing-group';
    group.dataset.kind = kind;
    const heading = document.createElement('h3');
    heading.className = 'timing-group-title';
    heading.textContent = title;
    group.appendChild(heading);
    el.timingRows.appendChild(group);
  }
  for(const kind of ['bpms','scrolls']){
    for(const entry of chart.timing[kind] || []) appendTimingRow(kind, entry.tick, entry[kind === 'bpms' ? 'bpm' : 'speed'], entry);
  }
  openAppModal(el.timingModalOverlay);
}
function closeTimingEditor(){ closeAppModal(el.timingModalOverlay); }
function saveTimingEditor(){
  const next = {bpms:[], scrolls:[]};
  const seen = {bpms:new Set(), scrolls:new Set()};
  for(const row of el.timingRows.querySelectorAll('.timing-row')){
    const kind = row.dataset.kind;
    const tickText = row.querySelector('.timing-tick').value.trim();
    const valueText = row.querySelector('.timing-value').value.trim();
    const tick = Number(tickText), value = Number(valueText);
    if(tickText === '' || !Number.isInteger(tick) || tick < 0 || valueText === '' || !Number.isFinite(value) || value <= 0){
      showAppMessage('BPM / Scroll の Tick は0以上の整数、値は0より大きい有限数で入力してください。'); return;
    }
    if(seen[kind].has(tick)){ showAppMessage(`${kind} の Tick ${tick} が重複しています。`); return; }
    seen[kind].add(tick);
    if(kind === 'bpms') next.bpms.push({tick,bpm:value});
    else {
      const entry = {tick,speed:value};
      if(row.querySelector('.timing-mode').value === 'fade'){
        const endText = row.querySelector('.timing-end').value.trim();
        const endTick = Number(endText);
        if(endText === '' || !Number.isInteger(endTick) || endTick <= tick){ showAppMessage(`Scroll Tick ${tick} の終了Tickは開始より大きい整数にしてください。`); return; }
        entry.endTick = endTick;
        entry.easing = row.querySelector('.timing-easing').value;
      }
      next.scrolls.push(entry);
    }
  }
  if(!seen.bpms.has(0)){ showAppMessage('Tick 0 の BPM が必要です。'); return; }
  for(const kind of ['bpms','scrolls']) next[kind].sort((a,b)=>a.tick-b.tick);
  const timingErrors = validateScrollEvents(next.scrolls);
  if(timingErrors.length){ showAppMessage(timingErrors.join(' / ')); return; }
  pushHistory();
  chart.timing.bpms = next.bpms;
  chart.timing.scrolls = next.scrolls;
  resizeCanvas(); draw(); updateMetaStats(); updateFooterCounts();
  closeTimingEditor();
}

el.btnTiming.addEventListener('click', openTimingEditor);
function suggestedEventTick(kind){
  let tick = Math.max(0,Math.round(tickForAudioTime(audio.currentTime || 0)));
  const used = new Set([...el.timingRows.querySelectorAll(`.timing-row[data-kind="${kind}"] .timing-tick`)].map(input => Number(input.value)));
  while(used.has(tick)) tick += resolution;
  return tick;
}
el.timingAddBpm.addEventListener('click', () => appendTimingRow('bpms', suggestedEventTick('bpms'), 120));
el.timingAddScroll.addEventListener('click', () => appendTimingRow('scrolls', suggestedEventTick('scrolls'), 1));
el.timingCancel.addEventListener('click', closeTimingEditor);
el.timingSave.addEventListener('click', saveTimingEditor);
el.timingModalOverlay.addEventListener('click', e => { if(e.target === el.timingModalOverlay) closeTimingEditor(); });

function drawScrollPreview(frameTime=audio.currentTime||0){
  if(!chart || !el.previewModalOverlay.classList.contains('open')) return;
  const canvas = el.previewCanvas, context = canvas.getContext('2d');
  const width = canvas.width, height = canvas.height, laneWidth = width / laneCount;
  const hitY = height * (isTimelineInverted ? 0.7 : 0.3);
  const direction = isTimelineInverted ? -1 : 1;
  const profile=getVisualProfile();
  const currentTick = tickForAudioTime(frameTime);
  const currentVisual = visualTimeAtTick(currentTick,profile);
  const yAtTick = tick => hitY + direction * (visualTimeAtTick(tick,profile) - currentVisual) * 200;
  const extent = maxContentTick();
  const tickAtVisual = value => {
    let low=0,high=extent;
    while(low<high){
      const mid=Math.floor((low+high)/2);
      if(visualTimeAtTick(mid,profile)<value) low=mid+1;
      else high=mid;
    }
    return low;
  };
  const minTick=Math.max(0,tickAtVisual(currentVisual-height/200)-resolution);
  const maxTick=Math.min(extent,tickAtVisual(currentVisual+height/200)+resolution);
  context.fillStyle = getVar('--bg'); context.fillRect(0,0,width,height);
  context.strokeStyle = getVar('--panel-border'); context.lineWidth = 1;
  for(let lane=1;lane<laneCount;lane++){
    const x = lane*laneWidth;
    context.beginPath(); context.moveTo(x,0); context.lineTo(x,height); context.stroke();
  }
  for(const segment of timeSignatureSegments(extent)){
    const beat = ReInverseChartFormat.ticksPerDenominatorNote(resolution, segment.denominator);
    if(beat <= 0) continue;
    const firstBeat=segment.startTick+Math.max(0,Math.ceil((minTick-segment.startTick)/beat))*beat;
    for(let tick=firstBeat;tick<segment.endTick && tick<=maxTick;tick+=beat){
      const y = yAtTick(tick);
      const distance = direction * (y-hitY);
      if(distance < -height) continue;
      if(distance > height) break;
      context.strokeStyle = getVar('--grid-beat');
      context.beginPath(); context.moveTo(0,y); context.lineTo(width,y); context.stroke();
    }
    const measure = beat * segment.numerator;
    const first = ReInverseChartFormat.firstBarTick(segment.startTick, segment.numerator, segment.denominator, resolution, chart.metadata.grid_offset);
    const firstVisible=first+Math.max(0,Math.ceil((minTick-first)/measure))*measure;
    for(let tick=firstVisible;tick<segment.endTick && tick<=maxTick;tick+=measure){
      const y = yAtTick(tick);
      const distance = direction * (y-hitY);
      if(distance < -height) continue;
      if(distance > height) break;
      context.strokeStyle = getVar('--grid-measure'); context.lineWidth = 2;
      context.beginPath(); context.moveTo(0,y); context.lineTo(width,y); context.stroke();
      context.lineWidth = 1;
    }
  }
  for(let pass=0;pass<2;pass++) for(const note of chart.notes || []){
    if((note.type==='scramble') !== (pass===0)) continue;
    if(note.tick>maxTick || (note.endTick??note.tick)<minTick) continue;
    const y = yAtTick(note.tick);
    const endY = note.endTick == null ? y : yAtTick(note.endTick);
    if(Math.max(y,endY)<-16 || Math.min(y,endY)>height+16) continue;
    const lane = getVisualLane(note), x = note.type === 'scramble' ? 6 : lane*laneWidth + 6;
    const noteWidth = note.type === 'scramble' ? width-12 : laneWidth-12;
    context.fillStyle = noteColor(note.type);
    if(note.endTick != null){
      context.globalAlpha = 0.3;
      context.fillRect(x,Math.min(y,endY),noteWidth,Math.max(2,Math.abs(endY-y)));
      context.globalAlpha = 1;
      context.fillRect(x,endY-2,noteWidth,4);
    }
    context.fillRect(x,y-5,noteWidth,10);
  }
  context.strokeStyle = getVar('--playhead'); context.lineWidth = 2;
  context.beginPath(); context.moveTo(0,hitY); context.lineTo(width,hitY); context.stroke();
}
function closeScrollPreview(){
  closeAppModal(el.previewModalOverlay);
}
el.btnPreview.addEventListener('click', () => {
  if(!chart) return;
  openAppModal(el.previewModalOverlay);
  drawScrollPreview(currentAudioTime||audio.currentTime||0);
});
el.previewClose.addEventListener('click', closeScrollPreview);
el.previewModalOverlay.addEventListener('click', e => { if(e.target === el.previewModalOverlay) closeScrollPreview(); });
