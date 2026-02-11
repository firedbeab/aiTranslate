function renderMd(text) {
  let h = (text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  h = h.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  h = h.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  h = h.replace(/`([^`]+)`/g, "<code>$1</code>");
  h = h.replace(/\n/g, "<br>");
  return h;
}
function escapeHtml(s) { const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML; }

// 从 URL 参数获取 index
const params = new URLSearchParams(window.location.search);
const itemIndex = parseInt(params.get("index"));
let currentItem = null;

document.addEventListener("DOMContentLoaded", () => {
  chrome.runtime.sendMessage({ action: "getHistory" }, res => {
    const history = res?.history || [];
    if (itemIndex < 0 || itemIndex >= history.length) {
      document.getElementById("content").innerHTML = "<div class='no-content'>记录不存在</div>";
      return;
    }
    currentItem = history[itemIndex];
    renderDetail();
  });
});

function renderDetail() {
  const item = currentItem;

  // 原文
  const origSection = document.getElementById("originalSection");
  const isLong = item.original.length > 150;
  if (isLong) {
    origSection.innerHTML = "<div class='original-text truncated' id='origText'>" + escapeHtml(item.original) + "</div>"
      + "<span class='expand-btn' id='expandBtn'>展开全文</span>";
    let expanded = false;
    setTimeout(() => {
      document.getElementById("expandBtn")?.addEventListener("click", () => {
        expanded = !expanded;
        document.getElementById("origText").classList.toggle("truncated", !expanded);
        document.getElementById("expandBtn").textContent = expanded ? "收起" : "展开全文";
      });
    }, 30);
  } else {
    origSection.innerHTML = "<div class='original-text'>" + escapeHtml(item.original) + "</div>";
  }

  // 时间
  document.getElementById("timeInfo").textContent = item.time || "";

  // 收藏状态
  updateFav(item.favorited);

  // Tab 和内容
  const tabsEl = document.getElementById("tabs");
  const contentEl = document.getElementById("content");

  if (item.isWord) {
    tabsEl.innerHTML = "<div class='tab active' data-tab='brief'>简明释义</div>"
      + "<div class='tab' data-tab='detailed'>详细讲解</div>";
    showTab("brief");
    tabsEl.querySelectorAll(".tab").forEach(tab => {
      tab.addEventListener("click", () => {
        tabsEl.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        showTab(tab.dataset.tab);
      });
    });
  } else {
    tabsEl.innerHTML = "";
    contentEl.innerHTML = renderMd(item.translation || "");
  }
}

function showTab(tab) {
  const el = document.getElementById("content");
  if (tab === "brief") {
    el.innerHTML = currentItem.brief ? renderMd(currentItem.brief) : "<div class='no-content'>暂无简明释义，划词翻译该单词后自动记录</div>";
  } else {
    if (currentItem.detailed) {
      el.innerHTML = renderMd(currentItem.detailed);
    } else {
      el.innerHTML = "<div class='no-content'>暂无详细讲解</div>"
        + "<button class='fetch-btn' id='fetchBtn'>立即获取</button>";
      setTimeout(() => {
        document.getElementById("fetchBtn")?.addEventListener("click", () => {
          el.innerHTML = "<span style='color:#7b68ee'>加载中...</span>";
          chrome.runtime.sendMessage(
            { action: "translate", text: currentItem.original, isWord: true, detailed: true },
            res => {
              if (res?.success) {
                currentItem.detailed = res.text;
                el.innerHTML = renderMd(res.text);
                chrome.runtime.sendMessage({ action: "updateHistory", index: itemIndex, field: "detailed", value: res.text });
              } else {
                el.innerHTML = "<div class='no-content'>获取失败：" + escapeHtml(res?.error || "") + "</div>";
              }
            }
          );
        });
      }, 30);
    }
  }
}

function updateFav(fav) {
  const btn = document.getElementById("favBtn");
  btn.textContent = fav ? "已收藏" : "收藏";
  btn.classList.toggle("fav-active", !!fav);
}

// 返回
document.getElementById("backBtn").addEventListener("click", () => {
  chrome.windows.getCurrent(w => chrome.windows.remove(w.id));
});

// 收藏
document.getElementById("favBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "toggleFavorite", index: itemIndex }, res => {
    if (res?.success) { currentItem.favorited = res.favorited; updateFav(res.favorited); }
  });
});

// 删除
document.getElementById("delBtn").addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "deleteHistory", index: itemIndex }, res => {
    if (res?.success) chrome.windows.getCurrent(w => chrome.windows.remove(w.id));
  });
});
