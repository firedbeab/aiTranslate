const translateCache = new Map();

// ====== 单例窗口管理 ======
const openWindows = {}; // key → windowId

async function openSingletonWindow(key, url, width, height, options) {
  // 如果已有同 key 窗口，聚焦它
  if (openWindows[key]) {
    try {
      const win = await chrome.windows.get(openWindows[key]);
      if (win) {
        // 如果是 history 类型，需要更新 URL（不同 index）
        if (options?.updateUrl) {
          const tabs = await chrome.tabs.query({ windowId: win.id });
          if (tabs[0]) await chrome.tabs.update(tabs[0].id, { url });
        }
        await chrome.windows.update(win.id, { focused: true });
        return;
      }
    } catch (e) { delete openWindows[key]; }
  }
  const createOpts = { url, type: "popup", width, height };
  if (options?.left != null) createOpts.left = Math.max(0, options.left);
  if (options?.top != null) createOpts.top = Math.max(0, options.top);
  try {
    const win = await chrome.windows.create(createOpts);
    openWindows[key] = win.id;
    // 窗口关闭时清理
    chrome.windows.onRemoved.addListener(function handler(removedId) {
      if (removedId === win.id) {
        delete openWindows[key];
        chrome.windows.onRemoved.removeListener(handler);
      }
    });
  } catch (e) {
    // 如果位置参数有问题，不带位置重试
    delete createOpts.left; delete createOpts.top;
    const win = await chrome.windows.create(createOpts);
    openWindows[key] = win.id;
    chrome.windows.onRemoved.addListener(function handler(removedId) {
      if (removedId === win.id) {
        delete openWindows[key];
        chrome.windows.onRemoved.removeListener(handler);
      }
    });
  }
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // 单例窗口请求
  if (request.action === "openWindow") {
    openSingletonWindow(request.key, request.url, request.width, request.height, request.options)
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }

  if (request.action === "translateStream") {
    const tabId = sender.tab?.id;
    streamTranslate(request.text, request.isWord, request.detailed, request.context, tabId);
    sendResponse({ success: true, streaming: true });
    return true;
  }
  if (request.action === "translate") {
    const ck = `tr|${request.text}|${!!request.isWord}|${!!request.detailed}`;
    if (translateCache.has(ck)) {
      saveHistory(request.text, translateCache.get(ck), request.isWord, request.detailed);
      sendResponse({ success: true, text: translateCache.get(ck), fromCache: true });
      return true;
    }
    callAI(request.text, request.isWord, request.detailed, request.context)
      .then(r => { translateCache.set(ck, r); saveHistory(request.text, r, request.isWord, request.detailed); sendResponse({ success: true, text: r }); })
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  if (request.action === "keywords") {
    const ck = `kw|${request.text}`;
    if (translateCache.has(ck)) { sendResponse({ success: true, text: translateCache.get(ck), fromCache: true }); return true; }
    extractKeywords(request.text)
      .then(r => { translateCache.set(ck, r); sendResponse({ success: true, text: r }); })
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  if (request.action === "pageTranslate") {
    handlePageTranslate(request.texts)
      .then(r => sendResponse({ success: true, texts: r }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  if (request.action === "clearCache") { translateCache.clear(); sendResponse({ success: true }); return true; }
  if (request.action === "getHistory") { chrome.storage.local.get(["history"], d => sendResponse({ history: d.history || [] })); return true; }
  if (request.action === "updateHistory") {
    chrome.storage.local.get(["history"], d => {
      const h = d.history || []; if (request.index >= 0 && request.index < h.length && request.field) h[request.index][request.field] = request.value;
      chrome.storage.local.set({ history: h }, () => sendResponse({ success: true }));
    }); return true;
  }
  if (request.action === "deleteHistory") {
    chrome.storage.local.get(["history"], d => {
      const h = d.history || []; if (request.index >= 0 && request.index < h.length) h.splice(request.index, 1);
      chrome.storage.local.set({ history: h }, () => sendResponse({ success: true, history: h }));
    }); return true;
  }
  if (request.action === "toggleFavorite") {
    chrome.storage.local.get(["history"], d => {
      const h = d.history || []; if (request.index >= 0 && request.index < h.length) h[request.index].favorited = !h[request.index].favorited;
      chrome.storage.local.set({ history: h }, () => sendResponse({ success: true, favorited: h[request.index]?.favorited }));
    }); return true;
  }
  if (request.action === "saveWordBrief") { saveHistory(request.word, request.brief, true, false); sendResponse({ success: true }); return true; }
  if (request.action === "exportHistory") { chrome.storage.local.get(["history"], d => sendResponse({ history: d.history || [] })); return true; }
  if (request.action === "importHistory") {
    chrome.storage.local.get(["history"], d => {
      let h = d.history || [];
      (request.data || []).forEach(item => { if (!h.some(x => x.original === item.original && x.time === item.time)) h.push(item); });
      h.sort((a, b) => new Date(b.time) - new Date(a.time)); if (h.length > 200) h = h.slice(0, 200);
      chrome.storage.local.set({ history: h }, () => sendResponse({ success: true, count: (request.data || []).length }));
    }); return true;
  }
  if (request.action === "checkApiKey") {
    chrome.storage.sync.get(["apiKey"], d => sendResponse({ hasKey: !!d.apiKey }));
    return true;
  }
});

// ====== 流式翻译（带超时）======
async function streamTranslate(text, isWord, detailed, context, tabId) {
  try {
    const config = await getConfig();
    if (!config.apiKey) { sendChunk(tabId, { done: true, error: "未配置 API Key，请点击扩展图标进入设置" }); return; }
    const ck = `tr|${text}|${!!isWord}|${!!detailed}`;
    if (translateCache.has(ck)) {
      const c = translateCache.get(ck); sendChunk(tabId, { done: true, fullText: c, fromCache: true }); saveHistory(text, c, isWord, detailed); return;
    }
    const prompt = buildPrompt(isWord, detailed, context);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000); // 15秒超时

    const response = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + config.apiKey },
      body: JSON.stringify({
        model: config.model || "qwen-turbo",
        messages: [{ role: "system", content: prompt }, { role: "user", content: text }],
        temperature: 0.3, stream: true
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errData = await response.json().catch(() => null);
      const errMsg = errData?.error?.message || `HTTP ${response.status}`;
      if (response.status === 401) { sendChunk(tabId, { done: true, error: "API Key 无效，请检查设置" }); return; }
      if (response.status === 429) { sendChunk(tabId, { done: true, error: "API 调用频率超限或余额不足，请检查账户" }); return; }
      sendChunk(tabId, { done: true, error: "API 错误：" + errMsg }); return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "", buffer = "";
    // 读取超时
    const readTimeout = 10000;
    let lastChunkTime = Date.now();

    while (true) {
      const readPromise = reader.read();
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("TIMEOUT")), readTimeout)
      );
      let result;
      try { result = await Promise.race([readPromise, timeoutPromise]); }
      catch (e) {
        if (e.message === "TIMEOUT") {
          if (fullText) { sendChunk(tabId, { done: true, fullText }); translateCache.set(ck, fullText); saveHistory(text, fullText, isWord, detailed); }
          else sendChunk(tabId, { done: true, error: "模型长时间未应答。请检查：1.API Key有效性 2.账户余额 3.模型名称是否正确" });
          return;
        }
        throw e;
      }
      const { done, value } = result;
      if (done) break;
      lastChunkTime = Date.now();
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n"); buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const j = JSON.parse(data); const delta = j.choices?.[0]?.delta?.content || "";
          if (delta) { fullText += delta; sendChunk(tabId, { chunk: delta, partial: fullText }); }
        } catch {}
      }
    }
    translateCache.set(ck, fullText); saveHistory(text, fullText, isWord, detailed);
    sendChunk(tabId, { done: true, fullText });
  } catch (err) {
    if (err.name === "AbortError") {
      sendChunk(tabId, { done: true, error: "请求超时。请检查：1.API Key有效性 2.账户余额 3.模型名称是否正确或已失效" });
    } else {
      sendChunk(tabId, { done: true, error: err.message });
    }
  }
}

