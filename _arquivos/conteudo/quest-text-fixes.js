const fs=require('fs'),path=require('path'),vm=require('vm');
module.exports=(game,simulate,backup)=>{
 const file=path.join(game,'js/plugins.js'),text=fs.readFileSync(file,'utf8'),ctx={};vm.runInNewContext(text,ctx);const plugin=ctx.$plugins.find(p=>p.name==='VisuMZ_2_QuestSystem');if(!plugin)return [];
 const rules=JSON.parse(fs.readFileSync(path.join(__dirname,'quest-text-fixes.json'),'utf8')),report=[];
 const rulesByKey=new Map();
 for(const rule of rules){if(!rulesByKey.has(rule.key))rulesByKey.set(rule.key,[]);rulesByKey.get(rule.key).push(rule);}
 function visit(v){if(typeof v==='string'){try{const p=JSON.parse(v);if(p&&typeof p==='object'){const n=visit(p);return JSON.stringify(p)===JSON.stringify(n)?v:JSON.stringify(n);}}catch{}return v;}
 if(Array.isArray(v))return v.map(visit);if(!v||typeof v!=='object')return v;
 const o=Object.fromEntries(Object.entries(v).map(([k,x])=>[k,visit(x)])),keyField=Object.keys(o).find(k=>k.split(':')[0]==='Key'),key=String(o[keyField]||'').toUpperCase();
 for(const r of (rulesByKey.get(key)||[])){const field=Object.keys(o).find(k=>k.split(':')[0]===r.field);if(!field)continue;let current=o[field],a,quoted=false;if(r.index!==undefined){try{a=JSON.parse(current);current=a[r.index];try{const decoded=JSON.parse(current);if(typeof decoded==='string'){current=decoded;quoted=true;}}catch{}}catch{continue;}}
 let status='different-text-skipped';if(current===r.target)status='already-fixed';else if(current===r.source){if(a){a[r.index]=quoted?JSON.stringify(r.target):r.target;o[field]=JSON.stringify(a);}else o[field]=r.target;status='fixed';}report.push({key,field:r.field,index:r.index,status});}return o;}
 plugin.parameters=visit(plugin.parameters);if(report.some(r=>r.status==='fixed')&&!simulate){backup(file);fs.writeFileSync(file,'var $plugins = '+JSON.stringify(ctx.$plugins,null,2)+';\n');}return report;
};
