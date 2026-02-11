function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }
function escapeAttr(s) { return (s||"").replace(/&/g,"&amp;").replace(/'/g,"&#39;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function showStatus(t, c) { const s = document.getElementById("status"); s.style.color = c; s.textContent = t; if (c !== "#7b68ee") setTimeout(() => (s.textContent = ""), 3000); }

document.addEventListener("DOMContentLoaded", () => {
  // 关闭按钮
  document.getElementById("closeBtn")?.addEventListener("click", () => {
    chrome.windows.getCurrent(w => chrome.windows.remove(w.id));
  });

  chrome.storage.sync.get(["apiKey","model","customModels"], config => {
    if (config.apiKey) document.getElementById("apiKey").value = config.apiKey;
    const customs = config.customModels || [];
    renderModelOptions(customs); renderModelList(customs);
    if (config.model) {
      if (["qwen-turbo","qwen-plus","qwen-max"].includes(config.model)) document.getElementById("model").value = config.model;
      else if (customs.includes(config.model)) document.getElementById("model").value = config.model;
      else { document.getElementById("model").value = "__custom__"; document.getElementById("customModelGroup").style.display = "block"; document.getElementById("customModel").value = config.model; }
    }
  });
});

function renderModelOptions(list) {
  const sel = document.getElementById("model");
  sel.querySelectorAll("option[data-custom]").forEach(e => e.remove());
  const anchor = sel.querySelector('option[value="__custom__"]');
  list.forEach(m => { const o = document.createElement("option"); o.value = m; o.textContent = m + "（自定义）"; o.setAttribute("data-custom","true"); sel.insertBefore(o, anchor); });
}

function renderModelList(list) {
  const c = document.getElementById("savedModelList");
  if (!list.length) { c.innerHTML = ""; return; }
  c.innerHTML = list.map((m,i) => "<div class='saved-model-item'><span class='model-name' data-model='"+escapeAttr(m)+"'>"+escapeHtml(m)+"</span><span class='del-model' data-index='"+i+"'>&#x2715;</span></div>").join("");
  c.querySelectorAll(".model-name").forEach(el => el.addEventListener("click", () => { document.getElementById("model").value = el.dataset.model; document.getElementById("customModel").value = ""; }));
  c.querySelectorAll(".del-model").forEach(el => el.addEventListener("click", e => {
    e.stopPropagation();
    const idx = parseInt(el.dataset.index);
    chrome.storage.sync.get(["customModels","model"], data => {
      const models = data.customModels || []; const removed = models.splice(idx, 1)[0];
      chrome.storage.sync.set({ customModels: models }, () => {
        renderModelOptions(models); renderModelList(models);
        if (data.model === removed) { document.getElementById("model").value = "qwen-turbo"; chrome.storage.sync.set({ model: "qwen-turbo" }); }
        showStatus("已删除：" + removed, "#4caf50");
      });
    });
  }));
}

document.getElementById("addModelBtn").addEventListener("click", () => {
  const code = document.getElementById("customModel").value.trim();
  if (!code) { showStatus("请输入模型 code", "#f44336"); return; }
  chrome.storage.sync.get(["customModels"], data => {
    const models = data.customModels || [];
    if (models.includes(code)) { showStatus("已在列表中", "#f0c040"); return; }
    models.push(code);
    chrome.storage.sync.set({ customModels: models }, () => {
      renderModelOptions(models); renderModelList(models);
      document.getElementById("model").value = code; document.getElementById("customModel").value = "";
      document.getElementById("customModelGroup").style.display = "none";
      showStatus("已添加：" + code, "#4caf50");
    });
  });
});

document.getElementById("model").addEventListener("change", e => { document.getElementById("customModelGroup").style.display = e.target.value === "__custom__" ? "block" : "none"; });

document.getElementById("saveBtn").addEventListener("click", () => {
  const apiKey = document.getElementById("apiKey").value.trim(), sel = document.getElementById("model").value, custom = document.getElementById("customModel").value.trim();
  if (!apiKey) { showStatus("请填写 API Key", "#f44336"); return; }
  const model = sel === "__custom__" ? custom : sel;
  if (!model) { showStatus("请输入模型 code", "#f44336"); return; }
  chrome.storage.sync.set({ apiKey, model }, () => showStatus("已保存，模型：" + model, "#4caf50"));
});

// 导出
document.getElementById("exportBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "exportHistory" }, res => {
    const blob = new Blob([JSON.stringify(res.history || [], null, 2)], { type: "application/json" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "ai-translator-history-" + new Date().toISOString().slice(0, 10) + ".json";
    a.click(); URL.revokeObjectURL(a.href);
    showStatus("已导出 " + (res.history?.length || 0) + " 条", "#4caf50");
  });
});

// 导入
document.getElementById("importBtn").addEventListener("click", () => document.getElementById("importFile").click());
document.getElementById("importFile").addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  const r = new FileReader();
  r.onload = () => { try { const d = JSON.parse(r.result); if (!Array.isArray(d)) throw 0;
    chrome.runtime.sendMessage({ action: "importHistory", data: d }, res => { if (res?.success) showStatus("已导入 " + res.count + " 条", "#4caf50"); });
  } catch { showStatus("导入失败", "#f44336"); } };
  r.readAsText(f); e.target.value = "";
});

// 帮助链接
document.getElementById("helpLink").addEventListener("click", () => {
  chrome.runtime.sendMessage({
    action: "openWindow", key: "help",
    url: chrome.runtime.getURL("src/popup/help.html"),
    width: 500, height: 650
  });
});
