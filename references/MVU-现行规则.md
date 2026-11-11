# MVU 现行规则

> 摘自 `D:/酒馆资料/tavern_helper_combo-latest/.cursor/rules/` 的 `mvu角色卡.mdc` 与 `mvu变量框架.mdc`（2026-05-31 版），比预设条目新，技术细节以本文件为准。
> 不适用于本项目的部分：`pnpm build` / `pnpm watch`、`角色卡/` 文件夹结构、Vue / pinia 的 `defineMvuDataStore`。本项目不打包前端工程，变量结构脚本直接内联进 `index.yaml`（见 `prompts/30_MVU1-结构.md`）。

## MVU 角色卡文件夹

MVU 角色卡文件夹提供了一种存储酒馆角色卡内容的文件结构:

- `角色卡/脚本/*/` 中是角色卡的所有脚本项目
- `角色卡/界面/*/` 中是角色卡的所有前端界面项目
- `角色卡/世界书/*/` 中是角色卡的世界书条目, 即角色卡的设定提示词, 编写角色卡其他内容时需要参考它来了解角色世界设定
- `角色卡/schema.ts` 中是用 zod 4 库书写的角色卡 MVU 变量结构定义
  - 提供给脚本、前端界面导入使用
  - 会在 `pnpm build` 或 `pnpm watch` 时生成对应的 json schema 文件 `角色卡/schema.json`, 便于编写变量初始值文件 initvar.yaml `# yaml-language-server: $schema=schema文件路径`
- `角色卡/界面/store.ts` 中是 pinia 预先写好的获取角色卡消息楼层 MVU 变量方式, 提供给所有前端界面导入使用

当玩家要求编写 MVU 角色卡的脚本、前端界面时, 除了参考`初始模板/脚本`或`初始模板/前端界面`外, 你还应该参考`初始模板/角色卡`中的脚本和前端界面模板.

**要区分单独的脚本、前端界面和为 MVU 角色卡增补脚本、前端界面, 如果用户只是想要编写单独的脚本、前端界面, 则不应参考这个文件.**

## MVU 变量结构

MVU 使用 zod 4 库书写变量结构定义, 这对应于`角色卡/schema.ts`, 例如:

```ts
export const Schema = z.object({
  好感度: z.coerce.number().transform(value => _.clamp(value, 0, 100)),
});
```

你应该要求用户提供变量结构文件或者自行编写, 它应该遵循以下要求:

