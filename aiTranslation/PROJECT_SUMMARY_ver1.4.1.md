# PROJECT_SUMMARY_ver1.4

# AI 翻译助手 - 浏览器插件项目总结

## 项目概况

-   **类型**：Microsoft Edge 浏览器扩展（Manifest V3）
    
-   **功能**：基于 AI 大模型的英文翻译助手，支持划词翻译、整页翻译、难词提取、动态内容监听、在线文档模式等
    
-   **API**：阿里云百炼（通义千问），兼容 OpenAI 格式
    
-   **API 地址**：`https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
    
-   **当前版本**：v1.3.0（含最新修复和新功能）
    
-   **本地开发路径**：`D:\Dve\aiTranslation\`
    

---

## 文件结构

```text
aiTranslation/
├── manifest.json                  # 扩展配置（MV3）
├── package.json                   # 项目信息
└── icons/
    ├── icon16.png                 # 图标
    ├── icon48.png                 
    └── icon128.png
└── src/
    ├── background.js              # Service Worker（API调用、流式输出、缓存、历史记录管理、单例窗口管理）
    ├── content.js                 # 内容脚本（划词检测、浮窗UI、流式渲染、上下文捕获、难词点击、动态内容监听、在线文档模式）
    └── popup/
        ├── popup.html             # 主界面（翻译按钮、模型快速切换、在线文档模式开关、历史记录列表）
        ├── popup.js               # 主界面逻辑
        ├── settings.html          # 设置页面（API Key、模型管理、导入导出）
        ├── settings.js            # 设置页逻辑
        ├── help.html              # 使用指南（获取API教程、功能说明、联系方式）
        ├── help.js                # 帮助页关闭按钮
        ├── history.html           # 历史详情页（独立弹窗）
        └── history-detail.js      # 历史详情逻辑（简明/详细Tab、收藏、删除、立即获取）
