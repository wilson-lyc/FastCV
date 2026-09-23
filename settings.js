const DB_NAME = "fastcv-v1";
const DB_VERSION = 1;
const STORE_NAMES = ["profiles", "profileVersions", "profileDrafts", "siteRules", "fillTransactions", "metadata"];
const resetModal = window.createModalController("#reset-modal");
let isResetting = false;

function uid(prefix = "id") {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("profiles")) database.createObjectStore("profiles", { keyPath: "profileId" });
      if (!database.objectStoreNames.contains("profileVersions")) database.createObjectStore("profileVersions", { keyPath: "versionId" });
      if (!database.objectStoreNames.contains("profileDrafts")) database.createObjectStore("profileDrafts", { keyPath: "profileId" });
      if (!database.objectStoreNames.contains("siteRules")) database.createObjectStore("siteRules", { keyPath: "ruleId" });
      if (!database.objectStoreNames.contains("fillTransactions")) database.createObjectStore("fillTransactions", { keyPath: "transactionId" });
      if (!database.objectStoreNames.contains("metadata")) database.createObjectStore("metadata", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("无法打开本地数据"));
  });
}

function readAll(database, storeName) {
  return new Promise((resolve, reject) => {
    const request = database.transaction(storeName, "readonly").objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error || new Error("读取本地数据失败"));
  });
}

function runTransaction(database, storeNames, action) {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeNames, "readwrite");
    action(transaction);
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error("保存数据失败"));
    transaction.onabort = () => reject(transaction.error || new Error("操作已取消"));
  });
}

function showStatus(message, isError = false) {
  const status = document.querySelector("#status-message");
  status.textContent = message;
  status.classList.toggle("error", isError);
}

