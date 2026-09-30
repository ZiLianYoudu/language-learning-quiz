# Quiz JSON Schema

> 本文件定义 `daily/YYYY-MM-DD.quiz.json` 的数据格式。
> 它是内容生成者（AI 或人工）与消费者（网页答题应用）之间的契约。
> AI 生成内容时必须遵守此文档；`src/validate.py` 的校验逻辑与本文档保持一致。

---

## 文件命名

| 语言 | 文件名格式 | `id` 字段 |
|------|-----------|-----------|
| 英语 | `YYYY-MM-DD.quiz.json` | `YYYY-MM-DD` |
| 日语 | `YYYY-MM-DD-ja.quiz.json` | `YYYY-MM-DD-ja` |
| CET-6 | `YYYY-MM-DD_CET6.quiz.json` | `YYYY-MM-DD_CET6` |

同一天可以有多份不同语言的 json，用 `id` 区分。

---

## 顶层结构

```jsonc
{
  "id": "2026-09-28",               // 必填，= 文件名去掉 .quiz.json，全局唯一
  "date": "2026-09-28",             // 必填，YYYY-MM-DD，合法日期
  "weekday": "Monday",              // 必填，英文星期
  "level": "Intermediate",          // 必填，难度描述
  "theme": "Health & Wellness",     // 必填，当日主题
  "language": "en",                 // 必填，"en" | "ja" | 其他语言代码

  "study": { ... },                 // 学习材料（见下方）
  "exercises": [ ... ]              // 练习题（见下方，约 20-21 题）
}
```

---

## `study` — 学习材料

网页"材料"面板展示的内容。所有字段均为必填（除非标注可选），但渲染端做了防御性处理，缺失时不崩溃。

```jsonc
"study": {
  "vocabulary": [                   // 必填，通常 5 个
    {
      "word": "resilient",          // 必填，单词/词条
      "ipa": "/rɪˈzɪliənt/",       // 必填，音标或读音
      "pos": "adj.",                // 必填，词性
      "meaningCn": "有韧性的",       // 必填，中文释义
      "meaningEn": "Able to...",   // 可选，英文释义
      "notes": "用法点睛...",        // 可选，markdown 字符串
      "examples": [                 // 必填，2-3 个
        { "en": "She is a **resilient** person.", "zh": "她是个有韧性的..." }
        // 英语用 en/zh 字段；日语用 ja/zh 字段
      ]
    }
  ],

  "phrases": [                      // 必填，通常 3 个
    {
      "phrase": "bounce back",
      "meaningCn": "恢复，东山再起",
      "examples": [ { "en": "...", "zh": "..." } ]
    }
  ],

  "grammar": {                      // 必填
    "title": "Present Perfect vs. Past Simple",
    "content": "markdown 字符串，支持标题/表格/列表/加粗/引用"
  },

  "reading": {                      // 必填
    "title": "Why Sleep Matters",
    "passage": "markdown 字符串（多段落用空行分隔）",
    "translation": "中文全文翻译",
    "vocab": [                      // 可选，8-10 个生词
      { "word": "deprivation", "ipa": "/ˌdeprɪˈveɪʃn/", "meaningCn": "剥夺" }
    ]
  },

  "culture": "可选，markdown 字符串",
  "quote": "可选，今日名言（含作者）"
}
```

### 日语字段差异

日语学习材料中以下字段有不同约定：

| 字段 | 日语约定 |
|------|----------|
| `vocabulary[].ipa` | 五十音阶段 = 罗马音；词汇阶段 = `"假名读音 (罗马音)"` |
| `vocabulary[].meaningEn` | 可省略，或放用法/字形记忆技巧 |
| `examples[].ja` | 替代 `en` 字段；汉字用括号标注假名读音，如 `"私（わたし）は学生です"` |

---

## `exercises` — 练习题

5 种题型，约 20-21 题，按 section 顺序排列。每题必填 `explanation`（match 可选）。

### 类型 1：`choice` — 选词填空

```jsonc
{
  "type": "choice",
  "section": "选词填空",
  "prompt": "It takes time for new employees to ___ to the company culture.",
  "options": ["adapt", "adopt", "adept", "assert"],   // 必填，4-5 个，至少 2 项
  "optionsCn": ["适应", "收养", "熟练的", "断言"],      // 必填，与 options 等长，每项的中文释义
  "sentenceCn": "新员工需要时间才能适应公司文化。",      // 必填，整句的中文翻译
  "answer": 0,                 // 必填，正确选项下标（0 起）
  "explanation": "adapt to 固定搭配，表示「适应」"       // 必填
}
```

