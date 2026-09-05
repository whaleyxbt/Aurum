import assert from "node:assert/strict";
import test from "node:test";
import { groupTransactionsByDate } from "./transactionGroups.ts";

test("empty pages have no date groups", () => {
  assert.deepEqual(groupTransactionsByDate([]), []);
});

test("groups dates while preserving transaction order and the original input", () => {
  const items = Object.freeze([
    Object.freeze({ id: 3, date: "2026-06-03" }),
    Object.freeze({ id: 2, date: "2026-06-03" }),
    Object.freeze({ id: 1, date: "2026-06-02" }),
  ]);
  assert.deepEqual(groupTransactionsByDate(items), [
    { date: "2026-06-03", items: [items[0], items[1]] },
    { date: "2026-06-02", items: [items[2]] },
  ]);
});

test("all-time searches distinguish months and years, including leap day", () => {
  const items = ["2028-02-29", "2027-03-01", "2027-02-01", "2026-02-01"].map(date => ({ date }));
  assert.deepEqual(groupTransactionsByDate(items).map(group => group.date), items.map(item => item.date));
});

test("a day spanning pages is grouped independently without inventing daily totals", () => {
  const page = [{ id: 21, date: "2026-06-03" }];
  assert.deepEqual(groupTransactionsByDate(page), [{ date: "2026-06-03", items: page }]);
});
