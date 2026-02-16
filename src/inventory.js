const createId = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

const overlaps = (aStart, aEnd, bStart, bEnd) => aStart < bEnd && bStart < aEnd;

export function createInventoryStore(initialState = {}) {
  const state = {
    assets: [],
    checkouts: [],
    reservations: [],
    maintenance: [],
    procurement: [],
    auditLog: [],
    ...initialState
  };

  const audit = (action, details) => {
    state.auditLog = [...state.auditLog, { id: createId("audit"), timestamp: new Date().toISOString(), action, details }];
  };

  const getAsset = (assetId) => state.assets.find((asset) => asset.assetId === assetId);

  return {
    getState: () => ({ ...state, assets: [...state.assets], checkouts: [...state.checkouts], reservations: [...state.reservations], maintenance: [...state.maintenance], procurement: [...state.procurement], auditLog: [...state.auditLog] }),
    addAsset: (asset) => {
      if (!asset.assetId || getAsset(asset.assetId)) {
        throw new Error("Asset ID is required and must be unique");
      }
      const newAsset = {
        ...asset,
        conditionScore: Number(asset.conditionScore ?? 5),
        tags: Array.isArray(asset.tags) ? asset.tags : String(asset.tags || "").split(",").map((value) => value.trim()).filter(Boolean),
        status: "available"
      };
      state.assets = [...state.assets, newAsset];
      audit("asset_added", { assetId: asset.assetId });
      return newAsset;
    },
    checkoutAsset: ({ assetId, borrowedBy, durationDays, conditionPhoto }) => {
      const asset = getAsset(assetId);
      if (!asset) throw new Error("Asset not found");
      if (asset.status === "checked_out") throw new Error("Asset is already checked out");
      if (!conditionPhoto) throw new Error("Condition photo is required");

      const dueAt = new Date(Date.now() + Number(durationDays || 1) * 86400000).toISOString();
      const checkout = { id: createId("co"), assetId, borrowedBy, checkedOutAt: new Date().toISOString(), dueAt, conditionPhoto };
      state.checkouts = [...state.checkouts, checkout];
      asset.status = "checked_out";
      audit("asset_checked_out", { assetId, borrowedBy, dueAt });
      return checkout;
    },
    checkinAsset: ({ assetId, conditionScore, repairNotes }) => {
      const asset = getAsset(assetId);
      if (!asset) throw new Error("Asset not found");
      if (asset.status !== "checked_out") throw new Error("Asset is not checked out");
      asset.status = "available";
      asset.conditionScore = Number(conditionScore ?? asset.conditionScore ?? 5);
      state.checkouts = state.checkouts.filter((checkout) => checkout.assetId !== assetId);
      audit("asset_checked_in", { assetId, conditionScore: asset.conditionScore, repairNotes: repairNotes || "" });
      return asset;
    },
    reserveAsset: ({ assetId, reservedBy, startAt, endAt, bufferMinutes = 15 }) => {
      const asset = getAsset(assetId);
      if (!asset) throw new Error("Asset not found");
      const start = new Date(startAt).getTime();
      const end = new Date(endAt).getTime();
      if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
        throw new Error("Invalid reservation time range");
      }
      const bufferMs = Number(bufferMinutes) * 60000;
      const conflict = state.reservations.find((reservation) =>
        reservation.assetId === assetId && overlaps(start - bufferMs, end + bufferMs, new Date(reservation.startAt).getTime(), new Date(reservation.endAt).getTime())
      );
      const request = { id: createId("res"), assetId, reservedBy, startAt: new Date(start).toISOString(), endAt: new Date(end).toISOString() };
      if (conflict) {
        request.waitlisted = true;
      }
      state.reservations = [...state.reservations, request];
      audit("asset_reserved", { assetId, reservedBy, waitlisted: Boolean(request.waitlisted) });
      return request;
    },
    addMaintenanceTask: ({ assetId, scheduledFor, type, vendor, cost }) => {
      if (!getAsset(assetId)) throw new Error("Asset not found");
      const task = { id: createId("mnt"), assetId, scheduledFor, type, vendor: vendor || "", cost: Number(cost || 0), status: "scheduled" };
      state.maintenance = [...state.maintenance, task];
      audit("maintenance_scheduled", { assetId, scheduledFor, type });
      return task;
    },
    createProcurementRequest: ({ requestedBy, itemName, justification, costCenter }) => {
      const request = {
        id: createId("proc"),
        requestedBy,
        itemName,
        justification,
        costCenter,
        status: "pending_team_lead"
      };
      state.procurement = [...state.procurement, request];
      audit("procurement_requested", { requestedBy, itemName, costCenter });
      return request;
    },
    getOverdueAssets: (now = Date.now()) =>
      state.checkouts
        .filter((checkout) => new Date(checkout.dueAt).getTime() < now)
        .map((checkout) => ({ ...checkout, overdue: true })),
    toJSON: () => JSON.stringify(state),
    hydrate: (serialized) => {
      if (!serialized) return;
      try {
        const parsed = JSON.parse(serialized);
        state.assets = Array.isArray(parsed.assets) ? parsed.assets : [];
        state.checkouts = Array.isArray(parsed.checkouts) ? parsed.checkouts : [];
        state.reservations = Array.isArray(parsed.reservations) ? parsed.reservations : [];
        state.maintenance = Array.isArray(parsed.maintenance) ? parsed.maintenance : [];
        state.procurement = Array.isArray(parsed.procurement) ? parsed.procurement : [];
        state.auditLog = Array.isArray(parsed.auditLog) ? parsed.auditLog : [];
      } catch {
        state.assets = [];
        state.checkouts = [];
        state.reservations = [];
        state.maintenance = [];
        state.procurement = [];
        state.auditLog = [];
      }
    }
  };
}