```yaml
rtask: Explorer requests to design the zod schema of variables which records the world status, you should reappear an instance of it using zod 4.x inside `<context>`, which is the main content of your reply
rule:
  - libraries: "`z` from zod 4.x (stick to it instead of 3.x!) and `_` from lodash are available by default, so you can use them directly and should prefer to use them; don't import them in the generated code"
  - idempotent operation: the schema is intended to parse the updates of the world status incrementally, thus, the output of `Schema.parse(input)` must be a valid input of `Schema.parse` itself; that is, you should use z.transform carefully, keeping `Schema.parse(Schema.parse(input))` equal to `Schema.parse(input)`
  - for number schema: prefer `z.coerce.number()` over `z.number()` whenever you expect a number since it will try to convert the input to a number if it's not a number; but don't use other `z.coerce.xxx()` such as `z.coerce.boolean()`, just use `z.boolean()` directly
  - prefer object schema over array schema: "the array index is hard to understand and maintain, so you should use `物品栏: z.record(z.string().describe('物品名'), z.object({ 描述: z.string(), ... }))` instead of `物品栏: z.array(z.object({ 名称: z.string(), 描述: z.string(), ... }))`"
  - for object schema:
      - fixed required keys + the same type: use `z.record(z.enum(['key1', 'key2', ...]), ${value type})`
        fixed optional keys + the same type: use `z.partialRecord(z.enum(['key1', 'key2', ...]), ${value type})`
        dynamic optional keys + the same type: use `z.record(z.string(), ${value type})`
        fixed required keys + different types: 'use `z.object({ key1: ${type1}, key2: ${type2}, ... })`'
        dynamic keys but some keys are required + the same type: 'use `z.intersection(z.object({ requiredKey1: ${type1}, requiredKey2: ${type2}, ... }), z.record(z.string(), ${value type}))`'
      - on clearable object: 'if the object is clearable by JSON patch `{ "op": "remove", "path": "/path/to/object" }`, set `z.object({ ${field}: ${type}.prefault(...), ... }).prefault({})` instead of `z.object({ ... }).optional()` for better compatibility with the incremental update'
  - for special format (rare to happen): prefer `z.templateLiteral` over regex or manual parsing
  - for restrictions: when accepting a update that breaks the schema, users are tend to expect the update takes some effect instead of being discarded completely; therefore, you should try your best to use `z.transform` to convert the broken input to a valid input. For example, if Explorer requests a value to be between 0 and 100, prefer `z.number().transform(value => _.clamp(value, 0, 100))` over `z.number().min(0).max(100)`; if an object could only contain 10 keys, when a new key comes, discard the oldest key instead. **but only impose these restrictions when Explorer requests**
  - on default value:
      - prefer `z.prefault` over `z.default`
      - if a `z.object` or the whole Schema is complicated enough, set `.prefault('${suitable default value}')` or `.or(z.literal('待初始化')).prefault('待初始化')` for every field of it
      - if a compund type is prefault-ed, all its fields should be prefault-ed as well
      - don't set `z.prefault` for other situatioins unless Explorer requests it
  - when to describe: use `z.describe` only when there's no field name to explain the usage of the schema such as the key type of `z.record`; in contrast, you should never use `z.describe` if the field name has already explained the usage well
  - determine the order of keys: 'if Explorer requests you to do something with the insertion time of keys, prefer to use `_(data).entries()` which almost always lists keys in insertion order, e.g. you can remove old keys with a simple `_(data).entries().takeRight(10)`; when keys are already additionally sorted inside `z.transform`, you should use `$time: z.coerce.number().prefault(() => Date.now())` to automatically assign a timestamp'
  - don't repeat yourself: merge the same variable schemas whenever possible, but don't define extra variables to do so - you can only define schema inside `export const Schema = z.object({ ... })`
  - some function definition corrections:
      z.transform:
        type: '(fn: (value: Output) => NewOutput) => z.ZodType'
        limit: '`fn` can only take the parsed output as input, never ever use `context`. i.e. `z.string().transform(value => value)` is valid, while `z.string().transform((value, context) => value)` is not'
        example: 'z.object({ 好感度: z.coerce.number() }).transform(data => ({ 好感度: _.clamp(data.好感度, 0, 100) }))'
      z.prefault:
        type: '(value: Input | (() => Input)) => z.ZodType'
        limit: '`value` must be a valid input of the schema itself. i.e. `z.object({ 好感度: z.coerce.number().prefault(0) }).prefault({})` is valid, while `z.object({ 好感度: z.coerce.number() }).prefault({})` is not (the input must contain the `好感度` field in this case)'
      z.extend:
        limit: only `z.object`、`z.looseObject`、`z.strictObject` can be extended, even if `z.object(...).prefault({})` could not be extended! i.e. `z.object({...}).extend({...})` is valid, while `z.object({...}).prefault({}).extend({...})` is not
      z.passthrough、z.strict: they are not exist, never ever use them!
```

如果用户提供了 `export const Schema`, 你应该区分用户提供的是直接的 `schema.ts` 还是变量结构脚本. 具体地,

- `schema.ts` 中只应该有 `export const Schema` 负责定义和导出变量结构, 而没有其他副作用;
- 变量结构脚本可能在开头有 `import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';`, 在结尾有 `$(() => { registerMvuSchema(Schema); });`, 如果是这样, **则你应该去除开头结尾, 只保留 `export const Schema`**.

## 脚本

MVU 角色卡总是有`角色卡/脚本/变量结构`脚本, 其导入变量结构并注册到 MVU 中:

```ts
import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';
import { Schema } from '../../schema';

$(() => {
  registerMvuSchema(Schema);
});
```

你可以按需求新建别的脚本到`角色卡/脚本/*/index.ts`中.

## 前端界面

MVU 角色卡可能会设置状态栏界面, 因此`初始模板/角色卡/新建为src文件夹中的文件夹/界面`中提供了状态栏模板.

此外, 模板在 `util/mvu.ts` 中定义了 `defineMvuDataStore` 函数, 这是模板推荐的 Vue 访问 MVU 变量方式:

```ts
function defineMvuDataStore<T extends z.ZodObject>(
  schema: T,
  variable_option: VariableOption,
  additional_setup?: (data: Ref<z.infer<T>>) => void,
): ReturnType<typeof defineStore>;
```

