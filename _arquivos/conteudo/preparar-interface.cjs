const fs=require('fs'),path=require('path'),crypto=require('crypto');
module.exports=function(game,simulate,backup){
 const folder=path.join(game,'languages','fo-ptBR');
 const read=(f,def)=>fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):def;
 const previousUI=read(path.join(folder,'interface.json'),{});
 const ui={},bindings={display:{}};
 // Exact display strings: includes nested VisuStella quest labels/descriptions,
 // never replaces quest IDs, scripts, switches or plugin parameters on disk.
 const addUI=text=>{if(typeof text!=='string'||!text.trim())return;const key='UI.'+crypto.createHash('sha256').update(text).digest('hex');bindings.display[text]=key;ui[key]=previousUI[key]??text;};
 const walk=o=>{if(typeof o==='string'){try{const parsed=JSON.parse(o);if(parsed!==o&&typeof parsed!=='number'&&typeof parsed!=='boolean'){walk(parsed);return;}}catch{}addUI(o);}else if(Array.isArray(o))o.forEach(walk);else if(o&&typeof o==='object')Object.values(o).forEach(walk);};
 const source=fs.readFileSync(path.join(game,'js','plugins.js'),'utf8');
 const plugins=JSON.parse(source.slice(source.indexOf('['),source.lastIndexOf(']')+1));
 for(const p of plugins.filter(p=>/VisuMZ_2_QuestSystem/.test(p.name)))walk(p.parameters);
 for(const f of ['System.json','Items.json','Weapons.json','Armors.json','Skills.json','States.json','Actors.json','Classes.json']){const d=read(path.join(game,'data',f),null);if(f==='System.json'){walk(d?.terms);addUI(d?.currencyUnit);}else for(const row of d||[])if(row)for(const key of ['name','nickname','profile','description','message1','message2','message3','message4'])addUI(row[key]);}
 ui['MLS.Language']='Idioma';
 for(const correction of read(path.join(__dirname,'correcoes-interface-mls.json'),[])){
   if(!bindings.display[correction.source])addUI(correction.source);
   const key=bindings.display[correction.source];
   if(key && (ui[key]===correction.source || (correction.previous||[]).includes(ui[key])))ui[key]=correction.target;
 }
 const outputs=new Map([
  ['languages/fo-ptBR/interface.json',JSON.stringify(ui,null,2)],
  ['languages/fo-ptBR/bindings.json',JSON.stringify(bindings)]
 ]);
 const changed=[];for(const [relative,content]of outputs){const target=path.join(game,relative);if(fs.existsSync(target)&&fs.readFileSync(target,'utf8')===content)continue;changed.push(relative);if(!simulate){backup(target);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content,'utf8');}}
 return {interfaceEntries:Object.keys(ui).length,changed,language:'pt-BR'};
};
