function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }
function showStatus(t, c) { const s = document.getElementById("status"); s.style.color = c; s.textContent = t; if (c !== "#7b68ee") setTimeout(() => (s.textContent = ""), 3000); }

// 单例窗口辅助
function openWindow(key, page, width, height, options) {
  const url = chrome.runtime.getURL("src/popup/" + page);
  chrome.runtime.sendMessage({
    action: "openWindow", key, url, width, height, options
  });
}

let allHistory = [], currentTab = "words", historyExpanded = false;

document.addEventListener("DOMContentLoaded", () => {
  // 加载配置
  chrome.storage.sync.get(["apiKey", "model", "customModels"], config => {
    if (!config.apiKey) {
      document.getElementById("apiWarning").style.display = "block";
    }
    // 构建模型下拉：预设 + 自定义
    buildModelSelect(config.model, config.customModels || []);
  });
  checkTranslateStatus();
  updateDocModeBtn();
  loadHistory();
});

// ====== 模型快速切换 ======
function buildModelSelect(currentModel, customModels) {
  const sel = document.getElementById("model");
  sel.innerHTML = "";
  const presets = [
    { value: "qwen-turbo", label: "qwen-turbo（快速）" },
    { value: "qwen-plus", label: "qwen-plus（均衡）" },
    { value: "qwen-max", label: "qwen-max（最强）" }
  ];
  presets.forEach(p => {
    const o = document.createElement("option"); o.value = p.value; o.textContent = p.label; sel.appendChild(o);
  });
  customModels.forEach(m => {
    const o = document.createElement("option"); o.value = m; o.textContent = m + "（自定义）"; sel.appendChild(o);
  });
  if (currentModel && sel.querySelector('option[value="' + CSS.escape(currentModel) + '"]')) {
    sel.value = currentModel;
  } else if (currentModel) {
    // 可能是没保存到 customModels 的自定义模型
    const o = document.createElement("option"); o.value = currentModel; o.textContent = currentModel; sel.appendChild(o);
    sel.value = currentModel;
  }
}

document.getElementById("model").addEventListener("change", e => {
  const model = e.target.value;
  chrome.storage.sync.set({ model }, () => {
    showStatus("已切换：" + model, "#4caf50");
  });
});

// ====== 设置 & 帮助（单例窗口）======
document.getElementById("settingsBtn").addEventListener("click", () => {
  openWindow("settings", "settings.html", 430, 550);
});

document.getElementById("helpBtn").addEventListener("click", () => {
  openWindow("help", "help.html", 500, 650);
});

document.getElementById("goSettings")?.addEventListener("click", () => {
  openWindow("settings", "settings.html", 430, 550);
});

// ====== 还原按钮 ======
function checkTranslateStatus() {
  const btn = document.getElementById("restoreBtn");
  const pageBtn = document.getElementById("pageBtn");
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: "checkTranslated" }, res => {
      if (chrome.runtime.lastError || !res) { btn.classList.remove("active"); btn.textContent = "还原页面（未翻译）"; return; }
      if (res.translated) {
        btn.classList.add("active"); btn.textContent = "还原页面";
        if (res.autoTranslating) {
          pageBtn.textContent = "整页翻译（监听中）";
          pageBtn.style.borderColor = "#4caf50";
        } else {
          pageBtn.textContent = "整页翻译（含 iframe）";
          pageBtn.style.borderColor = "#444";
        }
      } else {
        btn.classList.remove("active"); btn.textContent = "还原页面（未翻译）";
        pageBtn.textContent = "整页翻译（含 iframe）";
        pageBtn.style.borderColor = "#444";
      }
    });
  });
}

// ====== 整页翻译 ======
document.getElementById("pageBtn").addEventListener("click", () => {
  chrome.storage.sync.get(["apiKey"], config => {
    if (!config.apiKey) { showStatus("请先在设置中填写 API Key", "#f44336"); return; }
    showStatus("翻译中...", "#7b68ee");
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      chrome.scripting.executeScript({ target: { tabId: tabs[0].id, allFrames: true }, func: translateCurrentFrame }, () => {
        showStatus("翻译完成", "#4caf50"); checkTranslateStatus();
        // 翻译完成后自动开启动态内容监听
        chrome.tabs.sendMessage(tabs[0].id, { action: "startAutoTranslate" });
      });
    });
  });
});

