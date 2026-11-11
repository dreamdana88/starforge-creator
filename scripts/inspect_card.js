// 读取 PNG 角色卡内嵌的 chara 数据，打印摘要，用于打包后核对。
// 用法: node scripts/inspect_card.js <卡.png>
const fs = require('fs');

const file = process.argv[2];
if (!file) {
  console.error('用法: node scripts/inspect_card.js <卡.png>');
  process.exit(1);
}

const buf = fs.readFileSync(file);
if (buf.toString('ascii', 1, 4) !== 'PNG') {
  console.error('不是 PNG 文件。若是 tavern_sync 输出，检查作品目录下是否有 头像.png');
  process.exit(1);
}

let card = null;
for (let o = 8; o < buf.length;) {
  const len = buf.readUInt32BE(o);
  const type = buf.toString('ascii', o + 4, o + 8);
  if (type === 'tEXt') {
    const data = buf.subarray(o + 8, o + 8 + len);
    const sep = data.indexOf(0);
    const key = data.toString('latin1', 0, sep);
    if (key === 'ccv3' || (key === 'chara' && !card)) {
      card = JSON.parse(Buffer.from(data.toString('latin1', sep + 1), 'base64').toString('utf8'));
    }
  }
  o += 12 + len;
}
if (!card) {
  console.error('没有找到内嵌的角色卡数据');
  process.exit(1);
}

const c = card.data;
const preview = s => (s || '').replace(/\s+/g, ' ').slice(0, 40);
console.log(`卡名: ${c.name}    格式: ${card.spec} ${card.spec_version}`);
console.log(`开场白: ${1 + (c.alternate_greetings || []).length} 条`);
console.log(`  [0] ${preview(c.first_mes)}`);
(c.alternate_greetings || []).forEach((g, i) => console.log(`  [${i + 1}] ${preview(g)}`));

const entries = c.character_book?.entries || [];
console.log(`世界书「${c.character_book?.name ?? '无'}」: ${entries.length} 条`);
for (const e of entries) {
  const lamp = e.constant ? '蓝灯' : '绿灯';
  const keys = e.constant ? '' : `  关键字: ${e.keys.join(', ')}`;
  const recursion = e.extensions?.exclude_recursion && e.extensions?.prevent_recursion ? '' : '  ⚠递归未全关';
  console.log(`  ${e.enabled ? '✓' : '✗'} ${lamp} ${e.comment}  顺序 ${e.insertion_order}${keys}${recursion}`);
}

const regex = c.extensions?.regex_scripts || [];
console.log(`正则: ${regex.length} 条`);
for (const r of regex) console.log(`  ${r.disabled ? '✗' : '✓'} ${r.scriptName}`);

const scripts = c.extensions?.tavern_helper?.scripts || [];
console.log(`酒馆助手脚本: ${scripts.length} 个`);
for (const s of scripts) {
  const lines = (s.content || '').split('\n').length;
  console.log(`  ${s.enabled ? '✓' : '✗'} ${s.name}  ${s.content ? `${lines} 行` : '⚠内容为空'}`);
}
