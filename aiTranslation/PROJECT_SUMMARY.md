# AI 翻译助手 - 浏览器插件项目总结

## 项目概况

- **类型**：Microsoft Edge 浏览器扩展（Manifest V3）
- **功能**：基于 AI 大模型的英文翻译助手，支持划词翻译、整页翻译、难词提取等
- **API**：阿里云百炼（通义千问），兼容 OpenAI 格式
- **API 地址**：`https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions`
- **当前版本**：v1.3.0
- **本地开发路径**：`D:\Dve\aiTranslation\`

---

## 文件结构

```
aiTranslation/
├── manifest.json                  # 扩展配置（MV3）
├── package.json                   # 项目信息
└── src/
    ├── background.js              # Service Worker（API调用、流式输出、缓存、历史记录管理、单例窗口管理）
    ├── content.js                 # 内容脚本（划词检测、浮窗UI、流式渲染、上下文捕获、难词点击）
    └── popup/
        ├── popup.html             # 主界面（翻译按钮、模型快速切换、历史记录列表）
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
1. **划词翻译** — 选中网页文字自动触发翻译，右下角浮窗显示结果
2. **单词模式** — 选中单个英文单词→简明释义，可点击「详细讲解」获取完整词汇分析
3. **段落模式** — 选中句子/段落→中文翻译，可点击「提取难词」
4. **整页翻译** — 一键翻译页面所有英文文本（使用 TreeWalker 遍历文本节点），支持 iframe
5. **页面还原** — 翻译后可一键还原原始内容（常驻按钮，灰色/激活态切换）

### 智能特性
6. **流式输出** — 使用阿里云 SSE 流式 API，翻译结果逐字实时显示（通过 background fetch + ReadableStream → chrome.tabs.sendMessage 推送 chunk 给 content.js）
7. **上下文分析** — 划词时自动捕获周围段落文本（getSelectionContext，最多300字），发送给 AI 提供更准确的释义
8. **翻译缓存** — background.js 中使用 Map 缓存所有翻译结果（划词、难词、整页逐条），相同内容不重复调 API，页面刷新时通过 beforeunload 通知清除
9. **单词清理** — 选中文本首尾标点自动去除（cleanWord），支持连字符单词识别（如 well-known）

### 难词功能
10. **提取难词** — AI 提取 3-5 个关键词，格式 `[词汇] | 词性 | 中文释义 | 简短说明`
11. **难词可点击** — 提取结果中每个 `[word]` 渲染为可点击链接，点击查看详细讲解
12. **内容栈导航** — 浮窗支持多层内容栈（翻译→难词列表→单词讲解），← 按钮逐层返回
13. **难词自动存历史** — 提取难词后自动解析每个词的简明释义并存入历史记录

### 历史记录
14. **自动保存** — 翻译结果自动存入 chrome.storage.local，上限 200 条
15. **词汇合并** — 同一单词的简明释义和详细讲解合并为一条记录
16. **分类展示** — 历史列表分「词汇」和「句子/段落」两个 Tab
17. **独立详情页** — 点击历史条目在 popup 旁边打开独立弹窗（单例复用）
18. **详情功能** — 简明/详细 Tab 切换、收藏/取消收藏、删除、长原文可展开、markdown 渲染
19. **立即获取** — 详情页中无详细讲解时提供按钮直接调 API 获取
20. **导出/导入** — JSON 格式，支持去重合并（在设置页操作）
21. **二次确认清空** — 清空按钮需点两次确认，3 秒后自动恢复

### UI/UX
22. **沉浸式滚动条** — 全局 4px 细滚动条，透明轨道 + 暗色滑块
23. **Markdown 渲染** — 支持 **加粗**、*斜体*、`行内代码`、换行，浮窗和历史详情均适用
24. **模型快速切换** — 主界面下拉框直接切换模型，切换即保存
25. **模型管理** — 设置页支持添加/删除自定义模型，删除当前模型自动回退 qwen-turbo
26. **单例窗口** — 设置/帮助/历史详情窗口均为单例，重复点击聚焦已有窗口
27. **API 未设置提醒** — 主界面顶部红色警告框 + 跳转设置链接
28. **超时错误处理** — 15秒超时，HTTP 401/404/429 有对应中文提示
29. **扩展上下文失效保护** — safeSendMessage 包装，扩展更新后不卡死，提示刷新页面

