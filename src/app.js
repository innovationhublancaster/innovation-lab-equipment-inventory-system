import { createInventoryStore } from "./inventory.js";

const storageKey = "innovation_inventory_store";
const store = createInventoryStore();
store.hydrate(localStorage.getItem(storageKey));

const byId = (id) => document.getElementById(id);
const formData = (form) => Object.fromEntries(new FormData(form).entries());
const persistAndRender = () => {
  localStorage.setItem(storageKey, store.toJSON());
  render();
};

const submit = (id, handler) => {
  byId(id).addEventListener("submit", (event) => {
    event.preventDefault();
    const message = byId("message");
    try {
      handler(formData(event.target));
      event.target.reset();
      message.textContent = "Saved.";
      message.className = "ok";
      persistAndRender();
    } catch (error) {
      message.textContent = error.message;
      message.className = "error";
    }
  });
};

submit("asset-form", (data) => store.addAsset({
  ...data,
  conditionScore: Number(data.conditionScore || 5)
}));

submit("checkout-form", (data) => store.checkoutAsset({
  ...data,
  durationDays: Number(data.durationDays || 1)
}));

submit("checkin-form", (data) => store.checkinAsset({
  ...data,
  conditionScore: Number(data.conditionScore || 5)
}));

submit("reservation-form", (data) => store.reserveAsset(data));
submit("maintenance-form", (data) => store.addMaintenanceTask({ ...data, cost: Number(data.cost || 0) }));
submit("procurement-form", (data) => store.createProcurementRequest(data));

byId("export-json").addEventListener("click", () => {
  const blob = new Blob([store.toJSON()], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "inventory-export.json";
  link.click();
  URL.revokeObjectURL(url);
});

const renderRows = (id, rows, fields) => {
  byId(id).innerHTML = rows.map((row) => `<tr>${fields.map((field) => `<td>${row[field] ?? ""}</td>`).join("")}</tr>`).join("") || `<tr><td colspan="${fields.length}">No records</td></tr>`;
};

function render() {
  const state = store.getState();
  const overdue = store.getOverdueAssets();
  renderRows("asset-rows", state.assets, ["assetId", "category", "model", "location", "assignedProject", "costCenter", "status", "conditionScore"]);
  renderRows("checkout-rows", state.checkouts, ["assetId", "borrowedBy", "checkedOutAt", "dueAt"]);
  renderRows("reservation-rows", state.reservations, ["assetId", "reservedBy", "startAt", "endAt", "waitlisted"]);
  renderRows("maintenance-rows", state.maintenance, ["assetId", "scheduledFor", "type", "vendor", "cost", "status"]);
  renderRows("procurement-rows", state.procurement, ["requestedBy", "itemName", "costCenter", "status"]);
  renderRows("audit-rows", state.auditLog.slice(-25).reverse(), ["timestamp", "action"]);
  byId("overdue-count").textContent = String(overdue.length);
}

render();