function translateCurrentFrame() {
  if (document.body.dataset.aiTranslated === "true") return;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) { const p = n.parentElement; if (!p) return 2; const t = p.tagName.toLowerCase(); if (["script","style","noscript","svg","math","textarea","input"].includes(t)) return 2; if (p.closest("#ai-translator-tooltip")) return 2; const x = n.textContent.trim(); if (x.length < 4 || !/[a-zA-Z]{2,}/.test(x)) return 2; return 1; }
  });
  const nodes = []; while (w.nextNode()) nodes.push(w.currentNode);
  if (!nodes.length) return;
  nodes.forEach(n => { n._aiOriginal = n.textContent; });
  document.body.dataset.aiTranslated = "true"; document.body._aiTextNodes = nodes;
  const texts = nodes.map(n => n.textContent.trim());
  for (let i = 0; i < texts.length; i += 30) {
    const bt = texts.slice(i, i+30), bn = nodes.slice(i, i+30);
    chrome.runtime.sendMessage({ action: "pageTranslate", texts: bt }, res => {
      if (!res?.success) return; bn.forEach((n,j) => { const t = res.texts[j]?.trim(); if (t && n.parentElement) n.textContent = t; });
    });
  }
}

document.getElementById("restoreBtn").addEventListener("click", () => {
  if (!document.getElementById("restoreBtn").classList.contains("active")) return;
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    // 先停止自动翻译监听
    chrome.tabs.sendMessage(tabs[0].id, { action: "stopAutoTranslate" });
    chrome.scripting.executeScript({ target: { tabId: tabs[0].id, allFrames: true }, func: restoreCurrentFrame }, () => {
      showStatus("已还原", "#4caf50"); checkTranslateStatus();
    });
  });
});

function restoreCurrentFrame() {
  if (document.body._aiTextNodes) { document.body._aiTextNodes.forEach(n => { if (n._aiOriginal && n.parentElement) n.textContent = n._aiOriginal; }); delete document.body._aiTextNodes; }
  document.querySelectorAll("[data-ai-original]").forEach(el => { el.innerHTML = el.dataset.aiOriginal; delete el.dataset.aiOriginal; });
  delete document.body.dataset.aiTranslated;
}

// ====== 在线文档模式（开关）======
document.getElementById("docModeBtn").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    // 先查询当前状态
    chrome.tabs.sendMessage(tabs[0].id, { action: "checkTranslated" }, res => {
      if (chrome.runtime.lastError) { showStatus("请刷新页面后重试", "#f44336"); return; }
      const isOn = res?.docMode;
      if (isOn) {
        chrome.tabs.sendMessage(tabs[0].id, { action: "stopDocMode" });
        showStatus("在线文档模式已关闭", "#4caf50");
      } else {
        chrome.tabs.sendMessage(tabs[0].id, { action: "startDocMode" });
        showStatus("已开启：复制内容将自动翻译", "#4caf50");
      }
      // 延迟更新按钮状态
      setTimeout(() => updateDocModeBtn(), 100);
    });
  });
});

function updateDocModeBtn() {
  const btn = document.getElementById("docModeBtn");
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
    if (!tabs[0]) return;
    chrome.tabs.sendMessage(tabs[0].id, { action: "checkTranslated" }, res => {
      if (chrome.runtime.lastError || !res) {
        btn.textContent = "在线文档模式（关闭）";
        btn.style.background = "#2a2a4a"; btn.style.color = "#bbb"; btn.style.borderColor = "#444";
        return;
      }
      if (res.docMode) {
        btn.textContent = "在线文档模式（已开启）";
        btn.style.background = "#1e3a2a"; btn.style.color = "#4caf50"; btn.style.borderColor = "#4caf50";
      } else {
        btn.textContent = "在线文档模式（关闭）";
        btn.style.background = "#2a2a4a"; btn.style.color = "#bbb"; btn.style.borderColor = "#444";
      }
    });
  });
}

