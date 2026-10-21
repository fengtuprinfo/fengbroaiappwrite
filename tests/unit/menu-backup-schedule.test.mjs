import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  BACKUP_INTERVAL_OPTIONS,
  addDaysToDateKey,
  dateStampFromKey,
  daysBetweenDateKeys,
  describeBackupDate,
  intervalLabel,
  nextBackupDateKey,
  parseBackupInterval,
  shouldRunScheduledBackup,
  taipeiDateKey,
} from "../../lib/menuBackup/schedule.ts";

describe("backup interval options", () => {
  it("offers 1/3/7/14/28 days", () => {
    assert.deepEqual([...BACKUP_INTERVAL_OPTIONS], [1, 3, 7, 14, 28]);
  });

  it("falls back to daily for anything unknown", () => {
    assert.equal(parseBackupInterval(undefined), 1);
    assert.equal(parseBackupInterval(""), 1);
    assert.equal(parseBackupInterval("5"), 1);
    assert.equal(parseBackupInterval(0), 1);
    assert.equal(parseBackupInterval(-7), 1);
    assert.equal(parseBackupInterval("14"), 14);
    assert.equal(parseBackupInterval(28), 28);
  });

  it("labels the interval the way the settings card shows it", () => {
    assert.equal(intervalLabel(1), "每天");
    assert.equal(intervalLabel("3"), "每 3 天");
    assert.equal(intervalLabel(28), "每 28 天");
    assert.equal(intervalLabel("nope"), "每天");
  });
});

describe("taipei date keys", () => {
  it("uses the Taipei calendar day, not UTC", () => {
    // 2026-10-21 22:30 UTC = 2026-10-22 06:30 台北，正是 cron 執行的時間。
    assert.equal(taipeiDateKey(new Date("2026-10-21T22:30:00Z")), "2026-10-22");
    // 2026-10-21 15:59 UTC = 2026-10-21 23:59 台北。
    assert.equal(taipeiDateKey(new Date("2026-10-21T15:59:00Z")), "2026-10-21");
  });

  it("converts to the YYYYMMDD used by backup filenames", () => {
    assert.equal(dateStampFromKey("2026-10-22"), "20261022");
  });

  it("counts calendar days between keys", () => {
    assert.equal(daysBetweenDateKeys("2026-10-01", "2026-10-01"), 0);
    assert.equal(daysBetweenDateKeys("2026-10-01", "2026-10-08"), 7);
    assert.equal(daysBetweenDateKeys("2026-10-08", "2026-10-01"), -7);
    assert.equal(daysBetweenDateKeys("", "2026-10-01"), null);
    assert.equal(daysBetweenDateKeys("2026-10-01", "not-a-date"), null);
  });

  it("adds days across month boundaries", () => {
    assert.equal(addDaysToDateKey("2026-10-28", 7), "2026-11-04");
    assert.equal(addDaysToDateKey("2026-12-28", 7), "2027-01-04");
    assert.equal(addDaysToDateKey("bad", 7), null);
  });
});

describe("shouldRunScheduledBackup", () => {
  const base = { enabled: true, intervalDays: 1, lastSuccessDate: "2026-10-21", todayKey: "2026-10-22" };

  it("never runs when the schedule is off", () => {
    const decision = shouldRunScheduledBackup({ ...base, enabled: false });
    assert.equal(decision.run, false);
  });

  it("runs the first time because there is no success yet", () => {
    const decision = shouldRunScheduledBackup({ ...base, lastSuccessDate: "" });
    assert.equal(decision.run, true);
  });

  it("runs daily when the interval is 1", () => {
    assert.equal(shouldRunScheduledBackup(base).run, true);
  });

  it("skips while the interval has not elapsed", () => {
    const decision = shouldRunScheduledBackup({
      ...base,
      intervalDays: 3,
      lastSuccessDate: "2026-10-20",
    });
    assert.equal(decision.run, false);
    assert.equal(decision.daysSinceSuccess, 2);
  });

  it("runs on the exact interval day", () => {
    const decision = shouldRunScheduledBackup({
      ...base,
      intervalDays: 3,
      lastSuccessDate: "2026-10-19",
    });
    assert.equal(decision.run, true);
    assert.equal(decision.daysSinceSuccess, 3);
  });

  it("keeps retrying after a failure instead of waiting another full interval", () => {
    // 28 天的排程，10/01 成功後 10/29 該跑；那天失敗了，lastSuccessDate 仍是 10/01，
    // 所以 10/30 會再試一次，不會等到 11/26。
    const decision = shouldRunScheduledBackup({
      ...base,
      intervalDays: 28,
      lastSuccessDate: "2026-10-01",
      todayKey: "2026-10-30",
    });
    assert.equal(decision.run, true);
  });

  it("runs when the last success is in the future (clock skew)", () => {
    const decision = shouldRunScheduledBackup({
      ...base,
      intervalDays: 7,
      lastSuccessDate: "2026-12-01",
    });
    assert.equal(decision.run, true);
  });
});

describe("next run date", () => {
  it("points at today once the interval has elapsed", () => {
    assert.equal(
      nextBackupDateKey({ intervalDays: 3, lastSuccessDate: "2026-10-19", todayKey: "2026-10-22" }),
      "2026-10-22"
    );
  });

  it("points at last success + interval while waiting", () => {
    assert.equal(
      nextBackupDateKey({ intervalDays: 7, lastSuccessDate: "2026-10-20", todayKey: "2026-10-22" }),
      "2026-10-27"
    );
  });

  it("asks for a run today when nothing has succeeded yet", () => {
    assert.equal(
      nextBackupDateKey({ intervalDays: 28, lastSuccessDate: "", todayKey: "2026-10-22" }),
      "2026-10-22"
    );
  });

  it("describes the wait in days", () => {
    assert.equal(describeBackupDate("2026-10-22", "2026-10-22"), "今天");
    assert.equal(describeBackupDate("2026-10-23", "2026-10-22"), "明天");
    assert.equal(describeBackupDate("2026-10-29", "2026-10-22"), "7 天後（2026-10-29）");
  });
});