function sendChunk(tabId, data) {
  if (!tabId) return;
  try { chrome.tabs.sendMessage(tabId, { action: "streamChunk", ...data }); } catch {}
}

function buildPrompt(isWord, detailed, context) {
  const ctx = context ? `\n用户选词的上下文是："${context}"。请结合上下文给出更准确的释义。` : "";
  if (isWord && detailed) {
    return `你是英语词汇辅导助手。请按以下格式讲解：
**单词**：英文单词及词性
**中文释义**：最常见含义，计算机/工程含义优先
**英文释义**：简洁英文解释
**例句**：一个英文例句 + 中文翻译
**用法提示**：常见搭配、语体、易错点${ctx}
使用**加粗**突出重点。回答到用法提示后立即停止。禁止输出总结、鼓励、提问、引导语、emoji。`;
  } else if (isWord) {
    return `你是英语词汇助手。简明释义格式：
**词性** | 核心中文释义（2-3个）
计算机/工程含义优先。不超过3行。${ctx}
回答完后立即停止。禁止输出总结、鼓励、提问、引导语、emoji。`;
  }
  return "你是专业翻译，将文字翻译成中文，只输出翻译结果。翻译完后立即停止。禁止输出总结、鼓励、提问、引导语、emoji。";
}

async function getConfig() { return await chrome.storage.sync.get(["apiKey", "model"]); }

