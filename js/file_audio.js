
  let nextHitSoundIndex = 0;
  let lastHitSoundTime = -1;

  function scheduleHitSounds(curTime) {
    if (!chart || !chart.notes) return;
    const sorted = sortedNotes(); // Maybe cache this? It's fine for now.
    const lookaheadSec = 0.1;
    const endAudioTime = curTime + lookaheadSec;
    
    // Detect seek (jump in time)
    if (Math.abs(curTime - lastHitSoundTime) > 0.5 && lastHitSoundTime !== -1) {
      const curTick = tickForAudioTime(curTime);
      nextHitSoundIndex = sorted.findIndex(n => n.tick >= curTick);
      if (nextHitSoundIndex === -1) nextHitSoundIndex = sorted.length;
    }
    lastHitSoundTime = curTime;
    
    while(nextHitSoundIndex < sorted.length) {
      const n = sorted[nextHitSoundIndex];
      const noteTime = audioTimeForTick(n.tick);
      if (noteTime > endAudioTime) break;
      
      if (noteTime >= curTime) {
        // Schedule beep
        const scheduleTime = audioCtx.currentTime + (noteTime - curTime) / audio.playbackRate;
        playTickSound(scheduleTime);
      }
      nextHitSoundIndex++;
    }
  }

  function playTickSound(time) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, time);
    osc.frequency.exponentialRampToValueAtTime(100, time + 0.05);
    
    gain.gain.setValueAtTime(0.1, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(time);
    osc.stop(time + 0.05);
  }