其中 `Schema` 是变量结构, `variable_option` 是要访问的变量类型, `additional_setup` 是可选的额外设置函数.

例如, `示例/角色卡示例示例/store.ts` 中定义了访问 `useDataStore` 函数:

```ts
import { defineMvuDataStore } from '@util/mvu';
export const useDataStore = defineMvuDataStore(Schema, { type: 'message', message_id: getCurrentMessageId() });
```

其中 `const message_id = getCurrentMessageId()` 即获取界面所在楼层的楼层号, 因此 `const data = useDataStore()` 将能用于获取或修改该楼层的 MVU 变量.

或者, 前端界面可能会有需要在界面初始化时对 MVU 变量进行额外设置的需求, 则可以使用 `additional_setup`:

```ts
export const useDataStore = defineMvuDataStore(Schema, { type: 'message', message_id: getCurrentMessageId() }, data => {
  // 无论界面所在楼层原本记录有什么日志, 在初始化时强制置空
  data.value.系统状态.玩家本轮操作日志 = [];
});
```

## 世界书

`schema.ts` 所定义的变量结构除了被代码使用外, 还可以用于编写世界书.

当执行 `pnpm build` 或 `pnpm watch` 后, `schema.ts` 同目录下将会生成 json schema 文件 `schema.json`, 该文件描述了 `export const Schema = z.object({...})` 支持的输入数据. 可以据此完成`世界书/变量/initvar.yaml`即`世界书/index.yaml`中`[initvar]变量初始化勿开`条目的编写.

除了`[initvar]变量初始化勿开`外, 世界书里还应该有`变量列表`、`[mvu_update]变量更新规则`、`[mvu_update]变量输出格式`三个条目. 其中`变量列表`和`[mvu_update]变量输出格式`完全固定, 如果还没有设定, 可以按照初始模板中的设置.

`[mvu_update]变量更新规则`则应该按照以下要求:

```yaml
task: reappear an instance of the variable incremental update rule according to Explorer's request and the zod schema of variables, which is the main content of your reply
rule:
  - merge rules of the same variable types into one rule:
    - for fixed keys: "non-object type, `z.object({...})` and `z.record(z.enum(...), ...)` indicate that their keys always exist, so `主角.能力面板.力量`、`主角.能力面板.敏捷`、`主角.能力面板.体质`、`主角.能力面板.感知`、`主角.能力面板.意志`、`主角.能力面板.魅力` can be merged as `主角.能力面板.${六维}`, because their update rules are similar; the same applies to `${变量}.主角评价`"
    - for dynamic keys: |-
        `物品栏: z.record(z.string().describe('物品名'), ...)` may be empty or contain various items, so you should specify the path as `物品栏`, and put the key part into `type`'s index signature:
        物品栏:
          type: |-
            {
              [物品名: string]: {
                ...
              }
            }
  - nest fields of the same object to reduce tokens and make it more readable. for example, since `主角.能力面板` and `主角.装备栏` are both fields of `主角`, nest them under `主角` mapping
  - omit the type field for string variables
  - don't update readonly fields: field names starts with `_` are readonly, such as `_变量`, so don't list update rules for them
  - avoid listing update rules for variables whose names are self-explanatory unless Explorer specifies special rules for them
format: |-
  ---
  变量更新规则:
    ${变量名}:
      type: ${变量类型，**如果类型是string则省略这一字段**，否则要么是number、boolean等基础类型，要么使用typescript类型定义或zod schema定义（使用|-字符串块）}
      ${其他合适字段，仅当非常需要时才添加如format、range等...}
      check:
        - ${该变量更新时需要检查的更新规则，如：update it by ±(3~6) according to characters' attitudes towards <user>'s behavior respectively only if they're currently aware of it}
        - ...$(根据Explorer的描述确定需要几个check，尽量简练，不要过于扩展情况)
    ...
example: |- # just examples, don't copy them literally
  ---
  变量更新规则:
    世界:
      当前时间:
        format: ${xx历}-${YYYY/MM/DD}-${HH:MM}
        check:
          - 每次事件推进、休息或旅行后更新，保持时间流逝合理
          - 若场景跳转跨度较大，应说明跳跃原因
    主角:
      能力面板.${六维}.数值:
        type: number
        range: 0~100
        category:
          20~40: 普通人
          40~70: 冒险者常驻
        check:
          - 训练、战斗、重伤、系统奖励等显著事件才调整
          - 单次变化不超过 ±10，除非剧情有明确强化/削弱
      装备栏.${部位}:
        type: |-
          {
            装备: string; // 装备名称 + 状态; 若未装备，使用“空置”或“无”
            主角评价: string;
          }
        check:
          - 穿戴、损毁、替换装备时更新装备描述
    任务列表:
      type: |-
        {
          [任务名: string]: {
            类型: '主线' | '支线' | '每日' | '临危受命' ;
            说明: string; # 面向主角的任务背景或细则
            目标: string; # 明确可执行的目标描述，可包含步骤
            奖励: string;
            惩罚: string; # 失败后触发的负面效果
          }
        }
      check:
        - 避免一次性添加超过3个主线任务，保持焦点
        - 日常任务完成后可重置但需记录冷却
    ${变量}.主角评价:
      value: 主角对某个变量内容的即时感受
      check:
        - 在对应变量值发生变化或遭遇相关事件后可更新，其他情况不应更新
        - 语言应保持第一人称/贴近主角口吻
        - 主角的评价并不会被主角本人看到，也不会在剧情中出现
```

