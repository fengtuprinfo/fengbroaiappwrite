/**
 * 排程備份的頻率選擇與「今天該不該跑」的判斷。
 *
 * vercel.json 的 cron 只能固定每天叫一次（改頻率要重新部署），所以「每 3／7／14／28 天」
 * 是在執行時決定的：拿上次**成功**的日期跟今天比，未滿間隔就跳過。
 *
 * 間隔只看成功、不看失敗：某天失敗後隔天會自動重試，直到補成功為止，
 * 不會因為一次失敗就再等 28 天。
 */

/** 可選的備份間隔（天）。1 = 每天。 */
export const BACKUP_INTERVAL_OPTIONS = [1, 3, 7, 14, 28] as const;

export type BackupIntervalDays = (typeof BACKUP_INTERVAL_OPTIONS)[number];

/** 沒設定過時沿用舊行為：每天備份。 */
export const DEFAULT_BACKUP_INTERVAL: BackupIntervalDays = 1;

export const BACKUP_SCHEDULE_TIME_LABEL = "每天 06:06（台灣時間）";

/** 把存成字串的設定值收斂成允許的間隔；不認識的值一律回預設。 */
export function parseBackupInterval(value: unknown): BackupIntervalDays {
  const days = Number(value);
  return (BACKUP_INTERVAL_OPTIONS as readonly number[]).includes(days)
    ? (days as BackupIntervalDays)
    : DEFAULT_BACKUP_INTERVAL;
}

/** "每天" / "每 3 天" …，給畫面與通知信共用。 */
export function intervalLabel(days: unknown): string {
  const interval = parseBackupInterval(days);
  return interval === 1 ? "每天" : `每 ${interval} 天`;
}

/**
 * 台北時區的 YYYY-MM-DD。
 *
 * 備份檔名用的是 YYYYMMDD（`taipeiDateStamp`），但間隔比較需要可讀、可排序的日期，
 * 所以設定與狀態一律存這個格式，兩者都由同一個時區決定，不會出現「檔名是今天、
 * 判定卻是昨天」的錯位。
 */
export function taipeiDateKey(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** YYYY-MM-DD → YYYYMMDD（備份檔名用）。 */
export function dateStampFromKey(key: string): string {
  return key.replace(/-/g, "");
}

/** 日期字串轉成「UTC 天數」，只拿來相減，不涉及本地時區。 */
function keyToUtcDay(key: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
  if (!match) return null;
  const time = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(time) ? null : Math.round(time / 86_400_000);
}

function utcDayToKey(day: number): string {
  return new Date(day * 86_400_000).toISOString().slice(0, 10);
}

/** `to` 減 `from` 的日曆天數；任一格格式不對就回 null。 */
export function daysBetweenDateKeys(from: string, to: string): number | null {
  const start = keyToUtcDay(from);
  const end = keyToUtcDay(to);
  if (start == null || end == null) return null;
  return end - start;
}

export function addDaysToDateKey(key: string, days: number): string | null {
  const day = keyToUtcDay(key);
  if (day == null) return null;
  return utcDayToKey(day + days);
}

export type BackupScheduleDecision = {
  run: boolean;
  /** 給記錄／除錯看的一句話，不直接顯示給使用者。 */
  reason: string;
  daysSinceSuccess: number | null;
};

/**
 * 今天要不要跑排程備份。
 *
 * - 關閉 → 不跑
 * - 沒有成功紀錄 → 跑（第一次、或剛換資料庫）
 * - 上次成功在未來（時鐘跳動）→ 跑，避免永久卡住
 * - 距上次成功 < 間隔 → 跳過
 */
export function shouldRunScheduledBackup(input: {
  enabled: boolean;
  intervalDays: unknown;
  lastSuccessDate: string;
  todayKey: string;
}): BackupScheduleDecision {
  if (!input.enabled) {
    return { run: false, reason: "排程備份已關閉", daysSinceSuccess: null };
  }

  const interval = parseBackupInterval(input.intervalDays);
  const days = daysBetweenDateKeys(input.lastSuccessDate, input.todayKey);

  if (days == null) {
    return { run: true, reason: "還沒有成功紀錄，先跑一次", daysSinceSuccess: null };
  }
  if (days < 0) {
    return { run: true, reason: "上次成功日期在未來，先跑一次", daysSinceSuccess: days };
  }
  if (days < interval) {
    return {
      run: false,
      reason: `距上次成功 ${days} 天，未滿 ${interval} 天`,
      daysSinceSuccess: days,
    };
  }
  return { run: true, reason: `距上次成功 ${days} 天，已達 ${interval} 天`, daysSinceSuccess: days };
}

/**
 * 下次應該備份的日期（YYYY-MM-DD）。
 *
 * 今天已達間隔就回今天（等下一次 cron），否則回「上次成功 + 間隔」。
 */
export function nextBackupDateKey(input: {
  intervalDays: unknown;
  lastSuccessDate: string;
  todayKey: string;
}): string {
  const interval = parseBackupInterval(input.intervalDays);
  const due = addDaysToDateKey(input.lastSuccessDate, interval);
  if (!due) return input.todayKey;
  return due <= input.todayKey ? input.todayKey : due;
}

/** 「今天」「明天」「5 天後（2026-10-27）」。 */
export function describeBackupDate(targetKey: string, todayKey: string): string {
  const days = daysBetweenDateKeys(todayKey, targetKey);
  if (days == null) return targetKey;
  if (days <= 0) return "今天";
  if (days === 1) return "明天";
  return `${days} 天後（${targetKey}）`;
}
