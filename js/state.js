// State
  // ---------------------------------------------------------------
  let chart = null;

  // MusicPackage is the owner of song-wide metadata and of the chart path.
  let packageContext = null;
  let selectedChartDifficulty = "high";

  let isSwapVisualizeMode = false;
  let isTimelineInverted = false;
  let laneStateHistory = [];
  const SUPPORTED_NOTE_TYPES = new Set(['tap','hold','trace','pair_swap','flip','shift','scramble']);

  let lastMutatorHash = "";
  function createLaneMapping(){
    return { normal: [0,1,2,3,4,5], noSwap: [0,1,2,3,4,5] };
  }
  function cloneLaneMapping(mapping){
    return { normal: [...mapping.normal], noSwap: [...mapping.noSwap] };
  }
  function swapVisualPositions(mapping, first, second, target){
    const lanes = target === 'both' ? [mapping.normal, mapping.noSwap] : [mapping.normal];
    lanes.forEach(lanesAtVisualPosition => {
      [lanesAtVisualPosition[first], lanesAtVisualPosition[second]] = [lanesAtVisualPosition[second], lanesAtVisualPosition[first]];
    });
  }
  function applySwapMapping(mapping, logicalLane){
    const triggerVisualLane = mapping.normal.indexOf(logicalLane);
    if(triggerVisualLane === 0) swapVisualPositions(mapping, 1, 2, 'normal');
    else if(triggerVisualLane === 5) swapVisualPositions(mapping, 3, 4, 'normal');
  }
  function applyScrambleMapping(mapping){
    swapVisualPositions(mapping, 0, 5, 'both');
    swapVisualPositions(mapping, 1, 4, 'both');
    swapVisualPositions(mapping, 2, 3, 'both');
  }
  function compareGameOrder(a,b){
    return a.tick - b.tick || a.lane - b.lane || a.id - b.id;
  }
  function rebuildLaneStates() {
    if (!chart || !chart.notes) return;
    
    const mutators = chart.notes.filter(n => n.type === 'pair_swap' || n.type === 'flip' || n.type === 'scramble');
    let hash = "";
    for (let i = 0; i < mutators.length; i++) {
      hash += mutators[i].id + ":" + mutators[i].type + ":" + mutators[i].tick + ":" + mutators[i].lane + ":" + mutators[i].direction + ":" + mutators[i].steps + ",";
    }
    if (hash === lastMutatorHash && laneStateHistory.length > 0) return;
    lastMutatorHash = hash;
    
    laneStateHistory = PairFlipRules.timeline(mutators).history.map(item=>({tick:item.tick,mapping:{normal:item.after,noSwap:item.after}}));
  }

  function getLaneMappingAt(tick, includeCurrentTick) {
    let low = 0;
    let high = laneStateHistory.length - 1;
    let res = laneStateHistory[0];
    
    while (low <= high) {
      let mid = (low + high) >> 1;
      if (laneStateHistory[mid].tick < tick || (includeCurrentTick && laneStateHistory[mid].tick === tick)) {
        res = laneStateHistory[mid];
        low = mid + 1;
      } else {
        high = mid - 1;
      }
    }
    return res.mapping;
  }
  // Gimmicks affect only later ticks in the editor specification.
  function getLaneMappingBeforeTick(tick){ return getLaneMappingAt(tick, false); }
  function getLaneMappingAfterTick(tick){ return getLaneMappingAt(tick, true); }
  function getLaneMapping(tick){ return getLaneMappingAfterTick(tick); }

  function laneMappingForNote(n){
    return getLaneMappingBeforeTick(n.tick);
  }
  function mappingNameForType(type){ return type === 'hold' || type === 'shift' ? 'noSwap' : 'normal'; }
  // Always resolves the game-time physical lane, even when visualization is off.
  function getRuntimeVisualLane(n) {
    if(n.type === 'scramble') return 6;
    const mapping = laneMappingForNote(n)[mappingNameForType(n.type)];
    const visualLane = mapping.indexOf(n.lane);
    return visualLane >= 0 ? visualLane : n.lane;
  }
  function getVisualLane(n) {
    if (!isSwapVisualizeMode) return n.lane;
    return getRuntimeVisualLane(n);
  }

  function isValidPlacement(type, lane) {
    if(!Number.isInteger(lane) || lane < 0 || lane > 6) return false;
    if(type === 'scramble') return lane === 6;
    if(lane === 6) return false;
    if(!SUPPORTED_NOTE_TYPES.has(type)) return false;
    return true;
  }

  function getInternalLaneForNewNote(visualLane, type, targetTick, noteId = Number.MAX_SAFE_INTEGER) {
    if(type === 'scramble') return 6;
    if (!isSwapVisualizeMode) return visualLane;
    rebuildLaneStates();
    const mapping = getLaneMappingBeforeTick(targetTick)[mappingNameForType(type)];
    return mapping[visualLane];
  }

  function doesHoldCrossScramble(type, startTick, endTick){
    if(type !== 'hold' && type !== 'shift') return false;
    return (chart.notes||[]).some(n => n.type === 'scramble' && n.tick > startTick && n.tick < endTick);
  }
  function findHoldCrossingScramble(){
    return (chart && chart.notes || []).find(n => doesHoldCrossScramble(n.type, n.tick, n.endTick)) || null;
  }
  function findInvalidNotePlacement(){
    return (chart && chart.notes || []).find(n => !isValidPlacement(n.type, n.lane)) || null;
  }
  function ensureTickZero(entries, defaults){
    if(!entries.some(entry => entry.tick === 0)) entries.unshift({tick:0, ...defaults});
  }
  function normalizeChartTiming(timing){
    const normalized = ReInverseChartFormat.normalizeTiming(timing);
    Object.assign(timing, normalized);
  }

  function validatePackageContext(){
    const errors = [];
    if(!packageContext){
      errors.push("MusicPackageが選択されていません。");
      return errors;
    }
    if(!ReInverseChartFormat.isPackageKey(packageContext.packageKey)) errors.push("package_key は小文字kebab-caseである必要があります。");
    if(!packageContext.songdata || packageContext.songdata.format_version !== 3) errors.push("metadata/songdata.json は format_version 3 である必要があります。");
    if(!ReInverseChartFormat.difficultyInfo(selectedChartDifficulty)) errors.push("出力難易度が不正です。");
    return errors;
  }

  function validateChartSyntax(){
    const errors = [];
    if(!chart || !chart.metadata || !chart.timing) return ['譜面データが不完全です。'];
    if(chart.version !== 2) errors.push('version は 2 である必要があります。');
    if(chart.metadata.laneCount !== 7) errors.push('laneCount は 7 である必要があります。');
    if(typeof chart.metadata.charter !== 'string' || chart.metadata.charter.trim() === '') errors.push('metadata.charter は空にできません。');
    const difficultyLevel = Number(chart.metadata.difficulty && chart.metadata.difficulty.level);
    if(!Number.isFinite(difficultyLevel) || difficultyLevel <= 0) errors.push('metadata.difficulty.level は0より大きい必要があります。');
    ReInverseChartFormat.legacyMetadataFields(chart.metadata).forEach(field => errors.push(`${field} は旧フィールドです。保存時に削除されます。`));
    if(Object.prototype.hasOwnProperty.call(chart.metadata, 'grid_offset') && !ReInverseChartFormat.isFiniteInteger(chart.metadata.grid_offset)) errors.push('metadata.grid_offset は有限の整数である必要があります。');
    if(!Number.isInteger(chart.metadata.resolution) || chart.metadata.resolution < 1) errors.push('resolution は1以上の整数である必要があります。');
    const timing = chart.timing;
    const bpm0 = (timing.bpms||[]).find(b => b.tick === 0);
    if(!bpm0 || !Number.isFinite(bpm0.bpm) || bpm0.bpm <= 0) errors.push('Tick 0の有効なBPMが必要です。');
    errors.push(...validateTimingEvents());
    // scrolls and timeSignatures are valid when empty in MusicPackages v3.
    errors.push(...validatePackageContext());
    ['bpms','scrolls','timeSignatures','stops'].forEach(key => {
      (timing[key]||[]).forEach(entry => { if(!Number.isInteger(entry.tick) || entry.tick < 0) errors.push(`${key} に無効なTickがあります。`); });
    });
    (timing.timeSignatures||[]).forEach(entry => {
      if(!Number.isInteger(entry.numerator) || entry.numerator < 1 || !Number.isInteger(entry.denominator) || entry.denominator < 1) errors.push('timeSignatures の分子・分母は正の整数である必要があります。');
    });
    const ids = new Set();
    const positions = new Set();
    const scrambleTicks = new Set((chart.notes||[]).filter(n=>n.type==='scramble').map(n=>n.tick));
    const ordinaryCountByTick = new Map();
    (chart.notes||[]).filter(n=>n.type!=='scramble').forEach(n=>ordinaryCountByTick.set(n.tick,(ordinaryCountByTick.get(n.tick)||0)+1));
    scrambleTicks.forEach(tick=>{if((ordinaryCountByTick.get(tick)||0)>0) errors.push(`Tick ${tick} のSCRAMBLEと他ノーツは共存できません。`);});
    rebuildLaneStates();
    errors.push(...PairFlipRules.timeline(chart.notes).errors);
    errors.push(...validateGimmickNotes(chart.notes));
    (chart.notes||[]).forEach(note => {
      if(!Number.isInteger(note.id) || ids.has(note.id)) errors.push(`ノーツID ${note.id} が重複または不正です。`);
      ids.add(note.id);
      if(!SUPPORTED_NOTE_TYPES.has(note.type)) errors.push(`ID ${note.id} のtype ${note.type} は未対応です。`);
      if(!Number.isInteger(note.tick) || note.tick < 0) errors.push(`ID ${note.id} のTickが不正です。`);
      if(!Number.isInteger(note.lane) || note.lane < 0 || note.lane > 6 || !isValidPlacement(note.type, note.lane)) errors.push(`ID ${note.id} のレーンが不正です。`);
      const visualLane = getRuntimeVisualLane(note);
      const position = `${note.tick}:${visualLane}`;
      if(positions.has(position)) errors.push(`Tick ${note.tick} / 実行レーン ${visualLane+1} に重複ノーツがあります。`);
      positions.add(position);
      if((note.type === 'hold' || note.type === 'shift') && (!Number.isInteger(note.endTick) || note.endTick <= note.tick)) errors.push(`ID ${note.id} の終端Tickが不正です。`);
    });
    const longNotes = (chart.notes||[]).filter(note =>
      (note.type === 'hold' || note.type === 'shift') &&
      Number.isInteger(note.endTick) && note.endTick > note.tick
    );
    longNotes.forEach(longNote => {
      const longVisualLane = getRuntimeVisualLane(longNote);
      (chart.notes||[]).forEach(note => {
        if(note.id === longNote.id || note.tick < longNote.tick || note.tick > longNote.endTick) return;
        if(getRuntimeVisualLane(note) === longVisualLane){
          errors.push(`ID ${longNote.id} のロングノーツ区間が ID ${note.id} と実行レーン ${longVisualLane+1} で重なっています。`);
        }
      });
    });
    if(findHoldCrossingScramble()) errors.push('SCRAMBLEをまたぐHOLDまたはSHIFTがあります。');
    return [...new Set(errors)];
  }
  function validateGimmickNotes(notes){
    const line=PairFlipRules.timeline(notes),errors=line.errors.slice(),byTick=new Map();
    const mirrorNotes=notes.map(n=>n.type==='scramble'?n:{...n,lane:PairFlipRules.isLane(n.lane)?5-n.lane:n.lane,
      ...(n.type==='flip'?{direction:n.direction==='left'?'right':n.direction==='right'?'left':n.direction}:{})});
    errors.push(...PairFlipRules.timeline(mirrorNotes).errors.map(e=>`Mirror: ${e}`));
    for(const n of notes){if(!byTick.has(n.tick))byTick.set(n.tick,[]);byTick.get(n.tick).push(n);}
    for(const [tick,group] of byTick){
      if(group.some(n=>n.type==='scramble') && group.length!==1)errors.push(`Tick ${tick}: Scramble は他ノーツと同時に置けません。`);
      const slots=PairFlipRules.before(line.history,tick),occupied=new Set();
      for(const n of group){
        if(n.type==='scramble')continue;
        const slot=slots.indexOf(n.lane);
        if(slot<0 || occupied.has(slot))errors.push(`ID ${n.id} / Tick ${tick}: 開始レーンが重複しています。`);
        occupied.add(slot);
      }
    }
    for(const event of line.history.slice(1)){
      const touched=new Set((event.footprints||[]).flatMap(f=>f.slots));
      if(notes.some(n=>n.type==='scramble'&&n.tick===event.tick))for(let i=0;i<6;i++)touched.add(i);
      for(const n of notes)if((n.type==='hold'||n.type==='shift')&&n.tick<=event.tick&&n.endTick>=event.tick){
        const slot=event.before.indexOf(n.lane);
        if(touched.has(slot))errors.push(`ID ${n.id} / Tick ${event.tick}: Hold / Shift の判定区間でレーンが移動します。`);
      }
    }
    return [...new Set(errors)];
  }
  function validateTimingEvents(){
    const errors = [];
    if(!chart || !chart.timing) return errors;
    for(const [key, valueKey] of [['bpms','bpm'], ['scrolls','speed']]){
      const seen = new Set();
      for(const entry of (chart.timing[key] || [])){
        if(!entry || !Number.isInteger(entry.tick) || entry.tick < 0){ errors.push(`${key} に無効なTickがあります。`); continue; }
        if(seen.has(entry.tick)) errors.push(`${key} の Tick ${entry.tick} が重複しています。`);
        seen.add(entry.tick);
        if(!Number.isFinite(entry[valueKey]) || entry[valueKey] <= 0) errors.push(`${key} の Tick ${entry.tick} の値は0より大きい有限数である必要があります。`);
      }
      if(key === 'bpms' && !seen.has(0)) errors.push('Tick 0のBPMが必要です。');
    }
    errors.push(...validateScrollEvents(chart.timing.scrolls || []));
    if(!Number.isInteger(chart.metadata.resolution) || chart.metadata.resolution <= 0) errors.push('resolution は正の整数である必要があります。');
    return [...new Set(errors)];
  }
  function validateScrollEvents(scrolls){
    const errors = [];
    const sorted = scrolls.filter(Boolean).slice().sort((a,b)=>a.tick-b.tick);
    for(let i=0;i<sorted.length;i++){
      const entry = sorted[i];
      const hasEnd = Object.prototype.hasOwnProperty.call(entry,'endTick') && entry.endTick !== 0;
      if(!hasEnd){
        if(Object.prototype.hasOwnProperty.call(entry,'easing')) errors.push(`Scroll Tick ${entry.tick} の瞬時切替に easing は指定できません。`);
        continue;
      }
      if(!Number.isInteger(entry.endTick) || entry.endTick <= entry.tick) errors.push(`Scroll Tick ${entry.tick} の終了Tickが不正です。`);
      if(entry.easing != null && !['linear','inQuad','outQuad'].includes(entry.easing)) errors.push(`Scroll Tick ${entry.tick} の easing が不正です。`);
      if(sorted[i+1] && Number.isInteger(entry.endTick) && sorted[i+1].tick < entry.endTick) errors.push(`Scroll Tick ${entry.tick} のフェードが次のイベントと重複しています。`);
    }
    return errors;
  }
  function showChartSyntaxCheck(){
    if(!chart){
      document.getElementById('validationResults').textContent='譜面を読み込んでから構文チェックを実行してください。';
      return;
    }
    const errors = validateChartSyntax().filter(issue =>
      !issue.startsWith('MusicPackage') && !issue.startsWith('package_key') &&
      !issue.startsWith('metadata/songdata') && !issue.startsWith('出力難易度')
    );
    const packageErrors = validatePackageContext();
    const overlapTicks=PairFlipRules.eventsAt(chart.notes).filter(([,group])=>group.filter(n=>n.type==='flip').length>1 || (group.some(n=>n.type==='flip')&&group.some(n=>n.type==='pair_swap'))).map(([tick])=>tick);
    const summary=errors.length ? `問題 ${errors.length} 件\n${errors.slice(0,20).join('\n')}${errors.length>20?`\nほか ${errors.length-20} 件`:''}` : '構文上の問題はありません。';
    document.getElementById('validationResults').textContent=summary+
      (packageErrors.length ? `\n\n保存先の確認: ${packageErrors.join(' / ')}` : '')+
      (overlapTicks.length ? `\n\nUnity 互換性警告: 同 Tick の複数 Flip / Pair との共存 (${overlapTicks.join(', ')}) は現在の Unity に未対応です。` : '');
  }
  function findScrambleOverlapTicks(){
    if(!chart) return [];
    const scrambles=new Set((chart.notes||[]).filter(n=>n.type==='scramble').map(n=>n.tick));
    return [...new Set((chart.notes||[]).filter(n=>n.type!=='scramble' && scrambles.has(n.tick)).map(n=>n.tick))].sort((a,b)=>a-b);
  }
  let filename = 'chart.json';
  let laneCount = 6;
  let resolution = 960;
  let zoom = 1.0;
  let snapN = 16;
  let selectedType = 'tap';
  let pendingGimmick = null;
  let pointerMode = 'place'; // 'place' | 'select'
  let selectedIds = new Set();
  let lastClickedId = null;
  let history = [];
  let redoStack = [];
  let drag = null;
  let clipboard = null;

  // audio
  let audioObjectUrl = null;
  let currentAudioTime = 0;
  let rafHandle = null;
  let audioBuffer = null;
  let waveformData = null;
  let audioLoadGeneration = 0;
  let audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  let seekBarDragging = false;

  // 削除されたフィールド (m_subtitle, m_genre, m_previewStart, m_previewDuration) をリストから除外
  const el = {};
  ['fileInput','btnLoad','btnLoad2','btnNew','btnPackage','btnExport','btnDownload','btnMeta','btnAudio','audioInput',
   'btnUndo','btnRedo','snapSelect','btnSettings','swapVisualizeToggle','preserveVisualToggle','timelineInvertToggle','zoomIn','zoomOut','zoomLabel','filenameLabel','packageDifficulty',
   'btnFileMenu','fileMenu','btnInspectorToggle','inspectorPanel',
   'gridArea','emptyState','laneHeader','scrollWrap','gridCanvas','metaStats','noteCounts','packageLabel',
   'inspector','statTick','statBeat','statLane','statCount','statLength','hintBody','hintTitle',
   'transport','btnPlayPause','playbackRateSelect','timeLabel','seekBar','audioFileLabel','audioEl','btnTiming','btnPreview',
   'timingModalOverlay','timingRows','timingAddBpm','timingAddScroll','timingCancel','timingSave',
   'previewModalOverlay','previewCanvas','previewClose',
   'metaModalOverlay','metaCancel','metaSave','settingsModalOverlay','settingsClose','btnSwapSimulator','btnSyntaxCheck',
   'm_charter','m_diffLevel',
   'm_bpm','m_timeSigNumerator','m_timeSigDenominator','m_audioOffset','m_gridOffset','m_resolution',
   'editorMainContainer','minimapWrap','minimapCanvas'
  ].forEach(id=>{ el[id] = document.getElementById(id); });
  
  el.typeButtons = Array.from(document.querySelectorAll('.type-btn'));
  el.modeButtons = Array.from(document.querySelectorAll('.mode-btn'));
  const ctx = el.gridCanvas.getContext('2d');
  const audio = el.audioEl;

  // ---------------------------------------------------------------
