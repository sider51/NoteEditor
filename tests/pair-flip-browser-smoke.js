const {spawn}=require('node:child_process');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
async function port(){const s=net.createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const n=s.address().port;await new Promise(r=>s.close(r));return n;}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const p=await port(),url=pathToFileURL(path.join(__dirname,'../index.html')).href;
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'pair-flip-smoke-'));
  const isElectron=!!process.env.ELECTRON_PATH;
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const chrome=spawn(process.env.ELECTRON_PATH||process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',isElectron?
    ['--no-sandbox',`--remote-debugging-port=${p}`,'--remote-allow-origins=*',`--user-data-dir=${profile}`,path.join(__dirname,'../windows_app')]:
    ['--headless=new','--disable-gpu','--no-sandbox','--no-first-run','--disable-extensions','--window-size=1440,900',`--remote-debugging-port=${p}`,'--remote-allow-origins=*',`--user-data-dir=${profile}`,url],
    {windowsHide:true,stdio:'ignore',env});
  let ws;
  try{
    let page;
    for(let i=0;i<60;i++){
      try{page=(await(await fetch(`http://127.0.0.1:${p}/json/list`)).json()).find(x=>x.url===url);if(page)break;}catch{}
      await pause(100);
    }
    assert.ok(page,'page did not load');
    ws=new WebSocket(page.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j;});
    let id=0;const waiting=new Map();
    ws.onmessage=e=>{const v=JSON.parse(e.data);if(waiting.has(v.id)){waiting.get(v.id)(v);waiting.delete(v.id);}};
    const evalJs=expr=>new Promise((resolve,reject)=>{const next=++id;waiting.set(next,v=>v.result?.exceptionDetails?reject(new Error(v.result.exceptionDetails.text)):resolve(v.result?.result?.value));ws.send(JSON.stringify({id:next,method:'Runtime.evaluate',params:{expression:expr,returnByValue:true,awaitPromise:true}}));});
    for(let i=0;i<50;i++){if(await evalJs('document.readyState==="complete" && typeof placePair==="function"'))break;await pause(100);}
    if(process.env.SCREENSHOT_PATH)await evalJs('window.__keepGhost=true');
    const result=await evalJs(`(()=>{
      createNewChart();chart.metadata.charter='QA';
      const pair=placePair(960,0,1,false);
      const flip=placeFlip(960,2,'right',2,false);
      const conflict=placeFlip(960,3,'right',1,false);
      const illegal=placeFlip(1920,5,'right',1,false);
      const exported=JSON.parse(chartExportJson());
      const slots=PairFlipRules.timeline(chart.notes).history.at(-1).after.join(',');
      const click=(tick,slot)=>{const y=tickToY(tick);el.scrollWrap.scrollTop=y-el.scrollWrap.clientHeight/2;const rect=el.gridCanvas.getBoundingClientRect();el.gridCanvas.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0,clientX:rect.left+RULER_W+LANE_W*(slot+.5),clientY:rect.top+y-el.scrollWrap.scrollTop}));};
      selectType('pair_swap');click(2880,0);click(2880,1);
      const uiPair=chart.notes.filter(n=>n.tick===2880&&n.type==='pair_swap').length===2;
      selectType('flip');click(3840,2);click(3840,4);
      const uiFlip=chart.notes.some(n=>n.tick===3840&&n.type==='flip'&&n.steps===1);
      selectType('pair_swap');
      const ghostTick=4320,ghostY=tickToY(ghostTick);
      el.scrollWrap.scrollTop=ghostY-el.scrollWrap.clientHeight/2;draw();
      const ghostX=laneToX(1)+LANE_W/2;
      const emptyGhost=[...ctx.getImageData(0,0,el.gridCanvas.width,el.gridCanvas.height).data].reduce((a,b)=>a+b,0);
      const firstRect=el.gridCanvas.getBoundingClientRect();
      window.dispatchEvent(new MouseEvent('mousemove',{clientX:firstRect.left+laneToX(0)+LANE_W/2,clientY:firstRect.top+ghostY-el.scrollWrap.scrollTop}));
      draw();
      const startGhost=[...ctx.getImageData(0,0,el.gridCanvas.width,el.gridCanvas.height).data].reduce((a,b)=>a+b,0);
      const beforeGhost=startGhost;
      click(ghostTick,0);
      const ghostRect=el.gridCanvas.getBoundingClientRect();
      window.dispatchEvent(new MouseEvent('mousemove',{clientX:ghostRect.left+ghostX,clientY:ghostRect.top+ghostY-el.scrollWrap.scrollTop}));
      draw();
      const afterGhost=[...ctx.getImageData(0,0,el.gridCanvas.width,el.gridCanvas.height).data].reduce((a,b)=>a+b,0);
      const ghostState={pending:!!pendingGimmick,hoverLane:hoverPos?.lane,beforeGhost,afterGhost,ghostX,ghostY,width:el.gridCanvas.width,height:el.gridCanvas.height};
      const ghostVisible=ghostState.pending&&ghostState.hoverLane===1&&emptyGhost!==startGhost&&beforeGhost!==afterGhost;
      if(!window.__keepGhost){pendingGimmick=null;hoverPos=null;draw();}
      selectType('flip');hoverPos=null;draw();
      const beforeFlipGhost=[...ctx.getImageData(0,0,el.gridCanvas.width,el.gridCanvas.height).data].reduce((a,b)=>a+b,0);
      click(ghostTick,2);
      const flipRect=el.gridCanvas.getBoundingClientRect();
      window.dispatchEvent(new MouseEvent('mousemove',{clientX:flipRect.left+laneToX(3)+LANE_W/2,clientY:flipRect.top+ghostY-el.scrollWrap.scrollTop}));
      draw();
      const afterFlipGhost=[...ctx.getImageData(0,0,el.gridCanvas.width,el.gridCanvas.height).data].reduce((a,b)=>a+b,0);
      const flipGhostState={type:pendingGimmick?.type,hoverLane:hoverPos?.lane,beforeFlipGhost,afterFlipGhost};
      const flipGhostVisible=flipGhostState.type==='flip'&&flipGhostState.hoverLane===3&&beforeFlipGhost!==afterFlipGhost;
      if(!window.__keepGhost){pendingGimmick=null;hoverPos=null;draw();}
      return {pair,flip,conflict,illegal,version:exported.version,count:exported.notes.length,slots,
        uiPair,uiFlip,ghostVisible,flipGhostVisible,ghostState,flipGhostState,
        pairCount:exported.notes.filter(n=>n.type==='pair_swap').length,
        flipSteps:exported.notes.find(n=>n.type==='flip')?.steps};
    })()`);
    assert.equal(result.pair,true);assert.equal(result.flip,true);
    assert.equal(result.conflict,false);assert.equal(result.illegal,false);
    assert.equal(result.version,2);assert.equal(result.count,3);
    assert.equal(result.pairCount,2);assert.equal(result.flipSteps,2);
    assert.equal(result.uiPair,true,JSON.stringify(result));assert.equal(result.uiFlip,true,JSON.stringify(result));
    if(!process.env.SCREENSHOT_PATH)assert.equal(result.ghostVisible,true,JSON.stringify(result.ghostState));
    assert.equal(result.flipGhostVisible,true,JSON.stringify(result.flipGhostState));
    assert.equal(result.slots,'1,0,3,4,2,5');
    if(process.env.SCREENSHOT_PATH){
      await evalJs("document.getElementById('appDialogOverlay')?.classList.remove('open');draw();true");
      const shot=await new Promise(resolve=>{const next=++id;waiting.set(next,resolve);ws.send(JSON.stringify({id:next,method:'Page.captureScreenshot',params:{format:'png',captureBeyondViewport:false}}));});
      fs.writeFileSync(process.env.SCREENSHOT_PATH,Buffer.from(shot.result.data,'base64'));
    }
    const interaction=await evalJs(`(()=>{
      const flipNote=chart.notes.find(n=>n.type==='flip'&&n.tick===3840);
      isSwapVisualizeMode=false;rebuildLaneStates();const logicalRoute=flipDisplayRoute(flipNote);
      isSwapVisualizeMode=true;const physicalRoute=flipDisplayRoute(flipNote);isSwapVisualizeMode=false;
      const key=(type)=>window.dispatchEvent(new KeyboardEvent(type,{key:'Shift',bubbles:true}));
      const checked=()=>el.preserveVisualToggle.checked;
      selectType('pair_swap');key('keydown');const pairHeld=checked();
      selectType('flip');const flipHeld=checked();
      selectType('scramble');const scrambleHeld=checked();
      selectType('tap');const tapHeld=checked();
      selectType('pair_swap');key('keyup');const released=checked();
      el.preserveVisualToggle.checked=true;el.preserveVisualToggle.dispatchEvent(new Event('change'));
      key('keydown');key('keyup');const pinned=checked();
      el.preserveVisualToggle.checked=false;el.preserveVisualToggle.dispatchEvent(new Event('change'));
      el.modeButtons.find(b=>b.dataset.mode==='select').click();key('keydown');const selectHeld=checked();key('keyup');
      el.modeButtons.find(b=>b.dataset.mode==='place').click();
      selectType('scramble');hoverPos={lane:2,snappedTick:4320};draw();
      const scrambleGhost=[...ctx.getImageData(0,0,el.gridCanvas.width,el.gridCanvas.height).data].reduce((a,b)=>a+b,0);
      hoverPos=null;draw();
      const withoutScrambleGhost=[...ctx.getImageData(0,0,el.gridCanvas.width,el.gridCanvas.height).data].reduce((a,b)=>a+b,0);
      return {logicalRoute,physicalRoute,pairHeld,flipHeld,scrambleHeld,tapHeld,released,pinned,selectHeld,scrambleGhostVisible:scrambleGhost!==withoutScrambleGhost};
    })()`);
    assert.deepEqual([interaction.logicalRoute.fromDisplay,interaction.logicalRoute.toDisplay],[2,4]);
    assert.deepEqual([interaction.physicalRoute.fromDisplay,interaction.physicalRoute.toDisplay],[4,3]);
    assert.deepEqual([interaction.pairHeld,interaction.flipHeld,interaction.scrambleHeld,interaction.tapHeld,interaction.released,interaction.pinned,interaction.selectHeld,interaction.scrambleGhostVisible],[true,true,true,false,false,true,false,true],JSON.stringify(interaction));
    const pasteMetadata=await evalJs(`(()=>{
      drag={mode:'paste',snapTick:4800,lane:1,sourceAnchorLane:1,flipped:false,items:[
        {type:'tap',visualLane:1,dTick:0,dVisualLane:0,size:1,mutatorData:{tag:'retained'}}
      ]};
      commitPaste();
      return chart.notes.find(n=>n.tick===4800&&n.type==='tap')?.mutatorData?.tag;
    })()`);
    assert.equal(pasteMetadata,'retained');
    if(isElectron){
      await evalJs(`require('electron').ipcRenderer.send('open-legacy-chart',{name:'legacy.json',data:{version:1,metadata:{charter:'QA',difficulty:{level:1},laneCount:7,resolution:960,audio:{offset:0}},timing:{bpms:[{tick:0,bpm:120}],scrolls:[],timeSignatures:[],stops:[]},events:[],notes:[{id:1,tick:960,lane:2,type:'tap',size:1}]}})`);
      const oldUrl=pathToFileURL(path.join(__dirname,'../old-editor/index.html')).href;
      let old;
      for(let i=0;i<50;i++){old=(await(await fetch(`http://127.0.0.1:${p}/json/list`)).json()).find(x=>x.url===oldUrl);if(old)break;await pause(100);}
      assert.ok(old,'legacy Electron window did not open');
      const other=new WebSocket(old.webSocketDebuggerUrl);await new Promise((r,j)=>{other.onopen=r;other.onerror=j;});
      let oldId=0;const oldWaiting=new Map();
      other.onmessage=e=>{const v=JSON.parse(e.data);if(oldWaiting.has(v.id)){oldWaiting.get(v.id)(v);oldWaiting.delete(v.id);}};
      const oldEval=expr=>new Promise((resolve,reject)=>{const next=++oldId;oldWaiting.set(next,v=>v.result?.exceptionDetails?reject(new Error(v.result.exceptionDetails.text)):resolve(v.result?.result?.value));other.send(JSON.stringify({id:next,method:'Runtime.evaluate',params:{expression:expr,returnByValue:true,awaitPromise:true}}));});
      let loaded=false;for(let i=0;i<30;i++){loaded=await oldEval('typeof chart!=="undefined" && chart?.version===1 && chart.notes?.length===1');if(loaded)break;await pause(100);}
      assert.equal(loaded,true,'legacy chart was not delivered');
      await oldEval("selectedIds.add(1); [...document.querySelectorAll('button')].find(b=>b.textContent==='選択を新エディタへコピー').click()");
      let received=false;for(let i=0;i<30;i++){received=await evalJs('clipboard?.length===1 && clipboard[0].type==="tap"');if(received)break;await pause(100);}
      assert.equal(received,true,'selection was not returned to new editor');
      other.close();
    }
    if(process.env.HIGH_FIXTURE==='1'){
      const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/high.json'),'utf8'));
      await evalJs(`loadChart(${JSON.stringify(fixture)},'high.json')`);
      const high=await evalJs(`(()=>{
        draw();const before=exportIssues();
        const tick=Math.max(...chart.notes.map(n=>n.endTick||n.tick))+1920;
        const pair=placePair(tick,0,1,false),flip=placeFlip(tick,2,'right',1,false);
        const after=exportIssues(),saved=JSON.parse(chartExportJson());
        return {version:chart.version,notes:chart.notes.length,before:before.length,after:after.length,pair,flip,
          savedVersion:saved.version,savedNotes:saved.notes.length};
      })()`);
      assert.equal(high.version,2);assert.equal(high.notes,1623);
      assert.equal(high.before,0);assert.equal(high.after,0);
      assert.equal(high.pair,true);assert.equal(high.flip,true);
      assert.equal(high.savedVersion,2);assert.equal(high.savedNotes,1623);
      process.stdout.write('high.json loaded, rendered, and accepted Pair/Flip; no save-blocking issues\n');
    }
    if(process.env.HIGH_ORIGINAL==='1'){
      const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures/high.original.json'),'utf8'));
      await evalJs(`loadChart(${JSON.stringify(fixture)},'high.original.json')`);
      const original=await evalJs(`(()=>{
        const before=exportIssues().length,tick=Math.max(...chart.notes.map(n=>n.endTick||n.tick))+1920;
        const pair=placePair(tick,0,1,false),flip=placeFlip(tick,2,'right',1,false);
        return {before,after:exportIssues().length,pair,flip};
      })()`);
      assert.equal(original.before,16);assert.equal(original.after,16);
      assert.equal(original.pair,true);assert.equal(original.flip,true);
      process.stdout.write('original high.json accepted new Pair/Flip despite unrelated existing issues\n');
    }
    process.stdout.write('Pair/Flip browser smoke passed\n');
  }finally{ws?.close();chrome.kill();if(path.resolve(profile).startsWith(path.resolve(os.tmpdir())+path.sep+'pair-flip-smoke-')){try{fs.rmSync(profile,{recursive:true,force:true});}catch{}}}
})().catch(e=>{console.error(e);process.exitCode=1;});
