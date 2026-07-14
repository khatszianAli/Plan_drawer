"use strict";

/**
 * Modal dialog and small UI helpers.
 */

function confirmClear() {
  showModal(
    "Очистить план?",
    "Все стены будут удалены. Действие можно отменить через Ctrl+Z.",
    [
      { label: "Отмена" },
      {
        label: "Очистить",
        className: "danger",
        action: () => {
          walls = [];
          selectedIds.clear();
          commitHistory();
          runValidation(false);
          updateSelectionUI();
          draw();
        },
      },
    ],
  );
}
function showModal(title, message, actions = null) {
  $("modal-title").textContent = title;
  $("modal-message").textContent = message;
  const box = $("modal-actions");
  box.innerHTML = "";
  const items = actions || [{ label: "ОК" }];
  items.forEach((item) => {
    const b = document.createElement("button");
    b.className = "btn " + (item.className || "");
    b.textContent = item.label;
    b.onclick = () => {
      hideModal();
      if (item.action) item.action();
    };
    box.appendChild(b);
  });
  $("modal-backdrop").classList.remove("hidden");
}
function hideModal() {
  $("modal-backdrop").classList.add("hidden");
}
function escapeHtml(value) {
  return String(value).replace(
    /[&<>'"]/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        c
      ],
  );
}
function toggleSidebar() {
  $("sidebar").classList.toggle("open");
}
