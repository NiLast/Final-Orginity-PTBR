const fs = require('fs');
const path = require('path');

const patchDir = __dirname;
const args = process.argv.slice(2);
const option = name => args.includes(name);
const optionValue = name => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : '';
};
const simulate = option('--simulate');
const createBackup = option('--backup');
let game = optionValue('--game') || args.find(value => !value.startsWith('--')) || '';
const candidates = [
  game,
  patchDir,
  path.dirname(patchDir),
].filter(Boolean);
game = candidates.find(candidate =>
  fs.existsSync(path.join(candidate, 'data'))
  && fs.existsSync(path.join(candidate, 'js', 'plugins.js'))
);
if (!game) {
  throw new Error('Pasta do jogo nao encontrada. Use: Aplicar-Traducao.bat "D:\\Caminho\\Final Orginity"');
}
game = path.resolve(game);
const dataDir = path.join(game, 'data');
const pluginsPath = path.join(game, 'js', 'plugins.js');
const dialogPath = path.join(patchDir, 'conteudo', 'dialogos.json');
const questPath = path.join(patchDir, 'conteudo', 'missoes.json');
const interfacePath = path.join(patchDir, 'conteudo', 'interface-missoes.json');
const databasePath = path.join(patchDir, 'conteudo', 'interface-banco-ptbr.json');
const javascriptPath = path.join(patchDir, 'conteudo', 'arquivos-js-ptbr.json');
for (const required of [dialogPath, questPath, interfacePath, databasePath, javascriptPath]) {
  if (!fs.existsSync(required)) throw new Error(`Arquivo do patch ausente: ${required}`);
}

const controlRx = /\\(?:[A-Za-z]+(?:\[[^\]]*\])?|[.!|^><{}$])|\$\{[^}]+\}/g;
const controls = value => (String(value).match(controlRx) || []).sort();
const sameControls = (a, b) => JSON.stringify(controls(a)) === JSON.stringify(controls(b));
const dialogueRows = JSON.parse(fs.readFileSync(dialogPath, 'utf8'));
const dictionary = new Map();
const targets = new Set();
for (const row of dialogueRows.filter(row => !row.correction)) {
  const source = String(row.source ?? '').trim();
  const target = String(row.target ?? '').trim();
  if (!source || !target) throw new Error('Entrada vazia em dialogos.json');
  if (!sameControls(source, target)) throw new Error(`Codigos de controle invalidos em: ${source}`);
  if (dictionary.has(source) && dictionary.get(source) !== target) throw new Error(`Traducao conflitante em: ${source}`);
  dictionary.set(source, target);
  targets.add(target);
}
const correctionRows = dialogueRows.filter(row => row.correction && !row.location);
const corrections = new Map(correctionRows.filter(row => !row.speaker).map(row => [String(row.source).trim(), String(row.target).trim()]));
const contextualCorrections = new Map(correctionRows.filter(row => row.speaker).map(row => [`${String(row.speaker).trim()}\0${String(row.source).trim()}`, String(row.target).trim()]));
let dialogueCorrections = 0;