async function callAI(text, isWord, detailed, context) {
  const config = await getConfig();
  if (!config.apiKey) throw new Error("未配置 API Key");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const res = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + config.apiKey },
    body: JSON.stringify({
      model: config.model || "qwen-turbo",
      messages: [{ role: "system", content: buildPrompt(isWord, detailed, context) }, { role: "user", content: text }],
      temperature: 0.3
    }),
    signal: controller.signal
  });
  clearTimeout(timeout);
  const data = await res.json();
  if (data.error) {
    if (res.status === 401) throw new Error("API Key 无效");
    if (res.status === 429) throw new Error("API调用频率超限或余额不足");
    throw new Error(data.error.message);
  }
  return data.choices[0].message.content;
}

async function extractKeywords(text) {
  const config = await getConfig();
  if (!config.apiKey) throw new Error("未配置 API Key");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const res = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": "Bearer " + config.apiKey },
    body: JSON.stringify({
      model: config.model || "qwen-turbo",
      messages: [{ role: "system", content: `从英文文本中提取3-5个较难的关键词。严格按以下格式，每行一个：
[词汇] | 词性 | 中文释义 | 简短说明
要求：词汇用[]包裹，只含英文字母，用|分隔四部分，只输出列表。禁止输出标题、序号、总结、emoji。` },
      { role: "user", content: text }],
      temperature: 0.3
    }),
    signal: controller.signal
  });
  clearTimeout(timeout);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices[0].message.content;
}

async function handlePageTranslate(texts) {
  const config = await getConfig();
  if (!config.apiKey) throw new Error("未配置 API Key");
  const results = new Array(texts.length).fill(null), ui = [], ut = [];
  texts.forEach((t, i) => { const k = `page|${t}`; if (translateCache.has(k)) results[i] = translateCache.get(k); else { ui.push(i); ut.push(t); } });
  if (!ut.length) return results;
  for (let i = 0; i < ut.length; i += 20) {
    const batch = ut.slice(i, i+20), bIdx = ui.slice(i, i+20);
    const res = await fetch("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
      method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + config.apiKey },
      body: JSON.stringify({ model: config.model || "qwen-turbo", messages: [{ role: "system", content: "将文本翻译成中文。段落间用---SEP---分隔，结果也用---SEP---分隔，只输出翻译。" }, { role: "user", content: batch.join("\n---SEP---\n") }], temperature: 0.3 })
    });
    const data = await res.json(); if (data.error) throw new Error(data.error.message);
    data.choices[0].message.content.split("---SEP---").forEach((t, j) => { const v = t.trim(); results[bIdx[j]] = v; translateCache.set(`page|${ut[i+j]}`, v); });
  }
  return results;
}

function saveHistory(original, translation, isWord, isDetailed) {
  chrome.storage.local.get(["history"], d => {
    const h = d.history || [];
    if (isWord) {
      const w = original.toLowerCase();
      const idx = h.findIndex(x => x.isWord && x.original.toLowerCase() === w);
      if (idx >= 0) {
        if (isDetailed) h[idx].detailed = translation; else h[idx].brief = translation;
        h[idx].time = new Date().toLocaleString(); h.unshift(h.splice(idx, 1)[0]);
      } else {
        h.unshift({ original, isWord: true, brief: isDetailed ? "" : translation, detailed: isDetailed ? translation : "", time: new Date().toLocaleString(), favorited: false });
      }
    } else {
      const idx = h.findIndex(x => !x.isWord && x.original === original);
      if (idx >= 0) { h[idx].translation = translation; h[idx].time = new Date().toLocaleString(); h.unshift(h.splice(idx, 1)[0]); }
      else h.unshift({ original, isWord: false, translation, time: new Date().toLocaleString(), favorited: false });
    }
    if (h.length > 200) h.pop();
    chrome.storage.local.set({ history: h });
  });
}