```

---

## 已实现功能清单

### 核心翻译

1.  **划词翻译** — 选中网页文字自动触发翻译，右下角浮窗显示结果
    
2.  **单词模式** — 选中单个英文单词→简明释义，可点击「详细讲解」获取完整词汇分析
    
3.  **段落模式** — 选中句子/段落→中文翻译，可点击「提取难词」
    
4.  **整页翻译** — 一键翻译页面所有英文文本（使用 TreeWalker 遍历文本节点），支持 iframe
    
5.  **页面还原** — 翻译后可一键还原原始内容（常驻按钮，灰色/激活态切换）
    

### 智能特性

6.  **流式输出** — 使用阿里云 SSE 流式 API，翻译结果逐字实时显示（通过 background fetch + ReadableStream → chrome.tabs.sendMessage 推送 chunk 给 content.js）
    
7.  **上下文分析** — 划词时自动捕获周围段落文本（getSelectionContext，最多300字），发送给 AI 提供更准确的释义
    
8.  **翻译缓存** — background.js 中使用 Map 缓存所有翻译结果（划词、难词、整页逐条），相同内容不重复调 API，页面刷新时通过 beforeunload 通知清除
    
9.  **单词清理** — 选中文本首尾标点自动去除（cleanWord），支持连字符单词识别（如 well-known）
    

### 难词功能

10.  **提取难词** — AI 提取 3-5 个关键词，格式 `[词汇] | 词性 | 中文释义 | 简短说明`
    
11.  **难词可点击** — 提取结果中每个 `[word]` 渲染为可点击链接，点击查看详细讲解
    
12.  **内容栈导航** — 浮窗支持多层内容栈（翻译→难词列表→单词讲解），← 按钮逐层返回，返回时自动恢复对应层级的按钮绑定（metaStack 机制）
    
13.  **难词自动存历史** — 提取难词后自动解析每个词的简明释义并存入历史记录
    

### 动态内容监听（新增）

14.  **MutationObserver 自动翻译** — 整页翻译完成后自动启动 DOM 监听，检测页面新增的文本节点（如无限滚动加载的内容）并自动翻译
    
15.  **防抖批量处理** — 新增节点在 500ms 内合并，批量发送翻译请求，避免频繁 API 调用
    
16.  **状态联动** — popup 整页翻译按钮显示「监听中」状态（绿色边框），还原页面时自动停止监听
    

### 在线文档模式（新增）

17.  **Copy 事件监听** — 针对 Canvas 渲染的在线文档（Google Docs、Office Online 等无法划词翻译的场景），开启后监听用户的复制操作
    
18.  **自动读取剪贴板** — 复制事件触发后延迟 150ms 等待剪贴板写入，通过 `navigator.clipboard.readText()` 读取内容
    
19.  **复用浮窗翻译** — 读取到内容后直接调用 `handleSelection()`，复用划词翻译的完整流程（流式输出、详细讲解、提取难词等），结果显示在右下角浮窗
    
20.  **去重机制** — 相同内容不重复翻译
    
21.  **页面独立** — 每个页面有独立的 content.js 实例，开启/关闭互不影响，刷新页面自动重置
    
22.  **开关按钮** — popup 中提供开关按钮，显示当前状态（绿色=已开启，灰色=关闭）
    

### 历史记录

23.  **自动保存** — 翻译结果自动存入 chrome.storage.local，上限 200 条
    
24.  **词汇合并** — 同一单词的简明释义和详细讲解合并为一条记录
    
25.  **分类展示** — 历史列表分「词汇」和「句子/段落」两个 Tab
    
26.  **独立详情页** — 点击历史条目在 popup 旁边打开独立弹窗（单例复用），增强容错（位置参数异常时自动重试）
    
27.  **详情功能** — 简明/详细 Tab 切换、收藏/取消收藏、删除、长原文可展开、markdown 渲染
    
28.  **立即获取** — 详情页中无详细讲解时提供按钮直接调 API 获取
    
29.  **导出/导入** — JSON 格式，支持去重合并（在设置页操作）
    
30.  **二次确认清空** — 清空按钮需点两次确认，3 秒后自动恢复
    

### UI/UX

31.  **沉浸式滚动条** — 全局 4px 细滚动条，透明轨道 + 暗色滑块
    
32.  **Markdown 渲染** — 支持 **加粗**、*斜体*、`行内代码`、换行，浮窗和历史详情均适用
    
33.  **模型快速切换** — 主界面下拉框直接切换模型，切换即保存
    
34.  **模型管理** — 设置页支持添加/删除自定义模型，删除当前模型自动回退 qwen-turbo
    
35.  **单例窗口** — 设置/帮助/历史详情窗口均为单例，重复点击聚焦已有窗口，创建失败时自动去掉位置参数重试
    
36.  **API 未设置提醒** — 主界面顶部红色警告框 + 跳转设置链接
    
37.  **超时错误处理** — 15秒超时，HTTP 401/404/429 有对应中文提示
    
38.  **扩展上下文失效保护** — safeSendMessage 包装，扩展更新后不卡死，提示刷新页面
    

### iframe 支持

39.  **子 iframe 划词** — 子 frame 通过 postMessage 发送选中文字到顶层窗口统一处理
    
40.  **整页翻译含 iframe** — `all_frames: true` + `chrome.scripting.executeScript` 的 allFrames 选项
    

---

## 技术架构

### 通信流程

```text
[网页 content.js] ←→ [background.js Service Worker] ←→ [阿里云API]
       ↑                        ↑
    浮窗UI               chrome.storage (历史/设置)
       ↑                        ↑
  [iframe content.js]    [popup/settings/history 页面]
     (postMessage)         (chrome.runtime.sendMessage)
```

### 流式翻译流程

```text
content.js: safeSend({ action: "translateStream", text, isWord, context })
    ↓
background.js: streamTranslate() → fetch(SSE stream) → ReadableStream
    ↓ (每个chunk)
chrome.tabs.sendMessage(tabId, { action: "streamChunk", chunk, partial })
    ↓
content.js: handleStreamChunk() → 更新浮窗 innerHTML → onStreamDone() 显示按钮
```

### 缓存策略

```text
translateCache (Map in background.js):
  - 键格式: `tr|{text}|{isWord}|{detailed}` / `kw|{text}` / `page|{text}`
  - 命中时直接返回，不消耗API
  - 页面刷新时 content.js 通过 beforeunload → clearCache 清除