// ====== 历史记录 ======
document.getElementById("historyToggle").addEventListener("click", (e) => {
  // 忽略刷新按钮的点击
  if (e.target.id === "refreshBtn") return;
  historyExpanded = !historyExpanded;
  document.getElementById("historyContent").classList.toggle("expanded", historyExpanded);
  document.getElementById("historyArrow").innerHTML = historyExpanded ? "&#x25B2;" : "&#x25BC;";
  if (historyExpanded) loadHistory();
});

document.getElementById("refreshBtn").addEventListener("click", (e) => {
  e.stopPropagation();
  loadHistory();
  showStatus("已刷新", "#4caf50");
});

document.querySelectorAll(".history-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".history-tab").forEach(t => t.classList.remove("active"));
    tab.classList.add("active"); currentTab = tab.dataset.type; renderHistoryList();
  });
});

function loadHistory() { chrome.runtime.sendMessage({ action: "getHistory" }, res => { allHistory = res?.history || []; renderHistoryList(); }); }

function renderHistoryList() {
  const list = document.getElementById("historyList");
  const filtered = allHistory.filter(h => currentTab === "words" ? h.isWord : !h.isWord);
  if (!filtered.length) { list.innerHTML = "<div class='history-empty'>" + (currentTab === "words" ? "暂无词汇记录" : "暂无句子/段落记录") + "</div>"; return; }
  list.innerHTML = filtered.map(item => {
    const realIdx = allHistory.indexOf(item);
    const fav = item.favorited ? "<span class='fav-star'>&#x2605; </span>" : "";
    const preview = item.isWord ? escapeHtml((item.brief || item.detailed || "").slice(0, 50)) : escapeHtml((item.translation || "").slice(0, 50));
    return "<div class='history-item' data-index='" + realIdx + "'>"
      + "<div class='h-original'>" + fav + escapeHtml(item.original.slice(0, 60)) + (item.original.length > 60 ? "..." : "") + "</div>"
      + "<div class='h-preview'>" + preview + "</div>"
      + "<div class='h-time'>" + escapeHtml(item.time) + "</div></div>";
  }).join("");

  list.querySelectorAll(".history-item").forEach(el => {
    el.addEventListener("click", () => {
      const idx = el.dataset.index;
      const url = chrome.runtime.getURL("src/popup/history.html?index=" + idx);
      // 先获取 popup 窗口位置，再发消息打开详情窗口
      try {
        chrome.windows.getCurrent(popupWin => {
          const left = (popupWin.left || 0) + (popupWin.width || 340) + 4;
          const top = popupWin.top || 100;
          chrome.runtime.sendMessage({
            action: "openWindow",
            key: "history",
            url,
            width: 420,
            height: 520,
            options: { left, top, updateUrl: true }
          });
        });
      } catch {
        // fallback：不设置位置，直接打开
        chrome.runtime.sendMessage({
          action: "openWindow",
          key: "history",
          url,
          width: 420,
          height: 520,
          options: { updateUrl: true }
        });
      }
    });
  });
}

// 清空（带确认）
document.getElementById("clearBtn").addEventListener("click", () => {
  const btn = document.getElementById("clearBtn");
  if (btn.dataset.confirm === "true") {
    chrome.storage.local.set({ history: [] }, () => {
      allHistory = []; renderHistoryList();
      showStatus("已清空", "#4caf50");
      btn.textContent = "清空全部历史记录";
      btn.dataset.confirm = "false";
    });
  } else {
    btn.textContent = "确认清空？再次点击确认";
    btn.dataset.confirm = "true";
    btn.style.color = "#ff5555";
    btn.style.borderColor = "#ff5555";
    setTimeout(() => {
      btn.textContent = "清空全部历史记录";
      btn.dataset.confirm = "false";
      btn.style.color = ""; btn.style.borderColor = "";
    }, 3000);
  }
});