**前端行为**：答完后展示所有选项的中文释义（正确答案高亮）+ 整句翻译。

### 类型 2：`fill` — 语法填空

```jsonc
{
  "type": "fill",
  "section": "语法填空",
  "prompt": "If I ___ (have) enough money, I ___ (buy) a house by the sea.",
  "blanks": [
    {
      "word": "have",                  // 必填，所填词的原形
      "accepted": ["had"],             // 必填，可接受答案（可多个，大小写不敏感）
      "hint": "have"                   // 可选，自定义提示（默认同 word）
    },
    {
      "word": "buy",
      "accepted": ["would buy"],
      "hint": "buy"
    }
  ],
  "explanation": "Second Conditional——与现实相反的假设"
}
```

**约束**：`prompt` 中 `___` 的数量必须等于 `blanks` 数量。

**前端行为**：每个输入框上方显示"原形: xxx"提示（来自 `word` 字段）。

### 类型 3：`match` — 配对

```jsonc
{
  "type": "match",
  "section": "短语匹配",
  "left": ["Get the hang of something", "Think outside the box", "Keep someone posted"],
  // 必填，不少于 2 项
  "right": ["掌握窍门，学会做某事", "跳出框框思考", "让某人了解最新情况"],
  // 必填，与 left 等长
  "pairs": [0, 1, 2],           // 必填，left[i] 对应的 right 下标，互不相同
  "explanation": "可选"
}
```

**注意**：生成时右侧顺序应打乱，使 `pairs` 非平凡（非 `[0,1,2,...]`）。

### 类型 4：`truefalse` — 判断

```jsonc
{
  "type": "truefalse",
  "section": "阅读理解",
  "statement": "The article says technology has made communication worse in every way.",
  "answer": false,              // 必填，布尔值 true/false
  "explanation": "文章说技术有好有坏，并非「in every way」都变差"
}
```

### 类型 5：`translate` — 翻译（自评题）

```jsonc
{
  "type": "translate",
  "section": "句子翻译",
  "direction": "zh2en",         // 必填，"zh2en" 中译英 / "en2zh" 英译中
  "source": "她还没有适应大学生活。",
  "reference": "She hasn't adapted to college life yet.",
  "keyPoints": ["adapt to", "现在完成时"],   // 可选，评分要点
  "explanation": "可选补充说明"
}
```

**日语约定**：`direction` 可以是 `zh2ja`（中→日）或 `ja2zh`（日→中）。

---

## 校验规则（摘要）

`src/validate.py` 会检查以下约束，违规时拒绝生成 `web/data.js`：

| 规则 | 说明 |
|------|------|
| `id` 唯一 | 与文件名日期一致 |
| `type` 合法 | 只能是 `choice`/`fill`/`match`/`truefalse`/`translate` |
| `choice.answer` | 必须是 `options` 的合法下标 |
| `choice.optionsCn` | 与 `options` 等长，非空字符串数组 |
| `choice.sentenceCn` | 非空字符串 |
| `fill.prompt` 中 `___` 数 | 等于 `blanks` 数量 |
| `fill.blanks[].accepted` | 非空字符串数组 |
| `fill.blanks[].word` | 非空字符串 |
| `match.pairs` | 长度等于 `left`，值是 `right` 的合法下标，互不相同 |
| `truefalse.answer` | 布尔值 |
| `translate.source/reference` | 非空字符串 |
| `explanation` | 非空字符串（match 可选） |

---

## 新增字段说明（v2）

以下字段在基础 schema 上新增，用于改善学习体验：

| 字段 | 题型 | 用途 |
|------|------|------|
| `choice.optionsCn` | choice | 每个选项的中文释义，答完后展示全选项对比 |
| `choice.sentenceCn` | choice | 整句翻译，帮助理解上下文 |
| `fill.blanks[].word` | fill | 所填词原形，前端显示为输入提示 |

旧数据不含这些字段也能正常运行（前端做了可选字段防御），但新生成内容应始终包含。
