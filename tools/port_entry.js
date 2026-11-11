// 施工用：把预设条目搬成本项目的「规范正文」（+ 可选的输出模板），并按 MAPPING.md §9 清理措辞。
//
// 用法: node tools/port_entry.js <源条目> <规范输出> [--tpl <模板输出>] [--keep-user <行号,行号>] [--char <替换词>]
//   --tpl        抽出第一个 ``` 代码块作为模板（去掉围栏），规范正文里留一行指引
//   --keep-user  这些源文件行号上的 {{user}} 是卡内文本（如生成给酒馆用的提示词正文），保留宏不替换
//   --char       把代码块外的 {{char}} 替换成这个词（如「目标角色」）
//
// 清理规则：
//   代码块外：{{user}} / <user> → 女主角；「祈愿」→「提出」；条目标签互引 → 文件引用
//   代码块内：<user> → {{user}}（统一为酒馆宏），其余原样
//   「宙之花」不自动替换：语境差别太大，搬完后用 grep 逐处人工处理
const fs = require('fs');

const args = process.argv.slice(2);
const opt = name => {
  const i = args.indexOf(name);
  return i < 0 ? null : args.splice(i, 2)[1];
};
const tplOut = opt('--tpl');
const keepUser = new Set((opt('--keep-user') || '').split(',').filter(Boolean).map(Number));
const charWord = opt('--char');
const [src, specOut] = args;
if (!src || !specOut) {
  console.error('用法: node tools/port_entry.js <源条目> <规范输出> [--tpl <模板输出>] [--keep-user <行号,…>] [--char <词>]');
  process.exit(1);
}

const TAG_REFS = {
  '<knowledge_StatusBlock>': '`references/状态栏.md`',
  '<knowledge_AdvancedBeautify>': '`references/高级美化.md`',
  '<knowledge_worldinfo>': '`references/世界书.md`',
  '<knowledge_Regex>': '`references/正则.md`',
  '<knowledge_MVU_Zod>': '`references/MVU.md`',
  '<QuickReplies_infor_knowledge>': '`references/QR与STscript.md`',
  '<StatusBlock_Protocol>': '`prompts/35_状态栏.md`',
  '<Writing_style>': '`prompts/23_创世-文风.md`',
  '<Character_Blueprint_Protocol>': '`prompts/10_捏人-主角色.md`',
  '<Worldbuilding_Protocol>': '`prompts/20_创世-世界书.md`',
  '<Mvu_Zod_Protocol1>': '`prompts/30_MVU1-结构.md`',
  '<Mvu_Zod_Protocol2>': '`prompts/31_MVU2-初始化.md`',
  '<Mvu_Zod_Protocol3>': '`prompts/32_MVU3-更新规则.md`',
  '<Mvu_Zod_Protocol4>': '`prompts/33_MVU4-动态内容.md`',
  '<Mvu_Zod_Protocol5>': '`prompts/34_MVU5-状态栏.md`',
};

const lines = fs.readFileSync(src, 'utf8').replace(/\r\n/g, '\n').split('\n');
let inFence = false;
const cleaned = lines.map((line, i) => {
  if (/^\s*```/.test(line)) {
    inFence = !inFence;
    return line;
  }
  if (inFence) return line.replace(/<user>/g, '{{user}}');
  let out = line;
  // 标签互引只在说明文字里替换；条目自身的开闭标签（行首）保留
  if (!/^\s*<\/?[A-Za-z0-9_]+>\s*$/.test(out)) {
    for (const [tag, ref] of Object.entries(TAG_REFS)) out = out.split(tag).join(ref);
  }
  if (!keepUser.has(i + 1)) out = out.replace(/\{\{user\}\}|<user>/g, '女主角');
  if (charWord) out = out.replace(/\{\{char\}\}/g, charWord);
  return out.replace(/祈愿/g, '提出');
});

let spec = cleaned;
if (tplOut) {
  const start = cleaned.findIndex(l => /^\s*```/.test(l));
  const end = cleaned.findIndex((l, i) => i > start && /^\s*```\s*$/.test(l));
  if (start < 0 || end < 0) {
    console.error('没有找到完整的 ``` 代码块');
    process.exit(1);
  }
  fs.writeFileSync(tplOut, cleaned.slice(start + 1, end).join('\n').trim() + '\n');
  spec = [...cleaned.slice(0, start), '（输出模板见 templates/，见本文件开头「产物」）', ...cleaned.slice(end + 1)];
}
// 「首尾用三个`包裹」类要求 → 写文件
spec = spec.map(l => (/三个`/.test(l) ? '输出严格按照对应模板（见本文件开头「产物」），写入文件，不在对话里整段贴出。' : l));
fs.writeFileSync(specOut, spec.join('\n').trim() + '\n');

const left = spec.map((l, i) => [i + 1, l]).filter(([, l]) => /宙之花/.test(l));
if (left.length) {
  console.log(`${specOut} 中待人工处理的「宙之花」：`);
  for (const [n, l] of left) console.log(`  ${n}: ${l.trim().slice(0, 60)}`);
}
