'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),crypto=require('crypto');
const json=f=>JSON.parse(fs.readFileSync(f,'utf8'));
const plugins=f=>{const s=fs.readFileSync(f,'utf8');return JSON.parse(s.slice(s.indexOf('['),s.lastIndexOf(']')+1));};
module.exports=function(patch,args){
 const supplied=args.includes('--game')?args[args.indexOf('--game')+1]:'',simulate=args.includes('--simulate');
 if(supplied&&(!fs.existsSync(path.join(supplied,'data/System.json'))||!fs.existsSync(path.join(supplied,'js/plugins.js'))))throw Error('Pasta informada nao contem o jogo: '+supplied);
 const game=path.resolve([supplied,patch,path.dirname(patch),'D:/Desktop/Final_Orginity_v0.6.0_B_WIN'].filter(Boolean).find(p=>fs.existsSync(path.join(p,'data/System.json'))&&fs.existsSync(path.join(p,'js/plugins.js')))||'');
 if(!fs.existsSync(path.join(game,'data/System.json')))throw Error('Informe a pasta original em ingles com --game.');
 const originalPlugins=plugins(path.join(game,'js/plugins.js'));
 const manifest=path.join(game,'languages/fo-bilingual/manifest.json');
 if(originalPlugins.some(p=>p.name==='FO_MLS_Compatibility'&&p.status)&&!fs.existsSync(manifest))throw Error('Esta instalacao recebeu o patch antigo que substituia o ingles. Use uma instalacao original em ingles; seus saves nao precisam ser apagados.');
 const work=fs.mkdtempSync(path.join(os.tmpdir(),'fo-bilingual-')),draft=path.join(work,'game');
 const report={version:17,game,simulate,languages:['en','pt-BR'],changed:[],conflicts:[],untranslated:[],preservesOriginalData:true};
 try{
  fs.mkdirSync(draft);for(const dir of ['data','js'])fs.cpSync(path.join(game,dir),path.join(draft,dir),{recursive:true});
  // Build Portuguese on a temporary copy; never deploy those data/script files.
  let legacy=fs.readFileSync(path.join(patch,'conteudo/preparar-traducao.cjs'),'utf8').replace('const patchDir = __dirname;',`const patchDir = ${JSON.stringify(patch)};`).replace("path.join(patchDir, 'relatorio-aplicacao.json')",`path.join(${JSON.stringify(work)}, 'legacy-report.json')`);
  legacy=legacy.replace(/^report\.eventRepairs = .*$/m,'report.eventRepairs = [];');
  legacy=legacy.replace(/^report\.questReferenceRepairs = .*$/m,'report.questReferenceRepairs = [];');
  legacy=legacy.replace(/require\('\.\/conteudo\/([^']+)'\)/g,(_,name)=>`require(${JSON.stringify(path.join(patch,'conteudo',name))})`);
  const runner=path.join(work,'build.cjs');fs.writeFileSync(runner,legacy);
  const run=cp.spawnSync(process.execPath,[runner,'--game',draft],{encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024});
  if(run.status!==0)throw Error('Falha ao preparar catalogo: '+run.stderr+'\n'+run.stdout);
  const legacyReport=json(path.join(work,'legacy-report.json'));
  report.untranslated=legacyReport.possibleNewEnglishText;report.sourceWarnings={database:legacyReport.databaseMismatches,javascript:legacyReport.javascriptMismatches};
  const translatedPlugins=plugins(path.join(draft,'js/plugins.js'));
  const en={},pt={},bindings={version:2,files:{},display:{},questParameters:{},fragments:{}};
  const add=(source,target,key)=>{en[key]=source;pt[key]=target;return '${'+key+'}';};
  const ui=(source,target)=>{if(!source||source===target)return source;const key='UI.'+crypto.createHash('sha256').update(source).digest('hex');if(pt[key]&&pt[key]!==target){report.conflicts.push({source,first:pt[key],other:target});return source;}bindings.display[source]=key;return add(source,target,key);};
  function field(file,a,b,route,key){let x=a,y=b;for(const part of route){x=x?.[part];y=y?.[part];}if(typeof x!=='string'||typeof y!=='string'||!x.trim())return;add(x,y,key);(bindings.files[file]||=[]).push({path:route,source:x,key});}
  for(const file of fs.readdirSync(path.join(game,'data')).filter(f=>/^(Map\d+|CommonEvents|Troops)\.json$/.test(f))){
   const a=json(path.join(game,'data',file)),b=json(path.join(draft,'data',file)),common=file==='CommonEvents.json',array=Array.isArray(a);
   for(const e of (array?a:a.events)||[]){if(!e)continue;for(const [p,page]of(common?[{list:e.list}]:e.pages).entries()){
    const prefix=common?[e.id,'list']:array?[e.id,'pages',p,'list']:['events',e.id,'pages',p,'list'];
    (page.list||[]).forEach((c,i)=>{const key=file.slice(0,-5)+'.E'+e.id+'.P'+p+'.C'+i;const f=n=>field(file,a,b,[...prefix,i,'parameters',n],key+'.T'+n);
     if([401,405].includes(c.code))f(0);if(c.code===101)f(4);if(c.code===102)(c.parameters[0]||[]).forEach((_,j)=>field(file,a,b,[...prefix,i,'parameters',0,j],key+'.Choice'+j));});
   }}
  }
  // Database text fields only: never tokenize notes, IDs or executable scripts.
  for(const name of ['System','Items','Weapons','Armors','Skills','States','Actors','Classes']){const file=name+'.json',a=json(path.join(game,'data',file)),b=json(path.join(draft,'data',file));
   function walk(x,y,route){if(typeof x==='string'&&typeof y==='string'){if(x!==y)field(file,a,b,route,'DB.'+name+'.'+route.join('.'));return;}if(x&&y&&typeof x==='object')for(const k of Object.keys(x))walk(x[k],y[k],[...route,Array.isArray(x)?Number(k):k]);}
   if(name==='System'){walk(a.terms,b.terms,['terms']);walk(a.currencyUnit,b.currencyUnit,['currencyUnit']);}
   else a.forEach((row,i)=>{if(row)for(const k of ['name','nickname','profile','description','message1','message2','message3','message4'])walk(row[k],b[i]?.[k],[i,k]);});
  }
  function pair(a,b,route=[]){if(typeof a==='string'&&typeof b==='string'){
   try{const x=JSON.parse(a),y=JSON.parse(b);if(typeof x===typeof y&&x!==a)return JSON.stringify(pair(x,y,route));}catch{}
   if(a===b)return a;
   // Keep template placeholders available to the quest formatter.
   if(a.includes('[[')){const ax=a.split(/(\[\[.*?\]\]|\\[a-z]+\[.*?\]|\n)/i),bx=b.split(/(\[\[.*?\]\]|\\[a-z]+\[.*?\]|\n)/i);if(ax.length===bx.length)ax.forEach((s,i)=>{if(s.trim()&&s!==bx[i]&&!s.includes('[[')){ui(s,bx[i]);bindings.fragments[s]=bx[i];}});return a;}
   return add(a,b,'Q.'+crypto.createHash('sha256').update(JSON.stringify(route)).digest('hex'));
  }if(Array.isArray(a)&&Array.isArray(b))return a.map((v,i)=>pair(v,b[i],[...route,i]));if(a&&b&&typeof a==='object'&&typeof b==='object')return Object.fromEntries(Object.entries(a).map(([k,v])=>[k,pair(v,b[k],[...route,k])]));return a;}
  for(const a of originalPlugins){const b=translatedPlugins.find(p=>p.name===a.name);if(a.name==='VisuMZ_2_QuestSystem'&&b)bindings.questParameters[a.name]={source:a.parameters,value:pair(a.parameters,b.parameters)};}
  const draftUI=json(path.join(draft,'languages/fo-ptBR/interface.json')),draftBindings=json(path.join(draft,'languages/fo-ptBR/bindings.json'));
  for(const [s,key]of Object.entries(draftBindings.display))ui(s,draftUI[key]);
  // Literal display strings from custom plugins, leaving executable files intact.
  for(const row of json(path.join(patch,'conteudo/arquivos-js-ptbr.json'))){
   const extract=s=>{if(!/^(["'])[\s\S]*\1$/.test(s))return null;try{return require('vm').runInNewContext(s);}catch{return null;}};
   const a=extract(row.source),b=extract(row.target);if(typeof a==='string'&&typeof b==='string')ui(a,b);
  }
  for(const [a,b]of [['Resolution','Resolução'],['Quit','Sair'],['Miss','Errou'],['Yes','Sim'],['No','Não'],['Text Speed','Velocidade do texto'],['ON','LIGADO'],['OFF','DESLIGADO']])ui(a,b);
  en['MLS.Language']='Language';pt['MLS.Language']='Idioma';
  // Six narrowly-scoped typo repairs for jumps to missing labels. They are
  // applied to the temporary build and later in memory; map files stay intact.
  const eventRules=json(path.join(patch,'conteudo/event-fixes.json'));
  report.eventRepairs=require('./event-fixes.js')(draft,false,()=>{});
  bindings.eventRepairs=report.eventRepairs.filter(r=>r.status==='fixed').map(r=>eventRules.find(x=>x.file===r.file&&x.event===r.event));
  report.questReferenceRepairs=[];
  const names=['FO_LanguageBootstrap','ODW_Core','ODW_MultiLanguageSystem','FO_MLS_Compatibility'];
  const filtered=originalPlugins.filter(p=>!names.includes(p.name));
  for(const p of filtered)if(/^ODW_MultiLanguageSystem_/.test(p.name))p.status=false;
  const lang=(code,label,folder,miss,on,off)=>JSON.stringify({code,label,folder,fontName:'',fontSize:'0',files:JSON.stringify(['texts']),miss,on,off});
  filtered.unshift({name:names[0],status:true,description:'Final Orginity: bilingual parameter bindings',parameters:{}});
  filtered.push({name:'ODW_Core',status:true,parameters:{debugMode:'false',customFonts:'[]',character8D:'false'}},{name:'ODW_MultiLanguageSystem',status:true,parameters:{option:'${MLS.Language}',folder:'languages',languages:JSON.stringify([lang('en','English','fo-en','Miss','ON','OFF'),lang('pt-BR','Português (Brasil)','fo-ptBR','Errou','LIGADO','DESLIGADO')]),sceneActive:'false'}},{name:'FO_MLS_Compatibility',status:true,parameters:{}});
  for(const p of filtered)if(p.description===undefined)p.description='Bilingual support';
  const outputs=new Map([['js/plugins.js','var $plugins = '+JSON.stringify(filtered,null,2)+';\n'],['languages/fo-en/texts.json',JSON.stringify(en)],['languages/fo-ptBR/texts.json',JSON.stringify(pt)],['languages/fo-bilingual/bindings.json',JSON.stringify(bindings)],['languages/fo-bilingual/manifest.json',JSON.stringify({version:17,languages:report.languages})]]);
  for(const name of names)outputs.set('js/plugins/'+name+'.js',fs.readFileSync(path.join(patch,'conteudo/mls',name+'.js'),'utf8'));
  outputs.set('languages/fo-bilingual/LICENSE-ODW.md',fs.readFileSync(path.join(patch,'conteudo/mls/LICENSE-ODW.md'),'utf8'));
  const backup=path.join(game,'translation-backups','v17-'+new Date().toISOString().replace(/[:.]/g,'-'));
  for(const [relative,content]of outputs){const target=path.join(game,relative);if(fs.existsSync(target)&&fs.readFileSync(target,'utf8')===content)continue;report.changed.push(relative);if(simulate)continue;if(fs.existsSync(target)){const dest=path.join(backup,relative);fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(target,dest);}fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,content,'utf8');}
  report.entries=Object.keys(en).length;report.backup=simulate?null:backup;
  fs.writeFileSync(path.join(patch,'relatorio-aplicacao.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({version:17,simulate,entries:report.entries,eventTypos:report.eventRepairs.filter(r=>r.status==='fixed').length,changed:report.changed,untranslated:report.untranslated.length,conflicts:report.conflicts.length},null,2));
 }finally{const resolved=path.resolve(work),base=path.resolve(os.tmpdir())+path.sep;if(!resolved.startsWith(base)||!path.basename(resolved).startsWith('fo-bilingual-'))throw Error('Unsafe temporary cleanup');fs.rmSync(resolved,{recursive:true,force:true});}
};
