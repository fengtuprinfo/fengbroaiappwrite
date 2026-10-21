/**
 * 通知設定（Resend API Key／收件 Email／通知密碼）的 Appwrite Table 定義。
 *
 * 資料以「單一文件」存放（documentId = "main"，類似 sitevisit 的唯一筆計數文件），
 * 讓設定頁與 Vercel Cron 都能讀到同一份資料，取代原本只存 localStorage/env 的做法：
 * - 密碼以 scrypt hash 存放（格式 scrypt:<N>:<saltHex>:<hashHex>），只用來解鎖
 *   「顯示／儲存 API Key」的畫面操作，server 端 Cron 不受密碼阻擋。
 * - slots 以 JSON 字串存放，每組 { apiKey, toEmail }，對應既有 21 組槽位概念。
 */

/** Appwrite collection name（小寫無分隔，符合既有 table 命名慣例）。 */
export const NOTIFICATION_SETTINGS_COLLECTION = "notificationsettings";

/** 固定 documentId：全系統只有一份通知設定。 */
export const NOTIFICATION_SETTINGS_DOCUMENT_ID = "main";

/** 支援的 Resend 槽位組數上限（與既有 RESEND_SLOT_COUNT 對齊）。 */
export const NOTIFICATION_SETTINGS_MAX_SLOTS = 21;

/**
 * Additive schema：只建立缺少的欄位、永不刪資料。
 * collection 建立時採 private（無公開 permission），僅 server API key 可讀寫。
 */
export const NOTIFICATION_SETTINGS_SCHEMA = {
  name: NOTIFICATION_SETTINGS_COLLECTION,
  attributes: [
    { key: "passwordHash", type: "string", size: 300, required: false },
    { key: "fromEmail", type: "string", size: 300, required: false },
    { key: "slotsJson", type: "string", size: 20000, required: false },
    // Google Drive 連接設定（documentId "googledrive"）共用這張表，
    // 讀寫都要通過全站共用的四位數密碼。
    { key: "googleClientId", type: "string", size: 300, required: false },
    { key: "googleApiKey", type: "string", size: 300, required: false },
    // 排程備份的頻率與最近一次結果（documentId "menubackup"）。
    // 這張表只有字串欄位，所以 enabled 存 "true"/"false"、intervalDays 存 "1"/"3"/…
    { key: "enabled", type: "string", size: 10, required: false },
    { key: "intervalDays", type: "string", size: 4, required: false },
    { key: "lastAttemptAt", type: "string", size: 40, required: false },
    { key: "lastResult", type: "string", size: 12, required: false },
    { key: "lastMessage", type: "string", size: 2000, required: false },
    { key: "lastFile", type: "string", size: 200, required: false },
    { key: "lastSuccessAt", type: "string", size: 40, required: false },
    { key: "lastSuccessDate", type: "string", size: 10, required: false },
  ],
} as const;

/** Google Drive 連接設定的固定 documentId。 */
export const GOOGLE_DRIVE_SETTINGS_DOCUMENT_ID = "googledrive";

/** 排程備份設定與狀態的固定 documentId。 */
export const MENU_BACKUP_SCHEDULE_DOCUMENT_ID = "menubackup";

export type NotificationSettingSlot = {
  apiKey: string;
  toEmail: string;
};

/** 存進 slotsJson 的資料形狀（只保留 trim 過的非空組）。 */
export type NotificationSettingsPayload = {
  fromEmail: string;
  slots: NotificationSettingSlot[];
};
