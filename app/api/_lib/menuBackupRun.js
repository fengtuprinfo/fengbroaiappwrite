/**
 * 每日 CSV 備份的執行本體。
 *
 * 抽出來給兩邊共用：Vercel Cron（/api/menu-backup-cron）與鋒兄設定的「立即備份一次」
 * （/api/menu-backup-schedule）。兩者只差在觸發方式與是否寄失敗信，匯出、打包、
 * 上傳的邏輯必須是同一份，否則手動測成功、排程卻失敗會很難查。
 */
import JSZip from "jszip";
import { withBom } from "../../../lib/csvText";
import { BACKUP_FOLDER_LABEL, uploadBackupWithToken } from "../../../lib/googleDrive";
import { MANIFEST_NAME, REPORT_NAME, buildManifest, csvMenus, csvPathFor } from "../../../lib/menuBackup/catalog";
import { CsvExportSkipped, exportCsvMenuWith, formatBackupReport } from "../../../lib/menuBackup/csvExport";
import { dateStampFromKey, taipeiDateKey } from "../../../lib/menuBackup/schedule";
import { getDriveAccessToken } from "./googleDriveOAuth";
import { createAppwrite } from "./appwriteClient";
import { loadResendConfig } from "./resendSettings";
import { sendResendEmail } from "./resendEmail";
import { validateResendConfigs } from "../../../lib/notifications/resolveResendConfig.mjs";
import { DRIVE_REAUTH_STEPS, isDriveAuthError } from "../../../lib/googleDriveAuthHelp";

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * Emails the Resend recipients from 鋒兄設定 when a run fails outright or any
 * menu errors. Skipped menus (鋒兄新聞 lives only in the browser) are expected
 * and do not count. Never throws: a broken notifier must not hide the backup
 * result, so its own failure is returned alongside instead.
 */
export async function notifyBackupFailure(outcome) {
  try {
    const { databases, databaseId } = createAppwrite(null);
    const { configs } = await loadResendConfig(databases, databaseId);
    if (configs.length === 0) return { sent: 0, reason: "未設定 Resend 通知" };
    validateResendConfigs(configs);

    const dateKey = dateStampFromKey(taipeiDateKey());
    const failedMenus = (outcome.results || []).filter((result) => result.status === "error");
    const partial = outcome.success === true;
    const subject = partial
      ? `鋒兄 CSV 備份部分失敗 ${dateKey}（${failedMenus.length} 個選單）`
      : `鋒兄 CSV 備份失敗 ${dateKey}`;
    const lines = [
      partial
        ? `備份已上傳到 ${BACKUP_FOLDER_LABEL}，但有選單匯出失敗：`
        : `今天的排程備份沒有上傳到 ${BACKUP_FOLDER_LABEL}。`,
      outcome.error ? `原因：${outcome.error}` : "",
      ...failedMenus.map((result) => `- ${result.label}：${result.message || "匯出失敗"}`),
    ].filter(Boolean);

    // 授權失效時把「怎麼修」直接寫進信裡，不然收信的人只知道壞了、不知道下一步。
    if (isDriveAuthError(outcome.error)) {
      lines.push("", "處理步驟：", ...DRIVE_REAUTH_STEPS.map((step, index) => `${index + 1}. ${step}`));
    }
    const text = lines.join("\n");
    const html = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;line-height:1.6;color:#172033">
      <h2 style="margin:0 0 12px">${escapeHtml(subject)}</h2>
      ${lines.map((line) => `<p style="margin:0 0 6px">${escapeHtml(line)}</p>`).join("")}
    </div>`;

    const sent = await Promise.all(
      configs.map((resend, index) =>
        sendResendEmail({
          ...resend,
          subject,
          text,
          html,
          // Manual retries on the same day send one email, not one per attempt.
          idempotencyKey: `fengbro-menu-backup-${partial ? "partial" : "failed"}-${dateKey}-${index + 1}`,
        })
      )
    );
    return { sent: sent.length };
  } catch (error) {
    console.error("menu-backup notify error:", error);
    return { sent: 0, error: error instanceof Error ? error.message : "Resend 通知失敗" };
  }
}

/**
 * Exports every CSV menu and uploads the ZIP to OAuth／fengbroaiappwrite.
 *
 * `origin` is this deployment's own URL: the menu list APIs are fetched over
 * HTTP with no query string, so they fall back to the server's Appwrite env.
 */
export async function runBackup(origin) {
  try {
    // Fail before reading every table if Drive is not set up.
    const accessToken = await getDriveAccessToken();

    const source = {
      fetchJson: async (path) => {
        const response = await fetch(new URL(path, origin), { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error || `${path} 回應 HTTP ${response.status}`);
        return data;
      },
    };

    const zip = new JSZip();
    const results = [];
    const included = [];
    for (const entry of csvMenus()) {
      try {
        const { csv, rows } = await exportCsvMenuWith(entry, source);
        zip.file(csvPathFor(entry), withBom(csv));
        results.push({ id: entry.id, label: entry.label, status: "ok", rows });
        included.push(entry.id);
      } catch (error) {
        results.push({
          id: entry.id,
          label: entry.label,
          status: error instanceof CsvExportSkipped ? "skipped" : "error",
          rows: 0,
          message: error instanceof Error ? error.message : "匯出失敗",
        });
      }
    }

    // A backup with no menus in it would look like a success on Drive.
    if (included.length === 0) {
      return { status: 502, body: { error: "所有選單都匯出失敗，未上傳。", results } };
    }

    zip.file(MANIFEST_NAME, JSON.stringify(buildManifest("csv", included), null, 2));
    zip.file(REPORT_NAME, formatBackupReport("csv", results));
    const bytes = await zip.generateAsync({ type: "uint8array" });

    const filename = `appwrite-all-csv-${dateStampFromKey(taipeiDateKey())}.zip`;
    const uploaded = await uploadBackupWithToken(accessToken, new Blob([bytes], { type: "application/zip" }), filename);

    return {
      status: 200,
      body: {
        success: true,
        file: uploaded,
        ok: results.filter((result) => result.status === "ok").length,
        failed: results.filter((result) => result.status === "error").length,
        skipped: results.filter((result) => result.status === "skipped").length,
        results,
      },
    };
  } catch (error) {
    console.error("menu-backup run error:", error);
    return { status: 500, body: { error: error instanceof Error ? error.message : "排程備份失敗" } };
  }
}
