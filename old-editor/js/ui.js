// Inspector / side panel rendering
  // ---------------------------------------------------------------
  function updateMetaStats(){
    const metadata = chart.metadata || {};
    const rawDifficulty = metadata.difficulty || {};
    const difficultyLevel = Number(rawDifficulty.level);
    const m = {
      ...metadata,
      difficulty: {
        ...rawDifficulty,
        level: Number.isFinite(difficultyLevel) ? difficultyLevel.toFixed(2) : '0.00'
      }
    };
    const bpms = sortedBpms();
    const bpmRange = bpms.length ? [...new Set(bpms.map(b=>b.bpm))].join(' → ') : '-';
    const packageMusic = packageContext && packageContext.songdata && packageContext.songdata.music || {};
    el.metaStats.innerHTML = `
      <div class="stat-row"><span class="k">タイトル</span><span class="v">${escapeHtml(packageMusic.title||'-')}</span></div>
      <div class="stat-row"><span class="k">アーティスト</span><span class="v">${escapeHtml(packageMusic.artist||'-')}</span></div>
      <div class="stat-row"><span class="k">難易度</span><span class="v">${escapeHtml((ReInverseChartFormat.difficultyInfo(selectedChartDifficulty)||{}).label||'-')} ${m.difficulty?m.difficulty.level:''}</span></div>
      <div class="stat-row"><span class="k">入力レーン</span><span class="v">6（保存形式: 7）</span></div>
      <div class="stat-row"><span class="k">解像度</span><span class="v">${resolution}</span></div>
      <div class="stat-row"><span class="k">BPM</span><span class="v">${escapeHtml(bpmRange)}</span></div>
      <div class="stat-row"><span class="k">音声オフセット</span><span class="v">${(m.audio&&m.audio.offset)!=null ? m.audio.offset+' ms' : '0 ms'}</span></div>
      <div class="stat-row"><span class="k">小節線オフセット</span><span class="v">${m.grid_offset||0}</span></div>
    `;
  }

  function updateNoteCounts(){
    const notes = chart.notes||[];
    const counts = {tap:0,hold:0,trace:0,swap:0,shift:0,scramble:0};
    notes.forEach(n=>{ if(counts[n.type]!=null) counts[n.type]++; });
    el.noteCounts.innerHTML = Object.keys(TYPE_META).map(t=>`
      <div class="count-item"><span class="sw" style="background:${TYPE_META[t].color}"></span>${TYPE_META[t].label}<span class="n">${counts[t]}</span></div>
    `).join('') + `<div class="count-item">総採点単位<span class="n">${notes.reduce((sum,n)=>sum+(n.type==='scramble'?6:1),0)}</span></div>`;
  }

  function updateFooterCounts(){
    const notes = chart.notes||[];
    el.statCount.textContent = notes.length;
    el.statLength.textContent = maxContentTick()>0 ? Math.max(0, maxContentTick()-resolution*4*2) : 0;
  }

  function updateInspector(){
    if(selectedIds.size===0){
      el.inspector.innerHTML = '<p class="placeholder">ノーツをクリックして選択</p>';
      return;
    }
    if(selectedIds.size>1){
      el.inspector.innerHTML = `
        <div class="note-card">
          <div class="stat-row"><span class="k">選択中</span><span class="v">${selectedIds.size} 件</span></div>
          <button class="del-btn" id="inspDeleteMulti">選択したノーツを削除</button>
<button id="inspMirrorMulti" style="margin-top:8px; width:100%;">左右反転 (M)</button>
        </div>`;
      document.getElementById('inspDeleteMulti').addEventListener('click', deleteSelected);
      document.getElementById('inspMirrorMulti').addEventListener('click', mirrorSelected);
      return;
    }
    const id = [...selectedIds][0];
    const n = (chart.notes||[]).find(n=>n.id===id);
    if(!n){ el.inspector.innerHTML = '<p class="placeholder">ノーツをクリックして選択</p>'; return; }
    const meta = TYPE_META[n.type]||{color:'#888',label:n.type};
    el.inspector.innerHTML = `
      <div class="note-card">
        <span class="type-tag" style="background:${meta.color}22;color:${meta.color};border:1px solid ${meta.color}55;">${meta.label}</span>
        <div class="stat-row"><span class="k">ID</span><span class="v">${n.id}</span></div>
        <div class="stat-row"><span class="k">Tick</span><span class="v">${n.tick}</span></div>
        <div class="stat-row"><span class="k">Beat</span><span class="v">${(n.tick/resolution).toFixed(2)}</span></div>
        <div class="stat-row"><span class="k">Lane</span><span class="v">${n.lane}</span></div>
        ${n.type==='hold' || n.type==='shift' ? `<div class="stat-row"><span class="k">EndTick</span><span class="v">${n.endTick}</span></div>
        <div class="stat-row"><span class="k">長さ</span><span class="v">${n.endTick-n.tick} tick</span></div>` : ''}
        <button class="del-btn" id="inspDelete">このノーツを削除</button>
      </div>
    `;
    document.getElementById('inspDelete').addEventListener('click', ()=>deleteNoteById(n.id));
  }

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  // ---------------------------------------------------------------
