import { NextResponse } from "next/server";
import { notifyBackupFailure, runBackup } from "../_lib/menuBackupRun";
import {
  loadScheduleContext,
  readSchedule,
  recordRun,
  scheduleSnapshot,
} from "../_lib/menuBackupSchedule";
import { shouldRunScheduledBackup, taipeiDateKey } from "../../../lib/menuBackup/schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * GET /api/menu-backup-cron — Vercel cron 每天台灣時間 06:06 叫一次：
 * 匯出「所有 CSV 選單（不含 ZIP）」並上傳到 Google 雲端硬碟 OAuth／fengbroaiappwrite，
 * 檔案格式與鋒兄設定「匯出到雲端硬碟」相同，可直接用一鍵匯入還原。
 *
 * cron 本身固定在每天，實際頻率（每天／每 3／7／14／28 天）由鋒兄設定的排程決定：
 * 未滿間隔就跳過，不上傳也不寄信。失敗（含部分選單失敗）時用鋒兄設定裡的 Resend 寄信通知。
 * 必須設定 CRON_SECRET：這條路徑會讀出全部資料並寫進雲端硬碟。
 */
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return json({ error: "未設定 CRON_SECRET，排程備份已停用。" }, 503);
  }
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ error: "unauthorized" }, 401);
  }

  const { origin } = new URL(request.url);
  const todayKey = taipeiDateKey();

  // 讀不到設定時照舊每天備份：備份本身比「今天該不該跑」重要。
  let context = null;
  let schedule = readSchedule(null);
  try {
    context = await loadScheduleContext(null);
    schedule = readSchedule(context.doc);
  } catch (error) {
    console.error("menu-backup-cron schedule read error:", error);
  }

  const decision = shouldRunScheduledBackup({
    enabled: schedule.enabled,
    intervalDays: schedule.intervalDays,
    lastSuccessDate: schedule.lastSuccessDate,
    todayKey,
  });

  if (!decision.run) {
    return json({
      skipped: true,
      reason: decision.reason,
      schedule: scheduleSnapshot(schedule, todayKey),
    });
  }

  const { status, body } = await runBackup(origin);

  if (context) {
    try {
      await recordRun(context.databases, context.databaseId, context.collectionId, { status, body });
    } catch (error) {
      // 記錄失敗不該蓋掉備份結果，只是設定頁看不到這次狀態。
      console.error("menu-backup-cron record error:", error);
    }
  }

  if (status >= 400 || body.failed > 0) {
    body.notification = await notifyBackupFailure(body);
  }
  return json(body, status);
}