async function exportBackup() {
  const database = await openDb();
  try {
    const [profiles, profileVersions, profileDrafts, siteRules] = await Promise.all([
      readAll(database, "profiles"),
      readAll(database, "profileVersions"),
      readAll(database, "profileDrafts"),
      readAll(database, "siteRules"),
    ]);
    const backup = {
      format: "fastcv-backup",
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      profiles,
      profileVersions,
      profileDrafts,
      siteRules,
      metadata: { appVersion: "0.1.0", schemaVersion: 1 },
    };
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = blobUrl;
    link.download = `fastcv-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    showStatus("备份已导出。");
  } finally {
    database.close();
  }
}

function isValidBackup(backup) {
  return backup && backup.format === "fastcv-backup" && Number(backup.formatVersion) === 1
    && Array.isArray(backup.profiles) && Array.isArray(backup.profileVersions);
}

async function importBackup(file) {
  const backup = JSON.parse(await file.text());
  if (!isValidBackup(backup)) throw new Error("这不是有效的 FastCV v1 备份文件。");
  if (!window.confirm(`将导入 ${backup.profiles.length} 个档案及其历史版本。现有数据不会被覆盖，导入内容会创建为新的档案副本。继续吗？`)) return;

  const profileIdMap = new Map(backup.profiles.map((profile) => [profile.profileId, uid("profile")]));
  const versionIdMap = new Map(backup.profileVersions.map((version) => [version.versionId, uid("version")]));
  const now = new Date().toISOString();
  const importedProfiles = backup.profiles.map((profile) => ({
    ...profile,
    profileId: profileIdMap.get(profile.profileId),
    displayName: `${profile.displayName || "未命名档案"}（导入）`,
    baseProfileId: profile.baseProfileId ? profileIdMap.get(profile.baseProfileId) || null : null,
    currentVersionId: profile.currentVersionId ? versionIdMap.get(profile.currentVersionId) || null : null,
    createdAt: now,
    updatedAt: now,
  }));
  const importedVersions = backup.profileVersions.map((version) => ({
    ...version,
    versionId: versionIdMap.get(version.versionId),
    profileId: profileIdMap.get(version.profileId) || null,
    baseProfileId: version.baseProfileId ? profileIdMap.get(version.baseProfileId) || null : null,
    baseVersionId: version.baseVersionId ? versionIdMap.get(version.baseVersionId) || null : null,
    createdBy: "backup_restore",
  })).filter((version) => version.profileId);
  const importedDrafts = (backup.profileDrafts || []).map((draft) => ({
    ...draft,
    profileId: profileIdMap.get(draft.profileId),
    updatedAt: now,
  })).filter((draft) => draft.profileId);
  const importedSiteRules = (backup.siteRules || []).map((rule) => ({ ...rule, ruleId: uid("rule") }));

  const database = await openDb();
  try {
    await runTransaction(database, ["profiles", "profileVersions", "profileDrafts", "siteRules"], (transaction) => {
      importedProfiles.forEach((profile) => transaction.objectStore("profiles").put(profile));
      importedVersions.forEach((version) => transaction.objectStore("profileVersions").put(version));
      importedDrafts.forEach((draft) => transaction.objectStore("profileDrafts").put(draft));
      importedSiteRules.forEach((rule) => transaction.objectStore("siteRules").put(rule));
    });
    showStatus(`已导入 ${importedProfiles.length} 个档案副本和 ${importedSiteRules.length} 条网站规则。`);
  } finally {
    database.close();
  }
}

async function resetAllData() {
  const database = await openDb();
  try {
    await runTransaction(database, STORE_NAMES, (transaction) => {
      STORE_NAMES.forEach((storeName) => transaction.objectStore(storeName).clear());
    });
  } finally {
    database.close();
  }
}

function openResetModal() {
  document.querySelector("#reset-error").textContent = "";
  resetModal.open(document.querySelector("#reset-button"));
}

function closeResetModal(force = false) {
  if (isResetting && !force) return;
  resetModal.close();
}

async function confirmReset() {
  if (isResetting) return;
  const confirmButton = document.querySelector("#reset-confirm");
  const cancelButton = document.querySelector("#reset-cancel");
  const closeButton = document.querySelector("#reset-close");
  const error = document.querySelector("#reset-error");
  const startedAt = Date.now();
  isResetting = true;
  confirmButton.disabled = true;
  confirmButton.classList.add("button-resetting");
  confirmButton.setAttribute("aria-busy", "true");
  cancelButton.disabled = true;
  closeButton.disabled = true;
  confirmButton.innerHTML = '<svg class="reset-button-spinner" width="18" height="18" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M4 24C4 35.0457 12.9543 44 24 44C35.0457 44 44 35.0457 44 24C44 12.9543 35.0457 4 24 4" stroke="#ffffff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg><span>正在重置</span>';
  error.textContent = "";
  try {
    await resetAllData();
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, 3000 - (Date.now() - startedAt))));
    closeResetModal(true);
    showStatus("全部本地数据已重置。返回简历资料后会创建一个空白档案。");
  } catch (resetError) {
    error.textContent = resetError.message || "重置数据失败，请重试。";
  } finally {
    isResetting = false;
    confirmButton.disabled = false;
    confirmButton.classList.remove("button-resetting");
    confirmButton.removeAttribute("aria-busy");
    cancelButton.disabled = false;
    closeButton.disabled = false;
    confirmButton.textContent = "确认重置";
  }
}

document.querySelector("#export-button").addEventListener("click", async () => {
  showStatus("");
  try {
    await exportBackup();
  } catch (error) {
    showStatus(error.message || "导出备份失败。", true);
  }
});

document.querySelector("#import-button").addEventListener("click", () => document.querySelector("#import-file").click());
document.querySelector("#import-file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  showStatus("");
  try {
    await importBackup(file);
  } catch (error) {
    showStatus(error.message || "导入备份失败。", true);
  } finally {
    event.target.value = "";
  }
});

document.querySelector("#reset-button").addEventListener("click", () => {
  showStatus("");
  openResetModal();
});

document.querySelector("#reset-close").addEventListener("click", closeResetModal);
document.querySelector("#reset-cancel").addEventListener("click", closeResetModal);
document.querySelector("#reset-confirm").addEventListener("click", confirmReset);
document.querySelector("#reset-modal").addEventListener("click", (event) => {
  if (event.target.id === "reset-modal" && !isResetting) closeResetModal();
});
document.addEventListener("keydown", (event) => {
  const modal = document.querySelector("#reset-modal");
  if (modal.hidden) return;
  if (event.key === "Escape" && !isResetting) {
    event.preventDefault();
    closeResetModal();
  } else if (event.key === "Tab") {
    const controls = [...modal.querySelectorAll("button:not(:disabled)")];
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
});
