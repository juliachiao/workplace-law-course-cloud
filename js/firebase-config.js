/* ============================================================
   firebase-config.js — 雲端登入設定（Google、Microsoft 365）
   ------------------------------------------------------------
   請依照 SETUP.md 建立 Firebase 專案後，把下面的值換成你的專案設定。
   沒有填寫時，網站一樣可以用「示範帳號」登入，只是雲端登入按鈕會停用。
   ============================================================ */
window.FIREBASE_CONFIG = {
  apiKey: '',              // 例如 'AIzaSy....'
  authDomain: '',          // 例如 'your-project.firebaseapp.com'
  projectId: '',           // 例如 'your-project'
  appId: ''                // 例如 '1:1234567890:web:abcdef'
};

// 學校的 email 網域：用這些網域登入的人，後台會標記為「校內」，其他人標記為「校外」
// 例如 ['mail.ntust.edu.tw', 'ntust.edu.tw']
window.SCHOOL_EMAIL_DOMAINS = [];

// Microsoft 365 登入的租用戶：'common' = 學校／公司帳號與個人帳號都可以；
// 只想開放學校帳號，可以改成 'organizations'
window.MS_TENANT = 'common';
