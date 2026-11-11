> 来自预设「📚什么是MVU」：MVU Zod 变量系统概览。**与 `references/MVU-现行规则.md` 冲突时，以现行规则为准**（如输出指令集的操作类型、固定条目的拆分）。

<knowledge_MVU_Zod>
【知识库·MVU Zod变量系统】
SillyTavern MVU Zod变量管理系统技术指南

概述

MVU Zod是一套类型安全的变量管理框架，运行于酒馆助手环境。该系统通过Zod Schema提供类型定义与运行时验证，使用JSON Patch标准执行变量更新操作。

核心特性：
- 类型安全：Zod 4.x Schema定义变量结构与约束
- 运行时验证：所有变量更新经Schema校验后生效
- 标准化操作：采用JSON Patch (RFC 6902)更新格式
- 幂等保证：支持增量更新，重复解析结果一致

系统优势：
- 状态栏永不掉落：标签由脚本注入，格式恒定
- 节省AI注意力：仅输出变化的变量更新指令
- 边界强制约束：数值范围由Schema层自动钳制
- 操作语义明确：四种标准操作类型，无歧义

---

系统架构

MVU Zod由5个部分组成，按顺序依赖：

<Mvu_Zod_Protocol1> 变量结构
  格式：JavaScript脚本
  职能：使用Zod Schema定义变量类型、结构与验证规则
  输出内容：变量结构脚本

<Mvu_Zod_Protocol2> 变量初始化
  格式：YAML
  职能：基于Schema生成符合类型约束的初始值
  输出内容：变量初始化内容

<Mvu_Zod_Protocol3> 
变量更新规则
  格式：YAML
  职能：为每个变量制定更新触发条件与逻辑
  输出文件：变量更新规则

变量处理指令集
  格式：YAML
  职能：向AI展示当前状态，规定JSON Patch输出格式
  输出内容：变量处理指令集

<Mvu_Zod_Protocol4>  动态内容展示
  实现方式：EJS条件判断
  职能：根据变量值动态调整角色行为或世界内容

<Mvu_Zod_Protocol5> HTML状态展示
  职能：为女主角提供可视化状态界面

---

核心概念

1. Zod Schema

Schema定义变量的类型、结构与验证规则。所有变量更新在写入前经过Schema校验。

基础类型定义：
```javascript
import { z } from 'zod'
import _ from 'lodash'

const Schema = z.object({
  好感度: z.coerce.number()
    .transform(v => _.clamp(v, 0, 100)),
  心情: z.string(),
  记忆: z.array(z.string())
}).strict()
```

关键设计原则：

类型转换优先
使用z.coerce.number()自动将字符串转为数字，避免AI输出类型错误

边界强制约束
使用z.transform()配合_.clamp()强制钳制数值范围
Schema层直接修正越界值，无需依赖AI遵守规则

对象优于数组
使用z.record()定义键值对结构，便于通过键名直接访问
避免数组索引定位的复杂性

幂等操作保证
Schema设计需满足：Schema.parse(Schema.parse(data)) === Schema.parse(data)
使用prefault()而非default()设置默认值

2. JSON Patch

变量更新采用JSON Patch标准(RFC 6902)，路径格式遵循JSON Pointer(RFC 6901)。

路径格式规范：
- 使用斜杠分隔层级：/角色/歧令羽/好感度
- 数组指定位置用索引：/记忆/0
- 数组末尾追加用减号：/记忆/-
- 对象键名直接书写：/世界/时间

四种操作类型：

replace 替换现有值
```json
{ "op": "replace", "path": "/好感度", "value": 75 }
```

add 添加新项
```json
{ "op": "add", "path": "/记忆/-", "value": "新增记忆内容" }
{ "op": "add", "path": "/角色/新角色", "value": { "亲密度": 0 } }
```

remove 删除项
```json
{ "op": "remove", "path": "/记忆/0" }
```

move 移动项
```json
{ "op": "move", "from": "/记忆/0", "path": "/记忆/3" }
```

3. 宏

宏在消息发送时被替换为实际变量值。

批量展示宏：
```
{/{format_message_variable::stat_data}/}
```
该宏将所有变量以格式化方式展示给AI。

---

模块详解

模块1 变量结构

使用Zod Schema定义变量结构。