---

## MVU 变量框架

MVU 变量框架是一个独立的酒馆助手脚本. 它作用于消息楼层变量, 允许酒馆角色卡作者在世界书中设置消息楼层变量, 在世界书或聊天记录中初始化消息楼层变量, 及用 AI 输出更新消息楼层变量.

`@types/iframe/exported.mvu.d.ts` 中定义了 MVU 变量框架的接口. 如果提及到 "MVU 变量" 而非仅仅提及 "变量", 则应该优先使用 MVU 变量框架的接口.

## 使用

对于使用了 MVU 的脚本或前端界面, **你必须在代码加载时, 在顶部执行以下代码**:

- 使用 `await waitGlobalInitialized('Mvu');` 等待 MVU 变量框架初始化完成, **从而能够使用 `Mvu` 这个对象** (接下来的示例中, 我会在开头都等待 MVU 变量框架初始化来提醒你这一点, 但**你在实际编写时只需要在代码顶部等待一次)**;
- 如果是前端界面, 使用 `await waitUntil(() => _.has(getVariables({type: 'message'}), 'stat_data'));` 等待所在消息楼层变量有被正确设置, **从而能够使用消息楼层变量**;
- 如果是脚本, 合理使用 `waitUntil` 等待变量被正确设置.

## 数据存储

MVU 将变量数据存储在 `_.get(某楼层变量, 'stat_data')` 中, 如 `_.get(Mvu.getMvuData({type: 'message', message_id: 5}), 'stat_data')`.

```ts
await waitGlobalInitialized('Mvu');

// 获取第 5 楼的 MVU 变量
const variables = Mvu.getMvuData({ type: 'message', message_id: 5 });
const stat_data = _.get(variables, 'stat_data');

// 获取倒数第二楼的 MVU 变量
const variables = Mvu.getMvuData({ type: 'message', message_id: -2 });
const stat_data = _.get(variables, 'stat_data');

// 在前端界面中, 获取前端界面所在楼层的 MVU 变量
const variables = Mvu.getMvuData({ type: 'message', message_id: getCurrentMessageId() });
const stat_data = _.get(variables, 'stat_data');
```

此外, 你应该总是查找用户是否在编写区域内提供了变量结构定义 `schema.ts`, 其内使用 zod 4 定义了 stat_data 字段的类型, 例如:

```ts
export const Schema = z.object({
  好感度: z.coerce.number().transform(value => _.clamp(value, 0, 100)),
});
```

则获取 MVU 变量时应该:

```ts
await waitGlobalInitialized('Mvu');
const variables = Mvu.getMvuData({ type: 'message', message_id: getCurrentMessageId() });
const stat_data = Schema.parse(_.get(variables, 'stat_data'));
```

如果编写区域内没有 `schema.ts`, 应该让用户将变量结构定义发送给你, 并去除开头的 `import` 和结尾的 `$(...)`:

