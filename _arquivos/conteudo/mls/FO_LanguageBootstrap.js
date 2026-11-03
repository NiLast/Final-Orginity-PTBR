/*: @target MZ
 * @plugindesc Final Orginity: load bilingual quest text bindings before QuestSystem.
 */
(() => {
 const fs=require('fs'),path=require('path'),root=path.dirname(process.mainModule.filename);
 const bindings=JSON.parse(fs.readFileSync(path.join(root,'languages/fo-bilingual/bindings.json'),'utf8'));
 for(const [name,row]of Object.entries(bindings.questParameters)){
  const parameters=PluginManager.parameters(name);
  for(const [key,source]of Object.entries(row.source))if(parameters[key]===source)parameters[key]=row.value[key];
 }
 window.FO_LanguageBindings=bindings;
})();
