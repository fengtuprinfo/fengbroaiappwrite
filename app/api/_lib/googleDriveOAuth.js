/**
 * Server-side Google Drive OAuth for the daily CSV backup cron.
 *
 * The browser flow (lib/googleDrive.ts) gets a short-lived token from a popup,
 * which a cron job cannot open. Here a refresh token, granted once through
 * /api/google-drive/authorize, is traded for an access token on every run.
 * The client secret and refresh token stay in server-only env vars — never in
 * Appwrite, whose API key the browser can read.
 */
import { createAppwrite } from "./appwriteClient";
import { ensureNotificationSettingsCollection, readSettingsDocument } from "./notificationSettingsTable";
import { GOOGLE_DRIVE_SETTINGS_DOCUMENT_ID } from "../../../lib/notifications/notificationSettings";

export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

/**
 * The refresh token only works with the client that granted it, and drive.file
 * only shows folders that same client created, so this must resolve to the
 * client ID the browser uses: env first, then the one saved in 鋒兄設定.
 */
export async function resolveGoogleClientId() {
  const fromEnv = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  if (fromEnv) return fromEnv.trim();
  try {
    const { databases, databaseId } = createAppwrite(null);
    const collectionId = await ensureNotificationSettingsCollection(databases, databaseId);
    const doc = await readSettingsDocument(databases, databaseId, collectionId, GOOGLE_DRIVE_SETTINGS_DOCUMENT_ID);
    return String(doc?.googleClientId || "").trim();
  } catch {
    return "";
  }
}

export function getGoogleClientSecret() {
  return (process.env.GOOGLE_CLIENT_SECRET || "").trim();
}

export function getDriveRefreshToken() {
  return (process.env.GOOGLE_DRIVE_REFRESH_TOKEN || "").trim();
}

export function driveCallbackUrl(origin) {
  return `${origin}/api/google-drive/callback`;
}

/**
 * Google answers a dead refresh token with `invalid_grant` and, unhelpfully,
 * `error_description: "Bad Request"` — which used to be all the failure email
 * said. Name the real cause and the one setting that keeps it from recurring.
 */
export const REFRESH_TOKEN_EXPIRED_MESSAGE =
  "Google 授權已失效（invalid_grant）：GOOGLE_DRIVE_REFRESH_TOKEN 過期或被撤銷。" +
  "最常見原因是 OAuth 同意畫面還停在「測試」狀態——Google 對測試中的應用只發 7 天有效的 refresh token，" +
  "所以授權後第 8 天起每天都會備份失敗。" +
  "請到 Google Cloud Console → API 和服務 → OAuth 同意畫面按「發布應用程式」，" +
  "再開 /api/google-drive/authorize?secret=<CRON_SECRET> 重新授權，" +
  "把新的 refresh token 更新到 Vercel 的 GOOGLE_DRIVE_REFRESH_TOKEN 並重新部署。";

const TOKEN_ERROR_MESSAGES = {
  invalid_client: "Google 不接受這組用戶端（invalid_client）：請確認 GOOGLE_CLIENT_SECRET 與 Client ID 屬於同一個 OAuth 用戶端，且密鑰沒有重新產生。",
  unauthorized_client: "這個 OAuth 用戶端不允許這種授權方式（unauthorized_client）。",
  access_denied: "Google 授權被拒絕（access_denied）。",
};

async function tokenRequest(params) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data?.error || "";
    // "Bad Request" is Google's placeholder description, not a real diagnosis.
    const description =
      data?.error_description && data.error_description !== "Bad Request" ? data.error_description : "";
    const error = new Error(
      TOKEN_ERROR_MESSAGES[code] ||
        description ||
        `Google token 請求失敗（${code || `HTTP ${response.status}`}）`
    );
    error.code = code;
    error.status = response.status;
    throw error;
  }
  return data;
}

/** Trades the stored refresh token for a fresh access token. */
export async function getDriveAccessToken() {
  const clientId = await resolveGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  const refreshToken = getDriveRefreshToken();
  const missing = [
    !clientId && "Google Client ID",
    !clientSecret && "GOOGLE_CLIENT_SECRET",
    !refreshToken && "GOOGLE_DRIVE_REFRESH_TOKEN",
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`尚未設定 ${missing.join("、")}，無法排程上傳到 Google 雲端硬碟。`);
  }
  const data = await tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }).catch((error) => {
    // Only the refresh-token exchange can be expired; the code exchange has its own hint.
    if (error?.code === "invalid_grant") throw new Error(REFRESH_TOKEN_EXPIRED_MESSAGE);
    throw error;
  });
  return data.access_token;
}

/** Exchanges the authorization code from the consent screen. */
export async function exchangeAuthorizationCode(code, redirectUri) {
  const clientId = await resolveGoogleClientId();
  const clientSecret = getGoogleClientSecret();
  if (!clientId || !clientSecret) {
    throw new Error("尚未設定 Google Client ID 或 GOOGLE_CLIENT_SECRET。");
  }
  return tokenRequest({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}
