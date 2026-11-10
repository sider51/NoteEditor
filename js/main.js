// Static UI init
  // ---------------------------------------------------------------
  SNAP_OPTIONS.forEach(o=>{
    const opt = document.createElement('option');
    opt.value = o.n; opt.textContent = o.label;
    if(o.n===snapN) opt.selected = true;
    el.snapSelect.appendChild(opt);
  });

  el.btnLoad.addEventListener('click', openChartFile);
  el.btnLoad2.addEventListener('click', openChartFile);
  el.fileInput.addEventListener('change', onFileChosen);
  el.btnNew.addEventListener('click', createNewChart);
  el.btnPackage.addEventListener('click', selectMusicPackage);
  el.btnExport.addEventListener('click', exportChart);
  el.btnDownload.addEventListener('click', downloadChart);
  el.packageDifficulty.addEventListener('change', ()=>{ selectedChartDifficulty = el.packageDifficulty.value; updatePackageUi(); });
  el.btnMeta.addEventListener('click', openMetaModal);
  el.btnAudio.addEventListener('click', ()=>el.audioInput.click());
  el.audioInput.addEventListener('change', onAudioChosen);
  el.btnSettings.addEventListener('click', openSettingsModal);
  const menuShells = [...document.querySelectorAll('.menu-shell')];
  function closeMenus(returnFocus=false){
    menuShells.forEach(shell=>{
      const trigger=shell.querySelector('.menu-trigger');
      if(returnFocus && trigger.getAttribute('aria-expanded')==='true') trigger.focus();
      trigger.setAttribute('aria-expanded','false');
      shell.querySelector('.app-menu').hidden=true;
    });
  }
  function updateMenuAvailability(){
    const disabled = {
      audio:el.btnAudio.disabled,save:el.btnExport.disabled,undo:el.btnUndo.disabled,redo:el.btnRedo.disabled,
      copy:!chart || selectedIds.size===0,paste:!chart || !clipboard?.length,
      mirror:!chart || selectedIds.size===0,delete:!chart || selectedIds.size===0,
      syntax:!chart,simulator:!chart,'swap-visualize':!chart,invert:!chart,preview:el.btnPreview.disabled
    };
    document.querySelectorAll('.app-menu [data-command]').forEach(item=>{item.disabled=!!disabled[item.dataset.command];});
  }
  function toggleMenu(shell,force){
    const menu=shell.querySelector('.app-menu'),trigger=shell.querySelector('.menu-trigger');
    const open=force===undefined ? menu.hidden : force;
    closeMenus();
    if(open){ updateMenuAvailability();menu.hidden=false;trigger.setAttribute('aria-expanded','true'); }
  }
  menuShells.forEach(shell=>{
    const trigger=shell.querySelector('.menu-trigger');
    trigger.addEventListener('click',()=>toggleMenu(shell));
    trigger.addEventListener('keydown',event=>{
      if(event.key==='ArrowDown'){
        event.preventDefault();toggleMenu(shell,true);
        shell.querySelector('.app-menu button:not(:disabled)')?.focus();
      }
    });
    const panel=shell.querySelector('.app-menu');
    panel.addEventListener('keydown',event=>{
      if(event.key!=='ArrowDown' && event.key!=='ArrowUp' && event.key!=='Home' && event.key!=='End') return;
      event.preventDefault();
      const items=[...panel.querySelectorAll('button:not(:disabled)')];
      if(!items.length) return;
      const current=items.indexOf(document.activeElement);
      const next=event.key==='Home' ? 0 : event.key==='End' ? items.length-1 :
        (current+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;
      items[next].focus();
    });
    panel.addEventListener('click',event=>{
      const item=event.target.closest('button');
      if(!item || item.disabled) return;
      if(item.dataset.command) runMenuCommand(item.dataset.command);
      closeMenus();
    });
  });
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('.menu-bar')) closeMenus();});
  document.addEventListener('focusin',event=>{if(!event.target.closest('.menu-bar')) closeMenus();});
  document.querySelector('.menu-bar').addEventListener('keydown',event=>{
    const shell=event.target.closest('.menu-shell');
    if(!shell) return;
    if(event.key==='Escape'){event.preventDefault();closeMenus(true);}
    if(event.key==='ArrowRight' || event.key==='ArrowLeft'){
      event.preventDefault();
      const index=menuShells.indexOf(shell);
      const next=menuShells[(index+(event.key==='ArrowRight'?1:-1)+menuShells.length)%menuShells.length];
      toggleMenu(next,true);next.querySelector('.menu-trigger').focus();
    }
  });
  function runMenuCommand(command){
    const quick={audio:el.btnAudio,save:el.btnExport,undo:el.btnUndo,redo:el.btnRedo,preview:el.btnPreview,
      inspector:el.btnInspectorToggle,'zoom-in':el.zoomIn,'zoom-out':el.zoomOut};
    if(quick[command]){quick[command].click();return;}
    if(command==='copy') copySelectionToClipboard();
    else if(command==='paste') beginPasteFromClipboard();
    else if(command==='mirror') mirrorSelected();
    else if(command==='delete') deleteSelected();
    else if(command==='syntax'){openSettingsModal();showChartSyntaxCheck();}
    else if(command==='simulator') runSwapSimulator();
    else if(command==='swap-visualize'){
      setSwapVisualize(!isSwapVisualizeMode);el.swapVisualizeToggle.checked=isSwapVisualizeMode;
    } else if(command==='invert'){
      setTimelineInverted(!isTimelineInverted);el.timelineInvertToggle.checked=isTimelineInverted;
    }
  }

  const inspectorStorageKey = 'noteeditor.inspectorOpen.v1';
  function setInspectorOpen(open, persist = true){
    document.body.classList.toggle('inspector-open',open);
    el.btnInspectorToggle.setAttribute('aria-expanded',String(open));
    el.inspectorPanel.setAttribute('aria-hidden',String(!open));
    el.inspectorPanel.inert = !open;
    if(persist){ try{ localStorage.setItem(inspectorStorageKey,String(open)); }catch{} }
    if(chart){ resizeCanvas(); draw(); }
  }
  let storedInspector = null;
  try{ storedInspector = localStorage.getItem(inspectorStorageKey); }catch{}
  setInspectorOpen(storedInspector === 'true',false);
  el.btnInspectorToggle.addEventListener('click', () => {
    setInspectorOpen(!document.body.classList.contains('inspector-open'));
  });
  el.btnUndo.addEventListener('click', undo);
  el.btnRedo.addEventListener('click', redo);
  el.snapSelect.addEventListener('change', ()=>{ snapN = parseInt(el.snapSelect.value,10); });
  el.playbackRateSelect.addEventListener('change', ()=>{
    if (audio) audio.playbackRate = parseFloat(el.playbackRateSelect.value);
  });
  el.swapVisualizeToggle.addEventListener('change', (e) => setSwapVisualize(e.target.checked));
  let preserveVisualPinned=!!el.preserveVisualToggle.checked;
  let shiftPreserveHeld=false;
  function shiftCanPreserve(){return pointerMode==='place'&&['pair_swap','scramble','flip'].includes(selectedType);}
  function syncPreserveVisualToggle(){
    const temporary=shiftPreserveHeld&&shiftCanPreserve();
    el.preserveVisualToggle.checked=preserveVisualPinned||temporary;
    el.preserveVisualToggle.closest('.preserve-control')?.classList.toggle('temporary',temporary&&!preserveVisualPinned);
    el.preserveVisualToggle.title=temporary&&!preserveVisualPinned?'Shiftを押している間だけ有効':'後続の見た目を維持';
  }
  el.preserveVisualToggle.addEventListener('change',e=>{preserveVisualPinned=e.target.checked;syncPreserveVisualToggle();});
  window.addEventListener('keydown',e=>{if(e.key==='Shift'){shiftPreserveHeld=true;syncPreserveVisualToggle();}},true);
  window.addEventListener('keyup',e=>{if(e.key==='Shift'){shiftPreserveHeld=false;syncPreserveVisualToggle();}},true);
  window.addEventListener('blur',()=>{shiftPreserveHeld=false;syncPreserveVisualToggle();});
  syncPreserveVisualToggle();
  el.timelineInvertToggle.addEventListener('change', (e) => setTimelineInverted(e.target.checked));
  el.settingsClose.addEventListener('click', closeSettingsModal);
  el.settingsModalOverlay.addEventListener('click', (e)=>{ if(e.target===el.settingsModalOverlay) closeSettingsModal(); });
  el.btnSwapSimulator.addEventListener('click', runSwapSimulator);
  el.btnSyntaxCheck.addEventListener('click', showChartSyntaxCheck);

  function openSettingsModal(){
    el.swapVisualizeToggle.checked = isSwapVisualizeMode;
    el.timelineInvertToggle.checked = isTimelineInverted;
    el.btnSwapSimulator.disabled = !chart;
    el.btnSyntaxCheck.disabled = !chart;
    openAppModal(el.settingsModalOverlay);
  }
  function closeSettingsModal(){ closeAppModal(el.settingsModalOverlay); }
  function setSwapVisualize(enabled){
    isSwapVisualizeMode = enabled;
    if(chart) draw();
  }
  function setTimelineInverted(enabled){
    if(isTimelineInverted === enabled) return;
    const anchorY = el.scrollWrap.scrollTop + el.scrollWrap.clientHeight / 2;
    const anchorTick = chart ? yToTick(anchorY) : 0;
    isTimelineInverted = enabled;
    if(chart){
      resizeCanvas();
      el.scrollWrap.scrollTop = tickToY(anchorTick) - el.scrollWrap.clientHeight / 2;
      draw();
    }
  }

  el.zoomIn.addEventListener('click', ()=>setZoom(zoom*1.25));
  el.zoomOut.addEventListener('click', ()=>setZoom(zoom/1.25));

  el.typeButtons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      pendingGimmick=null;
      selectedType = btn.dataset.type;
      el.typeButtons.forEach(b=>b.classList.toggle('active', b===btn));
      syncPreserveVisualToggle();
    });
  });
  el.modeButtons.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      pointerMode = btn.dataset.mode;
      el.modeButtons.forEach(b=>b.classList.toggle('active', b===btn));
      syncPreserveVisualToggle();
      renderHints();
      drag = null;
      draw();
    });
  });

  function renderHints(){
    el.hintTitle.textContent = '操作（'+(pointerMode==='place'?'配置モード':'選択モード')+'）';
    el.hintBody.innerHTML = HINTS[pointerMode].map(([k,v])=>
      `<div class="hint-row"><span>${k}</span><span>${v}</span></div>`
    ).join('');
  }
  renderHints();
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin || event.data?.kind!=='noteeditor-v1-selection') return;
    const notes=event.data.notes;
    if(!chart || !Array.isArray(notes)) return;
    const allowed=notes.filter(n=>['tap','trace','hold','shift','scramble'].includes(n.type));
    if(!allowed.length) return;
    const base=Math.min(...allowed.map(n=>n.tick));
    const anchor=allowed[0].lane;
    clipboard=allowed.map(n=>({...n,visualLane:n.lane,dTick:n.tick-base,dEndTick:n.endTick==null?null:n.endTick-base,dVisualLane:n.lane-anchor}));
    beginPasteFromClipboard();
    showAppMessage(`${allowed.length} 件を受信しました。貼り付け先を選んでください。旧Swap ${event.data.excluded||0} 件は除外しました。`);
  });
  if(typeof require==='function'){
    try{require('electron').ipcRenderer.on('legacy-selection',(_,payload)=>{
      const notes=(payload.notes||[]).filter(n=>['tap','trace','hold','shift','scramble'].includes(n.type));
      if(!chart||!notes.length)return;
      const base=Math.min(...notes.map(n=>n.tick)),anchor=notes[0].lane;
      clipboard=notes.map(n=>({...n,visualLane:n.lane,dTick:n.tick-base,dEndTick:n.endTick==null?null:n.endTick-base,dVisualLane:n.lane-anchor}));
      beginPasteFromClipboard();showAppMessage(`${notes.length} 件を受信しました。貼り付け先を選んでください。`);
    });}catch{}
  }

  function copySelectionToClipboard(){
    if(!chart || selectedIds.size===0) return;
    for(const n of chart.notes)if(selectedIds.has(n.id)&&n.type==='pair_swap')chart.notes.filter(p=>p.type==='pair_swap'&&p.tick===n.tick).forEach(p=>selectedIds.add(p.id));
    const sel=Array.from(selectedIds).map(id=>chart.notes.find(n=>n.id===id)).filter(Boolean)
      .map(note=>({note,visualLane:getVisualLane(note)}));
    sel.sort((a,b)=>a.note.tick-b.note.tick || a.visualLane-b.visualLane || a.note.id-b.note.id);
    if(!sel.length) return;
    const anchorTick=sel[0].note.tick,anchorVisualLane=sel[0].visualLane;
    clipboard=sel.map(({note,visualLane})=>Object.assign({},note,{
      visualLane,dTick:note.tick-anchorTick,
      dEndTick:note.endTick!=null?note.endTick-anchorTick:null,
      dVisualLane:visualLane-anchorVisualLane
    }));
    showAppToast(`${clipboard.length} 件のノーツをコピーしました`);
  }
  function beginPasteFromClipboard(){
    if(!chart || !clipboard?.length) return;
    drag={mode:'paste',items:clipboard,snapTick:0,lane:0,sourceAnchorLane:clipboard[0].visualLane,flipped:false};
    draw();
  }

  document.addEventListener('keydown', (e)=>{
    if(document.querySelector('.modal-overlay.open')) return;
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    const inField = tag==='INPUT' || tag==='TEXTAREA' || tag==='SELECT';
    if(e.key==='Escape' && menuShells.some(shell=>!shell.querySelector('.app-menu').hidden)){
      closeMenus(true);
      return;
    }
    if(e.key==='Escape' && el.settingsModalOverlay.classList.contains('open')){
      e.preventDefault();
      closeSettingsModal();
      return;
    }
    if(e.key==='Escape' && el.metaModalOverlay.classList.contains('open')){
      e.preventDefault();
      closeMetaModal();
      return;
    }
    if(!chart){ return; }
    if(inField){
      if(e.key==='Escape') { closeMetaModal(); closeSettingsModal(); }
      return;
    }
    if(drag && drag.mode==='paste' && e.key==='Escape'){
      e.preventDefault();
      drag = null;
      draw();
      return;
    }
    if(drag && drag.mode==='paste' && e.key.toLowerCase()==='m'){
      e.preventDefault();
      drag.flipped = !drag.flipped;
      draw();
      return;
    }
    if(e.key==='1'){ selectType('tap'); }
    else if(e.key==='2'){ selectType('hold'); }
    else if(e.key==='3'){ selectType('trace'); }
    else if(e.key==='4'){ selectType('pair_swap'); }
    else if(e.key==='5'){ selectType('shift'); }
    else if(e.key==='6'){ selectType('scramble'); }
    else if(e.key==='7'){ selectType('flip'); }
    else if(e.key==='Escape'){ pendingGimmick=null;clearSelection(); draw(); updateInspector(); }
    else if(e.key==='Delete' || e.key==='Backspace'){
      if(selectedIds.size>0){ e.preventDefault(); deleteSelected(); }
    }
    else if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='c'){
      if(selectedIds.size > 0){e.preventDefault();copySelectionToClipboard();}
    }
    else if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='v'){
      if(clipboard?.length){e.preventDefault();beginPasteFromClipboard();}
    }
    else if(e.key==='Enter'){
      if(drag && drag.mode==='paste'){
        e.preventDefault();
        commitPaste();
      }
    }
    else if(e.key.toLowerCase()==='m' || e.key.toLowerCase()==='h'){
      if(selectedIds.size > 0){
        e.preventDefault();
        mirrorSelected();
      }
    }
    else if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='z'){
      e.preventDefault(); if(e.shiftKey) redo(); else undo();
    }
    else if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='y'){
      e.preventDefault(); redo();
    }
    else if(e.code==='Space'){
      if(audio.src){ e.preventDefault(); togglePlay(); }
    }
  });

  function selectType(t){
    pendingGimmick=null;
    selectedType = t;
    el.typeButtons.forEach(b=>b.classList.toggle('active', b.dataset.type===t));
    syncPreserveVisualToggle();
  }

  function setZoom(z, opts){
    const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z));
    if(chart){
      const anchorScreenY = opts && opts.anchorScreenY != null ? opts.anchorScreenY : el.scrollWrap.clientHeight / 2;
      const anchorTick = opts && opts.anchorTick != null ? opts.anchorTick : yToTick(el.scrollWrap.scrollTop + anchorScreenY);
      zoom = newZoom;
      el.zoomLabel.textContent = Math.round(zoom*100)+'%';
      resizeCanvas();
      el.scrollWrap.scrollTop = tickToY(anchorTick) - anchorScreenY;
      draw();
      return;
    }
    zoom = newZoom;
    el.zoomLabel.textContent = Math.round(zoom*100)+'%';
  }

  el.scrollWrap.addEventListener('scroll', () => {
    el.laneHeader.style.transform = `translateX(${-el.scrollWrap.scrollLeft}px)`;
    if(!audio.paused) return;
    draw();
  });
  el.scrollWrap.addEventListener('wheel', (e)=>{
    if(!chart) return;
    if(e.ctrlKey || e.metaKey){
      e.preventDefault();
      const rect = el.scrollWrap.getBoundingClientRect();
      const screenY = e.clientY - rect.top;
      const scrollY = screenY + el.scrollWrap.scrollTop;
      const tickUnderCursor = yToTick(scrollY);
      const factor = e.deltaY < 0 ? 1.12 : 1/1.12;
      setZoom(zoom*factor, {anchorTick:tickUnderCursor, anchorScreenY:screenY});
    }
  }, {passive:false});

  // ---------------------------------------------------------------
