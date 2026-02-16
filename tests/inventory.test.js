import test from "node:test";
import assert from "node:assert/strict";
import { createInventoryStore } from "../src/inventory.js";

test("asset lifecycle with checkout and checkin", () => {
  const store = createInventoryStore();
  store.addAsset({ assetId: "A-1", category: "3D Printer", location: "Lab A" });
  store.checkoutAsset({ assetId: "A-1", borrowedBy: "sam", durationDays: 1, conditionPhoto: "photo.jpg" });

  assert.throws(() => store.checkoutAsset({ assetId: "A-1", borrowedBy: "alex", durationDays: 1, conditionPhoto: "photo2.jpg" }), /already checked out/);

  store.checkinAsset({ assetId: "A-1", conditionScore: 4 });
  const state = store.getState();
  assert.equal(state.assets[0].status, "available");
  assert.equal(state.assets[0].conditionScore, 4);
});

test("reservation conflict creates waitlist entry", () => {
  const store = createInventoryStore();
  store.addAsset({ assetId: "A-2", category: "Oscilloscope", location: "Lab B" });

  const start = new Date("2026-01-01T10:00:00.000Z").toISOString();
  const end = new Date("2026-01-01T11:00:00.000Z").toISOString();
  const overlapStart = new Date("2026-01-01T10:30:00.000Z").toISOString();
  const overlapEnd = new Date("2026-01-01T11:30:00.000Z").toISOString();

  assert.equal(store.reserveAsset({ assetId: "A-2", reservedBy: "sam", startAt: start, endAt: end }).waitlisted, undefined);
  assert.equal(store.reserveAsset({ assetId: "A-2", reservedBy: "jules", startAt: overlapStart, endAt: overlapEnd }).waitlisted, true);
});

test("overdue detection and maintenance/procurement logging", () => {
  const store = createInventoryStore();
  store.addAsset({ assetId: "A-3", category: "Soldering Station", location: "Lab C" });
  store.checkoutAsset({ assetId: "A-3", borrowedBy: "pat", durationDays: 1, conditionPhoto: "photo.jpg" });
  const overdue = store.getOverdueAssets(Date.now() + 2 * 86400000);
  assert.equal(overdue.length, 1);

  store.addMaintenanceTask({ assetId: "A-3", scheduledFor: "2026-02-01", type: "Preventive" });
  store.createProcurementRequest({ requestedBy: "pat", itemName: "Laser Cutter", justification: "Capacity", costCenter: "RND" });

  const state = store.getState();
  assert.equal(state.maintenance.length, 1);
  assert.equal(state.procurement.length, 1);
  assert.ok(state.auditLog.length >= 4);
});
