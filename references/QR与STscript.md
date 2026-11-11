> 来自预设「📚什么是QR」：SillyTavern 快速回复（Quick Replies，简称 QR）与 STscript 的核心知识。
> 改动：原条目要求输出转义符（`\|`、`\{\{ \}\}`、`\{:` `:\}`），是为了防止脚本贴在聊天里被酒馆直接执行。本项目把脚本写进文件交付，**一律写真实符号**，下文示例已还原，女主角复制即可使用。

# 知识库：QR 与 STscript

## 1. QR 是什么

QR 是 SillyTavern 的「快捷回复 / 快捷脚本按钮」。
一个 QR 按钮可以存放一段文字，也可以存放一段 STscript。
用户点击按钮后，QR 会把内容发送、填入输入框，或执行脚本。

QR 常用于：

- 常用发言模板
- 快捷剧情指令
- 调试按钮
- 一键触发 AI 回复
- 给状态栏 / 世界书 / 正则前端提供操作入口

QR 预设组**不在角色卡里**：tavern_sync 不能把它打进卡，需要女主角在酒馆的 QR 面板里手动创建（或导入 QR 预设组文件）。

## 2. STscript 最小语法

STscript 是「斜杠命令 + 管道」的脚本语言。

基本结构：

```stscript
/command 参数=value | /next_command
```

常用概念：

- `/命令`：执行一个动作
- `|`：管道，把前一个命令结果传给后一个命令
- `||`：阻断自动传参
- `{{input}}`：当前输入框内容
- `{{pipe}}`：上一个命令传来的内容
- `{{getvar::name}}`：读取变量

常用变量命令：

- `/setvar key=name value=内容`：设置本地变量
- `/getvar name`：读取本地变量
- `/setglobalvar key=name value=内容`：设置全局变量
- `/getglobalvar name`：读取全局变量

常用交互命令：

- `/echo value=内容`：弹出提示，用于反馈或调试
- `/input 提示文本`：弹出输入框，并把用户输入传给下一条命令
- `/setinput value=内容`：把内容填入用户输入框
- `/send 内容`：以用户身份插入或发送内容
- `/sendas name=角色名 内容`：以指定角色身份插入消息；可用 `name={{char}}` 表示当前角色
- `/sys 内容`：插入系统消息
- `/comment 内容`：插入隐藏评论 / 辅助内容
- `/trigger`：触发 AI 回复
- `/inject 内容`：临时注入提示词到上下文
- `/getchatbook create=true或false`：获取或创建当前聊天世界书
- `/createentry file=世界书名 key=关键词 内容`：创建新的世界书条目
- `/getentryfield file=世界书名 field=content 条目UID`：读取世界书条目内容（UID 写在命令末尾）
- `/setentryfield file=世界书名 uid=条目UID field=content 内容`：写入世界书条目内容
- `/setentryfield file=世界书名 uid=条目UID field=disable 1/0`：关闭 / 开启指定世界书条目
- `/genraw 提示词`：静默生成内容，常用于生成草稿后再保存
- `/if left=A right=B rule=规则 else={: 失败命令 :} {: 成功命令 :}`：条件分支
- `/abort`：中止后续脚本

## 3. QR 的创建与调用

QR 按钮的创建、修改、删除、启用，需要女主角在 SillyTavern 的 QR 面板里操作：
右上角积木按钮 → 快速回复 → 编辑快速回复 → 创建 QR（+ 号）。

从另一个 QR 或高级美化按钮调用已有 QR：

```stscript
/:按钮名
/:预设组.按钮名
/run 预设组.按钮名
```

## 4. 常见设计模式

模式 A：把内容填入输入框
适合「帮用户准备一段话，但不直接发送」。

```stscript
/setinput value="请根据当前状态栏总结我的处境。"
```

模式 B：一键触发 AI 回复
适合「用户点按钮后，让 AI 按某个方向继续」。

```stscript
/send 继续推进当前剧情 | /trigger
```

模式 C：插入当前角色楼层
适合「让按钮生成一条当前角色名义的提示 / 面板 / 楼层」。

```stscript
/sendas name={{char}} 已刷新状态栏。
```

模式 D：检查输入框是否为空
适合「用户需要先填写内容」的按钮。

```stscript
/setvar key=user_input {{input}} |
/if left={{getvar::user_input}} right="" rule=eq
  "/echo severity=warning 请先在输入框填写内容"
  "/echo severity=success 已读取输入内容"
```

模式 E：条件分支
适合「确认后继续、输入不合格就中止、根据选择执行不同动作」。

```stscript
/input 请输入确认词 |
/if left={{pipe}} right="确认" rule=eq
  else={:
    /echo severity=warning 已取消 |
    /abort
  :}
  {:
    /echo severity=success 已确认 |
    /trigger
  :}
```

说明：

- `left` / `right`：比较双方
- `rule`：比较规则，常用 `eq` 等于、`neq` 不等于、`gt` / `gte` 大于 / 大于等于、`lt` / `lte` 小于 / 小于等于、`in` / `nin` 包含 / 不包含
- `else`：条件不成立时执行
- 最后一个闭包：条件成立时执行
- `/abort`：中止后续脚本

模式 F：连续弹窗收集信息
适合「剧情输入、设定收集、任务表单」等多步输入按钮。

```stscript
/input 请提供剧情方向 |
/setvar key=plot_setting |
/input 请提供背景设定 |
/setvar key=background_setting |
/send "<request>
剧情方向：{{getvar::plot_setting}}
背景设定：{{getvar::background_setting}}
</request>"
```

说明：

- `/input` 的结果会进入管道
- `/setvar key=变量名` 不写 value 时，会接收上一条命令的管道内容
- 最后用 `/send` 汇总成一条请求
- 若希望立刻触发 AI 回复，可在末尾追加 `| /trigger`

模式 G：调用另一个 QR
适合把常用逻辑拆成多个小按钮。

```stscript
/:星辰工坊工具.刷新状态
```

模式 H：临时注入提示词再触发回复
适合做轻量剧情引导。

```stscript
/inject 请在下一次回复中优先检查主线剧情是否需要推进 | /trigger
```

## 5. 和状态栏 / 前端美化的关系

QR 可以通过 `triggerSlash` 桥接，扩展前端美化 / 状态栏的交互，详见 `references/高级美化.md`。

推荐分工：

- 世界书：保存状态栏规则、字段规范、输出格式
- 正则：捕获标签并替换成前端页面
- QR：提供按钮入口，执行短脚本或快捷指令
- AI：根据世界书规范生成或更新状态栏内容
