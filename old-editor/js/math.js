// Coordinate helpers
  // ---------------------------------------------------------------
  let verticalExtentTick = 0;
  function pxPerTick(){ return BASE_PX_PER_TICK * zoom; }
  function tickToY(tick){ return (isTimelineInverted ? verticalExtentTick - tick : tick) * pxPerTick(); }
  function yToTick(y){ return isTimelineInverted ? verticalExtentTick - y / pxPerTick() : y / pxPerTick(); }
  function laneToX(lane){
    return RULER_W + lane*LANE_W;
  }
  function xToLane(x){
    let raw = Math.floor((x - RULER_W) / LANE_W);
    if(raw < 0) raw = 0;
    if(raw >= laneCount) raw = laneCount - 1;
    return Math.max(0, Math.min(laneCount-1, raw));
  }
  function snapTicks(){ return resolution*4/snapN; }
  function snapTick(tick){ const s = snapTicks(); return Math.max(0, Math.round(tick/s)*s); }
  function clampLane(l){ return Math.max(0, Math.min(laneCount-1, l)); }

  // オーディオ要素自体の長さを参照するように変更したよ
  function audioDurationSec(){
    if(audio && isFinite(audio.duration) && audio.duration>0){
      return audio.duration;
    }
    return 0;
  }

  function maxContentTick(){
    let m = 0;

    // 既存のノーツやタイミングイベントから最大Tickを取得
    (chart.notes||[]).forEach(n=>{ m = Math.max(m, n.tick||0, n.endTick||0); });
    (chart.timing.bpms||[]).forEach(b=>m=Math.max(m,b.tick||0));
    (chart.timing.scrolls||[]).forEach(s=>m=Math.max(m,s.tick||0,s.endTick||0));
    (chart.timing.timeSignatures||[]).forEach(t=>m=Math.max(m,t.tick||0));

    // 音声が読み込まれている場合は、曲の総尺そのものから最大Tickを算出してキャンバスを伸ばす
    const durationSec = audioDurationSec();
    if (durationSec > 0) {
      const audioMaxTick = tickForAudioTime(durationSec);
      m = Math.max(m, audioMaxTick);
    }

    // 音声がなくても常に最後尾からさらに20小節分の余白（キャンバス領域）を確保する
    // これにより、音声未読み込み状態でもスクロールして無限にノーツを配置し続けられる
    return m + (resolution * 4 * 20);
  }
  function contentHeight(){ return verticalExtentTick * pxPerTick(); }
  function contentWidth(){ return RULER_W + laneCount*LANE_W + 150; } // +150 for waveform space

  let dummy = null;
  function resizeCanvas(){
    if(!chart) return;

    if(!dummy) {
      dummy = document.createElement('div');
      dummy.id = 'scrollDummy';
      dummy.style.position = 'absolute';
      dummy.style.width = '1px';
      dummy.style.top = '0';
      dummy.style.left = '0';
      dummy.style.zIndex = '-1';
      el.scrollWrap.style.position = 'relative';
      el.scrollWrap.appendChild(dummy);
      el.gridCanvas.style.position = 'sticky';
      el.gridCanvas.style.top = '0';
      el.gridCanvas.style.zIndex = '1';
    }

    const w = contentWidth();
    const previousHeight = contentHeight();
    verticalExtentTick = maxContentTick();
    const h = Math.max(400, contentHeight());
    const viewH = el.scrollWrap.clientHeight || 800;
    dummy.style.height = h + 'px';
    if(isTimelineInverted && previousHeight > 0) el.scrollWrap.scrollTop += h - Math.max(400, previousHeight);

    const dpr = window.devicePixelRatio || 1;
    el.gridCanvas.style.width = w+'px';
    el.gridCanvas.style.height = viewH+'px';
    el.gridCanvas.width = Math.round(w*dpr);
    el.gridCanvas.height = Math.round(viewH*dpr);
    // transform is set in draw()
  }

  // ---------------------------------------------------------------
  // Tick <-> time (seconds) conversion, using BPM segments
  // ---------------------------------------------------------------
  function sortedBpms(){
    const entries = (chart.timing.bpms||[]).filter(e => e && Number.isInteger(e.tick) && e.tick >= 0 && Number.isFinite(e.bpm) && e.bpm > 0)
      .slice().sort((a,b)=>a.tick-b.tick);
    if(!entries.some(e=>e.tick===0)) entries.unshift({tick:0,bpm:120});
    return entries;
  }

  function tickToSeconds(targetTick){
    const bpms = sortedBpms();
    if(bpms.length===0 || bpms[0].tick!==0) bpms.unshift({tick:0,bpm:120});
    let t = 0, prevTick = 0, prevBpm = bpms[0].bpm;
    for(let i=1;i<bpms.length;i++){
      const segEnd = bpms[i].tick;
      if(targetTick <= segEnd){
        t += (targetTick-prevTick) * (60/(prevBpm*resolution));
        return t;
      }
      t += (segEnd-prevTick) * (60/(prevBpm*resolution));
      prevTick = segEnd; prevBpm = bpms[i].bpm;
    }
    t += (targetTick-prevTick) * (60/(prevBpm*resolution));
    return t;
  }

  function secondsToTick(targetSec){
    const bpms = sortedBpms();
    if(bpms.length===0 || bpms[0].tick!==0) bpms.unshift({tick:0,bpm:120});
    let t = 0, prevTick = 0, prevBpm = bpms[0].bpm;
    for(let i=1;i<bpms.length;i++){
      const segEnd = bpms[i].tick;
      const segDur = (segEnd-prevTick) * (60/(prevBpm*resolution));
      if(t+segDur >= targetSec){
        return prevTick + (targetSec-t) * (prevBpm*resolution/60);
      }
      t += segDur; prevTick = segEnd; prevBpm = bpms[i].bpm;
    }
    return prevTick + (targetSec-t) * (prevBpm*resolution/60);
  }

  function audioOffsetSec(){ return ((chart.metadata.audio && chart.metadata.audio.offset) || 0)/1000; }
  function audioTimeForTick(tick){ return tickToSeconds(tick) + audioOffsetSec(); }
  function tickForAudioTime(sec){ return secondsToTick(sec - audioOffsetSec()); }

  // Integrate a Tick-based Scroll curve in chart seconds. Every BPM, Scroll
  // start, and fade end becomes a segment boundary.
  function scrollEaseIntegral(u, easing){
    if(easing === 'inQuad') return u*u*u/3;
    if(easing === 'outQuad') return u*u - u*u*u/3;
    return u*u/2;
  }
  let visualProfileKey = null, visualProfile = null;
  function getVisualProfile(){
    const key = JSON.stringify([resolution, chart.timing.bpms, chart.timing.scrolls]);
    if(key === visualProfileKey) return visualProfile;
    const bpms = sortedBpms();
    const scrolls = (chart.timing.scrolls || []).filter(e => e && Number.isInteger(e.tick) && e.tick >= 0 && Number.isFinite(e.speed) && e.speed > 0)
      .slice().sort((a,b)=>a.tick-b.tick);
    const points = new Set([0]);
    bpms.forEach(e=>points.add(e.tick));
    scrolls.forEach(e=>{ points.add(e.tick); if(Number.isInteger(e.endTick) && e.endTick > e.tick) points.add(e.endTick); });
    const boundaries = [...points].sort((a,b)=>a-b);
    const segments = [];
    let bpm = bpms[0].bpm, bpmIndex = 1, speed = 1, scrollIndex = 0, activeFade = null, visual = 0;
    for(let i=0;i<boundaries.length;i++){
      const start = boundaries[i], end = boundaries[i+1];
      while(bpmIndex < bpms.length && bpms[bpmIndex].tick <= start) bpm = bpms[bpmIndex++].bpm;
      if(activeFade && activeFade.endTick <= start){ speed = activeFade.speed; activeFade = null; }
      while(scrollIndex < scrolls.length && scrolls[scrollIndex].tick <= start){
        const event = scrolls[scrollIndex++];
        if(Number.isInteger(event.endTick) && event.endTick > event.tick){
          activeFade = {...event, startSpeed:speed};
        } else { speed = event.speed; activeFade = null; }
      }
      const segment = {start, end:end == null ? Infinity : end, bpm, speed, fade:activeFade, visual};
      segments.push(segment);
      if(end != null) visual += visualSegmentAmount(segment, end);
    }
    visualProfileKey = key;
    visualProfile = {segments, preSpeed:scrolls[0] && scrolls[0].tick === 0 && !(scrolls[0].endTick > 0) ? scrolls[0].speed : 1};
    return visualProfile;
  }
  function visualSegmentAmount(segment, tick){
    const delta = tick - segment.start;
    const secondsPerTick = 60/(segment.bpm*resolution);
    if(!segment.fade) return delta*segment.speed*secondsPerTick;
    const fade = segment.fade, length = fade.endTick - fade.tick;
    const u0 = (segment.start-fade.tick)/length, u1 = (tick-fade.tick)/length;
    const easedArea = length*(scrollEaseIntegral(u1,fade.easing)-scrollEaseIntegral(u0,fade.easing));
    return (delta*fade.startSpeed + (fade.speed-fade.startSpeed)*easedArea)*secondsPerTick;
  }
  function visualTimeAtTick(tick, profile = getVisualProfile()){
    if(tick < 0) return tickToSeconds(tick)*profile.preSpeed;
    const segments = profile.segments;
    let low = 0, high = segments.length-1;
    while(low <= high){
      const mid = (low+high)>>1, segment = segments[mid];
      if(tick < segment.start) high = mid-1;
      else if(tick >= segment.end) low = mid+1;
      else return segment.visual + visualSegmentAmount(segment,tick);
    }
    return 0;
  }

  // ---------------------------------------------------------------