```

### 内容栈导航（metaStack 机制）

```text
contentStack: [HTML内容]     — 每层浮窗的 innerHTML
btnBarStack:  [按钮栏HTML]   — 每层的按钮栏内容
metaStack:    [元信息]       — 每层的 { isWord, originalText }

pushState(body, bar, meta)   — 进入下一层时压栈
popState()                   — 返回时弹栈，根据 meta 恢复按钮绑定
```

### 动态内容监听

```text
整页翻译完成 → startAutoTranslate()
    ↓
MutationObserver 监听 document.body (childList + subtree)
    ↓ (检测到新增节点)
收集可翻译文本节点 → autoTranslatePending[]
    ↓ (500ms 防抖)
flushAutoTranslate() → 批量发送 pageTranslate 请求
    ↓
还原页面 → stopAutoTranslate()
```

### 在线文档模式

```text
popup 点击开启 → content.js: startDocMode()
    ↓
document.addEventListener("copy", onCopyHandler)
    ↓ (用户复制内容)
延迟 150ms → navigator.clipboard.readText()
    ↓ (去重检查)
handleSelection(text) → 复用划词翻译完整流程（流式浮窗）
    ↓
popup 点击关闭 → content.js: stopDocMode()
```

### 单例窗口管理

```text
background.js: openWindows = { settings: windowId, help: windowId, history: windowId }
  - openSingletonWindow(key, url, w, h, options)
  - 已存在 → 聚焦（history 类型可更新 URL）
  - 不存在 → 创建，创建失败时去掉位置参数重试
  - 监听 onRemoved 清理
```

### 历史记录数据结构

```javascript
// 单词类型
{
  original: "example",     // 原始单词
  isWord: true,
  brief: "...",            // 简明释义
  detailed: "...",         // 详细讲解
  time: "2026/2/11 ...",
  favorited: false
}

