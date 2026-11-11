// 把代码文件写入 index.yaml 中某个酒馆助手脚本的「内容」字段。
// tavern_sync 的脚本库只接受直接写在 index.yaml 里的内容，不支持「文件:」引用，所以打包前用本脚本同步。
// 用法: node scripts/fill_script.js <作品目录> <脚本名称> <代码文件>
//   例: node scripts/fill_script.js works/某作品 变量结构 MVU/变量结构.js
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
if (args.length !== 3) {
  console.error('用法: node scripts/fill_script.js <作品目录> <脚本名称> <代码文件>');
  process.exit(1);
}
const [workDir, name, file] = args;

const indexPath = path.join(workDir, 'index.yaml');
const code = fs.readFileSync(path.join(workDir, file), 'utf8').replace(/\r\n/g, '\n').trim();
const lines = fs.readFileSync(indexPath, 'utf8').replace(/\r\n/g, '\n').split('\n');

const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const nameRe = new RegExp(`^(\\s*)- 名称: ['"]?${escaped}['"]?\\s*$`);
const at = lines.findIndex(l => nameRe.test(l));
if (at < 0) {
  console.error(`${indexPath} 中没有名称为「${name}」的条目`);
  process.exit(1);
}
const itemIndent = lines[at].match(nameRe)[1].length;

// 在这一项内部（缩进比「- 名称」更深的行）找「内容:」
let key = -1;
for (let i = at + 1; i < lines.length; i++) {
  const l = lines[i];
  if (l.trim() && l.search(/\S/) <= itemIndent) break;
  if (/^\s*内容:/.test(l)) {
    key = i;
    break;
  }
}
if (key < 0) {
  console.error(`「${name}」下没有「内容:」字段`);
  process.exit(1);
}
const keyIndent = lines[key].search(/\S/);

// 「内容:」后续属于它的行：空行或缩进更深的行
let end = key + 1;
while (end < lines.length && (lines[end].trim() === '' || lines[end].search(/\S/) > keyIndent)) end++;
// 末尾的空行留给下一项
while (end > key + 1 && lines[end - 1].trim() === '') end--;

const pad = ' '.repeat(keyIndent);
const block = [`${pad}内容: |-`, ...code.split('\n').map(l => (l ? `${pad}  ${l}` : ''))];
fs.writeFileSync(indexPath, [...lines.slice(0, key), ...block, ...lines.slice(end)].join('\n'));
console.log(`已写入脚本「${name}」（${file}，${code.split('\n').length} 行）→ ${indexPath}`);
