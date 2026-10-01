import test from "node:test";
import assert from "node:assert/strict";
import * as expiry from "../src/expiry-model.js";
const batch = { id: "one", plu: "1", department: "HAIRCARE", productionDate: "2026-03-01", quantity: 3, unit: "PCS", events: [] };
const vault = () => ({ schemaVersion: 1, archives: [], expiryRecords: [], departmentChecks: [], events: [] });
test("seven calendar months uses month-end clamping and leap years", () => {
  assert.equal(expiry.addMonths("2026-03-01", 7), "2026-10-01");
  assert.equal(expiry.addMonths("2026-07-31", 7), "2027-02-28");
  assert.equal(expiry.addMonths("2023-07-31", 7), "2024-02-29");
});
test("off shelf today differs from overdue and printed date overrides the default", () => {
  assert.equal(expiry.expiryStatus(batch, "2026-10-01").key, "today");
  assert.equal(expiry.expiryStatus(batch, "2026-10-02").key, "overdue");
  assert.equal(expiry.offShelfDate({ ...batch, expiryOverride: "2026-09-01" }), "2026-09-01");
  assert.equal(expiry.expiryStatus({ ...batch, productionDate: "2026-06-01" }, "2026-10-01").key, "3-months");
  assert.equal(expiry.expiryStatus({ ...batch, productionDate: "2026-06-02" }, "2026-10-01").key, "later");
});
test("Dubai calendar date rolls over before UTC midnight", () => {
  assert.equal(expiry.dubaiToday(new Date("2026-09-30T20:30:00Z")), "2026-10-01");
});
test("multiple batches persist and inspection is explicit", () => {
  let records = expiry.saveExpiryRecord(vault(), batch, "2026-10-01T10:00:00Z");
  records = expiry.saveExpiryRecord(records, { ...batch, id: "two", productionDate: "2026-04-01" }, "2026-10-01T10:00:00Z");
  assert.equal(records.expiryRecords.length, 2);
  assert.equal(records.departmentChecks.length, 0);
  records = expiry.recordDepartmentCheck(records, "HAIRCARE", "2026-10-01", "2026-10-08", "2026-10-01T10:00:00Z");
  assert.equal(records.departmentChecks[0].date, "2026-10-01");
  records = expiry.saveExpiryRecord(records, { ...records.expiryRecords[0], status: "closed", closureReason: "Wasted" }, "2026-10-01T11:00:00Z");
  assert.equal(records.expiryRecords[0].events.length, 2);
  assert.equal(records.expiryRecords[0].closureReason, "Wasted");
});
test("invalid and future production dates are rejected without changing records", () => {
  const records = vault();
  assert.throws(() => expiry.saveExpiryRecord(records, { ...batch, productionDate: "2026-02-30" }, "2026-10-01T10:00:00Z"), /date/i);
  assert.throws(() => expiry.saveExpiryRecord(records, { ...batch, productionDate: "2027-01-01" }, "2026-10-01T10:00:00Z"), /future/i);
  assert.equal(records.expiryRecords.length, 0);
});
