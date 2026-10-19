/* ============================================================
   cloud.js — Google／Microsoft 365 登入＋雲端學習紀錄（Firebase）
   ------------------------------------------------------------
   ・示範帳號、員工編號登入維持原本的方式（資料存在瀏覽器）
   ・用 Google／Microsoft 登入的人：學習紀錄會自動同步到雲端，
     換電腦登入也能接著學，管理員可以在後台載入所有人的數據
   ============================================================ */
const Cloud = (function () {
  const cfg = window.FIREBASE_CONFIG || {};
  const enabled = !!(cfg.apiKey && cfg.projectId && window.firebase);
  let auth = null, db = null;
  if (enabled) {
    try {
      firebase.initializeApp(cfg);
      auth = firebase.auth();
      db = firebase.firestore();
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
    } catch (e) { console.error('Firebase 初始化失敗', e); }
  }
  const COL = 'learners';
  const isReady = () => !!(auth && db);
  // Firestore 不支援「陣列裡面再放陣列」（影片觀看片段就是這種格式），
  // 所以學習資料一律轉成 JSON 文字存放；讀取時也相容舊的格式
  const packData = bundle => JSON.stringify(bundle);
  function unpackData(doc) {
    if (!doc) return null;
    if (typeof doc.dataJson === 'string') { try { return JSON.parse(doc.dataJson); } catch (e) { return null; } }
    return doc.data || null;
  }
  const empIdOf = uid => 'U' + uid.slice(0, 10);
  const schoolDomains = (window.SCHOOL_EMAIL_DOMAINS || []).map(d => d.toLowerCase());
  function groupOf(email, provider) {
    const dom = (email || '').split('@')[1] || '';
    if (schoolDomains.length) return schoolDomains.some(d => dom === d || dom.endsWith('.' + d)) ? '校內' : '校外';
    return provider === 'microsoft.com' ? '校內' : '校外';
  }
  function isCloudUser(u) { return !!(u && u.cloudUid); }

  // ---------- 上傳：學員的資料一有變動，2 秒後同步到雲端 ----------
  let syncTimer = null, syncing = false;
  function scheduleSync() {
    const u = Data.getCurrentUser();
    if (!isReady() || !isCloudUser(u)) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(syncNow, 2000);
  }
  async function syncNow() {
    clearTimeout(syncTimer);
    const u = Data.getCurrentUser();
    if (!isReady() || !isCloudUser(u) || !auth.currentUser || auth.currentUser.uid !== u.cloudUid) return;
    if (syncing) { scheduleSync(); return; }
    syncing = true;
    try {
      await db.collection(COL).doc(u.cloudUid).set({
        dataJson: packData(Data.exportUserBundle(u.empId)),
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (e) { console.warn('雲端同步失敗，稍後會再試一次', e); setTimeout(scheduleSync, 15000); }
    syncing = false;
  }
  // 在原本的資料寫入函式後面，加上「同步到雲端」
  ['setProgress', 'recordVideoSegment', 'setVideoMeta', 'addLog', 'addQuizAttempt', 'saveWrongAnswers', 'addBookmark', 'deleteBookmark', 'saveSurvey'].forEach(fn => {
    const orig = Data[fn];
    if (typeof orig !== 'function') return;
    Data[fn] = function () { const r = orig.apply(this, arguments); scheduleSync(); return r; };
  });
  // 登出時：先把最後的資料送上雲端，再登出 Firebase
  const origLogout = Data.logoutUser;
  Data.logoutUser = function () {
    const u = Data.getCurrentUser();
    const r = origLogout.apply(this, arguments);
    if (isReady() && isCloudUser(u)) {
      const uid = u.cloudUid, bundle = Data.exportUserBundle(u.empId);
      db.collection(COL).doc(uid).set({ dataJson: packData(bundle), updatedAt: new Date().toISOString() }, { merge: true })
        .catch(() => {}).finally(() => auth.signOut().catch(() => {}));
    }
    return r;
  };
  window.addEventListener('pagehide', () => { syncNow(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) syncNow(); });

  // ---------- 登入 ----------
  function providerFor(kind) {
    if (kind === 'google') {
      const p = new firebase.auth.GoogleAuthProvider();
      p.setCustomParameters({ prompt: 'select_account' });
      return p;
    }
    const p = new firebase.auth.OAuthProvider('microsoft.com');
    p.setCustomParameters({ prompt: 'select_account', tenant: window.MS_TENANT || 'common' });
    return p;
  }
  const ERR = {
    'auth/popup-closed-by-user': '登入視窗被關閉了，請再試一次',
    'auth/cancelled-popup-request': '登入已取消',
    'auth/account-exists-with-different-credential': '這個 email 已經用另一種方式登入過了，請改用上次的登入方式（Google 或 Microsoft 365）',
    'auth/unauthorized-domain': '這個網址還沒加入 Firebase 的「授權網域」，請管理員到 Firebase 設定',
    'auth/operation-not-allowed': '這種登入方式還沒在 Firebase 啟用，請管理員檢查設定',
    'auth/network-request-failed': '網路連線失敗，請檢查網路後再試一次'
  };
  async function signIn(kind) {
    if (!isReady()) { showMsg('雲端登入尚未設定，請先使用示範帳號登入', 'error'); return; }
    setBusy(true);
    try {
      const res = await auth.signInWithPopup(providerFor(kind));
      await afterSignIn(res.user, kind === 'google' ? 'google.com' : 'microsoft.com');
    } catch (e) {
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) {
        sessionStorage.setItem('cloud-redirect-kind', kind);
        await auth.signInWithRedirect(providerFor(kind));   // 手機或擋彈出視窗時，改用整頁跳轉登入
        return;
      }
      const msg = (e && ERR[e.code]) || ('登入失敗：' + ((e && e.message) || e));
      if (e && /admin|consent|AADSTS65001|AADSTS90094/i.test(e.message || '')) showMsg('學校帳號需要系統管理員核准才能登入，請改用 Google 登入，或聯絡學校資訊中心', 'error');
      else showMsg(msg, 'error');
    }
    setBusy(false);
  }
  async function afterSignIn(fbUser, providerId) {
    const uid = fbUser.uid;
    const ref = db.collection(COL).doc(uid);
    const snap = await ref.get();
    let profile = snap.exists ? (snap.data().profile || null) : null;
    if (!profile) {
      profile = await askProfile(fbUser, providerId);   // 第一次登入：填寫基本資料與同意個資蒐集
      if (!profile) { await auth.signOut(); setBusy(false); return; }
      await ref.set({ profile, createdAt: new Date().toISOString() }, { merge: true });
    }
    const empId = empIdOf(uid);
    const emp = Data.upsertEmployee({
      empId, name: profile.name, email: profile.email, dept: profile.dept || '', role: profile.role,
      active: true, password: Math.random().toString(36).slice(2), cloudUid: uid,
      provider: profile.provider === 'microsoft.com' ? 'Microsoft 365' : 'Google', group: profile.group, identity: profile.identity || ''
    });
    const cloudData = snap.exists ? unpackData(snap.data()) : null;
    if (cloudData) Data.importUserBundle(empId, cloudData);   // 換裝置登入：接回雲端上的進度
    Data.setCurrentUser(emp);
    Data.addLog(empId, 'login', '雲端登入（' + emp.provider + '）');
    showMsg('歡迎，' + emp.name + '！', 'success');
    setTimeout(() => location.reload(), 500);
  }

  // ---------- 第一次登入：基本資料＋個資告知 ----------
  function askProfile(fbUser, providerId) {
    return new Promise(resolve => {
      const email = (fbUser.email || (fbUser.providerData[0] || {}).email || '').toLowerCase();
      const group = groupOf(email, providerId);
      const dom = (email.split('@')[1] || ''), schoolMatch = schoolDomains.some(d => dom === d || dom.endsWith('.' + d));   // 學校 email 才預先勾選「校內」
      const ov = document.createElement('div');
      ov.className = 'cloud-ov';
      ov.innerHTML = `
        <div class="cloud-card">
          <h2>👋 歡迎！請先填寫基本資料</h2>
          <p class="cloud-sub">只需要填寫一次，之後用同一個帳號登入就不用再填。<b>身分送出後無法自行更改</b>，如需更改請聯絡研究人員。</p>
          <div class="cloud-acc">${providerId === 'google.com' ? 'Google' : 'Microsoft 365'} 帳號：<b>${escapeHtml(email)}</b></div>
          <label>姓名 <span class="req">*</span></label>
          <input id="cp-name" maxlength="30" value="${escapeHtml(fbUser.displayName || '')}">
          <label>單位／部門</label>
          <input id="cp-dept" maxlength="40" placeholder="例如：人資部、資訊系">
          <label>您是 <span class="req">*</span></label>
          <div class="cloud-roles">
            <label class="cloud-role"><input type="radio" name="cp-group" value="校內" ${schoolMatch ? 'checked' : ''}> <span>🏫 校內師生</span></label>
            <label class="cloud-role"><input type="radio" name="cp-group" value="校外"> <span>🌐 校外人士</span></label>
          </div>
          <label>身分 <span class="req">*</span></label>
          <div class="cloud-roles cloud-ids">
            <label class="cloud-role"><input type="radio" name="cp-id" value="學生" data-role="new_employee"> <span>🎓 學生</span></label>
            <label class="cloud-role"><input type="radio" name="cp-id" value="一般員工" data-role="new_employee"> <span>💼 一般員工</span></label>
            <label class="cloud-role"><input type="radio" name="cp-id" value="老師" data-role="manager"> <span>👩‍🏫 老師</span></label>
            <label class="cloud-role"><input type="radio" name="cp-id" value="主管" data-role="manager"> <span>👔 主管</span></label>
          </div>
          <div class="cloud-assign" id="cp-assign">請選擇身分，系統會自動分配適合的教材</div>
          <div class="cloud-consent">
            <b>個人資料蒐集告知</b><br>
            本網站為畢業專題研究使用，將蒐集您的姓名、email、單位與學習紀錄（影片觀看、測驗作答、學習時間），僅用於課程評鑑與學術研究分析，不會提供給第三方。研究結果將以匿名、整體統計的方式呈現。您可以隨時停止使用，並可要求刪除您的資料。
          </div>
          <label class="cloud-agree"><input type="checkbox" id="cp-agree"> 我已閱讀並同意上述個人資料蒐集與使用方式</label>
          <div class="cloud-err" id="cp-err"></div>
          <div class="cloud-actions"><button class="btn btn-secondary" id="cp-cancel">取消</button><button class="btn login-submit-btn" id="cp-ok">開始學習</button></div>
        </div>`;
      document.body.appendChild(ov);
      const err = t => { ov.querySelector('#cp-err').textContent = t; };
      // 依身分自動分配教材：學生、一般員工 → 員工篇；老師、主管 → 主管篇
      const assign = ov.querySelector('#cp-assign');
      ov.querySelectorAll('input[name="cp-id"]').forEach(r => r.addEventListener('change', () => {
        const mgr = r.dataset.role === 'manager';
        assign.className = 'cloud-assign on ' + (mgr ? 'mgr' : 'emp');
        assign.innerHTML = mgr
          ? '📘 將為您安排<b>主管篇</b>：職場霸凌預防、職場性騷擾防治 2 個單元＋主管篇 3D 遊戲'
          : '📗 將為您安排<b>員工篇</b>：個資、職安、AI 使用、資訊安全 4 個單元＋員工篇 3D 遊戲';
      }));
      ov.querySelector('#cp-cancel').onclick = () => { ov.remove(); resolve(null); };
      ov.querySelector('#cp-ok').onclick = () => {
        const name = ov.querySelector('#cp-name').value.trim();
        if (!name) return err('請填寫姓名');
        const idEl = ov.querySelector('input[name="cp-id"]:checked');
        if (!idEl) return err('請選擇您的身分');
        const grpEl = ov.querySelector('input[name="cp-group"]:checked');
        if (!grpEl) return err('請選擇校內師生或校外人士');
        if (!ov.querySelector('#cp-agree').checked) return err('請勾選同意個人資料蒐集與使用方式');
        const role = idEl.dataset.role, identity = idEl.value, grp = grpEl.value;
        ov.remove();
        resolve({ name, email, dept: ov.querySelector('#cp-dept').value.trim(), role, identity, provider: providerId, group: grp,
          consentAt: new Date().toISOString() });
      };
    });
  }
  function escapeHtml(s) { return String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ---------- 登入頁的按鈕 ----------
  function showMsg(t, type) {
    const el = document.getElementById('toast');
    if (!el) { alert(t); return; }
    el.textContent = t; el.className = 'toast show ' + (type || '');
    setTimeout(() => el.classList.remove('show'), 3500);
  }
  function setBusy(b) { document.querySelectorAll('.cloud-btn').forEach(x => { x.disabled = b || !isReady(); x.classList.toggle('busy', b); }); }
  function bindLoginButtons() {
    const g = document.getElementById('cloud-google'), m = document.getElementById('cloud-ms');
    if (!g || !m) return;
    // 還沒設定 Microsoft 365 登入時，先把按鈕藏起來（firebase-config.js 的 ENABLE_MICROSOFT）
    if (window.ENABLE_MICROSOFT === false) m.style.display = 'none';
    if (!isReady()) {
      [g, m].forEach(b => { b.disabled = true; b.title = '雲端登入尚未設定（請參考 SETUP.md）'; });
      const note = document.getElementById('cloud-note'); if (note) note.textContent = '⚙️ 雲端登入尚未設定，目前請使用下方示範帳號登入';
      return;
    }
    g.onclick = () => signIn('google');
    m.onclick = () => signIn('microsoft');
    // 整頁跳轉登入回來之後
    auth.getRedirectResult().then(res => {
      if (res && res.user) {
        const kind = sessionStorage.getItem('cloud-redirect-kind') || 'google';
        sessionStorage.removeItem('cloud-redirect-kind');
        afterSignIn(res.user, kind === 'google' ? 'google.com' : 'microsoft.com');
      }
    }).catch(e => showMsg((e && ERR[e.code]) || ('登入失敗：' + (e && e.message)), 'error'));
  }
  document.addEventListener('DOMContentLoaded', bindLoginButtons);

  // ---------- 後台：讀取所有人的雲端資料 ----------
  async function adminLoadAll() {
    if (!isReady()) throw new Error('雲端登入尚未設定（firebase-config.js）');
    if (!auth.currentUser) {
      const p = new firebase.auth.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' });
      await auth.signInWithPopup(p);
    }
    let qs;
    try { qs = await db.collection(COL).get(); }
    catch (e) { throw new Error('沒有讀取權限：請確認 Firestore 規則裡的管理員信箱包含 ' + (auth.currentUser.email || '你的帳號')); }
    let n = 0;
    qs.forEach(doc => {
      const d = doc.data(), pf = d.profile; if (!pf) return;
      const empId = empIdOf(doc.id);
      Data.upsertEmployee({ empId, name: pf.name, email: pf.email, dept: pf.dept || '', role: pf.role, active: true,
        password: Math.random().toString(36).slice(2), cloudUid: doc.id, provider: pf.provider === 'microsoft.com' ? 'Microsoft 365' : 'Google', group: pf.group, identity: pf.identity || '' });
      const cd = unpackData(d);
      if (cd) Data.importUserBundle(empId, cd);
      n++;
    });
    return { count: n, admin: auth.currentUser.email };
  }

  return { isReady, signIn, syncNow, adminLoadAll };
})();
window.Cloud = Cloud;
