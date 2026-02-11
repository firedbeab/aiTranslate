const isTopFrame = (window === window.top);
if (!isTopFrame) {
  document.addEventListener("mouseup", e => {
    const t = window.getSelection().toString().trim();
    if (t.length > 0) window.top.postMessage({ type: "AI_TRANSLATOR_SELECTION", text: t }, "*");
  });
} else {
  function safeSend(msg, cb) {
    try {
      if (!chrome.runtime?.id) { cb?.({ success: false, error: "扩展已更新，请刷新页面" }); return; }
      chrome.runtime.sendMessage(msg, res => {
        if (chrome.runtime.lastError) { cb?.({ success: false, error: "扩展已更新，请刷新页面" }); return; }
        cb?.(res);
      });
    } catch { cb?.({ success: false, error: "扩展已更新，请刷新页面" }); }
  }

  window.addEventListener("beforeunload", () => { try { chrome.runtime?.sendMessage({ action: "clearCache" }); } catch{} });
  chrome.runtime.onMessage?.addListener((req) => {
    if (req.action === "checkTranslated") return;
    if (req.action === "streamChunk") handleStreamChunk(req);
    if (req.action === "startAutoTranslate") startAutoTranslate();
    if (req.action === "stopAutoTranslate") stopAutoTranslate();
    if (req.action === "startDocMode") startDocMode();
    if (req.action === "stopDocMode") stopDocMode();
  });
  chrome.runtime.onMessage?.addListener((req, sender, sendResponse) => {
    if (req.action === "checkTranslated") {
      sendResponse({
        translated: document.body.dataset.aiTranslated === "true",
        autoTranslating: !!autoTranslateObserver,
        docMode: !!docModeActive
      });
      return true;
    }
  });

  document.addEventListener("mouseup", e => {
    if (document.getElementById("ai-translator-tooltip")?.contains(e.target)) return;
    const t = window.getSelection().toString().trim();
    if (t.length > 0) handleSelection(t);
  });
  window.addEventListener("message", e => { if (e.data?.type === "AI_TRANSLATOR_SELECTION" && e.data.text) handleSelection(e.data.text); });
  document.addEventListener("mousedown", e => {
    const tt = document.getElementById("ai-translator-tooltip");
    if (tt && !tt.contains(e.target)) tt.remove();
  });

  function getSelectionContext() {
    const sel = window.getSelection(); if (!sel.rangeCount) return "";
    let p = sel.anchorNode; if (!p) return "";
    if (p.nodeType === 3) p = p.parentElement;
    while (p && !["P","DIV","LI","TD","TH","H1","H2","H3","H4","H5","SPAN","BLOCKQUOTE","ARTICLE","SECTION"].includes(p.tagName)) p = p.parentElement;
    if (!p) return "";
    const t = p.textContent?.trim() || "";
    return t.length > 300 ? t.slice(0, 300) : t;
  }
  function cleanWord(t) { return t.replace(/^[^a-zA-Z]+/, "").replace(/[^a-zA-Z]+$/, ""); }
  function isWordText(t) { const c = cleanWord(t); return c.length > 0 && /^[a-zA-Z]+(-[a-zA-Z]+)*$/.test(c); }

  let streamTarget = null, streamFullText = "";

  function handleStreamChunk(data) {
    const body = document.getElementById("ai-content-body"); if (!body) return;
    if (data.error) { body.innerHTML = "<div style='color:#f44336;font-size:12px;line-height:1.6'>" + escH(data.error) + "</div>"; return; }
    if (data.fromCache && data.fullText) { body.innerHTML = renderMd(data.fullText); streamFullText = data.fullText; onStreamDone(); return; }
    if (data.chunk) { streamFullText = data.partial || streamFullText; body.innerHTML = renderMd(streamFullText); body.scrollTop = body.scrollHeight; }
    if (data.done && data.fullText) { streamFullText = data.fullText; body.innerHTML = renderMd(streamFullText); onStreamDone(); }
  }

  function onStreamDone() {
    if (!streamTarget) return;
    if (streamTarget._noButtons) { resetFold(); streamTarget._noButtons = false; return; }
    const { isWord, originalText } = streamTarget;
    const bar = document.getElementById("ai-btn-bar");
    if (bar) {
      if (isWord) { bar.innerHTML = mkBtn("btn-detail", "详细讲解"); setTimeout(() => bindDetailBtn(originalText), 30); }
      else { bar.innerHTML = mkBtn("btn-keywords", "提取难词"); setTimeout(() => bindKeywordsBtn(originalText), 30); }
    }
    resetFold();
  }

  function handleSelection(selectedText) {
    safeSend({ action: "checkApiKey" }, res => {
      if (!res?.hasKey) {
        showTooltip("", false, false, null, "未配置 API Key，请点击右上角扩展图标进入设置页面配置。");
        return;
      }
      const isWord = isWordText(selectedText);
      const queryText = isWord ? cleanWord(selectedText) : selectedText;
      const context = isWord ? getSelectionContext() : "";
      streamFullText = ""; streamTarget = { isWord, originalText: queryText, context };
      showTooltip("", true, isWord, queryText);
      safeSend({ action: "translateStream", text: queryText, isWord, detailed: false, context }, res => {
        if (!res?.success && !res?.streaming) {
          const b = document.getElementById("ai-content-body");
          if (b) b.innerHTML = "<div style='color:#f44336;font-size:12px'>" + escH(res?.error || "请求失败") + "</div>";
        }
      });
    });
  }

  function escH(s) { return (s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
  function renderMd(text) {
    let h = escH(text);
    h = h.replace(/\*\*(.+?)\*\*/g, "<strong style='color:#7b68ee'>$1</strong>");
    h = h.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
    h = h.replace(/`([^`]+)`/g, "<code style='background:#2a2a4a;padding:1px 4px;border-radius:3px;font-size:12px'>$1</code>");
    h = h.replace(/\n/g, "<br>"); return h;
  }
  function injectStyle() {
    if (document.getElementById("ai-translator-style")) return;
    const s = document.createElement("style"); s.id = "ai-translator-style";
    s.textContent = "#ai-translator-tooltip *::-webkit-scrollbar{width:4px}#ai-translator-tooltip *::-webkit-scrollbar-track{background:transparent}#ai-translator-tooltip *::-webkit-scrollbar-thumb{background:#3a3a5a;border-radius:4px}#ai-translator-tooltip *::-webkit-scrollbar-thumb:hover{background:#5a5a8a}";
    document.head.appendChild(s);
  }

  let contentStack = [], btnBarStack = [], metaStack = [], tooltipExpanded = false;
  function showTooltip(text, isLoading, isWord, originalText, errorMsg) {
    document.getElementById("ai-translator-tooltip")?.remove();
    injectStyle(); tooltipExpanded = false; contentStack = []; btnBarStack = []; metaStack = [];
    const tt = document.createElement("div"); tt.id = "ai-translator-tooltip";
    tt.style.cssText = "position:fixed;bottom:30px;right:30px;background:#1a1a2e;color:#e0e0e0;padding:0;border-radius:10px;width:360px;z-index:2147483647;font-size:14px;line-height:1.7;box-shadow:0 4px 20px rgba(0,0,0,0.5);border:1px solid #3a3a5a;overflow:hidden";
    const header = "<div style='padding:8px 12px;background:#16213e;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #2a2a4a'><span style='font-size:11px;color:#7b68ee;font-weight:bold'>AI 翻译助手</span><div style='display:flex;gap:10px;align-items:center'><span id='ai-back-btn' style='cursor:pointer;color:#555;font-size:15px;display:none' title='返回'>&#x2190;</span><span id='ai-toggle-btn' style='cursor:pointer;color:#888;font-size:15px' title='展开/折叠'>&#x2195;</span><span id='ai-close-btn' style='cursor:pointer;color:#888;font-size:15px' title='关闭'>&#x2715;</span></div></div>";
    let bc; if (errorMsg) bc = "<div style='color:#f44336;font-size:12px;line-height:1.6'>"+escH(errorMsg)+"</div>"; else if (isLoading) bc = "<span style='color:#7b68ee'>翻译中...</span>"; else bc = renderMd(text);
    tt.innerHTML = header + "<div id='ai-content-body' style='padding:12px 14px;max-height:160px;overflow-y:auto;font-size:13px;word-break:break-word;line-height:1.8'>" + bc + "</div><div id='ai-btn-bar' style='padding:8px 14px;border-top:1px solid #2a2a4a;display:flex;gap:8px;flex-wrap:wrap;min-height:10px'></div>";
    document.body.appendChild(tt);
    setTimeout(() => bindBaseEvents(originalText, isWord), 50);
  }

  function mkBtn(id, label) { return "<button id='"+id+"' style='background:#2a2a4a;color:#bbb;border:1px solid #444;padding:4px 12px;border-radius:5px;cursor:pointer;font-size:12px'>"+label+"</button>"; }
  function resetFold() { tooltipExpanded = false; const b = document.getElementById("ai-content-body"); if (b) b.style.maxHeight = "160px"; const t = document.getElementById("ai-toggle-btn"); if (t) t.innerHTML = "&#x2195;"; }
  function pushState(b, bar, meta) { contentStack.push(b.innerHTML); btnBarStack.push(bar?.innerHTML || ""); metaStack.push(meta || null); }
  function popState() {
    const b = document.getElementById("ai-content-body"), bar = document.getElementById("ai-btn-bar");
    if (!b || !contentStack.length) return;
    b.innerHTML = contentStack.pop(); if (bar) bar.innerHTML = btnBarStack.pop() || "";
    const meta = metaStack.pop();
    if (!contentStack.length) { const bk = document.getElementById("ai-back-btn"); if (bk) bk.style.display = "none"; }
    resetFold();
    // 恢复按钮绑定
    setTimeout(() => {
      bindWordLinks();
      if (meta) {
        if (meta.isWord && meta.originalText) bindDetailBtn(meta.originalText);
        if (!meta.isWord && meta.originalText) bindKeywordsBtn(meta.originalText);
      }
    }, 30);
  }
  function bindBaseEvents(ot, iw) {
    document.getElementById("ai-close-btn")?.addEventListener("click", () => document.getElementById("ai-translator-tooltip")?.remove());
    document.getElementById("ai-toggle-btn")?.addEventListener("click", () => {
      const b = document.getElementById("ai-content-body"); if (!b) return;
      tooltipExpanded = !tooltipExpanded; b.style.maxHeight = tooltipExpanded ? "420px" : "160px";
      document.getElementById("ai-toggle-btn").innerHTML = tooltipExpanded ? "&#x2B06;" : "&#x2195;";
    });
    document.getElementById("ai-back-btn")?.addEventListener("click", () => popState());
  }

  function bindDetailBtn(word) {
    document.getElementById("btn-detail")?.addEventListener("click", () => {
      const b = document.getElementById("ai-content-body"), bar = document.getElementById("ai-btn-bar"); if (!b) return;
      pushState(b, bar, { isWord: true, originalText: word }); b.innerHTML = "<span style='color:#7b68ee'>加载中...</span>"; if (bar) bar.innerHTML = "";
      document.getElementById("ai-back-btn").style.display = "inline";
      streamFullText = ""; streamTarget = { isWord: true, originalText: word, _noButtons: true };
      safeSend({ action: "translateStream", text: word, isWord: true, detailed: true, context: "" }, res => {
        if (!res?.success && !res?.streaming && document.getElementById("ai-content-body"))
          document.getElementById("ai-content-body").innerHTML = "<div style='color:#f44336;font-size:12px'>"+escH(res?.error||"失败")+"</div>";
      });
    });
  }
  function bindKeywordsBtn(originalText) {
    document.getElementById("btn-keywords")?.addEventListener("click", () => {
      const b = document.getElementById("ai-content-body"), bar = document.getElementById("ai-btn-bar"); if (!b) return;
      pushState(b, bar, { isWord: false, originalText }); b.innerHTML = "<span style='color:#7b68ee'>分析中...</span>"; if (bar) bar.innerHTML = "";
      document.getElementById("ai-back-btn").style.display = "inline";
      safeSend({ action: "keywords", text: originalText }, res => {
        if (res?.success && document.getElementById("ai-content-body")) {
          document.getElementById("ai-content-body").innerHTML = renderKeywords(res.text);
          saveKeywordBriefs(res.text);
          const barEl = document.getElementById("ai-btn-bar");
          if (barEl) barEl.innerHTML = "<span style='font-size:11px;color:#666'>点击词汇查看详细讲解</span>";
          resetFold(); setTimeout(() => bindWordLinks(), 30);
        } else if (document.getElementById("ai-content-body")) {
          document.getElementById("ai-content-body").innerHTML = "<div style='color:#f44336;font-size:12px'>"+escH(res?.error||"失败")+"</div>";
        }
      });
    });
  }
  function saveKeywordBriefs(text) {
    text.split("\n").forEach(line => {
      const m = line.match(/\[([a-zA-Z][a-zA-Z\s-]*?)\]\s*\|?\s*(.+)/);
      if (m) safeSend({ action: "saveWordBrief", word: m[1].trim(), brief: m[2].trim() });
    });
  }
  function renderKeywords(text) {
    let h = escH(text);
    h = h.replace(/\[([a-zA-Z][a-zA-Z\s-]*?)\]/g, "<a class='ai-word-link' data-word='$1' style='color:#7b68ee;cursor:pointer;text-decoration:underline;font-weight:bold'>$1</a>");
    h = h.replace(/\*\*(.+?)\*\*/g, "<strong style='color:#7b68ee'>$1</strong>");
    h = h.replace(/\n/g, "<br>"); return h;
  }
  function bindWordLinks() {
    document.querySelectorAll("#ai-content-body .ai-word-link").forEach(link => {
      if (link.dataset.bound) return; link.dataset.bound = "true";
      link.addEventListener("click", e => {
        e.preventDefault(); e.stopPropagation();
        const word = link.dataset.word; if (!word) return;
        const b = document.getElementById("ai-content-body"), bar = document.getElementById("ai-btn-bar"); if (!b) return;
        document.querySelectorAll("#ai-content-body .ai-word-link").forEach(l => delete l.dataset.bound);
        pushState(b, bar, { isWord: false, originalText: null });
        b.innerHTML = "<span style='color:#7b68ee'>正在讲解 "+escH(word)+"...</span>"; if (bar) bar.innerHTML = "";
        document.getElementById("ai-back-btn").style.display = "inline";
        streamFullText = ""; streamTarget = { isWord: true, originalText: word, _noButtons: true };
        safeSend({ action: "translateStream", text: word, isWord: true, detailed: true, context: "" }, res => {
          if (!res?.success && !res?.streaming && document.getElementById("ai-content-body"))
            document.getElementById("ai-content-body").innerHTML = "<div style='color:#f44336;font-size:12px'>"+escH(res?.error||"失败")+"</div>";
        });
      });
    });
  }

  // ====== 问题3：动态内容自动翻译（MutationObserver）======
  let autoTranslateObserver = null;
  let autoTranslatePending = [];
  let autoTranslateTimer = null;

  function isTranslatableTextNode(n) {
    const p = n.parentElement;
    if (!p) return false;
    const t = p.tagName.toLowerCase();
    if (["script","style","noscript","svg","math","textarea","input"].includes(t)) return false;
    if (p.closest("#ai-translator-tooltip")) return false;
    const x = n.textContent.trim();
    if (x.length < 4 || !/[a-zA-Z]{2,}/.test(x)) return false;
    // 跳过已翻译的节点
    if (n._aiOriginal) return false;
    return true;
  }

  function startAutoTranslate() {
    if (autoTranslateObserver) return; // 已在监听
    autoTranslateObserver = new MutationObserver(mutations => {
      const newTextNodes = [];
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === 3) {
            // 直接是文本节点
            if (isTranslatableTextNode(node)) newTextNodes.push(node);
          } else if (node.nodeType === 1) {
            // 元素节点，遍历其中的文本节点
            const w = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
              acceptNode(n) { return isTranslatableTextNode(n) ? 1 : 2; }
            });
            while (w.nextNode()) newTextNodes.push(w.currentNode);
          }
        }
      }
      if (newTextNodes.length > 0) {
        autoTranslatePending.push(...newTextNodes);
        // 防抖：500ms 内合并批量翻译
        if (autoTranslateTimer) clearTimeout(autoTranslateTimer);
        autoTranslateTimer = setTimeout(() => flushAutoTranslate(), 500);
      }
    });
    autoTranslateObserver.observe(document.body, { childList: true, subtree: true });
    // 通知状态
    console.log("[AI翻译助手] 已启动动态内容监听");
  }

  function stopAutoTranslate() {
    if (autoTranslateObserver) {
      autoTranslateObserver.disconnect();
      autoTranslateObserver = null;
    }
    if (autoTranslateTimer) { clearTimeout(autoTranslateTimer); autoTranslateTimer = null; }
    autoTranslatePending = [];
    console.log("[AI翻译助手] 已停止动态内容监听");
  }

  function flushAutoTranslate() {
    const nodes = autoTranslatePending.splice(0);
    if (!nodes.length) return;
    // 标记原文
    nodes.forEach(n => { n._aiOriginal = n.textContent; });
    // 追加到整页翻译的节点列表中
    if (!document.body._aiTextNodes) document.body._aiTextNodes = [];
    document.body._aiTextNodes.push(...nodes);
    document.body.dataset.aiTranslated = "true";
    const texts = nodes.map(n => n.textContent.trim());
    for (let i = 0; i < texts.length; i += 30) {
      const bt = texts.slice(i, i + 30), bn = nodes.slice(i, i + 30);
      safeSend({ action: "pageTranslate", texts: bt }, res => {
        if (!res?.success) return;
        bn.forEach((n, j) => { const t = res.texts[j]?.trim(); if (t && n.parentElement) n.textContent = t; });
      });
    }
  }

  // ====== 在线文档模式（监听 copy 事件）======
  let docModeActive = false;
  let lastClipboardText = "";

  function onCopyHandler() {
    // copy 事件触发后延迟 150ms 等剪贴板写入完成
    setTimeout(async () => {
      try {
        const text = await navigator.clipboard.readText();
        if (!text || !text.trim()) return;
        const trimmed = text.trim();
        // 避免重复翻译相同内容
        if (trimmed === lastClipboardText) return;
        lastClipboardText = trimmed;
        // 复用划词翻译流程
        handleSelection(trimmed);
      } catch (err) {
        console.warn("[AI翻译助手] 读取剪贴板失败：", err.message);
      }
    }, 150);
  }

  function startDocMode() {
    if (docModeActive) return;
    docModeActive = true;
    lastClipboardText = "";
    document.addEventListener("copy", onCopyHandler, true);
    console.log("[AI翻译助手] 在线文档模式已开启");
  }

  function stopDocMode() {
    if (!docModeActive) return;
    docModeActive = false;
    lastClipboardText = "";
    document.removeEventListener("copy", onCopyHandler, true);
    console.log("[AI翻译助手] 在线文档模式已关闭");
  }
}
