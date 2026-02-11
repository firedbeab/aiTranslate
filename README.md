# AI Translation Assistant — Browser Extension

A lightweight, AI-powered browser extension for English-to-Chinese translation. Select any word or paragraph on a webpage and get instant, context-aware translations in a sleek floating panel — powered by Alibaba Cloud's Qwen LLM via a streaming API.

Built with **Manifest V3**, works on **Chrome** and **Edge**.

## Highlights

- **Select & Translate** — Highlight any text; single words get concise definitions, sentences get full translations.
- **Streaming Output** — Results appear token-by-token in real time via SSE streaming.
- **Vocabulary Deep Dive** — One-click detailed explanations (POS, definitions, example sentences, usage tips) and keyword extraction from paragraphs.
- **Full-Page Translation** — Translate all visible English text on a page (including iframes) with one click; restore anytime.
- **Dynamic Content Awareness** — After full-page translation, a MutationObserver automatically detects and translates newly loaded content (infinite scroll, lazy loading, etc.).
- **Online Document Mode** — For Canvas-rendered documents (Google Docs, Office Online) where text selection doesn't work: enable this mode and every copy action triggers an automatic translation.
- **Translation History** — Auto-saved, searchable, with favorites, detail view, and JSON import/export.
- **Context-Aware** — Captures surrounding paragraph text to give more accurate definitions.
- **Caching** — Identical queries hit a local cache instead of the API.
- **Dark UI** — Minimal, non-intrusive floating panel with Markdown rendering.

---

## 项目概览

### 功能一览

| 功能 | 说明 |
|------|------|
| 划词翻译 | 选中单词→简明释义；选中句段→中文翻译，右下角浮窗显示 |
| 详细讲解 | 单词的词性、中英释义、例句、用法提示 |
| 提取难词 | 段落翻译后 AI 提取 3-5 个关键词，可逐个点击查看详解 |
| 整页翻译 | 一键翻译页面所有英文文本（含 iframe），可一键还原 |
| 动态内容监听 | 整页翻译后自动检测新加载的内容并翻译，适合无限滚动页面 |
| 在线文档模式 | 针对 Google Docs 等 Canvas 文档，开启后复制即翻译 |
| 流式输出 | SSE 流式 API，翻译结果逐字实时显示 |
| 上下文分析 | 自动捕获选词周围段落（最多300字）辅助翻译 |
| 翻译缓存 | 相同内容不重复调用 API |
| 历史记录 | 自动保存（上限200条），词汇合并，收藏/删除/导出/导入 |
| 模型切换 | 支持 qwen-turbo / qwen-plus / qwen-max 及自定义模型 |

### 技术栈

- **平台**：Chrome / Edge Extension（Manifest V3）
- **API**：阿里云百炼（通义千问），OpenAI 兼容格式
- **架构**：Service Worker (background.js) + Content Script (content.js) + Popup UI
- **流式传输**：fetch + ReadableStream（MV3 不支持 EventSource）
- **存储**：chrome.storage.sync（设置）+ chrome.storage.local（历史）

### 文件结构

```
aiTranslation/
├── manifest.json              # 扩展配置
├── package.json
└── src/
    ├── background.js          # Service Worker：API 调用、流式输出、缓存、历史管理、窗口管理
    ├── content.js             # 内容脚本：划词检测、浮窗 UI、动态监听、在线文档模式
    └── popup/
        ├── popup.html / js    # 主界面：翻译按钮、模型切换、在线文档开关、历史列表
        ├── settings.html / js # 设置：API Key、模型管理、导入导出
        ├── help.html / js     # 使用指南
        └── history.html / js  # 历史详情（独立弹窗）
```

### 快速开始

1. 获取 [阿里云百炼 API Key](https://bailian.console.aliyun.com/)（新用户有免费额度）
2. 下载或 clone 本仓库
3. 打开 `edge://extensions/` 或 `chrome://extensions/`，开启「开发者模式」
4. 点击「加载已解压的扩展」，选择项目根目录
5. 点击扩展图标 → 设置 → 粘贴 API Key → 保存
6. 在任意英文网页上选中文字即可使用

### 使用场景

| 场景 | 操作 |
|------|------|
| 阅读英文文章，遇到生词 | 选中单词 → 浮窗显示释义 → 点击「详细讲解」 |
| 阅读长段落 | 选中段落 → 中文翻译 → 点击「提取难词」逐个学习 |
| 快速浏览整个英文页面 | 点击扩展图标 → 整页翻译，滚动加载的内容自动翻译 |
| 使用 Google Docs 等在线文档 | 开启「在线文档模式」→ 复制内容即自动翻译 |
| 复习已翻译的词汇 | 扩展图标 → 历史记录 → 词汇 / 句段分类查看 |

### 已知限制

- Canvas 渲染文档（Google Docs、Office Online）无法划词翻译，需使用「在线文档模式」
- 扩展更新后需刷新页面（已有保护机制不会卡死）
- 部分网站 CSP 可能限制剪贴板读取

### License

MIT
