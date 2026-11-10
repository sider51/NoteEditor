const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=process.argv[2]?path.resolve(process.argv[2]):path.join(__dirname,'fixtures/high.json');
let chart;
try{chart=JSON.parse(fs.readFileSync(source,'utf8'));}
catch(error){console.error('JSON parse error:',error.message);process.exit(1);}
const types={};for(const note of chart.notes||[])types[note.type]=(types[note.type]||0)+1;
const context=vm.createContext({
  document:{getElementById:()=>({getContext:()=>({})}),querySelectorAll:()=>[]},
  AudioContext:class{},
});
context.window=context;
for(const file of ['chart_format.js','gimmicks.js','state.js']){
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../js',file),'utf8'),context,{filename:file});
}
context.fixture=chart;
vm.runInContext('chart=fixture',context);
const errors=Array.from(vm.runInContext('validateChartSyntax()',context));
const chartErrors=errors.filter(issue=>!issue.startsWith('MusicPackage')&&!issue.startsWith('package_key')&&!issue.startsWith('metadata/songdata')&&!issue.startsWith('出力難易度'));
console.log(JSON.stringify({source,path:path.relative(path.join(__dirname,'..'),source),version:chart.version,notes:chart.notes?.length,events:chart.events?.length,types,errors:chartErrors.length,details:chartErrors},null,2));
process.exitCode=chartErrors.length?1:0;
