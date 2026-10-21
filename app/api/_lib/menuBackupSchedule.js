/**
 * 排程備份的設定與執行紀錄（notificationsettings 表的 documentId "menubackup"）。
 *
 * 設定與 cron 共用同一份資料：鋒兄設定寫入頻率，cron 每次執行前讀它決定要不要跑，
 * 跑完再寫回結果，設定頁就靠這些欄位顯示「上次到底成功沒」。
 */
import { createAppwrite } from "./appwriteClient";
import {
  ensureNotificationSettingsCollection,
  readSettingsDocument,
} from "./notificationSettingsTable";
import { MENU_BACKUP_SCHEDULE_DOCUMENT_ID } from "../../../lib/notifications/notificationSettings";
import {
  nextBackupDateKey,
  parseBackupInterval,
  taipeiDateKey,
} from "../../../lib/menuBackup/schedule";

export async function loadScheduleContext(searchParams) {
  const { databases, databaseId } = createAppwrite(searchParams);
  const collectionId = await ensureNotificationSettingsCollection(databases, databaseId);
  const doc = await readSettingsDocument(
    databases,
    databaseId,
    collectionId,
    MENU_BACKUP_SCHEDULE_DOCUMENT_ID
  );
  return { databases, databaseId, collectionId, doc };
}

/** 文件不存在時回預設值：開啟、每天一次，與加入這個功能前的行為一致。 */
export function readSchedule(doc) {
  return {
    enabled: doc?.enabled !== "false",
    intervalDays: parseBackupInterval(doc?.intervalDays),
    lastAttemptAt: doc?.lastAttemptAt || "",
    lastResult: doc?.lastResult || "",
    lastMessage: doc?.lastMessage || "",
    lastFile: doc?.lastFile || "",
    lastSuccessAt: doc?.lastSuccessAt || "",
    lastSuccessDate: doc?.lastSuccessDate || "",
  };
}

/**
 * 寫入設定文件：有就更新、沒有就建立。
 *
 * 不用 `doc` 是否為 null 來判斷，因為 cron 只帶 documentId、不先讀一次；
 * update 404 才 create，兩條路都只有一次寫入。
 */
async function writeSchedule(databases, databaseId, collectionId, data) {
  try {
    await databases.updateDocument({
      databaseId,
      collectionId,
      documentId: MENU_BACKUP_SCHEDULE_DOCUMENT_ID,
      data,
    });
  } catch (error) {
    if (error?.code !== 404) throw error;
    await databases.createDocument({
      databaseId,
      collectionId,
      documentId: MENU_BACKUP_SCHEDULE_DOCUMENT_ID,
      data,
    });
  }
}

/** 儲存使用者在鋒兄設定選的頻率。 */
export async function saveSchedule(databases, databaseId, collectionId, input) {
  const enabled = input?.enabled !== false;
  const intervalDays = parseBackupInterval(input?.intervalDays);
  await writeSchedule(databases, databaseId, collectionId, {
    enabled: enabled ? "true" : "false",
    intervalDays: String(intervalDays),
  });
}

/** 執行結果 → 文件欄位；只有成功（含部分成功）才推進 lastSuccessDate，那是間隔的錨點。 */
export function runRecordFromOutcome({ status, body }, now = new Date()) {
  const attemptedAt = now.toISOString();
  const failedMenus = (body?.results || []).filter((result) => result.status === "error");
  const ok = status < 400 && body?.success === true;

  if (!ok) {
    return {
      lastAttemptAt: attemptedAt,
      lastResult: "failed",
      lastMessage: body?.error || "排程備份失敗",
      lastFile: "",
    };
  }

  return {
    lastAttemptAt: attemptedAt,
    lastResult: failedMenus.length > 0 ? "partial" : "ok",
    lastMessage:
      failedMenus.length > 0
        ? `已上傳 ${body?.ok ?? 0} 個選單，${failedMenus.length} 個失敗：${failedMenus
            .map((result) => result.label)
            .join("、")}`
        : `已上傳 ${body?.ok ?? 0} 個選單`,
    lastFile: body?.file?.name || "",
    lastSuccessAt: attemptedAt,
    lastSuccessDate: taipeiDateKey(now),
  };
}

export async function recordRun(databases, databaseId, collectionId, outcome, now = new Date()) {
  await writeSchedule(databases, databaseId, collectionId, runRecordFromOutcome(outcome, now));
}

/** 給畫面用的完整快照：設定 + 上次結果 + 下次執行日期。 */
export function scheduleSnapshot(schedule, todayKey = taipeiDateKey()) {
  const nextRunDate = nextBackupDateKey({
    intervalDays: schedule.intervalDays,
    lastSuccessDate: schedule.lastSuccessDate,
    todayKey,
  });
  return {
    ...schedule,
    todayKey,
    nextRunDate,
    // 已達間隔時 nextRunDate 就是今天，畫面改說「今天」。
    dueToday: nextRunDate <= todayKey,
  };
}
