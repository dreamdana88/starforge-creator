// 比对两张角色卡（JSON 或 PNG）在酒馆里真正起作用的字段，用于拆卡后回打包核对、改造前后对照。
// 用法: node scripts/diff_card.js <旧卡> <新卡>
// 世界书条目按「条目名」配对（同名的按出现顺序），正则按名称配对。
const fs = require('fs');

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
  return card;
}

const [fa, fb] = process.argv.slice(2);
if (!fa || !fb) {
  console.error('用法: node scripts/diff_card.js <旧卡> <新卡>');
  process.exit(1);
}
const A = readCard(fa).data, B = readCard(fb).data;
const diffs = [];
// 换行符（\r\n / \n）和文本末尾空白不影响酒馆效果，tavern_sync 打包时也会统一，比较前抹平
const norm = v => {
  if (typeof v === 'string') v = v.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  return v === undefined || v === '' ? null : v;
};
const same = (a, b) => JSON.stringify(norm(a)) === JSON.stringify(norm(b));
const show = v => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s === undefined ? '（无）' : s.length > 80 ? s.slice(0, 80).replace(/\n/g, '⏎') + `…（${s.length} 字）` : s.replace(/\n/g, '⏎');
};
const cmp = (where, a, b) => {
  if (same(a, b)) return;
  const na = norm(a), nb = norm(b);
  if (typeof na === 'string' && typeof nb === 'string') {
    // 长文本只显示第一处不同附近
    let i = 0;
    while (i < na.length && na[i] === nb[i]) i++;
    const at = s => (i > 20 ? '…' : '') + s.slice(Math.max(0, i - 20), i + 40).replace(/\n/g, '⏎') + (s.length > i + 40 ? '…' : '');
    diffs.push(`${where}（第 ${i} 字起）\n    旧: ${at(na)}\n    新: ${at(nb)}`);
    return;
  }
  diffs.push(`${where}\n    旧: ${show(a)}\n    新: ${show(b)}`);
};

for (const k of ['description', 'first_mes', 'personality', 'scenario', 'mes_example', 'creator', 'character_version', 'creator_notes']) cmp(k, A[k], B[k]);
const ga = A.alternate_greetings || [], gb = B.alternate_greetings || [];
cmp('备选开场白数量', ga.length, gb.length);
ga.forEach((g, i) => cmp(`备选开场白 [${i + 1}]`, g, gb[i]));

const entryView = e => {
  const x = e.extensions || {};
  return {
    启用: e.enabled !== false, 蓝灯: !!e.constant, 关键字: e.keys || [], 次要关键字: e.secondary_keys || [],
    次要逻辑: (e.secondary_keys || []).length ? x.selectiveLogic ?? 0 : null,
    位置: x.position, 深度: x.position === 4 ? x.depth : null, 角色: x.position === 4 ? x.role ?? 0 : null,
    顺序: e.insertion_order, 概率: x.useProbability && x.probability !== 100 ? x.probability : null,
    不可被激活: !!x.exclude_recursion, 不可激活: !!x.prevent_recursion, 延迟递归: x.delay_until_recursion || null,
    黏性: x.sticky || null, 冷却: x.cooldown || null, 延迟: x.delay || null, 扫描深度: x.scan_depth ?? null,
    向量化: !!x.vectorized, 群组: x.group || null, 内容: e.content,
  };
};
const group = list => {
  const m = new Map();
  for (const e of list) { const k = e.comment || ''; if (!m.has(k)) m.set(k, []); m.get(k).push(e); }
  return m;
};
const ba = A.character_book || { entries: [] }, bb = B.character_book || { entries: [] };
cmp('世界书名称', ba.name, bb.name);
cmp('世界书条目数', ba.entries.length, bb.entries.length);
const ma = group(ba.entries), mb = group(bb.entries);
for (const [name, list] of ma) {
  const other = mb.get(name) || [];
  list.forEach((e, i) => {
    const tag = `条目「${name}」${list.length > 1 ? `#${i + 1}` : ''}`;
    if (!other[i]) { diffs.push(`${tag}：新卡里没有`); return; }
    const va = entryView(e), vb = entryView(other[i]);
    for (const k of Object.keys(va)) cmp(`${tag}.${k}`, va[k], vb[k]);
  });
}
for (const [name, list] of mb) if ((ma.get(name) || []).length < list.length) diffs.push(`条目「${name}」：旧卡里没有（新增）`);
// 条目在酒馆里的显示顺序（按 display_index）
const shown = list => [...list].sort((x, y) => (x.extensions?.display_index ?? 0) - (y.extensions?.display_index ?? 0)).map(e => e.comment).join('\n');
const oa = shown(ba.entries), ob = shown(bb.entries);
if (oa !== ob && ba.entries.length === bb.entries.length) diffs.push('世界书条目的排列顺序不同');

const regexView = r => ({
  启用: !r.disabled, 查找: r.findRegex, 替换: r.replaceString, 修剪: r.trimStrings || [], 来源: [...(r.placement || [])].sort(),
  仅显示: !!r.markdownOnly, 仅提示词: !!r.promptOnly, 编辑时运行: !!r.runOnEdit,
  最小深度: r.minDepth ?? null, 最大深度: r.maxDepth ?? null, 替换宏: r.substituteRegex || 0,
});
const ra = A.extensions?.regex_scripts || [], rb = B.extensions?.regex_scripts || [];
cmp('正则数量', ra.length, rb.length);
for (const r of ra) {
  const o = rb.find(x => x.scriptName === r.scriptName);
  if (!o) { diffs.push(`正则「${r.scriptName}」：新卡里没有`); continue; }
  const va = regexView(r), vb = regexView(o);
  for (const k of Object.keys(va)) cmp(`正则「${r.scriptName}」.${k}`, va[k], vb[k]);
}
for (const r of rb) if (!ra.find(x => x.scriptName === r.scriptName)) diffs.push(`正则「${r.scriptName}」：旧卡里没有（新增）`);

const sa = A.extensions?.tavern_helper?.scripts || [], sb = B.extensions?.tavern_helper?.scripts || [];
cmp('酒馆助手脚本数量', sa.length, sb.length);
for (const s of sa) {
  const o = sb.find(x => x.name === s.name);
  if (!o) { diffs.push(`脚本「${s.name}」：新卡里没有`); continue; }
  cmp(`脚本「${s.name}」.启用`, !!s.enabled, !!o.enabled);
  cmp(`脚本「${s.name}」.内容`, s.content, o.content);
}

if (!diffs.length) console.log('✓ 两张卡在开场白、角色描述、世界书、正则、脚本上完全一致');
else {
  console.log(`共 ${diffs.length} 处不同：`);
  diffs.forEach(d => console.log('- ' + d));
  process.exitCode = 1;
}