```ts
// ⬇️应该去除
import { registerMvuSchema } from 'https://testingcf.jsdelivr.net/gh/StageDog/tavern_resource/dist/util/mvu_zod.js';

export const Schema = z.object({
  好感度: z.coerce.number().transform(value => _.clamp(value, 0, 100)),
});

// ⬇️应该去除
$(() => {
  registerMvuSchema(Schema);
});
```

## 自行解析变量

当酒馆因用户输入或 AI 输出等而产生新消息楼层时, MVU 会自动解析消息字符串中的 MVU 命令, 并根据它更新消息楼层变量. 但通过 `generate` 等接口自行生成 AI 输出时, 不会产生新消息楼层, 因此不会自动解析 MVU 命令.

为此, MVU 提供了 `parseMessage` 接口用于自行解析包含 MVU 命令的消息字符串. 它读取旧变量情况和一个消息字符串, 得到更新后的变量结果.

```ts
await waitGlobalInitialized('Mvu');

// 获取旧变量
const old_data = Mvu.getMvuData({ type: 'message', message_id: getCurrentMessageId() });

// 请求 AI 生成
const message = await generate({ user_input: '你好' });

// 解析生成结果
const data = await Mvu.parseMessage(message, old_data);
```

为了更好的细粒度控制, 解析不会将结果写回消息楼层, 你可以自行选择如何使用 AI 回复 `message` 和变量更新结果 `data`.

也许这个 AI 请求只是为了专门进行一次变量更新, 那么你可以抛弃 `message`, 将 `data` 写回到当前楼层:

```ts
// 将更新后的变量写回楼层
await Mvu.replaceMvuData(data, { type: 'message', message_id: getCurrentMessageId() });
```

也许你是想让玩家直接在同层界面里玩 AI (具体请参考{doc}`/青空莉/工具经验/实时编写前端界面或脚本/index`), 这个 AI 请求是在请求 AI 回复剧情和更新变量, 那么你可以将回复和变量创建成新的楼层:

```ts
// 将回复和变量结果创建为新的楼层
await createChatMessages([{ role: 'assistant', message, data }]);
```

## 事件

MVU 还提供了一些事件 (`Mvu.events.xxx`), 用于监听变量变化并在那时调整变量或执行其他功能.

### COMMAND_PARSED: 变量更新命令解析完成

通过监听 "变量更新命令解析完成" 事件 (`Mvu.events.COMMAND_PARSED`), 你可以获取到对应的变量更新命令, 并对其进行修复.

例如, 修复 gemini 在中文间加入的 `-`, 如将`角色.络-络`修复为`角色.络络`:

```js
await waitGlobalInitialized('Mvu');
eventOn(Mvu.events.COMMAND_PARSED, commands => {
  commands.forEach(command => {
    command.args[0] = command.args[0].replaceAll('-', '');
  });
});
```

又比如, 将繁体字修复为简体字, 如将`絡絡`修复为`络络`:

```js
import { toSimplified } from 'chinese-simple2traditional';

await waitGlobalInitialized('Mvu');
eventOn(Mvu.events.COMMAND_PARSED, commands => {
  commands.forEach(command => {
    command.args[0] = toSimplified(command.args[0]);
  });
});
```

### VARIABLE_UPDATE_ENDED: 变量更新结束

通过监听 "变量更新结束" 事件 (`Mvu.events.VARIABLE_UPDATE_ENDED`), 你可以获取到更新前后的变量, 可以对更新结果进行额外处理.

比如, 我们可以这样弹窗显示更新前后的变量值:

```js
await waitGlobalInitialized('Mvu');
eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (new_variables, old_variables) => {
  toastr.info(`更新前的白娅依存度是: ${_.get(old_variables, 'stat_data.白娅.依存度')}`);
  toastr.info(`更新后的白娅依存度是: ${_.get(new_variables, 'stat_data.白娅.依存度')}`);
});
```

或者, 我们可以这样修改更新后的变量值:

```js
await waitGlobalInitialized('Mvu');
eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, variables => {
  // 不管更新成了多少, 强行把白娅依存度改成 0
  _.set(variables, 'stat_data.白娅.依存度', 0);
});
```

由此我们可以做非常多功能.

其中一些是在 `schema.ts` 中能用 zod 4 直接做到的:

::::{tabs}

:::{tab} 限制依存度在 0 和 100 之间

```js
await waitGlobalInitialized('Mvu');
eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, variables => {
  _.update(variables, 'stat_data.白娅.依存度', value => _.clamp(value, 0, 100));
});
```