// File load / new chart
  // ---------------------------------------------------------------
  
  async function openChartFile(){
    if (!window.showOpenFilePicker) {
      el.fileInput.click();
      return;
    }
    try {
      const [fileHandle] = await window.showOpenFilePicker({
        types: [{
          description: 'Chart / MCZ Files',
          accept: { 'application/json': ['.json'], 'application/zip': ['.mcz'] }
        }],
      });
      const file = await fileHandle.getFile();
      if(file.name.toLowerCase().endsWith('.mcz')) {
        await loadMczChartFile(file);
      } else {
        const text = await file.text();
        loadChart(JSON.parse(text), file.name);
      }
    } catch(err) {
      if (err.name !== 'AbortError') showAppMessage('ファイルの読み込みに失敗しました: ' + err.message);
    }
  }

  function onFileChosen(e){
    const file = e.target.files[0];
    if(!file) return;
    if(file.name.toLowerCase().endsWith('.mcz')){
      el.fileInput.value = '';
      loadMczChartFile(file).catch(err => showAppMessage('MCZファイルの読み込みに失敗しました: ' + err.message));
      return;
    }
    const reader = new FileReader();
    reader.onload = ()=>{
      try{ loadChart(JSON.parse(reader.result), file.name); }
      catch(err){ showAppMessage('JSONの読み込みに失敗しました: '+err.message); }
    };
    reader.readAsText(file);
    el.fileInput.value = '';
  }

  // 新しいJSON構造に合わせたデフォルトデータを生成するよ
  // Converter と同じ選択規則で MCZ を開き、変換結果をダウンロードせずエディタへ渡す。
  async function loadMczChartFile(file){
    if(typeof JSZip === 'undefined'){
      throw new Error('MCZ展開ライブラリを読み込めませんでした。ネットワーク接続を確認して再読み込みしてください。');
    }
    const zip = await JSZip.loadAsync(file);
    const paths = Object.keys(zip.files);
    let maxFolderDigit = -1;
    let folderPrefix = '';
    paths.forEach(path => {
      const match = path.match(/^(\d)\//);
      if(!match) return;
      const digit = Number.parseInt(match[1], 10);
      if(digit > maxFolderDigit){
        maxFolderDigit = digit;
        folderPrefix = match[1] + '/';
      }
    });
    if(maxFolderDigit < 0) throw new Error('数字フォルダが見つかりませんでした。');

    let highestChartNumber = -1;
    let chartPath = null;
    paths.forEach(path => {
      if(!path.startsWith(folderPrefix)) return;
      const filename = path.slice(folderPrefix.length);
      const match = filename.match(/^(\d+)\.mc$/i);
      if(!match) return;
      const chartNumber = Number.parseInt(match[1], 10);
      if(chartNumber > highestChartNumber){
        highestChartNumber = chartNumber;
        chartPath = path;
      }
    });
    if(!chartPath) throw new Error('対象の .mc ファイルが見つかりませんでした。');

    let source;
    try {
      source = JSON.parse(await zip.files[chartPath].async('string'));
    } catch(err) {
      throw new Error(`MCZ内の ${chartPath} をJSONとして読み込めませんでした: ${err.message}`);
    }
    await loadChart(convertLegacyChartToRicf1(source), file.name.replace(/\.mcz$/i, '_ricf1.json'));
  }

  function convertLegacyChartToRicf1(source){
    const converterResolution = 960;
    let metadata;
    let timing;
    const notes = [];

    if(source.meta && Array.isArray(source.note)){
      metadata = {
        id: source.meta.version || '001',
        title: source.meta.song && source.meta.song.title || 'Unknown Title',
        artist: source.meta.song && source.meta.song.artist || '',
        charter: source.meta.creator || '',
        difficulty: { name: source.meta.version || 'Low', level: 1 },
        audio: { offset: 0 }, laneCount: 7, resolution: converterResolution
      };
      timing = {
        bpms: [], scrolls: [{tick:0, speed:1}],
        timeSignatures: [{tick:0, numerator:4, denominator:4}], stops: []
      };
      if(Array.isArray(source.time)){
        source.time.forEach(entry => {
          if(!Array.isArray(entry.beat) || !Number.isFinite(entry.bpm)) return;
          const beat = entry.beat[0] + (entry.beat[2] > 0 ? entry.beat[1] / entry.beat[2] : 0);
          timing.bpms.push({tick:Math.round(beat * converterResolution), bpm:entry.bpm});
        });
      }
      if(timing.bpms.length === 0) timing.bpms.push({tick:0, bpm:120});
      source.note.forEach(entry => {
        if(!Number.isFinite(entry.column) || !Array.isArray(entry.beat)) return;
        const beat = entry.beat[0] + (entry.beat[2] > 0 ? entry.beat[1] / entry.beat[2] : 0);
        let lane = entry.column;
        if(lane === 3) lane = 6;
        else if(lane === 4) lane = 3;
        else if(lane === 5) lane = 4;
        else if(lane === 6) lane = 5;
        const note = {id:0, tick:Math.round(beat * converterResolution), lane, type:'tap', size:1};
        if(Array.isArray(entry.endbeat)){
          const endBeat = entry.endbeat[0] + (entry.endbeat[2] > 0 ? entry.endbeat[1] / entry.endbeat[2] : 0);
          note.type = 'hold';
          note.endTick = Math.round(endBeat * converterResolution);
        }
        notes.push(note);
      });
    } else {
      metadata = {
        id: source.name || '001', title: source.name || 'Unknown Title', artist:'', charter:'',
        difficulty:{name:'Low', level:1}, audio:{offset:Number.isFinite(source.offset) ? source.offset : 0},
        laneCount:7, resolution:converterResolution
      };
      timing = {
        bpms:[{tick:0, bpm:Number.isFinite(source.BPM) ? source.BPM : 120}],
        scrolls:[{tick:0, speed:1}], timeSignatures:[{tick:0, numerator:4, denominator:4}], stops:[]
      };
      if(Array.isArray(source.notes)){
        source.notes.forEach(entry => {
          if(!Number.isFinite(entry.num) || !Number.isFinite(entry.LPB) || !Number.isFinite(entry.block)) return;
          const tick = Math.round(entry.num / entry.LPB * converterResolution);
          const note = {id:0, tick, lane:entry.block, type:entry.type === 2 ? 'hold' : 'tap', size:1};
          if(note.type === 'hold'){
            const end = Array.isArray(entry.notes) && entry.notes[0];
            note.endTick = end && Number.isFinite(end.num) && Number.isFinite(end.LPB)
              ? Math.round(end.num / end.LPB * converterResolution)
              : tick + converterResolution;
          }
          notes.push(note);
        });
      }
    }
    notes.sort((a,b) => a.tick - b.tick || a.lane - b.lane);
    notes.forEach((note, index) => { note.id = index + 1; });
    return ReInverseChartFormat.createChartExport({version:2, metadata, timing, notes, events:[]});
  }

  function createNewChart(){
    const data = {
      version: 2,
      metadata: {
        charter: "",
        difficulty: { level: 1 },
        audio: { offset: 0 },
        grid_offset: 0,
        laneCount: 7, resolution: 960
      },
      timing: {
        bpms: [{ tick: 0, bpm: 120.0 }],
        scrolls: [{ tick: 0, speed: 1.0 }],
        timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
        stops: []
      },
      notes: [], events: []
    };
    loadChart(data, 'new_chart.json');
  }

  
  async function loadChart(data, name){
    if(!data || typeof data !== 'object'){ showAppMessage('不正なJSONです'); return; }
    if(data.version !== 2 || (Array.isArray(data.notes)&&data.notes.some(n=>n.type==='swap'))){
      if(data.version===1){
        const openOld=await showAppConfirm('この譜面は v1 です。旧エディタを別画面で開きますか？ 新エディタでは v1 を保存できません。','旧譜面','旧エディタで開く');
        if(openOld){
          if(typeof require==='function'){
            try{require('electron').ipcRenderer.send('open-legacy-chart',{data,name});return;}catch{}
          }
          const popup=window.open('old-editor/index.html','noteeditor-old');
          if(!popup) showAppMessage('ポップアップがブロックされました。old-editor/index.html を開いてください。');
          else { const payload={kind:'noteeditor-v1-open',data,name}; const send=()=>popup.postMessage(payload,location.origin); popup.addEventListener('load',send,{once:true}); setTimeout(send,800); }
        }
      } else showAppMessage('この形式は v2 エディタでは開けません。');
      return;
    }
    if(!Array.isArray(data.notes)) data.notes = [];
    if(!data.metadata) data.metadata = {};
    if(!data.timing) data.timing = {};
    normalizeChartTiming(data.timing);
    if(!Array.isArray(data.events)) data.events = [];
    const rawResolution = data.metadata.resolution;
    const normalizedMetadata = ReInverseChartFormat.normalizeMetadata(data.metadata);
    data.metadata.charter = normalizedMetadata.charter;
    data.metadata.audio = normalizedMetadata.audio;
    data.metadata.difficulty = Object.assign({}, data.metadata.difficulty || {}, normalizedMetadata.difficulty);
    data.metadata.grid_offset = normalizedMetadata.grid_offset;
    data.metadata.resolution = rawResolution;

    chart = data;
    pendingGimmick=null;
    lastMutatorHash='';laneStateHistory=[];
    filename = name || 'chart.json';
    laneCount = 6;
    resolution = Number.isInteger(rawResolution) && rawResolution > 0 ? rawResolution : 960;

    if (audioObjectUrl) {
      URL.revokeObjectURL(audioObjectUrl);
      audioObjectUrl = null;
    }
    audio.removeAttribute('src');
    audio.load();
    audioLoadGeneration++;
    audioBuffer = null;
    waveformData = null;
    currentAudioTime = 0;
    nextHitSoundIndex = 0;
    lastHitSoundTime = -1;
    el.audioFileLabel.textContent = '音声未読み込み';
    el.transport.classList.add('disabled');
    el.btnPlayPause.disabled = true;
    el.seekBar.disabled = true;
    el.playbackRateSelect.disabled = true;
    el.btnPlayPause.innerHTML = '<span class="material-symbols-outlined">play_arrow</span>';
    stopRaf();
    el.timeLabel.textContent = '00:00 / 00:00';
    el.seekBar.value = 0;
    
    // エディタ情報はJSONから消えたから、今のUIの値を維持するね
    el.snapSelect.value = String(snapN);

    clearSelection();
    history = []; redoStack = [];
    updateHistoryButtons();

    el.filenameLabel.textContent = filename;
    el.btnExport.disabled = !packageContext;
    el.btnDownload.disabled = false;
    el.btnMeta.disabled = false;
    el.btnTiming.disabled = false;
    el.btnPreview.disabled = false;
    el.btnAudio.disabled = false;
    el.btnSettings.disabled = false;
    el.emptyState.style.display = 'none';
    el.laneHeader.style.display = 'flex';
    el.editorMainContainer.style.display = 'flex';

    buildLaneHeader();
    resizeCanvas();
    el.scrollWrap.scrollTop = isTimelineInverted ? Math.max(0, contentHeight() - el.scrollWrap.clientHeight) : 0;
    draw();
    updateMetaStats();
    updateNoteCounts();
    updateInspector();
    updateFooterCounts();
    const invalidNote = findInvalidNotePlacement();
    if(invalidNote) showAppMessage(`ID ${invalidNote.id} / Tick ${invalidNote.tick} の${invalidNote.type}は現行の6入力レーン仕様では配置できません。自動変換せず保持しています。修正してから保存してください。`);
  }

  function buildLaneHeader(){
    el.laneHeader.innerHTML = '';
    el.laneHeader.style.width = contentWidth()+'px';
    const rulerCell = document.createElement('div');
    rulerCell.className = 'ruler-cell';
    rulerCell.style.width = RULER_W+'px';
    el.laneHeader.appendChild(rulerCell);
    
    const visualOrder = [0,1,2,3,4,5];
    
    visualOrder.forEach(i => {
      const c = document.createElement('div');
      c.className = 'lane-cell';
      c.style.width = LANE_W+'px';
      c.textContent = 'LANE '+(i+1);
      el.laneHeader.appendChild(c);
    });
  }

  // ---------------------------------------------------------------

// Metadata modal
  // ---------------------------------------------------------------
  // 不要になった入力フィールドのデータバインディングを消してるよ
  function openMetaModal(){
    if(!chart) return;
    const m = chart.metadata;
    el.m_charter.value = m.charter||'';
    const difficultyLevel = Number(m.difficulty && m.difficulty.level);
    el.m_diffLevel.value = Number.isFinite(difficultyLevel) ? difficultyLevel.toFixed(2) : '0.00';
    el.m_audioOffset.value = (m.audio&&m.audio.offset!=null)?m.audio.offset:0;
    el.m_gridOffset.value = ReInverseChartFormat.normalizeGridOffset(m.grid_offset);
    const bpm0 = (chart.timing.bpms||[]).find(b=>b.tick===0) || {bpm:120};
    const timeSignature0 = (chart.timing.timeSignatures||[]).find(t=>t.tick===0) || {numerator:4,denominator:4};
    el.m_bpm.value = bpm0.bpm;
    el.m_timeSigNumerator.value = timeSignature0.numerator;
    el.m_timeSigDenominator.value = timeSignature0.denominator;
    el.m_resolution.value = m.resolution||960;
    openAppModal(el.metaModalOverlay);
  }
  function closeMetaModal(){ closeAppModal(el.metaModalOverlay); }
  el.metaCancel.addEventListener('click', closeMetaModal);
  el.metaModalOverlay.addEventListener('click', (e)=>{ if(e.target===el.metaModalOverlay) closeMetaModal(); });

  el.metaSave.addEventListener('click', ()=>{
    const newResolution = parseInt(el.m_resolution.value,10);
    const bpm = parseFloat(el.m_bpm.value);
    const numerator = parseInt(el.m_timeSigNumerator.value,10);
    const denominator = parseInt(el.m_timeSigDenominator.value,10);
    const difficultyLevel = parseFloat(el.m_diffLevel.value);
    const gridOffsetInput = el.m_gridOffset.value.trim();
    const gridOffset = gridOffsetInput === '' ? 0 : Number(gridOffsetInput);
    if(!Number.isInteger(newResolution) || newResolution<1 || !Number.isFinite(bpm) || bpm<=0 || !Number.isInteger(numerator) || numerator<1 || !Number.isInteger(denominator) || denominator<1 || !Number.isFinite(difficultyLevel) || difficultyLevel<0){
      showAppMessage('resolution、BPM、拍子には正の数を入力してください。');
      return;
    }
    if(!Number.isInteger(gridOffset)){
      showAppMessage('小節線オフセットは整数で入力してください。空欄は 0 として保存します。');
      return;
    }

    pushHistory();
    chart.metadata.charter = el.m_charter.value.trim();
    chart.metadata.difficulty = Object.assign({}, chart.metadata.difficulty, { level: Math.round(difficultyLevel * 100) / 100 });
    chart.metadata.audio = { offset: parseFloat(el.m_audioOffset.value)||0 };
    chart.metadata.grid_offset = gridOffset;
    delete chart.metadata.id; delete chart.metadata.title; delete chart.metadata.artist;
    if(chart.metadata.difficulty) delete chart.metadata.difficulty.name;
    delete chart.metadata.jacket;
    chart.metadata.resolution = newResolution;

    const bpmIndex = chart.timing.bpms.findIndex(b=>b.tick===0);
    if(bpmIndex >= 0) chart.timing.bpms[bpmIndex].bpm = bpm;
    else chart.timing.bpms.push({tick:0,bpm});
    const timeSignatureIndex = chart.timing.timeSignatures.findIndex(t=>t.tick===0);
    if(timeSignatureIndex >= 0) Object.assign(chart.timing.timeSignatures[timeSignatureIndex], {numerator, denominator});
    else chart.timing.timeSignatures.push({tick:0,numerator,denominator});

    laneCount = 6;
    resolution = newResolution;

    buildLaneHeader();
    resizeCanvas();
    draw();
    updateMetaStats();
    updateFooterCounts();
    closeMetaModal();
  });

  // ---------------------------------------------------------------
  // Audio
  // ---------------------------------------------------------------
  function generateWaveformData() {
    if (!audioBuffer) return;
    const channelData = audioBuffer.getChannelData(0);
    const sampleRate = audioBuffer.sampleRate;
    const step = Math.floor(sampleRate / 100); // 100 samples per second (10ms resolution)
    waveformData = [];
    for (let i = 0; i < channelData.length; i += step) {
      let min = 0;
      let max = 0;
      for (let j = 0; j < step && i + j < channelData.length; j++) {
        const val = channelData[i + j];
        if (val < min) min = val;
        if (val > max) max = val;
      }
      waveformData.push({ min, max });
    }
  }

  function onAudioChosen(e){
    const file = e.target.files[0];
    if(!file) return;
    if(audioObjectUrl) URL.revokeObjectURL(audioObjectUrl);
    audioObjectUrl = URL.createObjectURL(file);
    const loadGeneration = ++audioLoadGeneration;
    audioBuffer = null;
    waveformData = null;
    nextHitSoundIndex = 0;
    lastHitSoundTime = -1;
    audio.src = audioObjectUrl;
    if(chart) updateMetaStats();
    el.audioFileLabel.textContent = file.name + " (Loading waveform...)";
    el.transport.classList.remove('disabled');
    el.btnPlayPause.disabled = false;
    el.seekBar.disabled = false;
    el.playbackRateSelect.disabled = false;
    e.target.value = '';
    if(chart) draw();

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        if (audioCtx.state === 'suspended') await audioCtx.resume();
        const decodedBuffer = await audioCtx.decodeAudioData(ev.target.result);
        if(loadGeneration !== audioLoadGeneration) return;
        audioBuffer = decodedBuffer;
        generateWaveformData();
        el.audioFileLabel.textContent = file.name;
        if(chart) draw();
      } catch (err) {
        console.error('Error decoding audio:', err);
        el.audioFileLabel.textContent = file.name + " (Waveform failed)";
      }
    };
    reader.readAsArrayBuffer(file);
  }

  audio.addEventListener('loadedmetadata', ()=>{
    el.seekBar.max = String(Math.floor(audio.duration*100));
    // ここでJSONにメタデータとして長さを保存するのをやめたよ
    updateTimeLabel();

    if(chart){
      resizeCanvas();
      draw();
      updateMetaStats();
      updateFooterCounts();
    }
  });
  audio.addEventListener('timeupdate', ()=>{
    if(!seekBarDragging){ el.seekBar.value = String(Math.floor(audio.currentTime*100)); }
    updateTimeLabel();
  });
  let audioContextOffset = 0;
  
  function syncAudioContext() {
    if (!audio.paused) {
      audioContextOffset = audioCtx.currentTime - (audio.currentTime / (audio.playbackRate || 1));
    }
  }

  audio.addEventListener('play', ()=>{ 
    syncAudioContext();
    el.btnPlayPause.innerHTML='<span class="material-symbols-outlined">pause</span>'; 
    startRaf(); 
  });
  audio.addEventListener('seeked', syncAudioContext);
  audio.addEventListener('ratechange', syncAudioContext);

  audio.addEventListener('pause', ()=>{ el.btnPlayPause.innerHTML='<span class="material-symbols-outlined">play_arrow</span>'; stopRaf(); currentAudioTime=audio.currentTime||0; draw(); drawScrollPreview(currentAudioTime); });
  audio.addEventListener('ended', ()=>{ el.btnPlayPause.innerHTML='<span class="material-symbols-outlined">play_arrow</span>'; stopRaf(); currentAudioTime=audio.currentTime||0; draw(); drawScrollPreview(currentAudioTime); });

  el.btnPlayPause.addEventListener('click', togglePlay);
  function togglePlay(){
    if(!audio.src) return;
    if(audio.paused){
      // Reset hit sound index
      const curTick = tickForAudioTime(audio.currentTime||0);
      const sorted = sortedNotes();
      nextHitSoundIndex = sorted.findIndex(n => n.tick >= curTick);
      if (nextHitSoundIndex === -1) nextHitSoundIndex = sorted.length;
    }
    if(!audio.src) return;
    if(audioCtx.state === 'suspended') audioCtx.resume();
    if(audio.paused) audio.play(); else audio.pause();
  }

  el.seekBar.addEventListener('mousedown', ()=>{ seekBarDragging = true; });
  el.seekBar.addEventListener('input', ()=>{
    if(!audio.src) return;
    audio.currentTime = parseFloat(el.seekBar.value)/100;
    currentAudioTime = audio.currentTime;
    nextHitSoundIndex = sortedNotes().findIndex(n => audioTimeForTick(n.tick) >= currentAudioTime);
    if(nextHitSoundIndex < 0) nextHitSoundIndex = (chart && chart.notes || []).length;
    updateTimeLabel();
    draw();
    drawScrollPreview(currentAudioTime);
  });
  el.seekBar.addEventListener('change', ()=>{ seekBarDragging = false; });

  function fmtTime(sec){
    if(!isFinite(sec) || sec<0) sec = 0;
    const m = Math.floor(sec/60), s = Math.floor(sec%60);
    return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  }
  function updateTimeLabel(){
    el.timeLabel.textContent = fmtTime(audio.currentTime)+' / '+fmtTime(audio.duration||0);
  }
  function seekAudioToTick(tick){
    if(!audio.src || !Number.isFinite(audio.duration)) return;
    const time = Math.max(0, Math.min(audio.duration, audioTimeForTick(Math.max(0,tick))));
    audio.currentTime = time;
    currentAudioTime = time;
    el.seekBar.value = String(Math.floor(time * 100));
    nextHitSoundIndex = sortedNotes().findIndex(n => audioTimeForTick(n.tick) >= time);
    if(nextHitSoundIndex < 0) nextHitSoundIndex = (chart.notes || []).length;
    lastHitSoundTime = time;
    syncAudioContext();
    updateTimeLabel();
    draw();
    drawScrollPreview(currentAudioTime);
  }

  function playbackFrameTime(){
    if(audio.paused) return audio.currentTime||0;
    const predicted=(audioCtx.currentTime-audioContextOffset)*(audio.playbackRate||1);
    const reported=audio.currentTime||0;
    if(!Number.isFinite(predicted) || Math.abs(predicted-reported)>0.12){
      syncAudioContext();
      return reported;
    }
    return predicted;
  }

  function startRaf(){
    stopRaf();
    function loop(){
      if(chart){
        const preciseTime=playbackFrameTime();
        currentAudioTime = preciseTime;
        const curTick = tickForAudioTime(preciseTime);
        const py = tickToY(curTick);
        const wantTop = py - el.scrollWrap.clientHeight*(isTimelineInverted ? 0.7 : 0.3);
        const targetScrollTop = Math.max(0, wantTop);
        if(Math.abs(el.scrollWrap.scrollTop - targetScrollTop) > 0.5){
          el.scrollWrap.scrollTop = targetScrollTop;
        }
        draw();
        drawScrollPreview(preciseTime);
        scheduleHitSounds(preciseTime);
      }
      rafHandle = requestAnimationFrame(loop);
    }
    rafHandle = requestAnimationFrame(loop);
  }
  function stopRaf(){ if(rafHandle){ cancelAnimationFrame(rafHandle); rafHandle=null; } }

  // ---------------------------------------------------------------
  // Export
  // ---------------------------------------------------------------
  function chartExportJson(){ return JSON.stringify(ReInverseChartFormat.createChartExport(chart), null, 2); }
  function exportIssues(){
    return validateChartSyntax().filter(issue =>
      !issue.startsWith('MusicPackage') && !issue.startsWith('package_key') &&
      !issue.startsWith('metadata/songdata') && !issue.startsWith('出力難易度') &&
      !issue.includes('旧フィールド')
    );
  }

  function updatePackageUi(){
    const info=ReInverseChartFormat.difficultyInfo(selectedChartDifficulty), suffix=info?' / charts/'+info.fileName:'';
    const music=packageContext&&packageContext.songdata&&packageContext.songdata.music||{};
    el.packageLabel.textContent=packageContext?packageContext.packageKey+suffix+(music.title?' ('+music.title+')':''):'MusicPackage未選択';
    if(chart){ el.btnExport.disabled=!packageContext; updateMetaStats(); }
  }
  async function selectMusicPackage(){
    if(!window.showDirectoryPicker){ showAppMessage('MusicPackageへの直接保存は File System Access API 対応ブラウザで実行してください。'); return; }
    try { const rootHandle=await window.showDirectoryPicker({mode:'readwrite'}); const metadataHandle=await rootHandle.getDirectoryHandle('metadata'); const songdataHandle=await metadataHandle.getFileHandle('songdata.json'); packageContext={rootHandle,packageKey:rootHandle.name,songdata:JSON.parse(await (await songdataHandle.getFile()).text())}; updatePackageUi(); const errors=validatePackageContext(); if(errors.length)showAppMessage('MusicPackageの検証結果: '+errors.join(' / ')); } catch(err) { if(err&&err.name!=='AbortError')showAppMessage('MusicPackageの選択に失敗しました: '+err.message); }
  }
  async function exportChart(){
    if(!chart)return;const timingErrors=validateTimingEvents();if(timingErrors.length){showAppMessage('タイミングを修正してから保存してください: '+timingErrors.join(' / '));return;}
    const packageErrors=validatePackageContext();if(packageErrors.length){showAppMessage('MusicPackageへ保存できません: '+packageErrors.join(' / '));return;}
    const issues=exportIssues();
    if(issues.length){showAppMessage('譜面を修正してから保存してください: '+issues.slice(0,10).join(' / '));return;}
    if(!await confirmScrambleCompatibility()) return;
    try {const info=ReInverseChartFormat.difficultyInfo(selectedChartDifficulty),charts=await packageContext.rootHandle.getDirectoryHandle('charts',{create:true}),file=await charts.getFileHandle(info.fileName,{create:true}),writable=await file.createWritable();await writable.write(chartExportJson());await writable.close();filename=info.fileName;el.filenameLabel.textContent=filename;showAppToast('charts/'+info.fileName+' へ保存しました。');}catch(err){if(err&&err.name!=='AbortError')showAppMessage('MusicPackageへの保存に失敗しました: '+err.message);}
  }
  function confirmScrambleCompatibility(){
    const ticks=PairFlipRules.eventsAt(chart.notes).filter(([,group])=>group.filter(n=>n.type==='flip').length>1 || (group.some(n=>n.type==='flip')&&group.some(n=>n.type==='pair_swap'))).map(([tick])=>tick);
    if(!ticks.length) return Promise.resolve(true);
    return showAppConfirm(`同 Tick の複数 Flip / Pair との共存 (${ticks.join(', ')}) は現在の Unity に未対応です。保存しますか？`,'Unity 互換性警告','保存する');
  }
  async function downloadChart(){
    if(!chart)return;
    const issues=exportIssues();
    if(issues.length){showAppMessage('譜面を修正してから保存してください: '+issues.slice(0,10).join(' / '));return;}
    if(!await confirmScrambleCompatibility()) return;
    const info=ReInverseChartFormat.difficultyInfo(selectedChartDifficulty),blob=new Blob([chartExportJson()],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');
    a.href=url;a.download=info?info.fileName:'chart.json';document.body.appendChild(a);a.click();document.body.removeChild(a);URL.revokeObjectURL(url);
    showAppToast('JSONをダウンロードしました。');
  }
