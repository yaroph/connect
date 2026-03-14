// Simple in-app notifications (no browser alert/confirm/prompt)

export function notify(message, type = "info") {
  try {
    window.dispatchEvent(
      new CustomEvent("bni_notify", {
        detail: {
          id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
          type,
          message: String(message || ""),
        },
      })
    );
  } catch (e) {
    // no-op
  }
}

export const notifyError = (msg) => notify(msg, "error");
export const notifySuccess = (msg) => notify(msg, "success");
export const notifyInfo = (msg) => notify(msg, "info");

export function confirmAction(message, onConfirm, onCancel) {
  try {
    window.dispatchEvent(
      new CustomEvent("bni_confirm", {
        detail: {
          id: `${Date.now()}_${Math.random().toString(16).slice(2)}`,
          message: String(message || ""),
          onConfirm,
          onCancel,
        },
      })
    );
  } catch (e) {
    // fallback to browser confirm
    if (window.confirm(message)) {
      onConfirm?.();
    } else {
      onCancel?.();
    }
  }
}
