/*:
 * @target MZ
 * @plugindesc Final Orginity: catalogos PT-BR por ocorrencia e compatibilidade ODW 2.0.
 * @orderAfter ODW_MultiLanguageSystem
 * @help Arquivos em languages/fo-ptBR. Integração desktop NW.js.
 */
(() => {
 'use strict';
 const fs = require('fs'), path = require('path');
 const root = path.dirname(process.mainModule.filename);
 const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
 const bindings = window.FO_LanguageBindings;
 const catalogs = [read('languages/fo-en/texts.json'), read('languages/fo-ptBR/texts.json')];
 // Core utilities are needed by MLS; its unrelated movement/save hooks are not.
 for (const [key, original] of Object.entries(ODW.Core)) {
   if (typeof original !== 'function') continue;
   const split = key.lastIndexOf('_');
   const owner = window[key.slice(0, split)], method = key.slice(split + 1);
   if (!owner || !/^(Game_|DataManager)/.test(key)) continue;
   const target = key.startsWith('Game_') ? owner.prototype : owner;
   if (typeof target[method] === 'function') target[method] = original;
 }
 // Load completely before boot. No 100ms race or half-loaded language database.
 ODW.MLS.loadDatabase = function() {
   ConfigManager.mlsLanguageIndex = ConfigManager.mlsLanguageIndex === 1 ? 1 : 0;
   this.database = catalogs[ConfigManager.mlsLanguageIndex];
   if (window.FO_MLS) window.FO_MLS.language = ConfigManager.mlsLanguageIndex === 1 ? 'pt-BR' : 'en';
 };
 ODW.MLS.loadDatabase();
 ODW.MLS.getText = function(value) {
   if (typeof value !== 'string') return value;
   const original = value;
   const directKey = bindings.display[value];
   if (directKey && Object.prototype.hasOwnProperty.call(this.database, directKey)) value = this.database[directKey];
   const seen = new Set();
   for (let i=0; i<12 && !seen.has(value); i++) {
     seen.add(value);
     const next = value.replace(/\$\{([\w|.]+)\}/g, (all, key) => Object.prototype.hasOwnProperty.call(this.database,key) ? this.database[key] : all);
     if (next === value) {
       if (ConfigManager.mlsLanguageIndex === 1) {
         for (const [source,target] of Object.entries(bindings.fragments)) value = value.split(source).join(target);
         value = value.replace(/Found (\d+) Gold!/g, 'Você encontrou $1 de Ouro!')
           .replace(/Found: (.+)!/g, 'Encontrado: $1!')
           .replace(/You got a (.+)!/g, 'Você recebeu: $1!')
           .replace(/Gold: (\d+)/g, 'Ouro: $1')
           .replace(/Fail\.\.\. Attempts left:/g, 'Falhou... Tentativas restantes:');
       }
       return value;
     }
     value = next;
   }
   return /\$\{[\w|.]+\}/.test(value) ? original : value;
 };
 // Translate before the existing metadata/quest hooks process a data file.
 let loadingFile = null;
 const xhrLoad = DataManager.onXhrLoad;
 DataManager.onXhrLoad = function(xhr, name, src, url) {
   const previous = loadingFile; loadingFile = src;
   try { return xhrLoad.call(this, xhr, name, src, url); }
   finally { loadingFile = previous; }
 };
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const commandMatches=(command,spec)=>command?.code===spec.code&&(!spec.parameters||same(command.parameters,spec.parameters))&&(!spec.parametersPrefix||same(command.parameters?.slice(0,spec.parametersPrefix.length),spec.parametersPrefix));
 const repairEvent=(object,r)=>{
   const event=(Array.isArray(object)?object:object.events)?.[r.event];
   const list=event?.pages?event.pages[r.page]?.list:event?.list;
   if(!Array.isArray(list)||event.name!==r.eventName)return false;
   const labels=new Set(list.filter(c=>c.code===118).map(c=>c.parameters[0]));
   const sourceJumps=list.filter(c=>c.code===119&&c.parameters[0]===r.from);
   if(r.mode==='rename'){
     if(!sourceJumps.length||labels.has(r.from)||!labels.has(r.to))return false;
     for(const command of sourceJumps)command.parameters[0]=r.to;
     return true;
   }
   if(labels.has(r.from)||!sourceJumps.length)return false;
   const points=[];
   for(let i=0;i<list.length-1;i++)if(commandMatches(list[i],r.anchorBefore)&&commandMatches(list[i+1],r.anchorAfter)&&(!r.anchorNext||commandMatches(list[i+2],r.anchorNext)))points.push(i+1);
   if(points.length!==1)return false;
   list.splice(points[0],0,{code:118,indent:list[points[0]].indent,parameters:[r.from]});
   return true;
 };
 const onLoad = DataManager.onLoad;
 DataManager.onLoad = function(object) {
   for (const entry of bindings.files[loadingFile] || []) {
     let parent = object;
     for (const segment of entry.path.slice(0,-1)) parent = parent?.[segment];
     const field = entry.path[entry.path.length-1];
     if (!parent || parent[field] !== entry.source) continue;
     parent[field] = '${' + entry.key + '}';
   }
   for(const repair of bindings.eventRepairs||[])if(repair.file===loadingFile)repairEvent(object,repair);
   return onLoad.call(this, object);
 };
 const applyConfig = ConfigManager.applyData;
 ConfigManager.applyData = function(config) { applyConfig.call(this,config); this.mlsLanguageIndex=config.mlsLanguageIndex===1?1:0; ODW.MLS.loadDatabase(); };
 const maxCommands = Scene_Options.prototype.maxCommands;
 Scene_Options.prototype.maxCommands = function() { return maxCommands.call(this)+1; };
 Window_Options.prototype.mlsRefreshLanguage = function() {
   ODW.MLS.loadDatabase(); this.resetFontSettings(); this.refresh(); ODW.MLS.updateGameTitle();
 };
 const optionsRect=Scene_Options.prototype.optionsWindowRect;
 Scene_Options.prototype.optionsWindowRect=function(){const rect=optionsRect.call(this);rect.width=Math.min(Graphics.boxWidth-24,640);rect.x=(Graphics.boxWidth-rect.width)/2;return rect;};
 Window_Options.prototype.statusWidth=function(){return 240;};
 // MessageCore adds startX to its wrap limit; include that inset in the budget.
 // Leave a small margin for pixel-font edges instead of clipping the last glyph.
 const wrapBreak = Window_Message.prototype.processWrapBreak;
 if (wrapBreak) Window_Message.prototype.processWrapBreak = function(state, japanese) {
   const previous = state.width;
   const available = Math.max(1, this.innerWidth - Math.max(0, state.startX || 0) - 8);
   state.width = Math.min(previous > 0 ? previous : available, available);
   try { return wrapBreak.call(this, state, japanese); }
   finally { state.width = previous; }
 };
 // QuestSystem already supports MessageCore wrapping, but ships with it disabled.
 if (typeof Window_QuestLog !== 'undefined') Window_QuestLog.wordWrapSupport = true;
 if (Window_Message.prototype.resetWordWrap) Window_Message.prototype.resetWordWrap = function() { this.setWordWrap(true); };
 // The quest menu uses the original plugin's symbol and enable condition.
 const addCommand=Window_Command.prototype.addCommand;
 Window_Command.prototype.addCommand=function(name,symbol,enabled,ext){return addCommand.call(this,ODW.MLS.getText(name),symbol,enabled,ext);};
 // Translation attribution; refreshed when returning from language options.
 const titleStart = Scene_Title.prototype.start;
 Scene_Title.prototype.start = function() {
   titleStart.call(this);
   if (!this._foTranslationCredit) {
     this._foTranslationCredit = new Sprite(new Bitmap(Graphics.width, 32));
     this._foTranslationCredit.y = 16;
     this.addChild(this._foTranslationCredit);
   }
   const bitmap = this._foTranslationCredit.bitmap;
   bitmap.clear();
   this._foTranslationCredit.visible = ConfigManager.mlsLanguageIndex === 1;
   bitmap.fontSize = 18;
   bitmap.textColor = '#ffffff';
   bitmap.outlineColor = '#000000';
   bitmap.outlineWidth = 4;
   bitmap.drawText('Tradução PT-BR: NiLast', 20, 0, Graphics.width - 40, 32, 'left');
 };
 window.FO_MLS = { version:2, language:ConfigManager.mlsLanguageIndex===1?'pt-BR':'en', entries:Object.keys(ODW.MLS.database).length };
})();