### iframe 支持
30. **子 iframe 划词** — 子 frame 通过 postMessage 发送选中文字到顶层窗口统一处理
31. **整页翻译含 iframe** — `all_frames: true` + `chrome.scripting.executeScript` 的 allFrames 选项

---

## 技术架构

### 通信流程

```
[网页 content.js] ←→ [background.js Service Worker] ←→ [阿里云API]
       ↑                        ↑
    浮窗UI               chrome.storage (历史/设置)
       ↑                        ↑
  [iframe content.js]    [popup/settings/history 页面]
     (postMessage)         (chrome.runtime.sendMessage)
```

### 流式翻译流程

```
content.js: safeSend({ action: "translateStream", text, isWord, context })
    ↓
background.js: streamTranslate() → fetch(SSE stream) → ReadableStream
    ↓ (每个chunk)
chrome.tabs.sendMessage(tabId, { action: "streamChunk", chunk, partial })
    ↓
content.js: handleStreamChunk() → 更新浮窗 innerHTML → onStreamComplete() 显示按钮
```

### 缓存策略

```
translateCache (Map in background.js):
  - 键格式: `tr|{text}|{isWord}|{detailed}` / `kw|{text}` / `page|{text}`
  - 命中时直接返回，不消耗API
  - 页面刷新时 content.js 通过 beforeunload → clearCache 清除
```

### 单例窗口管理

```
background.js: openWindows = { settings: windowId, help: windowId, history: windowId }
  - openSingletonWindow(key, url, w, h, options)
  - 已存在 → 聚焦（history 类型可更新 URL）
  - 不存在 → 创建，监听 onRemoved 清理
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

- **单词简明**：`**词性** | 核心中文释义`，不超过 3 行，计算机/工程含义优先
- **单词详细**：单词→词性→中文释义→英文释义→例句→用法提示，使用加粗突出重点
- **段落翻译**：只输出翻译结果
- **提取难词**：`[词汇] | 词性 | 中文释义 | 简短说明`，3-5 个
- **上下文提示**：`用户选词的上下文句子是："..."。请结合上下文给出更准确的释义。`

---

## 已知限制

1. **Canvas 渲染文档无法翻译** — Google Docs、微软 Office Online 等使用 Canvas 绘制文字的在线文档，划词翻译和整页翻译均不可用（根本性限制）
2. **窗口标题栏无法隐藏** — `chrome.windows.create({ type: "popup" })` 已是最简模式，标题栏由 OS 控制
3. **扩展更新需刷新页面** — 更新扩展文件后，已打开页面的 content.js 上下文失效，需刷新页面（已有 safeSendMessage 保护不会卡死）
4. **MV3 Service Worker 无 EventSource** — 流式输出通过 fetch + ReadableStream 实现而非 EventSource

---

## 待办/可改进项

- [ ] help.html 中联系邮箱 `example@eg.com` 需替换为真实地址
- [ ] 帮助页面中的功能说明在后续功能更新后需要同步更新
- [ ] 可以考虑添加快捷键支持（如 Ctrl+Shift+T 触发翻译）
- [ ] 可以考虑添加翻译语言方向设置（目前固定为英→中）
- [ ] 可以考虑支持选中中文翻译为英文
- [ ] 可以考虑给整页翻译添加进度条
- [ ] 可以考虑支持 PDF 内嵌查看器的翻译
- [ ] 历史记录可以考虑添加搜索/筛选功能
- [ ] 可以考虑添加收藏夹独立视图

---

## 开发注意事项

1. **文件修改后**需在 `edge://extensions/` 点击重新加载扩展，然后刷新目标页面
2. **Manifest V3 不允许内联脚本**，所有 JS 必须通过 `<script src="...">` 引入
3. **chrome.storage.sync** 用于设置（API Key、模型、自定义模型列表），**chrome.storage.local** 用于历史记录
4. **popup 生命周期短**——点击页面其他区域 popup 就关闭，所以打开子窗口要委托给 background
5. **content.js 中所有 chrome.runtime.sendMessage 调用都必须通过 safeSend 包装**，防止扩展上下文失效时报错
