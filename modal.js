window.createModalController = function createModalController(target) {
  const modal = typeof target === "string" ? document.querySelector(target) : target;
  let returnFocus = null;

  if (!modal) throw new Error("找不到弹窗元素");

  return {
    open(trigger = document.activeElement) {
      if (!modal.hidden) return;
      returnFocus = trigger instanceof HTMLElement ? trigger : null;
      modal.hidden = false;
      const initialFocus = modal.querySelector("[data-modal-initial-focus]")
        || modal.querySelector("button:not(:disabled), input:not(:disabled), [tabindex='0']");
      initialFocus?.focus();
    },
    close() {
      if (modal.hidden) return;
      modal.hidden = true;
      if (returnFocus?.isConnected) returnFocus.focus();
      returnFocus = null;
    },
    isOpen() {
      return !modal.hidden;
    },
  };
};
