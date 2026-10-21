/**
 * 到期天數口徑測試。
 *
 * 首頁統計（hooks/useDashboardStats.ts）與各模組頁（useFoods / useSubscriptions /
 * useShoppingList）都必須共用 getDaysFromToday，否則會出現「訂閱頁說今天扣款、
 * 首頁說 1 天後」這種不一致。
 *
 * 關鍵陷阱：Appwrite 的 date-only 欄位會存成 UTC 00:00（例如
 * "2026-10-22T00:00:00.000+00:00"），在 UTC+8 等於當天 08:00。若拿它跟 now 直接
 * 相減再 Math.ceil，今天就會算成 1 天後。
 */
process.env.TZ = "Asia/Taipei";

import assert from "node:assert/strict";
import test from "node:test";

const { getDaysFromToday } = await import("@/lib/formatters");

const pad = (n) => String(n).padStart(2, "0");

/** 本機時區的 YYYY-MM-DD */
function localYmd(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 模擬 Appwrite 把 date-only 存成 UTC 00:00 */
const storedAsUtcMidnight = (ymd) => `${ymd}T00:00:00.000+00:00`;

test("date-only 欄位以本地日曆日計算，今天就是 0 天", () => {
  assert.equal(getDaysFromToday(storedAsUtcMidnight(localYmd(0))), 0);
  assert.equal(getDaysFromToday(localYmd(0)), 0);
});

test("明天是 1 天後、昨天是 -1 天", () => {
  assert.equal(getDaysFromToday(storedAsUtcMidnight(localYmd(1))), 1);
  assert.equal(getDaysFromToday(storedAsUtcMidnight(localYmd(-1))), -1);
});

test("提醒窗口邊界：3 天與 7 天都要落在視窗內", () => {
  assert.equal(getDaysFromToday(storedAsUtcMidnight(localYmd(3))), 3);
  assert.equal(getDaysFromToday(storedAsUtcMidnight(localYmd(7))), 7);
  assert.equal(getDaysFromToday(storedAsUtcMidnight(localYmd(8))), 8);
});

test("空值與無法解析的日期回傳 Infinity（不進提醒清單）", () => {
  assert.equal(getDaysFromToday(""), Number.POSITIVE_INFINITY);
  assert.equal(getDaysFromToday("not-a-date"), Number.POSITIVE_INFINITY);
});
