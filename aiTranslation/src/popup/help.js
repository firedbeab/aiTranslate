document.getElementById("closeBtn")?.addEventListener("click", () => {
  chrome.windows.getCurrent(w => chrome.windows.remove(w.id));
});
