// Manual integration check: node tests/browser-smoke.js
// Requires Chrome. Exercises the preserved v1 editor, event editor, inversion, and wave seek.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');

const chromePath = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const electronPath = process.env.ELECTRON_PATH;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function freePort(){
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}

function silentWav(){
  const sampleRate = 8000, samples = sampleRate * 2;
  const data = Buffer.alloc(44 + samples * 2);
  data.write('RIFF',0); data.writeUInt32LE(data.length-8,4);
  data.write('WAVEfmt ',8); data.writeUInt32LE(16,16);
  data.writeUInt16LE(1,20); data.writeUInt16LE(1,22);
  data.writeUInt32LE(sampleRate,24); data.writeUInt32LE(sampleRate*2,28);
  data.writeUInt16LE(2,32); data.writeUInt16LE(16,34);
  data.write('data',36); data.writeUInt32LE(samples*2,40);
  return 'data:audio/wav;base64,' + data.toString('base64');
}

async function main(){
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(),'noteeditor-browser-'));
  const pageUrl = pathToFileURL(path.join(__dirname,'../old-editor/index.html')).href;
  const electronEnv = {...process.env};
  delete electronEnv.ELECTRON_RUN_AS_NODE;
  const browser = electronPath
    ? spawn(electronPath,['--no-sandbox','--autoplay-policy=no-user-gesture-required',
      '--disable-background-media-suspend','--disable-renderer-backgrounding',
      '--disable-background-timer-throttling',`--remote-debugging-port=${port}`,
      '--remote-allow-origins=*',`--user-data-dir=${profile}`,
      path.join(__dirname,'../windows_app')],{windowsHide:true,stdio:'ignore',env:electronEnv})
    : spawn(chromePath,[
      '--headless=new','--disable-gpu','--no-first-run','--disable-extensions',
      '--no-sandbox','--autoplay-policy=no-user-gesture-required',`--remote-debugging-port=${port}`,'--remote-allow-origins=*',
      `--user-data-dir=${profile}`,pageUrl,
    ],{windowsHide:true,stdio:'ignore'});
  let socket;
  try {
    let page;
    for(let attempt=0;attempt<60;attempt++){
      try {
        const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        page = pages.find(entry => entry.type === 'page' && entry.url === pageUrl);
        if(page) break;
      } catch {}
      await pause(100);
    }
    if(!page && electronPath){
      try{ console.error('Electron targets:',(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).map(entry=>entry.url)); }catch(error){ console.error('Electron debugger:',error.message,'exit:',browser.exitCode); }
    }
    assert.ok(page,'Editor page target did not open');
    socket = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((resolve,reject) => {socket.onopen=resolve;socket.onerror=reject;});
    let nextId = 0;
    const pending = new Map();
    socket.onmessage = event => {
      const response = JSON.parse(event.data);
      if(pending.has(response.id)){
        pending.get(response.id)(response);
        pending.delete(response.id);
      }
    };
    const call = (method,params={}) => new Promise(resolve => {
      const id = ++nextId;
      pending.set(id,resolve);
      socket.send(JSON.stringify({id,method,params}));
    });
    async function evaluate(expression){
      const response = await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});
      if(response.result?.exceptionDetails) throw new Error(response.result.exceptionDetails.exception?.description || response.result.exceptionDetails.text);
      return response.result?.result?.value;
    }
    let ready = false;
    for(let attempt=0;attempt<50;attempt++){
      ready = await evaluate('document.readyState === "complete" && typeof openTimingEditor === "function" && el.snapSelect.options.length > 0');
      if(ready) break;
      await pause(100);
    }
    assert.ok(ready,'Editor scripts did not initialize');
    if(electronPath) await call('Page.bringToFront');
    const result = await evaluate(`(async()=>{
      createNewChart();
      openTimingEditor();
      appendTimingRow('bpms',1920,240);
      appendTimingRow('scrolls',960,0.5);
      appendTimingRow('scrolls',2880,2);
      const fadeRow = [...el.timingRows.querySelectorAll('.timing-row[data-kind="scrolls"]')].at(-1);
      fadeRow.querySelector('.timing-mode').value = 'fade';
      fadeRow.querySelector('.timing-mode').dispatchEvent(new Event('change'));
      fadeRow.querySelector('.timing-end').value = '3840';
      fadeRow.querySelector('.timing-easing').value = 'inQuad';
      saveTimingEditor();
      const fade = chart.timing.scrolls.find(e=>e.tick===2880);
      const fadeSaved = fade.endTick===3840 && fade.easing==='inQuad' && fade.speed===2;
      openTimingEditor();
      const reopenedFade = [...el.timingRows.querySelectorAll('.timing-row[data-kind="scrolls"]')].at(-1);
      const fadeReopened = reopenedFade.querySelector('.timing-mode').value==='fade' && reopenedFade.querySelector('.timing-end').value==='3840' && reopenedFade.querySelector('.timing-easing').value==='inQuad';
      closeTimingEditor();
      setTimelineInverted(true);
      const inverted = tickToY(960) < tickToY(0);
      audio.src = ${JSON.stringify(silentWav())};
      audio.load();
      await new Promise((resolve,reject)=>{
        if(audio.readyState >= 1) return resolve();
        audio.addEventListener('loadedmetadata',resolve,{once:true});
        audio.addEventListener('error',reject,{once:true});
      });
      const clickY = tickToY(960);
      el.scrollWrap.scrollTop = clickY - el.scrollWrap.clientHeight/2;
      const rect = el.gridCanvas.getBoundingClientRect();
      el.gridCanvas.dispatchEvent(new MouseEvent('mousedown',{
        bubbles:true,button:0,
        clientX:rect.left+laneToX(laneCount)+50,
        clientY:rect.top+clickY-el.scrollWrap.scrollTop,
      }));
      el.btnPreview.click();
      const previewOpen = el.previewModalOverlay.classList.contains('open');
      closeScrollPreview();
      undo();
      const undoRemoved = !chart.timing.bpms.some(e=>e.tick===1920);
      redo();
      const redoRestored = chart.timing.bpms.some(e=>e.tick===1920 && e.bpm===240);
      const noteY = tickToY(960);
      const noteRect = el.gridCanvas.getBoundingClientRect();
      el.gridCanvas.dispatchEvent(new MouseEvent('mousedown',{
        bubbles:true,button:0,
        clientX:noteRect.left+RULER_W+LANE_W/2,
        clientY:noteRect.top+noteY-el.scrollWrap.scrollTop,
      }));
      const reversedPlacement = chart.notes.some(n=>n.tick===960 && n.lane===0);
      setTimelineInverted(false);
      selectType('scramble');
      const scrambleY = tickToY(4800);
      el.scrollWrap.scrollTop = scrambleY-el.scrollWrap.clientHeight/2;
      const scrambleRect = el.gridCanvas.getBoundingClientRect();
      el.gridCanvas.dispatchEvent(new MouseEvent('mousedown',{
        bubbles:true,button:0,clientX:scrambleRect.left+RULER_W+LANE_W*3,
        clientY:scrambleRect.top+scrambleY-el.scrollWrap.scrollTop,
      }));
      const scramble = chart.notes.find(n=>n.tick===4800 && n.type==='scramble' && n.lane===6);
      const leftSwap = placeNote('swap',5760,0);
      const rightSwap = placeNote('swap',5760,5);
      rebuildLaneStates();
      const centerPair = getLaneMappingAfterTick(5760).normal.join(',') === '5,4,2,3,1,0';
      const sixHeaders = el.laneHeader.querySelectorAll('.lane-cell').length===6 && !el.laneHeader.textContent.includes('SPACE');
      const serialized = JSON.parse(chartExportJson());
      const oldStep = serialized.timing.scrolls.find(e=>e.tick===960);
      const roundTrip = serialized.metadata.laneCount===7 && serialized.notes.some(n=>n.id===scramble.id && n.lane===6) && serialized.timing.scrolls.some(e=>e.tick===2880 && e.endTick===3840 && e.easing==='inQuad') && Object.keys(oldStep).sort().join(',')==='speed,tick';
      const invalid = {id:nextId(),tick:6720,lane:6,type:'hold',endTick:7680,size:1};
      chart.notes.push(invalid);
      const invalidBlocked = exportIssues().some(issue=>issue.includes('レーンが不正'));
      chart.notes.pop();
      drag = {mode:'paste',snapTick:7200,lane:4,sourceAnchorLane:6,flipped:false,items:[
        {type:'scramble',visualLane:6,dTick:0,dVisualLane:0,size:1},
        {type:'tap',visualLane:2,dTick:240,dVisualLane:-4,size:1},
      ]};
      commitPaste();
      const mixedPaste = chart.notes.some(n=>n.tick===7200 && n.type==='scramble' && n.lane===6) && chart.notes.some(n=>n.tick===7440 && n.type==='tap' && n.lane===2);
      return {
        bpm:chart.timing.bpms.find(e=>e.tick===1920)?.bpm,
        scroll:chart.timing.scrolls.find(e=>e.tick===960)?.speed,
        inverted,
        waveSeek:audio.currentTime,
        previewOpen,undoRemoved,redoRestored,reversedPlacement,fadeSaved,fadeReopened,
        scramble:!!scramble,leftSwap:!!leftSwap,rightSwap:!!rightSwap,centerPair,sixHeaders,roundTrip,invalidBlocked,mixedPaste,
      };
    })()`);
    assert.equal(result.bpm,240);
    assert.equal(result.scroll,0.5);
    assert.equal(result.inverted,true);
    assert.ok(Math.abs(result.waveSeek-0.5)<0.02,`Wave seek landed at ${result.waveSeek}`);
    assert.equal(result.previewOpen,true);
    assert.equal(result.undoRemoved,true);
    assert.equal(result.redoRestored,true);
    assert.equal(result.reversedPlacement,true);
    for(const key of ['fadeSaved','fadeReopened','scramble','leftSwap','rightSwap','centerPair','sixHeaders','roundTrip','invalidBlocked','mixedPaste']) assert.equal(result[key],true,key);
    const playback = await evaluate(`(async()=>{
      audio.muted=false;
      audioCtx.resume().catch(()=>{});
      audio.currentTime=0.2;
      el.btnPreview.click();
      await Promise.race([audio.play(),new Promise((_,reject)=>setTimeout(()=>reject(new Error('audio playback timeout')),1500))]);
      currentAudioTime=audio.currentTime;
      const before=currentAudioTime;
      await new Promise(resolve=>setTimeout(resolve,220));
      const after=currentAudioTime;
      const tick=tickForAudioTime(after),py=tickToY(tick);
      const wanted=Math.max(0,py-el.scrollWrap.clientHeight*(isTimelineInverted?0.7:0.3));
      const follow=Math.abs(el.scrollWrap.scrollTop-wanted)<2;
      const aligned=Math.abs(after-audio.currentTime)<0.12;
      let maxFrameError=null;
      if(document.visibilityState==='visible'){
        const errors=[];
        await new Promise(resolve=>{
          const sample=()=>{
            const frameTick=tickForAudioTime(currentAudioTime);
            const frameTop=Math.max(0,tickToY(frameTick)-el.scrollWrap.clientHeight*(isTimelineInverted?0.7:0.3));
            errors.push(Math.abs(el.scrollWrap.scrollTop-frameTop));
            if(errors.length>=18) resolve(); else requestAnimationFrame(sample);
          };
          requestAnimationFrame(sample);
        });
        maxFrameError=Math.max(...errors);
      }
      audio.pause();closeScrollPreview();
      return {advancing:after-before>0.12,follow,aligned,maxFrameError,before,after,audioTime:audio.currentTime,
        paused:audio.paused,visibility:document.visibilityState,rafHandle};
    })()`);
    console.log('Playback checks:',playback);
    if(playback.visibility==='visible') {
      for(const key of ['advancing','follow','aligned']) assert.equal(playback[key],true,`playback ${key}`);
      assert.ok(playback.maxFrameError<2,`playback frame tracking ${playback.maxFrameError}px`);
    } else {
      assert.ok(electronPath,`Unexpected hidden browser target: ${playback.visibility}`);
      console.log('Electron live playback RAF checks skipped: CDP target is hidden');
    }
    const performanceCheck = await evaluate(`(()=>{
      createNewChart();
      chart.notes=Array.from({length:1800},(_,i)=>({id:i+1,tick:960+i*240,lane:i%6,type:'tap',size:1}));
      resizeCanvas();
      el.btnPreview.click();
      const durations=[];
      for(let i=0;i<45;i++){
        const started=performance.now();
        currentAudioTime=0.5+i/60;
        draw();drawScrollPreview(currentAudioTime);
        if(i>=5) durations.push(performance.now()-started);
      }
      closeScrollPreview();
      durations.sort((a,b)=>a-b);
      return {p95:durations[Math.floor(durations.length*0.95)],max:durations.at(-1)};
    })()`);
    console.log('Dense chart draw ms:',performanceCheck);
    assert.ok(performanceCheck.p95<30,`dense chart p95 draw ${performanceCheck.p95}ms`);
    const screenshotDir = process.env.UI_SCREENSHOT_DIR;
    const editing = await evaluate(`(()=>{
      createNewChart();
      selectType('tap');
      const point = (tick,lane,recenter=true) => {
        const y=tickToY(tick);
        if(recenter) el.scrollWrap.scrollTop=Math.max(0,y-el.scrollWrap.clientHeight/2);
        const rect=el.gridCanvas.getBoundingClientRect();
        return {x:rect.left+RULER_W+LANE_W*(lane+0.5),y:rect.top+y-el.scrollWrap.scrollTop};
      };
      const down = p => el.gridCanvas.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,clientX:p.x,clientY:p.y}));
      const move = p => window.dispatchEvent(new MouseEvent('mousemove',{bubbles:true,clientX:p.x,clientY:p.y}));
      const up = () => window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));
      const first=point(960,2);
      down(first); up();
      const placed=chart.notes.find(n=>n.tick===960 && n.lane===2 && n.type==='tap');
      setInspectorOpen(true);
      document.getElementById('modeSelect').click();
      down(point(960,2)); up();
      const selected=selectedIds.has(placed?.id) && el.inspector.textContent.includes('TAP');
      const beforeToggle=chartExportJson();
      setInspectorOpen(false); setInspectorOpen(true);
      const toggleSafe=beforeToggle===chartExportJson() && selectedIds.has(placed?.id);
      down(point(960,2)); move(point(1920,3,false)); up();
      const moved=placed.tick===1920 && placed.lane===3;
      undo();
      const moveUndone=chart.notes.some(n=>n.id===placed.id && n.tick===960 && n.lane===2);
      redo();
      const moveRedone=chart.notes.some(n=>n.id===placed.id && n.tick===1920 && n.lane===3);
      document.getElementById('modePlace').click(); selectType('hold');
      down(point(2880,1)); move(point(3840,1,false)); up();
      const hold=chart.notes.find(n=>n.type==='hold' && n.tick===2880 && n.lane===1 && n.endTick>=3840);
      const zoomBefore=zoom;
      document.getElementById('zoomIn').click(); document.getElementById('zoomOut').click();
      const zoomRoundTrip=zoom===zoomBefore;
      setInspectorOpen(false);
      return {placed:!!placed,selected,toggleSafe,moved,moveUndone,moveRedone,hold:!!hold,zoomRoundTrip};
    })()`);
    console.log('Editing checks:',editing);
    for(const [key,value] of Object.entries(editing)) assert.equal(value,true,`editing ${key}`);
    const workflow = await evaluate(`(async()=>{
      createNewChart();
      const point = (lane) => {
        const y=tickToY(960);
        el.scrollWrap.scrollTop=Math.max(0,y-el.scrollWrap.clientHeight/2);
        const rect=el.gridCanvas.getBoundingClientRect();
        return {x:rect.left+RULER_W+LANE_W*(lane+0.5),y:rect.top+y-el.scrollWrap.scrollTop};
      };
      const down = lane => {const p=point(lane);el.gridCanvas.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,clientX:p.x,clientY:p.y}));window.dispatchEvent(new MouseEvent('mouseup',{bubbles:true}));};
      selectType('tap');
      for(let lane=0;lane<4;lane++) down(lane);
      selectType('scramble');down(2);
      const scramble=chart.notes.find(n=>n.tick===960 && n.type==='scramble');
      selectType('tap');down(4);
      const fifth=chart.notes.some(n=>n.tick===960 && n.lane===4 && n.type==='tap');
      down(5);
      const sixthBlocked=!chart.notes.some(n=>n.tick===960 && n.lane===5 && n.type==='tap');
      const noSyntaxConflict=!exportIssues().some(e=>e.includes('SCRAMBLEと重複'));
      const warning=findScrambleOverlapTicks().includes(960);
      drag={mode:'paste',snapTick:1920,lane:2,sourceAnchorLane:2,flipped:false,items:[
        {type:'tap',visualLane:2,dTick:0,dVisualLane:0,size:1},
        {type:'scramble',visualLane:6,dTick:0,dVisualLane:4,size:1}
      ]};
      commitPaste();
      const pastedPair=chart.notes.some(n=>n.tick===1920 && n.type==='tap' && n.lane===2) &&
        chart.notes.some(n=>n.tick===1920 && n.type==='scramble' && n.lane===6);
      const roundTrip=JSON.parse(chartExportJson()).notes.some(n=>n.tick===1920 && n.type==='scramble');
      const check=confirmScrambleCompatibility();
      const customWarning=document.getElementById('appDialogOverlay').classList.contains('open') &&
        document.getElementById('appDialogMessage').textContent.includes('Unity');
      document.getElementById('appDialogCancel').click();
      const cancelled=(await check)===false;
      document.getElementById('btnEditMenu').click();
      const editMenu=!document.getElementById('editMenu').hidden && !document.querySelector('[data-command="copy"]').disabled;
      document.querySelector('[data-command="copy"]').click();
      const copied=clipboard?.length===2;
      document.getElementById('btnEditMenu').click();
      document.querySelector('[data-command="paste"]').click();
      const pasteFromMenu=drag?.mode==='paste';
      drag=null;
      const before=selectedType;
      openSettingsModal();
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'6',bubbles:true}));
      const shortcutBlocked=selectedType===before;
      document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
      const escapeClosed=!el.settingsModalOverlay.classList.contains('open');
      return {scramble:!!scramble,fifth,sixthBlocked,noSyntaxConflict,warning,pastedPair,roundTrip,
        customWarning,cancelled,editMenu,copied,pasteFromMenu,shortcutBlocked,escapeClosed};
    })()`);
    for(const [key,value] of Object.entries(workflow)) assert.equal(value,true,`workflow ${key}`);
    if(screenshotDir){
      fs.mkdirSync(screenshotDir,{recursive:true});
      await call('Emulation.setDeviceMetricsOverride',{width:1280,height:800,deviceScaleFactor:1,mobile:false});
      await evaluate('resizeCanvas();el.scrollWrap.scrollTop=Math.max(0,tickToY(960)-el.scrollWrap.clientHeight/2);draw()');
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      fs.writeFileSync(path.join(screenshotDir,'scramble-overlap.png'),Buffer.from(shot.result.data,'base64'));
    }
    const ui = await evaluate(`(()=>{
      const initialClosed = !document.body.classList.contains('inspector-open');
      el.btnFileMenu.click();
      const menuOpened = !el.fileMenu.hidden && el.btnFileMenu.getAttribute('aria-expanded')==='true';
      document.body.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));
      const menuClosed = el.fileMenu.hidden;
      createNewChart();
      chart.metadata.charter = 'Visual QA';
      chart.notes = [
        {id:1,tick:960,lane:0,type:'tap',size:1},
        {id:2,tick:1440,endTick:2400,lane:1,type:'hold',size:1},
        {id:3,tick:1920,lane:2,type:'trace',size:1},
        {id:4,tick:2880,lane:0,type:'swap',size:1},
        {id:5,tick:3360,endTick:4320,lane:4,type:'shift',size:1},
        {id:6,tick:4800,lane:6,type:'scramble',size:1},
      ];
      resizeCanvas(); draw(); updateNoteCounts();
      const layout = () => {
        const canvas = el.gridCanvas.getBoundingClientRect();
        const wrap = el.scrollWrap.getBoundingClientRect();
        const header = el.laneHeader.getBoundingClientRect();
        return {canvasLeft:canvas.left,headerLeft:header.left,leftGap:canvas.left-wrap.left,rightGap:wrap.right-canvas.right,
          horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
      };
      return {initialClosed,menuOpened,menuClosed,layout:layout()};
    })()`);
    assert.equal(ui.initialClosed,true);
    assert.equal(ui.menuOpened,true);
    assert.equal(ui.menuClosed,true);
    assert.equal(ui.layout.horizontalOverflow,false);
    assert.ok(Math.abs(ui.layout.canvasLeft-ui.layout.headerLeft)<15,'lane header and canvas are aligned');
    assert.ok(Math.abs(ui.layout.leftGap-ui.layout.rightGap)<15,'canvas is centered');
    async function capture(name,width,height){
      await call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});
      const layout = await evaluate(`(()=>{
        resizeCanvas(); draw();
        const canvas=el.gridCanvas.getBoundingClientRect(), wrap=el.scrollWrap.getBoundingClientRect(), header=el.laneHeader.getBoundingClientRect();
        return {canvasLeft:canvas.left,headerLeft:header.left,leftGap:canvas.left-wrap.left,rightGap:wrap.right-canvas.right,
          horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
      })()`);
      assert.equal(layout.horizontalOverflow,false,`${width}px document overflow`);
      assert.ok(Math.abs(layout.canvasLeft-layout.headerLeft)<15,`${width}px lane alignment`);
      assert.ok(Math.abs(layout.leftGap-layout.rightGap)<15,`${width}px canvas centering`);
      if(screenshotDir){
        fs.mkdirSync(screenshotDir,{recursive:true});
        const shot = await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
        fs.writeFileSync(path.join(screenshotDir,name+'.png'),Buffer.from(shot.result.data,'base64'));
      }
    }
    await capture('editor-1280-closed',1280,800);
    await evaluate('setInspectorOpen(true)');
    await capture('editor-1280-open',1280,800);
    await evaluate('openTimingEditor()');
    await capture('timing-1280',1280,800);
    await evaluate('closeTimingEditor();openSettingsModal();showChartSyntaxCheck()');
    await capture('settings-1280',1280,800);
    await evaluate('closeSettingsModal();el.btnFileMenu.click()');
    await capture('menu-1280',1280,800);
    await evaluate("closeMenus();showAppConfirm('Scramble と通常ノーツが同 Tick にあります。現在の Unity はこの譜面を読み込めません。互換性未対応のまま保存しますか？','Unity 互換性警告','保存する');true");
    await capture('dialog-1280',1280,800);
    await evaluate("document.getElementById('appDialogCancel').click();setInspectorOpen(false)");
    await capture('editor-1024-closed',1024,768);
    await evaluate('setInspectorOpen(true)');
    await capture('editor-1024-open',1024,768);
    await call('Emulation.setDeviceMetricsOverride',{width:640,height:768,deviceScaleFactor:1,mobile:false});
    const narrow = await evaluate(`(async()=>{
      resizeCanvas(); draw();
      el.scrollWrap.scrollLeft=40;
      el.scrollWrap.dispatchEvent(new Event('scroll'));
      await new Promise(resolve=>setTimeout(resolve,30));
      const canvas=el.gridCanvas.getBoundingClientRect(), header=el.laneHeader.getBoundingClientRect();
      return {scrolled:el.scrollWrap.scrollLeft>0,aligned:Math.abs(canvas.left-header.left)<15,
        horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
    })()`);
    assert.equal(narrow.scrolled,true,'narrow viewport can scroll lanes');
    assert.equal(narrow.aligned,true,'lane header follows horizontal scroll');
    assert.equal(narrow.horizontalOverflow,false,'narrow viewport document overflow');
    if(screenshotDir){
      const shot=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      fs.writeFileSync(path.join(screenshotDir,'editor-640-open.png'),Buffer.from(shot.result.data,'base64'));
    }
    await call('Page.reload',{ignoreCache:true});
    let inspectorRestored = false;
    for(let attempt=0;attempt<40;attempt++){
      inspectorRestored = await evaluate("document.readyState==='complete' && !!document.getElementById('btnInspectorToggle') && document.body.classList.contains('inspector-open')");
      if(inspectorRestored) break;
      await pause(100);
    }
    assert.equal(inspectorRestored,true,'inspector state persisted after reload');
    console.log('Browser smoke passed:',result);
    await call('Browser.close');
  } finally {
    if(socket && socket.readyState === WebSocket.OPEN) socket.close();
    browser.kill();
    if(browser.exitCode == null) await Promise.race([
      new Promise(resolve => browser.once('exit',resolve)),
      pause(2000),
    ]);
    const tempRoot = fs.realpathSync(os.tmpdir());
    const resolvedProfile = path.resolve(profile);
    if(path.relative(tempRoot,resolvedProfile).startsWith('..')) throw new Error('Temporary profile escaped temp root');
    fs.rmSync(resolvedProfile,{recursive:true,force:true,maxRetries:10,retryDelay:300});
  }
}

main().catch(error => {console.error(error);process.exitCode=1;});
