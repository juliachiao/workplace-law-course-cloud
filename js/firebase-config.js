/* ============================================================
   firebase-config.js — 雲端登入設定（Google、Microsoft 365）
   ------------------------------------------------------------
   沒有填寫時，網站一樣可以用「示範帳號」登入，只是雲端登入按鈕會停用。
   ============================================================ */
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyCZAOpXwpsbdEKMrxXJ8EmGM5B9cZ3rBTk',
  authDomain: 'workplace-law-course.firebaseapp.com',
  projectId: 'workplace-law-course',
  appId: '1:970831065161:web:23d40256e62ee56538cf98'
};

// 是否顯示「使用 Microsoft 365 帳號登入」按鈕
// 目前學校帳號沒有權限註冊 Microsoft 應用程式，先設為 false 隱藏；之後設定完成再改成 true
window.ENABLE_MICROSOFT = false;

// 學校的 email 網域：用這些網域登入的人，後台會標記為「校內」，其他人標記為「校外」
window.SCHOOL_EMAIL_DOMAINS = ['o365.tku.edu.tw', 'tku.edu.tw', 'mail.tku.edu.tw'];

// Microsoft 365 登入的租用戶：'common' = 學校／公司帳號與個人帳號都可以
window.MS_TENANT = 'common';