// 段落类型
{
  original: "full text...", // 完整原文（不截断）
  isWord: false,
  translation: "翻译...",   // 完整译文
  time: "2026/2/11 ...",
  favorited: false
}
```

---

## Prompt 设计

所有 prompt 末尾统一约束：

> 回答完成后立即停止，不要输出任何总结、鼓励、提问或引导语句，不要使用emoji。

-   **单词简明**：`**词性** | 核心中文释义`，不超过 3 行，计算机/工程含义优先
    
-   **单词详细**：单词→词性→中文释义→英文释义→例句→用法提示，使用加粗突出重点
    
-   **段落翻译**：只输出翻译结果
    
-   **提取难词**：`[词汇] | 词性 | 中文释义 | 简短说明`，3-5 个
    
-   **上下文提示**：`用户选词的上下文句子是："..."。请结合上下文给出更准确的释义。`
    

---

## 本次修改记录

### Bug 修复

1.  **提取难词后返回失效** — 引入 `metaStack` 机制，`pushState` 时同时保存 `{ isWord, originalText }` 元信息，`popState` 恢复时根据 meta 重新绑定「详细讲解」或「提取难词」按钮事件，不再依赖页面选中状态
    
2.  **历史记录详情无法打开** — 增强 `openSingletonWindow` 容错：窗口位置参数 `Math.max(0, ...)` 防止负值，创建失败时自动去掉位置参数重试；popup.js 中历史点击事件增加 try-catch fallback
    

### 新增功能

3.  **动态内容自动翻译** — 整页翻译完成后自动启动 `MutationObserver` 监听 DOM 新增节点，500ms 防抖后批量翻译；还原页面时自动停止；popup 按钮显示「监听中」状态
    
4.  **在线文档模式** — content.js 监听 `copy` 事件，延迟 150ms 读取剪贴板，复用 `handleSelection()` 浮窗翻译流程；popup 提供开关按钮；页面独立互不影响
    

### 文件变更

| 文件  | 变更内容 |
| --- | --- |
| `manifest.json` | 新增 `clipboardRead` 权限 |
| `src/background.js` | `openSingletonWindow` 增强容错（位置参数校验、创建失败重试） |
| `src/content.js` | 新增 metaStack 机制、MutationObserver 动态监听、在线文档模式（copy 事件 + 剪贴板读取） |
| `src/popup/popup.html` | 新增「在线文档模式」开关按钮 |
| `src/popup/popup.js` | 新增 docMode 开关逻辑、`updateDocModeBtn()` 状态同步、整页翻译后自动启动监听、还原时停止监听 |
| `src/popup/help.html` | 功能说明新增「动态内容监听」和「在线文档模式」，已知限制更新引导使用在线文档模式 |

---

## 已知限制

1.  **Canvas 渲染文档无法划词翻译** — Google Docs、Office Online 等使用 Canvas 绘制文字的在线文档，划词翻译和整页翻译不可用（可使用「在线文档模式」替代）
    
2.  **窗口标题栏无法隐藏** — `chrome.windows.create({ type: "popup" })` 已是最简模式，标题栏由 OS 控制
    
3.  **扩展更新需刷新页面** — 更新扩展文件后，已打开页面的 content.js 上下文失效，需刷新页面（已有 safeSendMessage 保护不会卡死）
    
4.  **MV3 Service Worker 无 EventSource** — 流式输出通过 fetch + ReadableStream 实现而非 EventSource
    
5.  **剪贴板权限** — 在线文档模式需要页面处于聚焦状态才能读取剪贴板，部分网站 CSP 可能限制 `navigator.clipboard.readText()`
    

---

## 待办/可改进项

- [ ] help.html 中联系邮箱 `example@eg.com` 需替换为真实地址 <!-- div-format -->

- [ ] 帮助页面中的功能说明在后续功能更新后需要同步更新 <!-- div-format -->

- [ ] 可以考虑添加快捷键支持（如 Ctrl+Shift+T 触发翻译） <!-- div-format -->

- [ ] 可以考虑添加翻译语言方向设置（目前固定为英→中） <!-- div-format -->

- [ ] 可以考虑支持选中中文翻译为英文 <!-- div-format -->

- [ ] 可以考虑给整页翻译添加进度条 <!-- div-format -->

- [ ] 可以考虑支持 PDF 内嵌查看器的翻译 <!-- div-format -->

- [ ] 历史记录可以考虑添加搜索/筛选功能 <!-- div-format -->

- [ ] 可以考虑添加收藏夹独立视图 <!-- div-format -->

- [ ] 在线文档模式可考虑用 `chrome.storage.session` 按 tabId 记住状态，刷新后自动恢复 <!-- div-format -->

- [ ] 修改清空历史记录按钮位置，避免历史记录目录过长导致需要下滑很久 <!-- div-format -->

- [x] 增加图标 <!-- div-format -->

- [ ] 使用帮助页面返回按钮失效 <!-- div-format -->

- [ ] 考虑增加页面语言识别功能 <!-- div-format -->

- [ ] 考虑修改提取词汇功能，改为拆分整个句子并可选讲解词汇 <!-- div-format -->

- [ ] 考虑增加句子分析功能 <!-- div-format -->

- [ ] 考虑增加拓展界面显示语言切换选项 <!-- div-format -->

---

## 开发注意事项

1.  **文件修改后**需在 `edge://extensions/` 点击重新加载扩展，然后刷新目标页面
    
2.  **Manifest V3 不允许内联脚本**，所有 JS 必须通过 `<script src="...">` 引入
    
3.  **chrome.storage.sync** 用于设置（API Key、模型、自定义模型列表），**chrome.storage.local** 用于历史记录
    
4.  **popup 生命周期短**——点击页面其他区域 popup 就关闭，所以打开子窗口要委托给 background
    
5.  **content.js 中所有 chrome.runtime.sendMessage 调用都必须通过 safeSend 包装**，防止扩展上下文失效时报错
    
6.  **在线文档模式和动态内容监听**均为页面级状态，存在于 content.js 实例中，刷新页面即重置