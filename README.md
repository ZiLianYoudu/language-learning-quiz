# 每日语言练习

> AI 驱动的每日语言学习内容生成 + 本地网页答题应用。
> 支持英语（CET-6）、日语（零基础→N5），零依赖、完全离线。

## 特性

- **AI 生成内容**：每日单词、短语、语法、阅读 + 5 类练习题（约 21 题）
- **5 种题型**：选词填空、语法填空、短语配对、判断、翻译（自评）
- **即时反馈**：每题提交后立即显示对错与解析，结算页可重做错题
- **学习材料侧栏**：答题时随时查看单词、短语、语法、阅读原文
- **错题本**：跨天聚合错题，可集中重练
- **间隔复习**：AI 生成时可读取错题记录，在新课中自然融入复习点
- **进度自动存档**：每答一题即保存到本地（`progress.json` + `progress.log`），清缓存不丢
- **语音朗读**：单词、例句、阅读可点击 🔊 朗读（使用系统语音）
- **深色模式**：自动适配系统主题
- **多语言轨道**：英语和日语各自独立进度，按语言显示不同 UI 文案

## 快速开始

### 环境要求

- Python 3.8+（标准库，无需 `pip install`）
- 现代浏览器（Edge / Chrome / Firefox / Safari）

### 1. 生成学习内容

用任意 LLM 加载 `prompts/english.md`（或 `prompts/japanese.md`），
让它生成符合 `docs/SCHEMA.md` 的 quiz.json，保存到 `daily/YYYY-MM-DD.quiz.json`。

> **用 Claude Code**：说"生成今日学习内容"或 `/daily-english`，
> 它会自动调用 agent 生成并运行构建脚本。

### 2. 开始答题

**Windows**：双击 `刷题.bat`

**macOS / Linux**：
```bash
make run        # 构建数据 + 启动服务 + 打开浏览器
# 或分步执行：
make build      # 仅构建数据
make serve      # 仅启动服务
```

浏览器会自动打开 `http://127.0.0.1:8399/`。

## 项目结构

```
languagelearning/
├── docs/
│   ├── PROJECT_SKETCH.md        ← 项目改造路线图
│   ├── SCHEMA.md                ← quiz.json 格式契约（核心文档）
│   └── CONTRIBUTING.md          ← 贡献指南（待写）
│
├── prompts/                     ← 给 LLM 的生成 prompt（工具无关）
│   ├── english.md               ← 英语生成规范
│   ├── japanese.md              ← 日语生成规范（五十音→N5→阅读）
│   └── cet6.md                  ← CET-6 生成规范
│
├── web/
│   ├── index.html               ← 答题应用入口
│   ├── css/style.css            ← 样式
│   ├── js/app.js                ← 应用逻辑
│   ├── js/i18n.js               ← 前端多语言文案
│   └── data.js                  ← 自动生成，勿手工编辑
│
├── daily/                       ← 每日内容（json 是唯一数据源）
│   ├── 2026-09-28.quiz.json
│   └── 2026-09-28-ja.quiz.json
│
├── build_data.py                ← 构建脚本：校验 → 生成 data.js
├── server.py                    ← 本地服务：静态页面 + 进度存档 API
├── Makefile                     ← 跨平台构建入口
├── 刷题.bat                     ← Windows 启动器
├── .gitignore
├── LICENSE                      ← MIT
└── README.md                    ← 本文件
```

## 数据流

```
LLM 生成                      构建                        使用
────────────                ────────────                ────────────
prompts/english.md   →                             →
                         build_data.py      →   web/data.js
daily/日期.quiz.json       · 校验 SCHEMA.md           （网页加载）
（唯一数据源）             · 按日期汇总
                           · 渲染归档 md            make run / 刷题.bat
                                                   → 本地服务(127.0.0.1:8399)
                                                   → 浏览器答题
                                                       ↓ 每答一题
                                                  progress.json / progress.log
```

## 答题操作

| 题型 | 操作 |
|------|------|
| 单选（选词填空等） | 鼠标点选项，或按 `1-9` / `A-J` 直接选中即判 |
| 填空（语法填空） | 输入后 `Tab` / `Enter` 跳到下一空，最后一空 `Enter` 提交 |
| 配对（短语匹配） | 先点左侧、再点右侧完成配对，`Enter` 提交 |
| 判断（阅读理解） | 按 `T` / `F`，或 `←` / `→` |
| 翻译（自评题） | 文本框作答 → `Ctrl+Enter` 看参考答案 → `Y`（答对了）/ `N`（没答好）自评 |

**通用快捷键**

| 按键 | 作用 |
|------|------|
| `Enter` | 提交 / 下一题 / 查看结算 |
| `←` `→` | 上一题 / 下一题 |
| `M` | 打开 / 关闭学习材料侧栏 |
| `Esc` | 关闭侧栏 / 返回列表 |

## 添加新语言

1. 写 `prompts/xxx.md`（生成规范，参考 `prompts/english.md`）
2. 在 `web/js/i18n.js` 的 `I18N` 对象中加一个语言条目
3. 生成内容时使用 `"language": "xxx"` 字段

前端 UI 文案、语音选择、归档 md 标题会自动跟随 `language` 字段切换。

## 常见问题

**打开页面显示"未找到数据文件"**
→ 运行 `make build`（或双击 `刷题.bat`）重新构建。

**想重做某一天**
→ 打开该天 → 结算页有「全部重做」；或清除浏览器 localStorage。

**进度存在哪里**
→ 每答一题自动写入 `progress.json`（状态）和 `progress.log`（日志），同时镜像一份在浏览器 localStorage。

**日语朗读没声音**
→ 网页朗读用系统语音。用 Edge 打开通常开箱即用；Chrome 需要先在系统设置中添加日语语音包。

## License

MIT
