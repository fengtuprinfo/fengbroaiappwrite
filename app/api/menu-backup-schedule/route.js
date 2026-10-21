import { NextResponse } from "next/server";
import { runBackup } from "../_lib/menuBackupRun";
import {
  loadScheduleContext,
  readSchedule,
  recordRun,
  saveSchedule,
  scheduleSnapshot,
} from "../_lib/menuBackupSchedule";
import { parseBackupInterval } from "../../../lib/menuBackup/schedule";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function json(data, status = 200) {
  return NextResponse.json(data, { status });
}

function failure(error) {
  console.error("menu-backup-schedule error:", error);
  return json({ error: error instanceof Error ? error.message : "操作失敗" }, 500);
}

async function snapshotFrom(context) {
  return scheduleSnapshot(readSchedule(context.doc));
}

/**
 * GET /api/menu-backup-schedule — 排程備份的設定與最近一次結果。
 * 不含任何密鑰，所以不需要四位數密碼；設定頁一打開就能看到「上次成功沒」。
 */
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const context = await loadScheduleContext(searchParams);
    return json(await snapshotFrom(context));
  } catch (error) {
    return failure(error);
  }
}

/** PUT /api/menu-backup-schedule — 儲存頻率（每天／每 3／7／14／28 天）與開關。 */
export async function PUT(request) {
  try {
    const { searchParams } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    const context = await loadScheduleContext(searchParams);

    await saveSchedule(context.databases, context.databaseId, context.collectionId, {
      enabled: body?.enabled !== false,
      intervalDays: parseBackupInterval(body?.intervalDays),
    });

    const latest = await loadScheduleContext(searchParams);
    return json(await snapshotFrom(latest));
  } catch (error) {
    return failure(error);
  }
}

/**
 * POST /api/menu-backup-schedule — 立刻跑一次備份（不受間隔限制）。
 *
 * 手動跑不寄失敗信：結果直接回給畫面，重複按也不會寄一堆重複郵件。
 */
export async function POST(request) {
  try {
    const { searchParams, origin } = new URL(request.url);
    const body = await request.json().catch(() => ({}));
    if (body?.action && body.action !== "run") {
      return json({ error: "不支援的操作" }, 400);
    }

    const context = await loadScheduleContext(searchParams);
    const { status, body: outcome } = await runBackup(origin);

    let schedule = null;
    try {
      await recordRun(context.databases, context.databaseId, context.collectionId, { status, body: outcome });
      const latest = await loadScheduleContext(searchParams);
      schedule = await snapshotFrom(latest);
    } catch (error) {
      // 備份本身可能成功，只是狀態沒寫回去；照樣把結果回給使用者。
      console.error("menu-backup-schedule record error:", error);
    }

    return json({ ...outcome, status, schedule }, status);
  } catch (error) {
    return failure(error);
  }
}
