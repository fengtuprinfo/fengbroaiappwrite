/**
 * Google 授權失效時給使用者看的處理步驟。
 *
 * 這段文字同時出現在失敗通知信與鋒兄設定的監測卡，所以放在 client／server 都能
 * import 的純字串模組；`app/api/_lib/googleDriveOAuth.js` 只負責判斷錯誤碼。
 */

/** 記錄用的一句話：短到可以塞進「上次執行」那一行。 */
export const DRIVE_REAUTH_SHORT =
  "Google 授權已失效（invalid_grant）：GOOGLE_DRIVE_REFRESH_TOKEN 過期或被撤銷，需要重新授權。";

/** 完整處理步驟，照順序做就會好。 */
export const DRIVE_REAUTH_STEPS = [
  "Google Cloud Console →「Google Auth Platform」→ 左側「目標對象」，最上面「發布狀態」若是「測試中」，按「發布應用程式」改成正式版。測試狀態下 Google 只發 7 天有效的 refresh token，這就是每天失敗的原因。",
  "開 /api/google-drive/authorize?secret=<CRON_SECRET> 重新授權，複製頁面上的 refresh token。",
  "Vercel → Settings → Environment Variables 更新 GOOGLE_DRIVE_REFRESH_TOKEN（Production），再重新部署。",
];

/** 只有真的 invalid_grant 才值得跳出這三步，其他錯誤照原文顯示。 */
export function isDriveAuthError(message: string | undefined | null): boolean {
  return /invalid_grant/i.test(String(message || ""));
}