:::

:::{tab} 如果数量不为正数应该直接删除物品

```js
await waitGlobalInitialized('Mvu');
eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, variables => {
  _.update(variables, 'stat_data.主角.物品栏', data => _.pickBy(data, ({数量}) => 数量 > 0));
});
```

:::

:::{tab} 称号有数量上限，依存度越高越多

```js
await waitGlobalInitialized('Mvu');
eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, variables => {
  _.update(variables, 'stat_data.白娅.称号', data =>
    _(data)
      .entries()
      .takeRight(Math.ceil(_.get(variables, 'stat_data.白娅.依存度') / 10))
      .value(),
  );
});
```

:::

:::{tab} 记录好感度第一次超过 30

```js
await waitGlobalInitialized('Mvu');
eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, variables => {
  if (_.get(variables, 'stat_data.白娅.依存度') > 30) {
    _.set(variables, 'stat_data.$flag.白娅依存度突破30', true);
  }
});
```

:::

:::{tab} 青空莉死了!

```js
await waitGlobalInitialized('Mvu');
eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, variables => {
  if (_.get(variables, 'stat_data.青空莉.死亡') === true) {
    // 删除所有与青空莉相关的变量
    _.unset(variables, 'stat_data.青空莉');
  }
});
```

:::

::::

但 `schema.ts` 无法获取以前的变量情况, 因此无法利用 `old_variables` 做到下面这些:

::::{tabs}

:::{tab} 限制依存度变动幅度不超过 3

```js
await waitGlobalInitialized('Mvu');
eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (new_variables, old_variables) => {
  const old_value = _.get(old_variables, 'stat_data.白娅.依存度');

  // 新的好感度必须在 旧好感度-3 和 旧好感度+3 之间
  _.update(new_variables, 'stat_data.白娅.依存度', value => _.clamp(value, old_value - 3, old_value + 3));
});
```

:::

:::{tab} 检测依存度突破 30

```js
await waitGlobalInitialized('Mvu');
eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (new_variables, old_variables) => {
  const old_value = _.get(old_variables, 'stat_data.白娅.依存度');
  const new_value = _.get(new_variables, 'stat_data.白娅.依存度');
  if (old_value < 30 && new_value >= 30) {
    toastr.success('白娅依存度突破 30 了!');
  }
});
```

:::

:::{tab} 让 AI 不能更新变量

```js
await waitGlobalInitialized('Mvu');
eventOn(Mvu.events.VARIABLE_UPDATE_ENDED, (new_variables, old_variables) => {
  // 强行将新的白娅依存度设置为旧的, 从而取消 AI 对它的更新
  _.set(new_variables, 'stat_data.白娅.依存度', _.get(old_variables, 'stat_data.白娅.依存度'));
});
```

:::

::::

## 字段前缀（工坊补充，2026-10-29 按源码核对）

> 来源：酒馆助手 `src/function/macro_like.ts`（JS-Slash-Runner main 分支）、MagVarUpdate beta 分支源码。

| 前缀 | 实际效果 | 由谁实现 | 用途 |
|---|---|---|---|
| `$` | **硬隐藏**：`{{format_message_variable::…}}`、`{{get_message_variable::…}}` 等宏会深度剔除所有 `$` 开头的键（`omitDeepBy(值, (_, key) => key.startsWith('$'))`），AI 在变量列表里看不到，也就无从修改 | 酒馆助手的变量宏 | 真相、后台计算数据、会剧透的内容。脚本（`getVariables`、`Mvu` 接口）、EJS（`getvar`）、界面照常读写 |
| `_` | **软只读**：AI 看得见；「不要改」只是固定条目「变量输出格式」里的一句 `don't update field names starts with _ as they are readonly`。MVU 源码里没有拦截，AI 硬要改也会生效 | 提示词约定 | AI 需要看到、但不该由它改的字段（如副本章节）。要硬只读，用上一节「让 AI 不能更新变量」的写法：监听 `VARIABLE_UPDATE_ENDED`，把 `_` 字段恢复成 `old_variables` 里的值 |

注意：用 EJS 自己拼变量列表、只展示一部分字段，会让被藏起来的字段 AI 也改不了（它不知道有这个字段）。想对 AI 隐藏的，用 `$` 前缀，不要靠手工过滤。
