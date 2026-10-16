# 雲端登入版（Google／Microsoft 365）設定說明

這個版本在原本的網站上，多了「使用 Google 帳號登入」和「使用 Microsoft 365 帳號登入」。
**示範帳號（E001、E002）和員工編號登入都保留**，沒有設定 Firebase 之前，網站一樣可以正常用示範帳號登入。

用 Google／Microsoft 365 登入的學員：
- 第一次登入要填姓名、單位、學習身分（新進人員／主管），並勾選同意個資蒐集
- 學習紀錄會自動同步到雲端，換電腦、換手機登入同一個帳號，進度會接著走
- 管理員在後台按「☁️ 載入雲端數據」，就能把所有人的資料抓下來分析、匯出 Excel

全部都使用免費方案，**不需要綁信用卡**。

---

## 步驟 1：把這個資料夾放上網

新建一個 GitHub repo（例如 `workplace-law-course-cloud`），把整個資料夾的檔案上傳，
用 GitHub Pages 或 Vercel 部署，記下網址，例如：

- `https://juliachiao.github.io/workplace-law-course-cloud/`
- 或 `https://workplace-law-course-cloud.vercel.app`

> 步驟 3 會用到這個網址的網域（`juliachiao.github.io` 或 `xxx.vercel.app`）。

## 步驟 2：建立 Firebase 專案

1. 到 <https://console.firebase.google.com>，用你的 Google 帳號登入
2. 按「建立專案」，名稱例如 `workplace-law-course`（Google Analytics 可以不用開）
3. 進入專案後，按首頁的「`</>`」（新增網頁應用程式），名稱隨意，**不用勾 Firebase Hosting**
4. 畫面會出現一段 `firebaseConfig`，把裡面的 4 個值填到 `js/firebase-config.js`：

```js
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSy....',
  authDomain: 'workplace-law-course.firebaseapp.com',
  projectId: 'workplace-law-course',
  appId: '1:1234567890:web:abcdef'
};
```

> 這些值放在網頁裡是正常的，不是密碼；真正保護資料的是步驟 5 的安全規則。

⚠️ 如果過程中看到「升級到 Blaze 方案」或「連結帳單帳戶」，**不要按**，我們用免費的 Spark 方案就夠了。

## 步驟 3：開啟 Google 登入

1. 左側選單 → **Authentication（驗證）** → 開始使用
2. 「Sign-in method（登入方式）」→ 新增供應商 → **Google** → 啟用，選一個支援信箱 → 儲存
3. 「Settings（設定）」→ **授權網域（Authorized domains）** → 新增你在步驟 1 的網域
   （例如 `juliachiao.github.io` 或 `workplace-law-course-cloud.vercel.app`）

## 步驟 4：開啟 Microsoft 365 登入

這一步要到 Microsoft 的 Azure 平台註冊一個應用程式。

1. 先在 Firebase：Sign-in method → 新增供應商 → **Microsoft** → 先不要關掉視窗，
   複製畫面下方的「重新導向 URI」（長得像 `https://xxx.firebaseapp.com/__/auth/handler`）
2. 另開分頁到 <https://portal.azure.com>，用 Microsoft 帳號登入
   （學校帳號如果沒有權限註冊應用程式，可以改用個人的 Outlook／Hotmail 帳號）
3. 搜尋 **「應用程式註冊」（App registrations）** → 新增註冊
   - 名稱：`workplace-law-course`
   - 支援的帳戶類型：選 **「任何組織目錄中的帳戶及個人 Microsoft 帳戶」**
   - 重新導向 URI：平台選 **Web**，貼上第 1 步複製的網址
   - 按「註冊」
4. 在「概觀」頁面複製 **應用程式 (用戶端) 識別碼**
5. 左側「憑證與祕密」→ 新增用戶端密碼 → 到期時間選最長 → 新增後，**立刻複製「值」**（離開頁面就看不到了）
6. 回到 Firebase 的 Microsoft 視窗，填入：
   - 應用程式 ID ＝ 第 4 步的識別碼
   - 應用程式密鑰 ＝ 第 5 步的「值」
   - 啟用 → 儲存

> 用戶端密碼有到期日（最長 2 年），到期後 Microsoft 登入會失效，要回來重新產生一組。

**學校帳號被擋怎麼辦？** 有些學校會限制學生帳號登入外部應用程式，登入時會看到「需要系統管理員核准」。
這時可以請學校資訊中心核准，或請校內的人改用 Google 登入，不影響測試。

## 步驟 5：建立雲端資料庫（Firestore）

1. 左側選單 → **Firestore Database** → 建立資料庫
2. 位置選 **`asia-east1`（台灣）**，模式選「正式版模式（production mode）」
3. 建立完成後，切到「**規則（Rules）**」分頁，把這個資料夾裡 `firestore.rules` 的內容整段貼上，
   **記得把 `your-admin@gmail.com` 換成你的管理員 Google 帳號**，按「發布」

## 步驟 6：設定學校網域（分辨校內／校外）

打開 `js/firebase-config.js`，填入學校的 email 網域，例如：

```js
window.SCHOOL_EMAIL_DOMAINS = ['mail.ntust.edu.tw'];
```

用這些網域登入的人，後台會標記為「校內」，其他人為「校外」。

## 步驟 7：測試

1. 把改好的 `js/firebase-config.js` 重新上傳，等部署完成
2. 打開網站 → 員工登入 → 按「使用 Google 帳號登入」，填完基本資料後應該會進入課程選單
3. 再用學校帳號試「使用 Microsoft 365 帳號登入」
4. 到 Firebase → Firestore Database → 資料，應該會看到 `learners` 底下多了你的資料
5. 後台：`admin.html` 用 admin／admin123 登入 → 數據分析 → 按「☁️ 載入雲端數據」→ 用步驟 5 設定的管理員 Google 帳號登入 → 應該會看到剛剛測試的帳號

## 常見問題

| 狀況 | 原因與解法 |
|---|---|
| 登入按鈕是灰色的 | `firebase-config.js` 還沒填，或檔案沒有上傳成功 |
| 跳出「網址還沒加入授權網域」 | 步驟 3 的授權網域沒有加，或網域打錯 |
| 跳出「這種登入方式還沒啟用」 | Firebase 裡的 Google 或 Microsoft 供應商沒有啟用 |
| Microsoft 登入失敗 | 檢查步驟 4 的重新導向 URI、應用程式 ID、密碼是否正確，密碼是否過期 |
| 後台按「載入雲端數據」顯示沒有權限 | `firestore.rules` 裡的管理員信箱，要跟你登入的 Google 帳號一樣 |
| 用 LINE 打開網站無法登入 | LINE 內建瀏覽器會擋登入視窗，請改用 Chrome 或 Safari 開啟 |
