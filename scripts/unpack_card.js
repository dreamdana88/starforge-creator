// 把已有角色卡（JSON 或 PNG）拆成工坊目录：index.yaml + 世界书 / 开场白 / 正则文件，用于「改造已有卡」。
// 拆完用 tavern_sync bundle 打包，再用 scripts/diff_card.js 和原卡比对。
//
// 用法: node scripts/unpack_card.js <原卡.json|.png> <作品目录>
//   作品目录下已有 index.yaml 时拒绝执行，避免覆盖改到一半的作品。
//
// 产物:
//   index.yaml                 字段写法与 templates/index-template.yaml 一致
//   第一条消息/0.txt, 1.txt…   first_mes + 备选开场白，按原顺序
//   世界书/NN-条目名.txt        每个条目一个文件，NN 是原顺序
//   正则/NN-正则名.txt          替换内容（含 HTML 美化）
//   头像.png                   原卡是 PNG 时复制；JSON 时生成占位图
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const [src, outDir] = process.argv.slice(2);
if (!src || !outDir) {
  console.error('用法: node scripts/unpack_card.js <原卡.json|.png> <作品目录>');
  process.exit(1);
}
if (fs.existsSync(path.join(outDir, 'index.yaml'))) {
  console.error(`${outDir}/index.yaml 已存在，不覆盖。要重新拆卡，先把它移走。`);
  process.exit(1);
}

function readCard(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('ascii', 1, 4) !== 'PNG') return JSON.parse(buf.toString('utf8'));
  let card = null;
  for (let o = 8; o < buf.length;) {
    const len = buf.readUInt32BE(o);
    if (buf.toString('ascii', o + 4, o + 8) === 'tEXt') {
      const data = buf.subarray(o + 8, o + 8 + len);
      const sep = data.indexOf(0);
      const key = data.toString('latin1', 0, sep);
      if (key === 'ccv3' || (key === 'chara' && !card)) {
        card = JSON.parse(Buffer.from(data.toString('latin1', sep + 1), 'base64').toString('utf8'));
      }
    }
    o += 12 + len;
  }
  if (!card) throw new Error('PNG 里没有找到角色卡数据');
  return card;
}

