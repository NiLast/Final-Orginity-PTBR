const fs=require('fs'),path=require('path');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const matches=(command,spec)=>command?.code===spec.code&&(!spec.parameters||equal(command.parameters,spec.parameters))&&(!spec.parametersPrefix||equal(command.parameters?.slice(0,spec.parametersPrefix.length),spec.parametersPrefix));
const labels=list=>new Set(list.filter(c=>c.code===118).map(c=>c.parameters[0]));
const jumps=(list,name)=>list.filter(c=>c.code===119&&c.parameters[0]===name);
const insertionPoint=(list,rule)=>{const found=[];for(let i=0;i<list.length-1;i++)if(matches(list[i],rule.anchorBefore)&&matches(list[i+1],rule.anchorAfter)&&(!rule.anchorNext||matches(list[i+2],rule.anchorNext)))found.push(i+1);return found.length===1?found[0]:-1;};
module.exports=function(game,simulate,backup){
 const rows=JSON.parse(fs.readFileSync(path.join(__dirname,'event-fixes.json'),'utf8')),report=[];
 for(const file of new Set(rows.map(r=>r.file))){const target=path.join(game,'data',file),d=JSON.parse(fs.readFileSync(target,'utf8'));let changed=false;
 for(const r of rows.filter(r=>r.file===file)){const e=(Array.isArray(d)?d:d.events)?.[r.event],l=e?.pages?e.pages[r.page]?.list:e?.list;
  if(!Array.isArray(l)||e.name!==r.eventName){report.push({file,event:r.event,status:'different-version-skipped',reason:'event-identity'});continue;}
  const known=labels(l),source=jumps(l,r.from);
  if(r.mode==='rename'){
   if(source.length===0&&known.has(r.to)){report.push({file,event:r.event,status:'already-fixed'});continue;}
   if(source.length===0||known.has(r.from)||!known.has(r.to)){report.push({file,event:r.event,status:'different-version-skipped',reason:'rename-structure'});continue;}
   for(const c of source)c.parameters[0]=r.to;
  }else{
   if(known.has(r.from)){report.push({file,event:r.event,status:'already-fixed'});continue;}
   const at=insertionPoint(l,r);
   if(source.length===0||at<0){report.push({file,event:r.event,status:'different-version-skipped',reason:'insert-anchor'});continue;}
   l.splice(at,0,{code:118,indent:l[at].indent,parameters:[r.from]});
  }
  changed=true;report.push({file,event:r.event,status:'fixed'});
 }if(changed&&!simulate){backup(target);fs.writeFileSync(target,JSON.stringify(d));}}
 return report;
};