示例：
```javascript
import { z } from 'zod'
import _ from 'lodash'

const Schema = z.object({
  角色: z.record(
    z.object({
      好感度: z.coerce.number()
        .transform(v => _.clamp(v, 0, 100)),
      心情: z.string(),
      衣着: z.string()
    })
  ),
  世界: z.object({
    日期: z.string(),
    时间: z.string()
  }),
  记忆: z.array(z.string())
}).strict()

export default Schema
```

注意事项：
- 仅在女主角明确要求时添加验证约束
- 使用z.transform()进行范围限制
- 避免使用.min()/.max()等抛出错误的验证方法
- 使用.strict()禁止Schema外的额外字段

模块2 变量初始化

基于Schema结构生成初始值。

示例：
```yaml
世界:
  日期: 01-01
  时间: 08:00
角色:
  空条承太郎:
    好感度: 80
    心态: 充满探究
    衣着: 黑色羊毛定制校服
  花京院典明:
    好感度: 90
    心态: 警惕困惑
    衣着: 绿色校服
记忆: []
```

规范：
- 所有值必须符合Schema定义的类型
- 仅包含变量名和初始值
- 不包含更新规则

模块3 变量更新规则与指令集

为变量制定更新触发条件。

示例：
```yaml
世界.时间:
  check:
    - 根据场景描述中的时间流逝更新
角色.好感度:
  check:
    - 角色注意到玩家行为时，根据态度调整±1至4
    - 重大事件可突破常规变化幅度
角色.心态:
  check:
    - 根据当前剧情和角色性格调整
```

规范：
- 类型和范围约束已在Schema中定义，此处可省略
- check字段描述触发更新的条件
- 可合并相似规则简化描述

变量处理指令集：

向AI展示变量状态并规定输出格式。

示例：
```yaml
当前状态: |
  {/{format_message_variable::stat_data}/}

更新规则引用: 参照模块2定义的check条件

输出格式: |
  在回复末尾输出变量更新，格式如下：
  <update>
  <analysis>
  简述变量变化原因（英语，不超过80词）
  </analysis>
  [
    { "op": "操作类型", "path": "/变量路径", "value": 新值 }
  ]
  </update>

操作类型说明:
  - replace: 替换现有值
  - add: 向数组末尾添加（路径以/-结尾）或向对象添加新键
  - remove: 删除数组项或对象键
  - move: 移动数组项位置
```

模块4 动态内容构建

使用EJS模板引擎根据变量值条件渲染内容。

应用场景：
- 分阶段角色设定：好感度变化触发不同行为模式
- 动态世界内容：场景描述、事件触发

实现依赖提示词模版插件。

模块5 HTML状态展示

通过正则替换实现状态栏可视化。

工作原理：
1. MVU脚本在AI回复末尾注入固定标签
2. 正则表达式捕获该标签
3. 替换为HTML状态栏代码
4. 状态栏从MVU变量数据库读取数值

优势：标签格式固定，不受AI输出质量影响。

---

完整工作流程

1. 玩家发送消息
2. 宏被替换为变量数据库中的当前值
3. AI接收替换后的消息
4. AI生成回复，包含剧情内容和JSON Patch更新指令
5. MVU脚本解析指令，经Schema验证后更新数据库
6. 状态栏标签被正则替换为可视化界面
7. 玩家看到完整回复和更新后的状态栏

---

配置检查清单

□ MVU Zod脚本已加载
□ 变量结构已创建（<Mvu_Zod_Protocol1>）
□ 变量初始化已创建（<Mvu_Zod_Protocol2>）
□ 变量更新规则与变量处理指令集已创建（<Mvu_Zod_Protocol3>）
□ 所有路径使用斜杠分隔符
□ 更新指令采用JSON Patch格式
□ 状态栏正则已配置（<Mvu_Zod_Protocol5>，若需可视化）

---

常见问题

数值超出范围如何处理
Schema层使用z.transform()配合_.clamp()自动钳制，无需AI遵守

AI输出类型错误如何处理
z.coerce系列方法自动转换类型，字符串"50"自动转为数字50

如何访问嵌套对象中的值
使用JSON Pointer路径：/角色/歧令羽/好感度

如何向数组添加元素
路径末尾使用/-表示追加：/记忆/-

</knowledge_MVU_Zod>