const matched = new Set();
const finalTexts = new Set();
const fileReports = [];
const filesChanged = [];
const groupBy = (rows, keyFn) => rows.reduce((groups, row) => {
  const key = keyFn(row);
  (groups[key] ||= []).push(row);
  return groups;
}, {});
const timestamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '-');
const backupDir = createBackup && !simulate ? path.join(patchDir, `backup-${timestamp}`) : null;
function backup(file) {
  if (!backupDir || !fs.existsSync(file)) return;
  const relative = path.relative(game, file);
  const destination = path.join(backupDir, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  if (!fs.existsSync(destination)) fs.copyFileSync(file, destination);
}

function replaceText(container, index, changes, speaker = '') {
  const current = String(container[index] ?? '');
  let key = current.trim();
  if (dictionary.has(key)) {
    const target = dictionary.get(key);
    if (target !== key) {
      const left = current.match(/^\s*/)?.[0] || '';
      const right = current.match(/\s*$/)?.[0] || '';
      const translated = `${left}${target}${right}`;
      if (!sameControls(current, translated)) throw new Error(`Codigos alterados ao aplicar: ${key}`);
      changes.push({ container, index, original: current });
      container[index] = translated;
      matched.add(key);
      key = target;
    }
  }
  const contextualKey = `${speaker}\0${key}`;
  const correctionTarget = contextualCorrections.get(contextualKey) ?? corrections.get(key);
  if (correctionTarget !== undefined && correctionTarget !== key) {
    const target = correctionTarget;
    const left = current.match(/^\s*/)?.[0] || '';
    const right = current.match(/\s*$/)?.[0] || '';
    const translated = `${left}${target}${right}`;
    if (!sameControls(current, translated)) throw new Error(`Codigos alterados ao corrigir: ${key}`);
    changes.push({ container, index, original: current });
    container[index] = translated;
    dialogueCorrections++;
    key = target;
  }
  if (key) finalTexts.add(key);
}

const eventNames = [
  'CommonEvents.json',
  'Troops.json',
  ...fs.readdirSync(dataDir).filter(name => /^Map\d+\.json$/.test(name)).sort(),
];
for (const name of eventNames) {
  const file = path.join(dataDir, name);
  if (!fs.existsSync(file)) throw new Error(`Arquivo de eventos ausente: ${file}`);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  const before = JSON.stringify(json);
  const changes = [];
   const events = ['CommonEvents.json', 'Troops.json'].includes(name) ? json : (json.events || []);
  for (const event of events || []) {
    if (!event) continue;
    const pages = name === 'CommonEvents.json' ? [{ list: event.list || [] }] : (event.pages || []);
    for (const page of pages) {
      let speaker = '';
      for (const command of page.list || []) {
      if (command.code === 101) speaker = '';
      if (command.code === 401 || command.code === 405) {
        const current = String(command.parameters?.[0] ?? '').trim();
        replaceText(command.parameters, 0, changes, speaker);
        const translated = String(command.parameters?.[0] ?? '').trim();
        if (/^[^()]{1,40}:$/.test(translated || current)) speaker = (translated || current).slice(0, -1);
      }
      else if (command.code === 402) replaceText(command.parameters, 1, changes);
      else if (command.code === 102) {
        for (let index = 0; index < (command.parameters[0] || []).length; index++) {
          replaceText(command.parameters[0], index, changes);
        }
      }
      }
    }
  }
  if (!changes.length) continue;
  const output = JSON.stringify(json);
  JSON.parse(output);
  for (const change of changes) change.container[change.index] = change.original;
  if (JSON.stringify(json) !== before) throw new Error(`Estrutura alterada fora dos textos permitidos: ${name}`);
  if (!simulate) {
    backup(file);
    fs.writeFileSync(file, output);
  }
  filesChanged.push(name);
  fileReports.push({ file: name, replacements: changes.length, structureVerified: true });
}

const databaseRows = JSON.parse(fs.readFileSync(databasePath, 'utf8'));
const databaseReports = [];
const databaseMismatches = [];
for (const [name, rows] of Object.entries(groupBy(databaseRows, row => row.file))) {
  const file = path.join(dataDir, name);
  if (!fs.existsSync(file)) {
    databaseMismatches.push({ file: name, reason: 'arquivo-ausente' });
    continue;
  }
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  let replacements = 0;
  for (const row of rows) {
    let container = json;
    const route = row.path || [];
    for (let index = 0; index < route.length - 1; index++) {
      const segment = route[index];
      if (container == null || !(segment in container)) {
        container = null;
        break;
      }
      container = container[segment];
    }
    if (container == null || !route.length) {
      databaseMismatches.push({ file: name, path: route, source: row.source, reason: 'caminho-ausente' });
      continue;
    }
    let key = route.at(-1);
    if (Array.isArray(container) && typeof key === 'string' && !/^\d+$/.test(key)) {
      const sourceIndexes = container.flatMap((value, index) => String(value) === String(row.source) ? [index] : []);
      if (sourceIndexes.length) {
        if (!sameControls(row.source, row.target)) throw new Error(`Codigos alterados no banco: ${name}/${route.join('/')}`);
        for (const index of sourceIndexes) container[index] = row.target;
        replacements += sourceIndexes.length;
        continue;
      }
      key = container.findIndex(value => String(value) === String(row.target));
    }
    if (key < 0 || !(key in container)) {
      databaseMismatches.push({ file: name, path: route, source: row.source, reason: 'campo-ausente' });
      continue;
    }
    const current = String(container[key] ?? '');
    if (current === String(row.target)) continue;
    const acceptedSources = [String(row.source), ...(row.previous || []).map(String)];
    if (!acceptedSources.includes(current)) {
      databaseMismatches.push({ file: name, path: route, source: row.source, current, reason: 'texto-alterado-na-versao' });
      continue;
    }
    if (!sameControls(row.source, row.target)) throw new Error(`Codigos alterados no banco: ${name}/${route.join('/')}`);
    container[key] = row.target;
    replacements++;
  }
  if (replacements) {
    const output = JSON.stringify(json);
    JSON.parse(output);
    if (!simulate) {
      backup(file);
      fs.writeFileSync(file, output);
    }
    filesChanged.push(`data/${name}`);
  }
  databaseReports.push({ file: name, replacements });
}

const javascriptRows = JSON.parse(fs.readFileSync(javascriptPath, 'utf8'));
const javascriptReports = [];
const javascriptMismatches = [];
for (const [relative, rows] of Object.entries(groupBy(javascriptRows, row => row.file))) {
  const file = path.join(game, relative);
  if (!fs.existsSync(file)) {
    javascriptMismatches.push({ file: relative, reason: 'arquivo-ausente' });
    continue;
  }
  let source = fs.readFileSync(file, 'utf8');
  let replacements = 0;
  for (const row of rows) {
    const sourceCount = source.split(row.source).length - 1;
    if (sourceCount) {
      source = source.split(row.source).join(row.target);
      replacements += sourceCount;
    } else if (!source.includes(row.target)) {
      javascriptMismatches.push({ file: relative, source: row.source, reason: 'texto-alterado-na-versao' });
    }
  }
  if (replacements) {
    if (!simulate) {
      backup(file);
      fs.writeFileSync(file, source);
    }
    filesChanged.push(relative);
  }
  javascriptReports.push({ file: relative, replacements });
}

function parsePlugins(source) {
  const start = source.indexOf('[');
  const end = source.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('plugins.js invalido');
  return JSON.parse(source.slice(start, end + 1));
}
const plugins = parsePlugins(fs.readFileSync(pluginsPath, 'utf8'));
const questMatches = plugins.filter(plugin => plugin.name === 'VisuMZ_2_QuestSystem');
if (questMatches.length > 1) throw new Error('Mais de um plugin VisuMZ_2_QuestSystem foi encontrado');
let questReplacements = 0;
let interfaceReplacements = 0;
let questLiteralRepairs = 0;
const missingInterfaceFields = [];
if (questMatches.length === 1) {
  const questPlugin = questMatches[0];
  const otherBefore = plugins.filter(plugin => plugin !== questPlugin).map(JSON.stringify);
  const allowedParams = new Set(['Categories:arraystruct', 'General:struct', 'Label:struct', 'Tracker:struct', 'MainMenu:struct']);
  const untouchedBefore = Object.fromEntries(Object.entries(questPlugin.parameters).filter(([key]) => !allowedParams.has(key)));
  const questDictionary = new Map(JSON.parse(fs.readFileSync(questPath, 'utf8')).map(row => [String(row.source), String(row.target)]));
  function translateQuest(text) {
    if (questDictionary.has(text)) {
      questReplacements++;
      return questDictionary.get(text);
    }
    const normalized = text.replace(/\\\\/g, '\\').replace(/\\n/g, '\n');
    if (questDictionary.has(normalized)) {
      questReplacements++;
      return questDictionary.get(normalized)
        .replace(/\\(?=(?:[A-Za-z]+\[[^\]]*\]|[.!|^><{}$]))/g, '\\\\')
        .replace(/\r?\n/g, '\\n');
    }
    return text;
  }
  function validateQuestLiteral(value) {
    try {
      JSON.parse(value);
      return value;
    } catch (originalError) {
      if (typeof value !== 'string' || value.length < 2 || value[0] !== '"' || value.at(-1) !== '"') {
        throw new Error(`Texto interno de missao invalido: ${value}`);
      }
      let body = value.slice(1, -1);
      body = body.replace(/\\+"/g, '"');
      body = body.replace(/\\n/g, '\n');
      body = body.replace(/\\r/g, '\r');
      body = body.replace(/\\t/g, '\t');
      body = body.replace(/\\\\/g, '\\');
      const repaired = JSON.stringify(body);
      JSON.parse(repaired);
      questLiteralRepairs++;
      return repaired;
    }
  }
  if (questPlugin.parameters['Categories:arraystruct']) {
    const categoryStrings = JSON.parse(questPlugin.parameters['Categories:arraystruct']);
    questPlugin.parameters['Categories:arraystruct'] = JSON.stringify(categoryStrings.map(categoryString => {
      const category = JSON.parse(categoryString);
      if ('CategoryName:str' in category) category['CategoryName:str'] = translateQuest(String(category['CategoryName:str']));
      const questStrings = JSON.parse(category['Quests:arraystruct']);
      category['Quests:arraystruct'] = JSON.stringify(questStrings.map(questString => {
        const quest = JSON.parse(questString);
        for (const field of ['Title:str', 'Difficulty:str', 'From:str', 'Location:str', 'Footer']) {
          if (field in quest) quest[field] = translateQuest(String(quest[field]));
        }
        for (const field of ['Description:arrayjson', 'Objectives:arrayjson', 'Rewards:arrayjson', 'Subtext:arrayjson', 'Quotes:arrayjson']) {
          if (!quest[field]) continue;
          quest[field] = JSON.stringify(JSON.parse(quest[field]).map(value =>
            validateQuestLiteral(translateQuest(String(value)))
          ));
        }
        return JSON.stringify(quest);
      }));
      return JSON.stringify(category);
    }));
  }
  const interfacePatch = JSON.parse(fs.readFileSync(interfacePath, 'utf8'));
  for (const [groupName, fields] of Object.entries(interfacePatch)) {
    if (!(groupName in questPlugin.parameters)) {
      missingInterfaceFields.push(groupName);
      continue;
    }
    const group = JSON.parse(questPlugin.parameters[groupName]);
    for (const [field, rawValue] of Object.entries(fields)) {
      if (!(field in group)) {
        missingInterfaceFields.push(`${groupName}/${field}`);
        continue;
      }
      const newValue = field.endsWith(':json') ? JSON.stringify(String(rawValue)) : String(rawValue);
      if (String(group[field]) !== newValue) {
        group[field] = newValue;
        interfaceReplacements++;
      }
    }
    questPlugin.parameters[groupName] = JSON.stringify(group);
  }
  const otherAfter = plugins.filter(plugin => plugin !== questPlugin).map(JSON.stringify);
  if (JSON.stringify(otherAfter) !== JSON.stringify(otherBefore)) throw new Error('Outro plugin foi alterado');
  const untouchedAfter = Object.fromEntries(Object.entries(questPlugin.parameters).filter(([key]) => !allowedParams.has(key)));
  if (JSON.stringify(untouchedAfter) !== JSON.stringify(untouchedBefore)) throw new Error('Parametro nao autorizado do plugin de missoes foi alterado');
  if (questReplacements || interfaceReplacements || questLiteralRepairs) {
    const pluginsOutput = `// Generated by RPG Maker.\r\n// Brazilian Portuguese translation patch.\r\nvar $plugins =\r\n${JSON.stringify(plugins)};\r\n`;
    parsePlugins(pluginsOutput);
    if (!simulate) {
      backup(pluginsPath);
      fs.writeFileSync(pluginsPath, pluginsOutput);
    }
    filesChanged.push('js/plugins.js');
  }
}

const strongEnglish = /\b(?:the|you|your|yours|yourself|him|his|hers|they|them|their|this|that|these|those|what|which|who|whose|why|where|when|how|from|with|without|have|has|does|did|could|would|should|will|was|were|been|being|into|about|through|between|under|over|here|there|then|than|very|just|gonna|wanna|gotta|ain't|aren't|isn't|wasn't|don't|doesn't|didn't|won't|thanks|thank|sorry|please|hello|goodbye|maybe|never|always|everyone|someone|anything|everything|nothing)\b/i;
const soundWords = new Set(['gee', 'he', 'ehee', 'hee', 'huh', 'hm', 'hmm', 'uh', 'umm', 'ah', 'oh', 'ooh', 'aah', 'neigh', 'huff', 'puff', 'gasp', 'gulp', 'ahem', 'tee', 'ha', 'eh']);
const soundOnly = text => {
  const words = text.toLowerCase().match(/[a-z]+/g) || [];
  return words.length > 0 && words.every(word => soundWords.has(word));
};
const possibleNewEnglishText = [...finalTexts]
  .filter(text => !targets.has(text) && strongEnglish.test(text) && !soundOnly(text))
  .sort();
const report = {
  patch: 'Final Orginity PT-BR Atualizavel',
  version: 14,
  gamePath: game,
  simulated: simulate,
  backupCreated: backupDir,
  dialogueDictionary: dictionary.size,
  dialogueSourcesMatched: matched.size,
  dialogueSourcesNotPresent: dictionary.size - matched.size,
  dialogueReplacements: fileReports.reduce((sum, row) => sum + row.replacements, 0),
  dialogueCorrections,
  eventFilesScanned: eventNames.length,
  eventFilesChanged: fileReports.length,
  questReplacements,
  interfaceReplacements,
  questLiteralRepairs,
  databaseReplacements: databaseReports.reduce((sum, row) => sum + row.replacements, 0),
  databaseMismatches,
  javascriptReplacements: javascriptReports.reduce((sum, row) => sum + row.replacements, 0),
  javascriptMismatches,
  questPluginFound: questMatches.length === 1,
  recoveryPluginInstalled: false,
  missingInterfaceFields,
  possibleNewEnglishText,
  filesChanged,
  fileDetails: fileReports,
  structureVerified: true,
};
// Translation-only package: do not alter event flow or quest references.
report.eventRepairs = [];
report.questReferenceRepairs = [];
report.questTextRepairs = require('./conteudo/quest-text-fixes.js')(game, simulate, backup);
report.localization = require('./conteudo/preparar-interface.cjs')(game, simulate, backup);
report.englishDetectionNotice = 'Busca heuristica limitada: zero candidatos nao certifica ausencia de ingles.';
const reportPath = path.join(patchDir, 'relatorio-aplicacao.json');
fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
console.log('');
console.log('Patch concluido.');
console.log(`Substituicoes em dialogos: ${report.dialogueReplacements}`);
console.log(`Correcoes semanticas aplicadas: ${dialogueCorrections}`);
console.log(`Textos de missoes: ${questReplacements}`);
console.log(`Textos internos de missoes reparados: ${questLiteralRepairs}`);
console.log(`Textos de menus e banco de dados: ${report.databaseReplacements}`);
console.log(`Textos de plugins e interface: ${report.javascriptReplacements}`);
console.log(`Arquivos de eventos alterados: ${fileReports.length}`);
console.log(`Possiveis textos novos em ingles: ${possibleNewEnglishText.length}`);
console.log(report.englishDetectionNotice);
console.log(`Relatorio: ${reportPath}`);
if (simulate) console.log('Modo simulacao: nenhum arquivo do jogo foi gravado.');


