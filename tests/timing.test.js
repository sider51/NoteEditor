const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function contextFor(chart){
  const context = vm.createContext({
    chart, resolution:960, zoom:1, BASE_PX_PER_TICK:90/960,
    isTimelineInverted:false, audio:{duration:0},
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/chart_format.js'),'utf8'),context);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/math.js'),'utf8'),context);
  return context;
}

test('BPM seconds and integrated Scroll match the handoff example', () => {
  const context = contextFor({
    metadata:{audio:{offset:-120}},
    timing:{bpms:[{tick:0,bpm:120},{tick:1920,bpm:240}],scrolls:[{tick:960,speed:0.5},{tick:2880,speed:2}]},
    notes:[],
  });
  const calc = expression => vm.runInContext(expression,context);
  assert.equal(calc('tickToSeconds(960)'),0.5);
  assert.equal(calc('tickToSeconds(1920)'),1);
  assert.equal(calc('tickToSeconds(2880)'),1.25);
  assert.equal(calc('tickToSeconds(3840)'),1.5);
  assert.equal(calc('visualTimeAtTick(960)'),0.5);
  assert.equal(calc('visualTimeAtTick(1920)'),0.75);
  assert.equal(calc('visualTimeAtTick(2880)'),0.875);
  assert.equal(calc('visualTimeAtTick(3840)'),1.375);
  assert.equal(calc('audioTimeForTick(1920)'),0.88);
  assert.equal(calc('tickForAudioTime(0.88)'),1920);
});

test('same-tick BPM and Scroll apply after their shared boundary', () => {
  const context = contextFor({
    metadata:{audio:{offset:0}},
    timing:{bpms:[{tick:0,bpm:120},{tick:960,bpm:240}],scrolls:[{tick:960,speed:2}]},
    notes:[],
  });
  assert.equal(vm.runInContext('tickToSeconds(1920)',context),0.75);
  assert.equal(vm.runInContext('visualTimeAtTick(1920)',context),1);
});

test('inverted editor coordinate is reversible', () => {
  const context = contextFor({metadata:{audio:{offset:0}},timing:{bpms:[{tick:0,bpm:120}],scrolls:[]},notes:[]});
  vm.runInContext('verticalExtentTick = 10000; isTimelineInverted = true',context);
  assert.equal(vm.runInContext('tickToY(0) > tickToY(960)',context),true);
  assert.equal(vm.runInContext('yToTick(tickToY(3840))',context),3840);
});

test('chart export preserves timing arrays and does not invent a missing BPM', () => {
  const context = contextFor({metadata:{audio:{offset:0}},timing:{bpms:[],scrolls:[]},notes:[]});
  const result = vm.runInContext(`ReInverseChartFormat.createChartExport({
    metadata:{charter:'A',difficulty:{level:1},audio:{offset:0},resolution:960},
    timing:{bpms:[],scrolls:[],timeSignatures:[{tick:0,numerator:4,denominator:4}],stops:[{tick:960,duration:1}]},
    notes:[],events:[]
  })`,context);
  assert.equal(result.timing.bpms.length,0);
  assert.equal(result.timing.scrolls.length,0);
  assert.equal(result.timing.stops[0].tick,960);
});

test('save validation rejects duplicate and nonpositive timing events', () => {
  const chart = {
    metadata:{resolution:960},
    timing:{bpms:[{tick:0,bpm:120},{tick:960,bpm:180},{tick:960,bpm:200}],scrolls:[{tick:0,speed:0}]},
    notes:[],
  };
  const context = contextFor(chart);
  context.document = {
    getElementById: () => ({getContext:()=>({})}),
    querySelectorAll: () => [],
  };
  context.AudioContext = class {};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/state.js'),'utf8'),context);
  // state.js owns a lexical chart binding, set it inside that context.
  vm.runInContext(`chart = ${JSON.stringify(chart)}`,context);
  const errors = vm.runInContext('validateTimingEvents()',context);
  assert.ok(errors.some(error => error.includes('重複')));
  assert.ok(errors.some(error => error.includes('0より大きい')));
});

test('Scroll fades integrate each easing and keep judgment time unchanged', () => {
  for(const [easing, expected] of [['linear',0.75],['inQuad',2/3],['outQuad',5/6]]){
    const context = contextFor({metadata:{audio:{offset:0}},timing:{
      bpms:[{tick:0,bpm:120}],scrolls:[{tick:0,endTick:960,speed:2,easing}]
    },notes:[]});
    assert.ok(Math.abs(vm.runInContext('visualTimeAtTick(960)',context)-expected)<1e-12);
    assert.equal(vm.runInContext('tickToSeconds(960)',context),0.5);
    assert.equal(vm.runInContext('visualTimeAtTick(-960)',context),-0.5);
  }
});

test('BPM change inside a Scroll fade splits visual integration', () => {
  const context = contextFor({metadata:{audio:{offset:0}},timing:{
    bpms:[{tick:0,bpm:120},{tick:480,bpm:240}],
    scrolls:[{tick:0,endTick:960,speed:2,easing:'linear'},{tick:960,speed:0.75}]
  },notes:[]});
  assert.equal(vm.runInContext('visualTimeAtTick(960)',context),0.53125);
  assert.equal(vm.runInContext('visualTimeAtTick(1920)',context),0.71875);
  assert.equal(vm.runInContext('tickToSeconds(960)',context),0.375);
});

test('Scroll validation rejects overlaps and malformed fades while preserving step events', () => {
  const chart = {metadata:{resolution:960},timing:{bpms:[{tick:0,bpm:120}],scrolls:[
    {tick:0,endTick:960,speed:2,easing:'linear'},
    {tick:480,speed:1},
    {tick:1440,endTick:1440,speed:2,easing:'invalid'}
  ]},notes:[]};
  const context = contextFor(chart);
  context.document = {getElementById:()=>({getContext:()=>({})}),querySelectorAll:()=>[]};
  context.AudioContext = class {};
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js/state.js'),'utf8'),context);
  vm.runInContext(`chart = ${JSON.stringify(chart)}`,context);
  const errors = vm.runInContext('validateTimingEvents()',context);
  assert.ok(errors.some(error=>error.includes('重複')));
  assert.ok(errors.some(error=>error.includes('終了Tick')));
  assert.ok(errors.some(error=>error.includes('easing')));
  const exportChart = vm.runInContext('ReInverseChartFormat.createChartExport(chart)',context);
  assert.deepEqual(Object.keys(exportChart.timing.scrolls[1]).sort(),['speed','tick']);
});

test('v2 export and six physical slots remain distinct from Scramble lane 6',()=>{
  const chart={metadata:{laneCount:7},timing:{},notes:[{id:1,tick:0,lane:6,type:'scramble'}],events:[]};
  const context=contextFor(chart);
  const output=vm.runInContext('ReInverseChartFormat.createChartExport(chart)',context);
  assert.equal(output.version,2);
  assert.equal(output.metadata.laneCount,7);
  assert.equal(output.notes[0].lane,6);
});
