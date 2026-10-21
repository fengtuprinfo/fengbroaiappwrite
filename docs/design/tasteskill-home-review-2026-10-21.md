# Taste Skill 首頁審視（2026-10-21）

對象是已上線的家用控制台，不是行銷頁。規則來自 [Taste Skill v2](https://www.tasteskill.dev/) 的 app screen：`inspect.mjs --app` 對 `https://fengbroaiappwrite.vercel.app` 在 1440×900、768×1024、390×844 實機量測。截圖留在本機 `.taste-skill/before/`，不進 git。

這次只看預設的「精簡」首頁。沒有登入後的訂閱、食品、銀行，也沒有暗色與「完整儀表」。

## 量測

| 項目 | 結果 |
| --- | --- |
| 可見標題 | 「鋒兄首頁」，1 行，38px，Iowan Old Style 600。桌面 `h1` 從畫面頂端起算在 417px |
| 字級 | 10 / 13 / 14 / 16 / 18 / 20 / 22 / 26 / 38 px（10 級） |
| 字體 | Segoe UI Variable Text 約 96%，Iowan 約 4% |
| 地面 | `#f6f5f1`，卡片 `#fffefb` |
| 第一屏 | 約 1.3 屏、69 字、0 張圖 |
| 檢查 | **7 FAIL，5 WARN** |

FAIL：`micro-label`、`gradient`、`heavy-shadow`、`tiny-text`、`no-title`（1440 與 390；標題在語音列之下，app 探針不把它當成畫面的 h1）、`palette-claude`（768 與 390）、`icon-chips`（390，10 個、兩色）。

WARN：`palette-cream`、`heavy-borders`（10 條深框）、`icon-chips`（1440 有 8 個）、`micro-label`、`many-h1`（768 與 390 各兩個 h1：頂列與 `PageTitle`）。

暖紙色是 `PRODUCT.md` 的品牌（Calm · Editorial · Gold）。`palette-cream` / `palette-claude` 是技能對「奶油地 + 赤陶」的禁令，不是要求改成冷灰套件。紙色可留。問題是赤陶同時用在標誌、作用中導覽、語音鈕和每一個捷徑圖示。

## ROUND 1

Seen in one second: 一顆赤陶語音鈕，和一排全是 0 的小卡。

Idea (one sentence): 這個畫面要回答「今天家裡有什麼要處理」，但第一眼是語音入口。

Live thing: 八個待辦數字；這次公開頁全部是 0，句子寫「目前沒有緊急項目」。

Layout words by section: 頂列導覽 = bar / 語音 = banner / 精簡切換 = control / 標題 = statement / 今日待處理 = grid / 常用功能 = card-row。

Scores: design 5 · usability 6 · creativity 5 · content 7 → overall 5.5

Caps applied: 仍有 FAIL，總分上限 6.0。5.5 未碰到上限。

Top three problems:

1. 桌面第一屏的 `h1` 在 417px，前面是「語音 CRUD 管理」整列（`DashboardLayout` 在訂閱以外的每個模組都插這列）。手機第一屏在底列之上只剩語音、`CONSOLE VIEW`、標題，和「已過期食品 0」。要處理的事被自己的工具蓋住。把語音收回殼層既有的按鈕，標題和「今日待處理」緊接在導覽下面。
2. 「常用功能」是八張同樣的淺色圖示方塊，導覽裡已經有這些模組。檢查器在 1440 數到 8 個 tinted icon chip，在 390 數到 10 個、兩色。拿掉色塊，改成文字列；只有大於 0、而且方向是「該處理」的數字才上色。
3. 裝飾比資料大聲。10px 字距大寫「FENGBRO」「DESIGN MODE」；標誌與頁面是漸層；靜止卡片陰影 `0 10px 28px`；「鋒兄首頁」只有一個子項「首頁」，桌面因此多一條只有一顆藥丸的次導覽。中繼字改 12px 句式或刪掉；標誌改平塗；作用中項目用中性灰底；單子項分組不要再長出第二列。

## 這個畫面要先回答的事

首頁的問題是「今天有什麼要處理」。最大的東西應是那句結論和需要行動的數字。現在最大的是語音鈕，八個 0 一樣大。數字這次是 0，和「目前沒有緊急項目」一致，沒有看到錯誤橫幅。這只證明公開首頁的零狀態，不證明家裡的訂閱或食品也是空的。

畫布左右還算齊（左 31px、右 69px）。框線偏深（約 11:1），一屏裡像一格格盒子。手機導覽有收到底列，這點符合 app 規則；內容仍被語音列往下推。

## 先不要動的

- 模組 id、語音指令、Appwrite 與媒體播放。
- 暖紙地面與金褐品牌色本身。收的是用量，不是換成另一套紫或藍。
- 「完整儀表」裡的 `StatCard`（圖示、上緣漸層）這次沒有截圖，不在這三項的範圍裡。下一輪再量。
