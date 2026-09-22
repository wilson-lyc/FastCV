const settingsUrl = chrome.runtime.getURL("settings.html");

function openSettingsFallback() {
  window.open(settingsUrl, "_blank");
}

document.querySelector("#open-options").addEventListener("click", () => {
  try {
    const result = chrome.runtime.openOptionsPage();
    if (result && typeof result.catch === "function") result.catch(openSettingsFallback);
  } catch {
    openSettingsFallback();
  }
});
