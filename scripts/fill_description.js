// 把一位主角色的档案写入 index.yaml 的「角色描述」字段。
// tavern_sync 的角色描述只接受直接写在 index.yaml 里的文字，不支持「文件:」引用，所以打包前用本脚本同步。
// 角色描述只放一位角色；多个主角色放世界书（见 prompts/10_捏人-主角色.md）。
// 用法: node scripts/fill_description.js <作品目录> <档案文件>
//   例: node scripts/fill_description.js works/某作品 角色/角色-甲.txt
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length !== 2) {
  console.error('用法: node scripts/fill_description.js <作品目录> <档案文件>（角色描述只放一位角色）');
  process.exit(1);
}
const [workDir, file] = args;

const indexPath = path.join(workDir, 'index.yaml');
const text = fs.readFileSync(path.join(workDir, file), 'utf8').replace(/\r\n/g, '\n').trim();
const block = '角色描述: |-\n' + text.split('\n').map(l => (l ? '  ' + l : '')).join('\n') + '\n';

// 替换「角色描述:」这一行及其后所有缩进行 / 空行（直到下一个顶层键）
const lines = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n').split('\n');
const start = lines.findIndex(l => /^角色描述:/.test(l));
if (start < 0) {
  console.error(`${indexPath} 中没有「角色描述:」字段`);
  process.exit(1);
}
let end = start + 1;
while (end < lines.length && (lines[end] === '' || /^\s/.test(lines[end]))) end++;
// 保留原本分隔下一个顶层键的空行
const trailing = lines.slice(start + 1, end).reverse().findIndex(l => l !== '');
const keepBlank = trailing < 0 ? end - start - 1 : trailing;

const out = [...lines.slice(0, start), block.trimEnd(), ...Array(keepBlank).fill(''), ...lines.slice(end)];
fs.writeFileSync(indexPath, out.join('\n'));
console.log(`已写入角色描述（${file}，${text.length} 字）→ ${indexPath}`);