const card = readCard(src);
const d = card.data || card;
const q = s => JSON.stringify(String(s ?? ''));
// Windows 文件名非法字符换成全角，去掉首尾空格
const safe = s => String(s || '未命名').trim().replace(/[\\/:*?"<>|]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xfee0)).replace(/\s+/g, ' ').slice(0, 60) || '未命名';
const pad = (i, n) => String(i).padStart(String(n - 1).length < 2 ? 2 : String(n - 1).length, '0');
function write(rel, content) {
  const p = path.join(outDir, rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, content ?? '');
}
const noExt = rel => rel.replace(/\.txt$/, '').replace(/\\/g, '/');

const Y = [];
Y.push('# yaml-language-server: $schema=https://testingcf.jsdelivr.net/gh/StageDog/tavern_sync/dist/schema/character.zh.json');
Y.push(`# 由 scripts/unpack_card.js 从 ${path.basename(src)} 拆出`);
Y.push('头像: 头像');
Y.push(`版本: ${q(d.character_version)}`);
Y.push(`作者: ${q(d.creator)}`);
Y.push(`备注: ${q(d.creator_notes)}`);
Y.push('');

// 开场白
const greetings = [d.first_mes || '', ...(d.alternate_greetings || [])];
Y.push('第一条消息:');
greetings.forEach((g, i) => {
  write(`第一条消息/${i}.txt`, g);
  Y.push(`  - 文件: 第一条消息/${i}`);
});
Y.push('');

// 角色描述：只能写字符串
Y.push(`角色描述: ${q(d.description)}`);
for (const k of ['personality', 'scenario', 'mes_example', 'system_prompt', 'post_history_instructions']) {
  if (d[k]) console.warn(`⚠ 原卡 ${k} 有内容（${d[k].length} 字），tavern_sync 不支持，未拆出`);
}
Y.push('');

// 世界书
const book = d.character_book || { entries: [] };
const entries = [...book.entries].sort((a, b) => (a.extensions?.display_index ?? a.id ?? 0) - (b.extensions?.display_index ?? b.id ?? 0));
Y.push(`世界书名称: ${book.name ? q(book.name) : 'null'}`);
Y.push('条目:');
const POS = { 0: '角色定义之前', 1: '角色定义之后', 2: '作者注释之前', 3: '作者注释之后', 4: '指定深度', 5: '示例消息之前', 6: '示例消息之后' };
const ROLE = { 0: '系统', 1: '用户', 2: 'AI' };
const LOGIC = { 0: '与任意', 1: '非所有', 2: '非任意', 3: '与所有' };
entries.forEach((e, i) => {
  const x = e.extensions || {};
  const file = `世界书/${pad(i, entries.length)}-${safe(e.comment)}.txt`;
  write(file, e.content);
  const type = x.vectorized ? '向量化' : e.constant ? '蓝灯' : '绿灯';
  Y.push(`  - 名称: ${q(e.comment)}`);
  Y.push(`    启用: ${e.enabled !== false}`);
  Y.push('    激活策略:');
  Y.push(`      类型: ${type}`);
  const keys = (e.keys || []).filter(k => String(k).length);
  if (keys.length) Y.push(`      关键字: [${keys.map(q).join(', ')}]`);
  else if (type === '绿灯') console.warn(`⚠ 第 ${i} 条「${e.comment}」是绿灯但没有关键字`);
  const sec = (e.secondary_keys || []).filter(k => String(k).length);
  if (sec.length) {
    Y.push('      次要关键字:');
    Y.push(`        逻辑: ${LOGIC[x.selectiveLogic ?? 0]}`);
    Y.push(`        关键字: [${sec.map(q).join(', ')}]`);
  }
  if (x.scan_depth != null) Y.push(`      扫描深度: ${x.scan_depth}`);
  Y.push('    插入位置:');
  const pos = x.position ?? (e.position === 'before_char' ? 0 : 1);
  Y.push(`      类型: ${POS[pos]}`);
  if (pos === 4) {
    Y.push(`      角色: ${ROLE[x.role ?? 0]}`);
    Y.push(`      深度: ${x.depth ?? 4}`);
  }
  Y.push(`      顺序: ${e.insertion_order ?? 100}`);
  if (x.useProbability && x.probability != null && x.probability !== 100) Y.push(`    激活概率: ${x.probability}`);
  Y.push('    递归:');
  Y.push(`      不可被其他条目激活: ${!!x.exclude_recursion}`);
  Y.push(`      不可激活其他条目: ${!!x.prevent_recursion}`);
  if (typeof x.delay_until_recursion === 'number' && x.delay_until_recursion >= 1) Y.push(`      延迟递归: ${x.delay_until_recursion}`);
  else if (x.delay_until_recursion === true) Y.push('      延迟递归: 1');
  const eff = [['黏性', x.sticky], ['冷却', x.cooldown], ['延迟', x.delay]].filter(([, v]) => v);
  if (eff.length) {
    Y.push('    特殊效果:');
    eff.forEach(([k, v]) => Y.push(`      ${k}: ${v}`));
  }
  if (x.group) console.warn(`⚠ 第 ${i} 条「${e.comment}」有群组「${x.group}」，未拆出，请手动补`);
  Y.push(`    文件: ${q(noExt(file))}`);
  Y.push('');
});

// 扩展字段
const ext = d.extensions || {};
const regex = ext.regex_scripts || [];
const helper = ext.tavern_helper || {};
const scripts = helper.scripts || [];
if (regex.length || scripts.length) Y.push('扩展字段:');
if (regex.length) {
  Y.push('  正则:');
  regex.forEach((r, i) => {
    const pl = r.placement || [];
    Y.push(`    - 正则名称: ${q(r.scriptName)}`);
    Y.push(`      id: ${q(r.id)}`);
    Y.push(`      启用: ${!r.disabled}`);
    Y.push(`      查找表达式: ${q(r.findRegex)}`);
    if ((r.trimStrings || []).length) Y.push(`      修剪掉: [${r.trimStrings.map(q).join(', ')}]`);
    const rep = r.replaceString || '';
    if (rep.length > 200 || rep.includes('\n')) {
      const file = `正则/${pad(i, regex.length)}-${safe(r.scriptName)}.txt`;
      write(file, rep);
      Y.push(`      文件: ${q(noExt(file))}`);
    } else {
      Y.push(`      内容: ${q(rep)}`);
    }
    Y.push('      来源:');
    Y.push(`        用户输入: ${pl.includes(1)}`);
    Y.push(`        AI输出: ${pl.includes(2)}`);
    if (pl.includes(3)) Y.push('        快捷命令: true');
    if (pl.includes(5)) Y.push('        世界信息: true');
    Y.push('      作用于:');
    Y.push(`        仅格式显示: ${!!r.markdownOnly}`);
    Y.push(`        仅格式提示词: ${!!r.promptOnly}`);
    if (r.runOnEdit) Y.push('      在编辑时运行: true');
    if (r.minDepth != null && r.minDepth !== '') Y.push(`      最小深度: ${r.minDepth}`);
    if (r.maxDepth != null && r.maxDepth !== '') Y.push(`      最大深度: ${r.maxDepth}`);
    if (r.substituteRegex) console.warn(`⚠ 正则「${r.scriptName}」用了替换宏（substituteRegex=${r.substituteRegex}），tavern_sync 打包时会丢，请核对`);
    Y.push('');
  });
}
if (scripts.length) {
  Y.push('  酒馆助手:');
  Y.push('    脚本库:');
  scripts.forEach(s => {
    if (s.type && s.type !== 'script') { console.warn(`⚠ 脚本文件夹「${s.name}」未拆出，请手动补`); return; }
    Y.push(`      - 名称: ${q(s.name)}`);
    Y.push(`        id: ${q(s.id)}`);
    Y.push(`        启用: ${!!s.enabled}`);
    Y.push('        类型: 脚本');
    Y.push(`        内容: ${q(s.content)}`);
    if (s.info) Y.push(`        介绍: ${q(s.info)}`);
    Y.push('');
  });
}
const extra = Object.keys(ext).filter(k => !['regex_scripts', 'tavern_helper', 'world', 'talkativeness', 'fav', 'depth_prompt'].includes(k));
if (extra.length) console.warn(`⚠ 扩展字段里还有 ${extra.join('、')}，未拆出`);
if (ext.depth_prompt?.prompt) console.warn(`⚠ 原卡有角色备注（depth_prompt，${ext.depth_prompt.prompt.length} 字），tavern_sync 不支持，未拆出`);

write('index.yaml', Y.join('\n').replace(/\n+$/, '\n'));

// 头像
const avatar = path.join(outDir, '头像.png');
if (!fs.existsSync(avatar)) {
  if (fs.readFileSync(src).toString('ascii', 1, 4) === 'PNG') fs.copyFileSync(src, avatar);
  else execFileSync('node', [path.join(__dirname, 'placeholder_avatar.js'), avatar], { stdio: 'inherit' });
}

console.log(`已拆出「${d.name}」→ ${outDir}`);
console.log(`  开场白 ${greetings.length} 条、世界书 ${entries.length} 条、正则 ${regex.length} 条、脚本 ${scripts.length} 个`);
console.log('  下一步：在 tools/tavern_sync.yaml 登记配置 → bundle → node scripts/diff_card.js <原卡> <新卡.png>');
