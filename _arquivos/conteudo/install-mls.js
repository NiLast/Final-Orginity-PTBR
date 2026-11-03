const fs=require('fs'),path=require('path'),crypto=require('crypto');
module.exports=function(game,simulate,backup){
 const vendor=path.join(__dirname,'mls'),folder=path.join(game,'languages','fo-ptBR');
 const read=(f,def)=>fs.existsSync(f)?JSON.parse(fs.readFileSync(f,'utf8')):def;
 const previousTexts=read(path.join(folder,'dialogos.json'),{}), previousUI=read(path.join(folder,'interface.json'),{});
 const previousBindings=read(path.join(folder,'bindings.json'),{files:{},display:{}});
 const texts={},ui={},bindings={version:1,files:{},display:{}};
 const add=(file,object,segments,key)=>{
   let value=object;for(const part of segments)value=value?.[part];
   if(typeof value!=='string'||!value.trim())return;
   const previous=(previousBindings.files[file]||[]).find(r=>r.key===key);
   texts[key]=previous?.source===value&&typeof previousTexts[key]==='string'?previousTexts[key]:value;
   (bindings.files[file]||=[]).push({path:segments,source:value,key});
 };
 for(const file of fs.readdirSync(path.join(game,'data')).filter(f=>/^Map\d+\.json$|^(CommonEvents|Troops)\.json$/.test(f))){
   const data=read(path.join(game,'data',file));const common=file==='CommonEvents.json';
   const arrayData=common||file==='Troops.json';
   for(const event of (arrayData?data:data.events)||[]){if(!event)continue;
     for(const [p,page]of(common?[{list:event.list}]:event.pages).entries()){
       const prefix=common?[event.id,'list']:arrayData?[event.id,'pages',p,'list']:['events',event.id,'pages',p,'list'];
       (page.list||[]).forEach((c,i)=>{
         const key=file.replace('.json','')+'.E'+event.id+'.P'+p+'.C'+i;
         const field=n=>add(file,data,[...prefix,i,'parameters',n],key+'.T'+n);
         if([401,405].includes(c.code))field(0);
         if(c.code===101)field(4);
         if(c.code===102)(c.parameters[0]||[]).forEach((_,j)=>add(file,data,[...prefix,i,'parameters',0,j],key+'.Choice'+j));
       });
     }
   }
 }
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
 const names=['ODW_Core','ODW_MultiLanguageSystem','FO_MLS_Compatibility'];
 const filtered=plugins.filter(p=>!names.includes(p.name));
 for(const p of filtered)if(/^ODW_MultiLanguageSystem_/.test(p.name))p.status=false;
 const lang={code:'pt-BR',label:'Português (Brasil)',folder:'fo-ptBR',fontName:'',fontSize:'0',files:JSON.stringify(['dialogos','interface']),miss:'Errou',on:'Ligado',off:'Desligado'};
 filtered.push({name:names[0],status:true,description:'ODW Core 1.1.0',parameters:{debugMode:'false',customFonts:'[]',character8D:'false'}},{name:names[1],status:true,description:'ODW MultiLanguage 2.0.0',parameters:{option:'${MLS.Language}',folder:'languages',languages:JSON.stringify([JSON.stringify(lang)]),sceneActive:'false'}},{name:names[2],status:true,description:'Final Orginity: compatibilidade e catalogos PT-BR',parameters:{}});
 const outputs=new Map([
  ['languages/fo-ptBR/dialogos.json',JSON.stringify(texts,null,2)],['languages/fo-ptBR/interface.json',JSON.stringify(ui,null,2)],['languages/fo-ptBR/bindings.json',JSON.stringify(bindings)],
  ['js/plugins.js','var $plugins = '+JSON.stringify(filtered,null,2)+';\n']
 ]);
 for(const name of names)outputs.set('js/plugins/'+name+'.js',fs.readFileSync(path.join(vendor,name+'.js'),'utf8'));
 outputs.set('languages/fo-ptBR/LICENSE-ODW.md',fs.readFileSync(path.join(vendor,'LICENSE-ODW.md'),'utf8'));
 const changed=[];for(const [relative,content]of outputs){const target=path.join(game,relative);if(fs.existsSync(target)&&fs.readFileSync(target,'utf8')===content)continue;changed.push(relative);if(!simulate){backup(target);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content,'utf8');}}
 return {dialogueEntries:Object.keys(texts).length,interfaceEntries:Object.keys(ui).length,changed,language:'pt-BR'};
};
