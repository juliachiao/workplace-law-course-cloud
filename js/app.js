/* ============================================================
   app.js — 員工前台 SPA 邏輯
   ============================================================ */

const App = (function () {

  // ===== YouTube 影片支援 =====
  let currentVideoController = null;

  function extractYouTubeId(url) {
    if (!url) return null;
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([A-Za-z0-9_-]{6,})/);
    return m ? m[1] : null;
  }

  function loadYouTubeAPI() {
    return new Promise(resolve => {
      if (window.YT && window.YT.Player) return resolve();
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(); };
      if (!document.getElementById('yt-iframe-api')) {
        const tag = document.createElement('script');
        tag.id = 'yt-iframe-api';
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
      }
    });
  }

  // 建立一個「假裝是 <video>」的控制器,讓既有的觀看紀錄邏輯不用大改
  function createYouTubeController(containerId, videoId, initialMaxWatched) {
    const target = new EventTarget();
    let player = null;
    let pollTimer = null;
    let lastPollTime = 0;
    let maxWatchedTime = initialMaxWatched || 0;
    let isPlaying = false;
    // 影片還沒按過播放前，不能呼叫 seekTo（YouTube 的 seekTo 會讓影片自動開始播放）
    // 所以先把續播位置記下來，等學員按下播放鍵時再跳過去
    let hasStarted = false;
    let pendingStart = null;
    function safeSeek(t) {
      if (!player) return;
      if (hasStarted) player.seekTo(t, true);
      else pendingStart = t;
    }

    Object.defineProperty(target, 'currentTime', {
      get() { return pendingStart != null ? pendingStart : (player ? player.getCurrentTime() : 0); },
      // 直接設定 currentTime 只允許用在「續播」等內部用途,一律做上限保護
      set(t) { safeSeek(Math.min(t, maxWatchedTime)); }
    });
    Object.defineProperty(target, 'duration', {
      get() { return player ? player.getDuration() : 0; }
    });
    target.play = () => {
      if (!player) return;
      if (pendingStart != null) { const t = pendingStart; pendingStart = null; player.seekTo(t, true); }
      player.playVideo();
    };
    target.pause = () => { if (player) player.pauseVideo(); };
    target.mute = () => { if (player) player.mute(); };
    target.unmute = () => { if (player) player.unMute(); };
    target.getMaxWatchedTime = () => maxWatchedTime;
    // 提供給書籤等功能使用的「安全跳轉」— 只允許跳到已經真正看過的位置,不能跳關
    target.requestSeek = (t) => {
      if (!player) return false;
      const safeTime = Math.min(Math.max(0, t), maxWatchedTime);
      safeSeek(safeTime);
      return safeTime >= t - 0.5; // 回報是否為「完整跳轉」(沒有被裁切)
    };
    target.isPlayingNow = () => isPlaying;

    loadYouTubeAPI().then(() => {
      player = new YT.Player(containerId, {
        width: '100%',
        height: '100%',
        playerVars: { rel: 0, modestbranding: 1, controls: 0, disablekb: 1, fs: 0 },
        videoId,
        events: {
          onReady: () => {
            target.dispatchEvent(new Event('loadedmetadata'));
          },
          onStateChange: (e) => {
            if (e.data === YT.PlayerState.PLAYING) {
              isPlaying = true;
              hasStarted = true;
              target.dispatchEvent(new Event('play'));
              if (!pollTimer) {
                lastPollTime = player.getCurrentTime();
                pollTimer = setInterval(() => {
                  const now = player.getCurrentTime();
                  // 偵測非預期跳轉(理論上已被擋,這裡當作最後一道防線):強制彈回最遠已看位置
                  if (now - lastPollTime > 1.8) {
                    player.seekTo(maxWatchedTime, true);
                    target.dispatchEvent(new Event('seeked'));
                    lastPollTime = maxWatchedTime;
                    target.dispatchEvent(new Event('timeupdate'));
                    return;
                  }
                  lastPollTime = now;
                  if (now > maxWatchedTime) maxWatchedTime = now;
                  target.dispatchEvent(new Event('timeupdate'));
                }, 1000);
              }
            } else {
              isPlaying = false;
              if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
              if (e.data === YT.PlayerState.PAUSED) {
                target.dispatchEvent(new Event('pause'));
              } else if (e.data === YT.PlayerState.ENDED) {
                maxWatchedTime = player.getDuration();
                target.dispatchEvent(new Event('ended'));
              }
            }
          }
        }
      });
    });

    return target;
  }

  // 自訂播放器控制列(取代 YouTube 原生控制列,拿掉可拖動的進度條)
  function attachCustomYTControls(video, wrapId) {
    const wrap = document.getElementById(wrapId);
    if (!wrap) return;
    const btnPlay = wrap.querySelector('.ytc-play');
    const btnMute = wrap.querySelector('.ytc-mute');
    const btnFs = wrap.querySelector('.ytc-fullscreen');
    const timeEl = wrap.querySelector('.ytc-time');
    const barFill = wrap.querySelector('.ytc-bar-fill');
    let muted = false;

    btnPlay.addEventListener('click', () => {
      if (video.isPlayingNow()) video.pause(); else video.play();
    });
    btnMute.addEventListener('click', () => {
      muted = !muted;
      btnMute.textContent = muted ? '🔇' : '🔊';
      muted ? video.mute() : video.unmute();
    });
    if (btnFs) {
      btnFs.addEventListener('click', () => {
        const isFs = document.fullscreenElement || document.webkitFullscreenElement;
        if (isFs) {
          (document.exitFullscreen || document.webkitExitFullscreen)?.call(document);
        } else {
          (wrap.requestFullscreen || wrap.webkitRequestFullscreen)?.call(wrap);
        }
      });
    }
    video.addEventListener('play', () => { btnPlay.textContent = '⏸'; });
    video.addEventListener('pause', () => { btnPlay.textContent = '▶'; });
    video.addEventListener('ended', () => { btnPlay.textContent = '↺'; });
    video.addEventListener('timeupdate', () => {
      const dur = video.duration || 0;
      timeEl.textContent = `${formatSec(video.currentTime)} / ${formatSec(dur)}`;
      if (barFill && dur) barFill.style.width = Math.min(100, (video.currentTime / dur) * 100) + '%';
    });
  }

  // ===== Toast =====
  function toast(msg, type = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + type;
    setTimeout(() => el.classList.remove('show'), 2500);
  }

  // ===== 登入頁面 =====
  function bindLogin() {
    document.getElementById('employee-login-form').addEventListener('submit', e => {
      e.preventDefault();
      const empId = document.getElementById('login-empId').value.trim();
      const pwd = document.getElementById('login-password').value;
      try {
        const emp = Data.loginEmployee(empId, pwd);
        toast(`歡迎回來,${emp.name}!`, 'success');
        setTimeout(() => enterApp(), 600);
      } catch (e) {
        toast(e.message, 'error');
      }
    });
    document.getElementById('goto-admin').addEventListener('click', () => {
      window.location.href = 'admin.html';
    });
    document.getElementById('reset-demo').addEventListener('click', () => {
      if (confirm('確定要重置所有示範資料嗎？這將清除所有學習進度。')) {
        Data.resetAll();
        toast('示範資料已重置，請重新登入', 'success');
      }
    });

    // ===== 忘記密碼 =====
    const loginForm = document.getElementById('employee-login-form');
    const forgotForm = document.getElementById('forgot-password-form');
    const fpStep2 = document.getElementById('fp-step2');
    const fpVerifyBtn = document.getElementById('fp-verify-btn');
    const fpSubmitBtn = document.getElementById('fp-submit-btn');
    const fpError = document.getElementById('fp-error');
    let fpVerifiedEmpId = null;

    function showFpError(msg) {
      fpError.textContent = msg;
      fpError.style.display = 'block';
    }
    function resetForgotForm() {
      forgotForm.reset();
      fpStep2.classList.add('hidden');
      fpVerifyBtn.classList.remove('hidden');
      fpSubmitBtn.classList.add('hidden');
      fpError.style.display = 'none';
      fpVerifiedEmpId = null;
      document.getElementById('fp-empId').disabled = false;
      document.getElementById('fp-email').disabled = false;
    }

    document.getElementById('goto-forgot-pwd').addEventListener('click', () => {
      loginForm.classList.add('hidden');
      resetForgotForm();
      forgotForm.classList.remove('hidden');
    });
    document.getElementById('back-to-login-from-fp').addEventListener('click', () => {
      forgotForm.classList.add('hidden');
      loginForm.classList.remove('hidden');
    });

    fpVerifyBtn.addEventListener('click', () => {
      fpError.style.display = 'none';
      const empId = document.getElementById('fp-empId').value.trim();
      const email = document.getElementById('fp-email').value.trim().toLowerCase();
      if (!empId || !email) { showFpError('請輸入員工編號與信箱'); return; }
      const emp = Data.getEmployee(empId);
      if (!emp || (emp.email || '').toLowerCase() !== email) {
        showFpError('員工編號或信箱不正確，請確認後再試一次');
        return;
      }
      if (!emp.active) {
        showFpError('此帳號已停用，請聯繫系統管理員');
        return;
      }
      fpVerifiedEmpId = empId;
      document.getElementById('fp-empId').disabled = true;
      document.getElementById('fp-email').disabled = true;
      fpStep2.classList.remove('hidden');
      fpVerifyBtn.classList.add('hidden');
      fpSubmitBtn.classList.remove('hidden');
    });

    fpSubmitBtn.addEventListener('click', () => {
      fpError.style.display = 'none';
      const p1 = document.getElementById('fp-new-password').value;
      const p2 = document.getElementById('fp-confirm-password').value;
      if (!p1 || p1.length < 4) { showFpError('新密碼至少需要 4 碼'); return; }
      if (p1 !== p2) { showFpError('兩次輸入的密碼不一致'); return; }
      try {
        Data.updateEmployee(fpVerifiedEmpId, { password: p1 });
        toast('密碼已重設成功，請用新密碼登入', 'success');
        forgotForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        document.getElementById('login-empId').value = fpVerifiedEmpId;
        document.getElementById('login-password').value = '';
        document.getElementById('login-password').focus();
      } catch (e) {
        showFpError(e.message || '重設失敗，請稍後再試');
      }
    });
  }

  // ===== 首頁 / 登入頁切換 =====
  function showLogin() {
    document.getElementById('page-landing').classList.add('hidden');
    document.getElementById('page-login').classList.remove('hidden');
  }
  function showLanding() {
    document.getElementById('page-login').classList.add('hidden');
    document.getElementById('page-landing').classList.remove('hidden');
  }
  function bindLanding() {
    ['landing-start-btn', 'landing-start-btn2', 'goto-login-btn'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('click', showLogin);
    });
    const backBtn = document.getElementById('back-to-landing');
    if (backBtn) backBtn.addEventListener('click', showLanding);

    // 課程翻轉卡片：點擊或鍵盤 Enter/空白鍵翻面查看詳情
    document.querySelectorAll('.flip-card').forEach(card => {
      const toggle = () => card.classList.toggle('flipped');
      card.addEventListener('click', toggle);
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
      });
    });
  }

  // ===== 進入主應用 =====
  function enterApp() {
    const landing = document.getElementById('page-landing');
    if (landing) landing.classList.add('hidden');
    document.getElementById('page-login').classList.add('hidden');
    document.getElementById('page-app').classList.remove('hidden');
    const user = Data.getCurrentUser();
    document.getElementById('user-name').textContent = `${user.name} (${user.role === 'manager' ? '主管' : '新進'})`;
    // 重新整理時留在原本的頁面；網址沒有頁面資訊就回課程選單
    const r = routeFromHash();
    if (r) { routeFromHistory = true; try { renderRoute(...r); } finally { routeFromHistory = false; } }
    else renderRoute('menu');
    checkDeadlineReminder();
    checkAnnouncements();
  }

  // ===== 完課截止日提醒 =====
  function checkDeadlineReminder() {
    const deadline = Data.getDeadline();
    if (!deadline) return;
    const user = Data.getCurrentUser();
    const overall = Data.getEmployeeOverallProgress(user.empId);
    if (overall.percent >= 100) return;

    const daysLeft = Math.ceil((new Date(deadline) - new Date()) / 86400000);
    let bgColor, icon, msg;
    if (daysLeft < 0) {
      bgColor = '#c0392b'; icon = '🚨';
      msg = `完課截止日（${deadline}）已過期 ${Math.abs(daysLeft)} 天，請儘速完成剩餘 ${overall.total - overall.completed} 門課程！`;
    } else if (daysLeft <= 3) {
      bgColor = '#e67e22'; icon = '⚠️';
      msg = `距離完課截止日（${deadline}）還有 <strong>${daysLeft}</strong> 天，請盡快完成剩餘 ${overall.total - overall.completed} 門課程！`;
    } else {
      bgColor = '#5a6b8c'; icon = '📅';
      msg = `完課截止日：${deadline}，距今還有 <strong>${daysLeft}</strong> 天，目前已完成 ${overall.completed} / ${overall.total} 門。`;
    }

    const banner = document.createElement('div');
    banner.id = 'deadline-banner';
    banner.innerHTML = `
      <div style="background:${bgColor}; color:#fff; padding:12px 24px; display:flex; align-items:center; justify-content:space-between; font-size:14px; position:sticky; top:64px; z-index:90;">
        <span>${icon} ${msg}</span>
        <button onclick="document.getElementById('deadline-banner').remove()"
          style="background:none; border:none; color:#fff; font-size:18px; cursor:pointer; margin-left:16px; flex-shrink:0;">✕</button>
      </div>`;
    const existing = document.getElementById('deadline-banner');
    if (existing) existing.remove();
    document.getElementById('page-app').insertBefore(banner, document.querySelector('.container') || document.getElementById('main-content'));
  }

  // ===== 管理員公告 =====
  function checkAnnouncements() {
    const user = Data.getCurrentUser();
    if (!user) return;
    const unread = Data.getUnreadAnnouncements(user.empId);
    if (!unread.length) return;

    const typeIcon = { info: '📘', warning: '⚠️', urgent: '🚨' };
    const typeBg   = { info: '#e8f0fe', warning: '#fff3e0', urgent: '#fdecea' };
    const typeBorder = { info: '#5a6b8c', warning: '#e67e22', urgent: '#c0392b' };
    const typeLabel  = { info: '一般通知', warning: '注意事項', urgent: '緊急公告' };

    const overlay = document.createElement('div');
    overlay.id = 'ann-overlay';
    overlay.innerHTML = `
      <div class="ann-modal-box">
        <div class="ann-modal-header">
          <span>📢 最新公告 (${unread.length} 則)</span>
          <button class="ann-close-btn" id="ann-close-btn">✕ 關閉</button>
        </div>
        <div class="ann-modal-body">
          ${unread.map(a => `
            <div style="background:${typeBg[a.type] || '#f5f5f5'}; border-left:4px solid ${typeBorder[a.type] || '#5a6b8c'}; border-radius:8px; padding:14px 16px; margin-bottom:14px;">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">
                <span style="font-size:16px;">${typeIcon[a.type] || '📢'}</span>
                <span style="background:${typeBorder[a.type] || '#5a6b8c'}; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px;">${typeLabel[a.type] || a.type}</span>
                <strong style="font-size:15px;">${escAnn(a.title)}</strong>
              </div>
              <div style="font-size:14px; color:#333; white-space:pre-wrap; line-height:1.6;">${escAnn(a.content)}</div>
              <div style="margin-top:8px; font-size:12px; color:#888;">${formatAnnTime(a.createdAt)}${a.expiry ? `　到期：${a.expiry}` : ''}</div>
            </div>
          `).join('')}
        </div>
        <div style="padding:16px 20px; text-align:right; border-top:1px solid #eee;">
          <button class="btn btn-primary" id="ann-close-btn2">我知道了</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const ids = unread.map(a => a.id);
    function close() {
      Data.markAnnouncementsRead(user.empId, ids);
      overlay.remove();
    }
    document.getElementById('ann-close-btn').onclick = close;
    document.getElementById('ann-close-btn2').onclick = close;
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  }

  function escAnn(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  function formatAnnTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')}`;
  }

  // ===== 學習證書 =====
  // ===== 路由 =====
  const routes = {
    menu:         renderMenu,
    home:         renderHome,
    cover:        renderCover,
    intro:        renderIntro,
    guide:        renderGuide,
    wronganswers: renderWrongAnswers,
    course:       renderCourse,
    final_exam:   renderFinalExam,
    game:         renderGame,
    summary:      renderSummary,
    summary_unit: renderSummaryUnit,
    survey:       renderSurvey,
    resources:    renderResources
  };

  // 切換頁面：
  //  ・換頁後一律回到頁面最上方（避免停在下方，看起來像沒有反應）
  //  ・先離開全螢幕播放，按鈕才點得到
  //  ・萬一頁面產生錯誤，自動重新整理回到課程選單，不會卡住
  //  ・記錄在網址（#/menu 等），瀏覽器的「上一頁」也能正常使用
  let routeFromHistory = false;
  function renderRoute(route, ...args) {
    try { flushStudyTimer(); } catch (e) {}
    const fn = routes[route];
    if (!fn) return;
    try {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } catch (e) {}
    try {
      fn(...args);
    } catch (e) {
      console.error('頁面載入失敗', route, e);
      try { sessionStorage.setItem('tp_route_error', route); } catch (_) {}
      toast('頁面載入發生問題，正在重新整理…', 'error');
      setTimeout(() => { location.hash = '#/menu'; location.reload(); }, 800);
      return;
    }
    // 這個網站是由 body 負責捲動，所以 body 和 html 都要一起捲回最上方
    window.scrollTo(0, 0); document.body.scrollTop = 0; document.documentElement.scrollTop = 0;
    const hash = '#/' + [route, ...args].map(a => encodeURIComponent(a)).join('/');
    if (!routeFromHistory && location.hash !== hash) {
      try { history.pushState({ route, args }, '', hash); } catch (e) {}
    }
  }
  function routeFromHash() {
    const h = (location.hash || '').replace(/^#\/?/, '');
    if (!h) return null;
    const parts = h.split('/').map(x => decodeURIComponent(x));
    return routes[parts[0]] ? parts : null;
  }
  window.addEventListener('popstate', () => {
    if (!Data.getCurrentUser() || document.getElementById('page-app').classList.contains('hidden')) return;
    const r = routeFromHash() || ['menu'];
    routeFromHistory = true;
    try { renderRoute(...r); } finally { routeFromHistory = false; }
  });

  function bindNav() {
    document.querySelectorAll('[data-route]').forEach(a => {
      a.addEventListener('click', () => renderRoute(a.dataset.route));
    });
  }

  function logout() {
    flushStudyTimer();
    try { Data.logoutUser(); } catch(e) {}
    try { history.replaceState(null, '', location.pathname + location.search); } catch(e) {}   // 清掉網址上的頁面紀錄
    // 關閉彈窗
    const annOverlay = document.getElementById('ann-overlay');
    if (annOverlay) annOverlay.remove();
    // 切回登入頁
    document.getElementById('main-content').innerHTML = '';
    document.getElementById('page-app').classList.add('hidden');
    document.getElementById('page-login').classList.remove('hidden');
    document.getElementById('login-empId').value = '';
    document.getElementById('login-password').value = '';
  }

  // ===== 課程子目標資料 =====
  const COURSE_OBJECTIVES = {
    pdpa:       ['個資法規範與定義', '合規蒐集處理原則', '外洩通報與法律責任'],
    osh:        ['安衛法基本規範', '職場危害辨識', '職災預防與緊急應變'],
    ai_policy:  ['AI 使用政策規範', '倫理風險與禁止事項', '合規使用行為準則'],
    infosec:    ['CIA 資安三要素', '釣魚郵件與社交工程', '疑・查・報三步驟'],
    bullying:   ['霸凌定義與認定標準', '管理者法定義務', '調查通報與輔導程序'],
    harassment: ['性騷擾法律定義', '主管防治角色與責任', '申訴受理與保護措施']
  };

  const COURSE_INTRO = {
    infosec: {
      duration: '約 15–20 分鐘',
      videoTitle: '情境劇：一封可疑的郵件',
      quizCount: 10,
      scenario: '新進員工小強收到一封「績效獎金補發」的通知郵件，同事小誠一眼發現了可疑之處。透過與虛擬資安助手 Aery 和同事小妤的對話，他們一步步拆解釣魚郵件的陷阱，學習如何在真實職場中保護企業資料與自身安全。',
      characters: [
        { icon: '👦', name: '小強', role: '新進員工' },
        { icon: '👨', name: '小誠', role: '資深同事' },
        { icon: '👩', name: '小妤', role: '資安講師' },
        { icon: '🤖', name: 'Aery', role: '資安虛擬助手' },
      ],
      keyPoints: [
        { icon: '🛡️', label: 'CIA 三要素', desc: '機密性・完整性・可用性' },
        { icon: '🎣', label: '釣魚郵件識別', desc: '寄件者・連結・急迫感' },
        { icon: '🤝', label: '社交工程防範', desc: '人性弱點與操控手法' },
        { icon: '📋', label: '疑・查・報', desc: '資安事件三步驟流程' },
      ]
    }
  };

  // ===== 課程選單 =====
  function renderMenu() {
    const user = Data.getCurrentUser();
    const main = document.getElementById('main-content');
    const overall = Data.getEmployeeOverallProgress(user.empId);
    const myCourses = Data.COURSES[user.role] || [];
    const isManager = user.role === 'manager';

    const finalLock = getFinalExamLockStatus(user.empId, user.role);
    const finalProg = Data.getProgress(user.empId, 'final_' + user.role);
    let finalBadge = '';
    if (finalProg.completed) {
      finalBadge = `<span class="menu-card-badge badge-done">✓ 已完成（${finalProg.quizScore} 分）</span>`;
    } else if (finalLock.locked) {
      finalBadge = `<span class="menu-card-badge" style="background:#eee; color:#888;">🔒 尚未解鎖</span>`;
    }
    const finalExamCard = `
      <div class="menu-card menu-card-final ${finalLock.locked && !finalProg.completed ? 'is-locked' : ''}" data-final-exam="1">
        <div class="menu-card-left">
          <div class="menu-card-icon">🎓</div>
        </div>
        <div class="menu-card-body">
          <div class="menu-card-title-row">
            <span class="menu-card-title">總測驗</span>
            ${finalBadge}
          </div>
          <div class="menu-card-desc">${finalLock.locked
            ? `完成以上所有單元後解鎖：尚差「${finalLock.incomplete.map(c => c.title).join('、')}」`
            : '完成所有單元課程！可以進行總測驗，檢核整體學習成效'}</div>
        </div>
        <div class="menu-card-arrow">${finalLock.locked && !finalProg.completed ? '🔒' : '→'}</div>
      </div>
    `;

    // 滿意度問卷（做過總測驗後解鎖）
    const svyDone = Data.getSurvey(user.empId), svyOpen = finalProg.quizScore != null;
    const surveyCard = `
      <div class="menu-card menu-card-survey ${svyOpen ? '' : 'is-locked'}" data-survey="1">
        <div class="menu-card-left"><div class="menu-card-icon">📝</div></div>
        <div class="menu-card-body">
          <div class="menu-card-title-row">
            <span class="menu-card-title">學習滿意度問卷</span>
            ${svyDone ? '<span class="menu-card-badge" style="background:#2e8b57;color:#fff">✓ 已填寫</span>' : (svyOpen ? '<span class="menu-card-badge" style="background:#e0457b;color:#fff">請填寫</span>' : '<span class="menu-card-badge">🔒 尚未開放</span>')}
          </div>
          <div class="menu-card-desc">${svyDone ? '感謝您的回饋！' : (svyOpen ? '約 5～8 分鐘，分享您的學習心得與建議' : '完成總測驗後開放填寫')}</div>
        </div>
        <div class="menu-card-arrow">${svyOpen ? '→' : '🔒'}</div>
      </div>
    `;

    // 3D 闖關遊戲（依身分顯示員工篇或主管篇）
    const gameCard = `
      <div class="menu-card menu-card-game ${isManager ? 'game-mgr' : 'game-emp'}" data-game="1">
        <div class="menu-card-left">
          <div class="menu-card-icon">🎮</div>
        </div>
        <div class="menu-card-body">
          <div class="menu-card-title-row">
            <span class="menu-card-title">Aery 3D 闖關遊戲・${isManager ? '主管篇' : '員工篇'}</span>
            <span class="menu-card-badge">NEW</span>
          </div>
          <div class="menu-card-desc">走進 3D 辦公室，找線索、玩小遊戲，${isManager ? '3' : '4'} 大關卡全破就能領取結業證書！</div>
        </div>
        <div class="menu-card-arrow">→</div>
      </div>
    `;

    const totalStudySec = myCourses.reduce((sum, c) => sum + (Data.getProgress(user.empId, c.id).studySeconds || 0), 0);
    const quizScores = myCourses.map(c => Data.getProgress(user.empId, c.id).quizScore).filter(s => s != null);
    const avgScore = quizScores.length ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length) : null;
    const pathLabel = isManager ? '主管人員學習路徑' : '新進人員學習路徑';
    const pathIcon  = isManager ? '👔' : '👤';

    const courseCards = myCourses.map((c, i) => {
      const col = BRANCH_COLORS[i % BRANCH_COLORS.length];
      const p = Data.getProgress(user.empId, c.id);
      let statusBadge = '';
      if (p.completed) {
        statusBadge = `<span class="menu-card-badge badge-done">✓ 已完成</span>`;
      } else if (p.videoWatched || p.videoWatchedSeconds > 0) {
        statusBadge = `<span class="menu-card-badge badge-prog">學習中</span>`;
      }
      return `
        <div class="menu-card" data-course-id="${c.id}" style="--bc:${col.c}; --bbg:${col.bg}; --i:${i}">
          <div class="menu-card-left">
            <div class="menu-card-icon">${c.icon}</div>
          </div>
          <div class="menu-card-body">
            <div class="menu-card-title-row">
              <span class="menu-card-title">${c.title}</span>
              ${statusBadge}
            </div>
            <div class="menu-card-desc">${c.desc}</div>
          </div>
          <div class="menu-card-arrow">→</div>
        </div>
      `;
    }).join('');

    main.innerHTML = `
      <div class="menu-hero">
        <div class="menu-hero-inner">
          <div class="menu-hero-left">
            <div class="menu-hero-greeting">歡迎回來，<strong>${user.name}</strong>${isManager ? '　主管' : ''}</div>
            <div class="menu-hero-path">${pathIcon} ${pathLabel}</div>
          </div>
          <div class="menu-hero-stats">
            <div class="menu-stat">
              <div class="menu-stat-n">${overall.completed}<span>/${overall.total}</span></div>
              <div class="menu-stat-l">課程完成</div>
            </div>
            <div class="menu-stat">
              <div class="menu-stat-n">${formatStudyTime(totalStudySec)}</div>
              <div class="menu-stat-l">學習時間</div>
            </div>
            <div class="menu-stat">
              <div class="menu-stat-n">${avgScore != null ? avgScore + '<span>分</span>' : '--'}</div>
              <div class="menu-stat-l">測驗均分</div>
            </div>
          </div>
        </div>
        <div class="menu-prog-overall">
          <div class="menu-prog-overall-label">整體完成度 ${overall.percent}%</div>
          <div class="menu-prog-overall-bar">
            <div class="menu-prog-overall-fill" style="width:${overall.percent}%"></div>
          </div>
        </div>
      </div>

      <div class="menu-section">
        <div class="menu-section-hdr">
          <h2 class="menu-section-title">課程選單</h2>
          <p class="menu-section-sub">點擊課程卡片進入學習</p>
        </div>
        <div class="menu-grid">${courseCards}${finalExamCard}${gameCard}${surveyCard}</div>
      </div>
    `;

    main.querySelectorAll('.menu-card[data-course-id]').forEach(el => {
      el.addEventListener('click', () => renderRoute('cover', el.dataset.courseId, user.role));
    });

    const feCard = main.querySelector('.menu-card[data-final-exam]');
    if (feCard) {
      feCard.addEventListener('click', () => renderRoute('final_exam', user.role));
    }

    const svCard = main.querySelector('.menu-card[data-survey]');
    if (svCard) svCard.addEventListener('click', () => renderRoute('survey'));

    const gmCard = main.querySelector('.menu-card[data-game]');
    if (gmCard) {
      gmCard.addEventListener('click', () => renderRoute('game'));
    }
  }

  // =====================================================================
  // ===== 重點整理（視覺化複習）=====
  // 內容依據各單元課程說明、測驗題目與解析整理；修改內容只要改這個物件
  // =====================================================================
  const SUMMARY = {
    pdpa: {
      tagline: '該收的才收、該鎖的要鎖、該碎的要碎',
      concepts: [
        { icon: '🪪', title: '一般個資', desc: '姓名、電話、Email、地址，以及車牌、GPS 位置等能直接或拼湊出身分的資料' },
        { icon: '🔐', title: '特種個資', desc: '病歷、醫療、基因、性生活、健康檢查、犯罪前科，受最高等級保護' },
        { icon: '🎯', title: '特定目的', desc: '個資只能用在當初蒐集的目的，拿去做別的用途就是「逾越特定目的」' },
        { icon: '⚖️', title: '法律紅線', desc: '個資外洩的民事賠償，同一事件合計最高可達 2 億元' },
      ],
      flowTitle: '個資管理四階段',
      flow: [
        { icon: '📥', label: '蒐集', desc: '合法蒐集，告知當事人用途、保存期限與接觸者' },
        { icon: '🗂️', label: '處理', desc: '妥善保管，傳輸要加密' },
        { icon: '📤', label: '利用', desc: '只在原本的特定目的內使用' },
        { icon: '✂️', label: '銷毀', desc: '用碎紙機切成顆粒狀' },
      ],
      dos: ['離開座位時，個資文件鎖進抽屜或隨身帶走（桌面清空原則）', '寄送加密檔案，密碼改用電話或訊息另外告知（管道分離）', '密碼使用 12 位以上的強密碼', '發現個資異常，立即通報主管與個資窗口'],
      donts: ['文件只是蓋起來、翻面就離開座位', '密碼和加密檔案寫在同一封信裡', '把客戶辦卡留的電話，拿去推銷其他商品', '因為害怕被罵，隱瞞個資外洩事件'],
      sop: { title: '個資異常 SOP：疑、查、報', steps: ['疑：發現可疑的異常狀況', '查：立即查證是否真的外洩', '報：回報主管與個資窗口，不要隱瞞'] },
      laws: [
        { title: '《個人資料保護法》第 12 條', desc: '個資被竊取、洩漏或竄改時，要查明後以適當方式通知當事人' },
        { title: '損害賠償上限', desc: '同一原因事實造成多數人受害，賠償合計最高 2 億元' },
      ],
      traps: ['碎成「長條狀」還是可能被拼湊還原，要碎成顆粒狀', '車牌、GPS 位置看似不重要，也屬於個資', '不必等到正式申訴，知悉疑似事件就要啟動處理'],
    },
    osh: {
      tagline: '看見危險、避開危險、通報危險',
      concepts: [
        { icon: '🪜', title: '跌倒風險', desc: '站在椅子上拿高處物品，是辦公室最典型的職安風險' },
        { icon: '💧', title: '滑倒風險', desc: '茶水間、走道地板濕滑，要立刻提醒並處理' },
        { icon: '💺', title: '職業健康', desc: '長時間姿勢不良造成肩頸痠痛，也屬於職業安全衛生的範圍' },
        { icon: '🧯', title: '火災應變', desc: '火勢過大時以自身安全為優先，先撤離再通報' },
      ],
      flowTitle: '職安三步驟：看、避、報',
      flow: [
        { icon: '👀', label: '看', desc: '留意身邊的危險源' },
        { icon: '🚶', label: '避', desc: '避免危險行為，改用安全的替代方式' },
        { icon: '📢', label: '報', desc: '立即通報相關人員，避免危害擴大' },
      ],
      dos: ['拿高處物品使用安全梯凳，或請同事協助', '發現地板濕滑，立即提醒周圍同事並通報', '依作業性質全程配戴耳罩、口罩等防護具', '正確使用公司提供的設備，遵守工作守則'],
      donts: ['踩椅子、紙箱，或跳起來拿東西', '認為「沒有受傷就不算違規」', '覺得自己很資深，或沒人稽核就不戴防護具', '火勢已經很大，還硬要自己撲滅'],
      laws: [
        { title: '《職業安全衛生法》勞工義務', desc: '勞工應正確使用雇主提供的設備與防護措施，並遵守安全衛生工作守則' },
      ],
      traps: ['職安違規看的是「行為」，不是「有沒有受傷」', '長期姿勢不良的肌肉骨骼問題，也是職業健康議題'],
    },
    ai_policy: {
      tagline: 'AI 是助手，不是替身：輸入前去識別、產出後要查證',
      concepts: [
        { icon: '🔓', title: '資料外洩', desc: '客戶個資、公司機密輸入外部 AI，可能被保存或外洩' },
        { icon: '🌀', title: 'AI 幻覺', desc: 'AI 會產生看似正確、實際錯誤的內容' },
        { icon: '©️', title: '著作權風險', desc: 'AI 生成內容可能涉及他人著作，註明「AI 生成」也不能免責' },
        { icon: '✅', title: '核准工具清單', desc: '只使用公司核准的 AI 工具，確保資料安全與資安規範' },
      ],
      flowTitle: '安全使用 AI 的流程',
      flow: [
        { icon: '🧹', label: '去識別化', desc: '刪除姓名、電話等可識別個人的資料' },
        { icon: '🛠️', label: '用核准工具', desc: '只在公司清單內的工具上操作' },
        { icon: '🔍', label: '人工查證', desc: '確認 AI 產出的內容是否正確' },
        { icon: '🏷️', label: '標註後使用', desc: '對外使用時依規範標註 AI 協助' },
      ],
      dos: ['分析客戶資料前，先刪除姓名、電話等可識別欄位', '使用公司核准清單內的 AI 工具', 'AI 產出的內容經過人工查證才使用', '對外文件依規範標註 AI 協助情形'],
      donts: ['把含姓名、電話、交易紀錄的完整客戶資料直接貼給 AI', '把未公開的商業策略、合約、技術文件輸入公開 AI', '完全相信 AI 的答案，不做查證', '以為註明「AI 生成」就沒有著作權問題'],
      laws: [
        { title: '個資與機密保護', desc: '輸入 AI 的資料同樣受個資法與公司保密規範約束' },
        { title: '智慧財產權', desc: 'AI 生成內容仍可能侵害他人著作權，使用前要確認來源與授權' },
      ],
      traps: ['「只要能提升效率」不是把個資輸入 AI 的理由', 'AI 不能完全取代人工判斷，最後的責任在使用的人'],
    },
    infosec: {
      tagline: '資安不只是 IT 的事，每個「多確認一步」的人都是防線',
      concepts: [
        { icon: '🙈', title: '機密性 C', desc: '資料不能被未經授權的人看到' },
        { icon: '🧩', title: '完整性 I', desc: '資料不能被竄改，例如帳號、金額被非法修改' },
        { icon: '⚡', title: '可用性 A', desc: '需要使用時，系統和資料能正常取得' },
        { icon: '🎣', title: '社交工程', desc: '駭客利用的是人性弱點，例如急迫感與貪婪，而不只是技術' },
      ],
      flowTitle: '資安事件三步驟：疑、查、報',
      flow: [
        { icon: '🤔', label: '疑', desc: '對可疑的信件、訊息保持警覺' },
        { icon: '🔎', label: '查', desc: '確認來源是否合法，或直接詢問 IT，不要自己上網亂搜' },
        { icon: '📮', label: '報', desc: '用公司內部的資安通報機制回報' },
      ],
      dos: ['先看寄件者：公司信應該是官方信箱，不是一般 Gmail', '收到「急件」「獎金」類訊息，先停一下再確認', '可疑郵件透過公司資安通報機制回報', '使用強密碼，不用 123456 或生日'],
      donts: ['因為「不點就拿不到錢」就急著點連結', '插上來路不明的隨身碟', '相信假冒同事、主管傳來的訊息', '自己公開或回覆可疑的信件'],
      threats: ['釣魚信件', '弱密碼（123456、生日）', '不明隨身碟', '假冒同事傳訊'],
      laws: [
        { title: '刑法：妨害電腦使用罪', desc: '病毒進入系統造成設備故障或資料損毀，可能涉及刑事責任' },
        { title: '《個人資料保護法》', desc: '點了釣魚信導致客戶資料外洩，公司可能被主管機關開罰並負民事賠償' },
      ],
      traps: ['寄件者顯示名稱可以造假，要看實際的 email 網域', '資料外洩讓不該看的人看到，破壞的是「機密性」'],
    },
    bullying: {
      tagline: '主管一「知悉」就要行動，守住「通、調、密、記」',
      concepts: [
        { icon: '💢', title: '霸凌的認定', desc: '依課程內容，造成身心危害的嚴重人格侮辱，即使只有一次也可能成立' },
        { icon: '👂', title: '知悉即釐清', desc: '不必等書面申訴，主管只要知悉就有主動釐清的義務' },
        { icon: '🛡️', title: '保護被害人', desc: '調查期間主管可以暫停被申訴人的職務，保護被害人' },
        { icon: '🚫', title: '禁止報復', desc: '對申訴人或協助調查者的不利處分（例如調職）一律無效' },
      ],
      flowTitle: '主管處理原則：通、調、密、記',
      flow: [
        { icon: '📢', label: '通', desc: '知悉後依程序通報' },
        { icon: '🔍', label: '調', desc: '啟動調查，釐清事實' },
        { icon: '🤐', label: '密', desc: '全程保密，避免二次傷害' },
        { icon: '📝', label: '記', desc: '每次警告、評估都留下書面紀錄' },
      ],
      dos: ['聽到傳聞就主動釐清，不等正式申訴', '調查期間採取保護被害人的措施', '每一次處理都留下完整的書面紀錄', '把霸凌定義和處理流程寫進工作規則並公告，定期辦理主管教育訓練'],
      donts: ['找雙方「搓湯圓」，要求和解了事', '以「經營需要」為由，把申訴人調到偏遠單位', '讓被害人請無薪假來「隔離」', '認為員工離職，申訴就不了了之'],
      laws: [
        { title: '申訴時效', desc: '依課程內容，霸凌行為終了起 3 年內可申訴；在職期間發生者，離職後 1 年內仍可提出' },
        { title: '《勞動事件法》舉證責任', desc: '雇主拿不出管理紀錄，法院可能直接認定勞工的主張為真實' },
        { title: '強制和解的後果', desc: '強迫和解或程序有瑕疵，調查可能被認定無效並命令重查' },
      ],
      traps: ['「才罵一次」不代表不算霸凌', '平時沒有留紀錄，打官司時對公司非常不利'],
    },
    harassment: {
      tagline: '知悉即啟動、保護當事人、程序要公正',
      concepts: [
        { icon: '👔', title: '權勢性騷擾', desc: '利用職務上指揮、監督的權力或機會進行騷擾，法院可判 1～3 倍懲罰性賠償金' },
        { icon: '🌙', title: '非工作時間', desc: '同一單位或業務往來對象的持續性騷擾，即使在非工作時間也適用' },
        { icon: '⚡', title: '知悉即啟動', desc: '不論有沒有正式申訴書，雇主知悉就要啟動處置並留下紀錄' },
        { icon: '🧑‍⚖️', title: '外部專業人士', desc: '申訴調查小組要納入具性別意識的外部專業人士，確保公正' },
      ],
      flowTitle: '性騷擾事件處理流程',
      flow: [
        { icon: '👂', label: '知悉', desc: '一知道就要開始處理' },
        { icon: '🛡️', label: '立即保護', desc: '隔離措施針對行為人' },
        { icon: '📝', label: '受理申訴', desc: '依公司防治規定受理' },
        { icon: '🔍', label: '公正調查', desc: '小組納入外部專業人士' },
        { icon: '⚖️', label: '懲處追蹤', desc: '落實懲處並持續關心' },
      ],
      dos: ['調整行為人的座位、業務，或暫停其職務來隔離雙方', '提供申訴人心理諮商等協助', '即使行為人否認，也要完成調查程序', '情節重大要解僱時，在知悉起 30 日內行使'],
      donts: ['等受害者遞交正式申訴書才處理', '以「發生在下班時間」為由拒絕受理', '把申訴人調職或減薪', '行為人一否認就停止調查'],
      laws: [
        { title: '雇主未立即處理', desc: '知悉性騷擾卻未採取立即有效的糾正及補救措施，最高可罰 100 萬元' },
        { title: '連帶賠償責任', desc: '雇主無法證明已盡防治責任，要與行為人連帶負擔民事賠償' },
        { title: '《勞動基準法》解僱時效', desc: '不經預告解僱，須自知悉之日起 30 日內行使' },
      ],
      traps: ['隔離措施要針對「行為人」，不是處罰申訴人', '權勢性騷擾和一般性騷擾的法律效果不同'],
    },
  };

  // ===== 重點整理：列表頁 =====
  function renderSummary() {
    const user = Data.getCurrentUser();
    const main = document.getElementById('main-content');
    const myCourses = Data.COURSES[user.role] || [];
    main.innerHTML = `
      <div class="sum-wrap">
        <a class="btn-back-menu" onclick="App.go('menu')">← 回課程選單</a>
        <div class="page-header" style="text-align:center; margin: 10px 0 26px;">
          <h1 class="page-title" style="font-size:32px; letter-spacing:6px;">重點整理</h1>
          <div style="width:44px; height:3px; background:var(--primary); margin:14px auto;"></div>
          <p style="color:var(--text-light);">一頁看懂每個單元的重點，複習、考前快速瀏覽都方便</p>
        </div>
        <div class="sum-list">
          ${myCourses.map((c, i) => {
            const col = BRANCH_COLORS[i % BRANCH_COLORS.length], sm = SUMMARY[c.id];
            if (!sm) return '';
            return `
              <div class="sum-list-card" data-cid="${c.id}" style="--bc:${col.c}; --bbg:${col.bg}">
                <div class="sum-list-icon">${c.icon}</div>
                <div class="sum-list-body">
                  <div class="sum-list-unit">Unit ${String(i + 1).padStart(2, '0')}</div>
                  <div class="sum-list-title">${c.title}</div>
                  <div class="sum-list-tag">${sm.tagline}</div>
                  <div class="sum-list-chips">${sm.concepts.map(k => `<span>${k.icon} ${k.title}</span>`).join('')}</div>
                </div>
                <div class="sum-list-arrow">→</div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
    main.querySelectorAll('.sum-list-card').forEach(el => el.addEventListener('click', () => renderRoute('summary_unit', el.dataset.cid)));
  }

  // ===== 重點整理：單元頁 =====
  function renderSummaryUnit(courseId) {
    const user = Data.getCurrentUser();
    const main = document.getElementById('main-content');
    const myCourses = Data.COURSES[user.role] || [];
    const idx = myCourses.findIndex(c => c.id === courseId);
    const course = myCourses[idx], sm = SUMMARY[courseId];
    if (!course || !sm) return renderSummary();   // 只看得到自己學習路徑的單元
    const col = BRANCH_COLORS[idx % BRANCH_COLORS.length];
    try { Data.addLog(user.empId, 'summary_view', `查看重點整理：${course.title}`); } catch (e) {}
    const prev = myCourses[idx - 1], next = myCourses[idx + 1];
    main.innerHTML = `
      <div class="sum-wrap sum-unit" style="--bc:${col.c}; --bbg:${col.bg}">
        <div class="sum-top no-print">
          <a class="btn-back-menu" onclick="App.go('summary')">← 回重點整理</a>
          <button class="btn btn-secondary sum-print" id="sum-print">🖨️ 列印／存成 PDF</button>
        </div>

        <div class="sum-hero">
          <div class="sum-hero-icon">${course.icon}</div>
          <div>
            <div class="sum-hero-unit">Unit ${String(idx + 1).padStart(2, '0')}・重點整理</div>
            <h1 class="sum-hero-title">${course.title}</h1>
            <div class="sum-hero-tag">💡 ${sm.tagline}</div>
          </div>
        </div>

        <h2 class="sum-h">📌 核心概念</h2>
        <div class="sum-concepts">
          ${sm.concepts.map(k => `<div class="sum-concept"><div class="sum-concept-icon">${k.icon}</div><div class="sum-concept-title">${k.title}</div><div class="sum-concept-desc">${k.desc}</div></div>`).join('')}
        </div>

        <h2 class="sum-h">🔄 ${sm.flowTitle}</h2>
        <div class="sum-flow">
          ${sm.flow.map((f, i) => `
            <div class="sum-step"><div class="sum-step-no">${i + 1}</div><div class="sum-step-icon">${f.icon}</div><div class="sum-step-label">${f.label}</div><div class="sum-step-desc">${f.desc}</div></div>
            ${i < sm.flow.length - 1 ? '<div class="sum-arrow">➜</div>' : ''}`).join('')}
        </div>

        <h2 class="sum-h">⚖️ 正確做法 vs 錯誤做法</h2>
        <div class="sum-dd">
          <div class="sum-do"><div class="sum-dd-head">✅ 這樣做</div>${sm.dos.map(t => `<div class="sum-dd-item">✓ ${t}</div>`).join('')}</div>
          <div class="sum-dont"><div class="sum-dd-head">❌ 不要這樣做</div>${sm.donts.map(t => `<div class="sum-dd-item">✕ ${t}</div>`).join('')}</div>
        </div>

        ${sm.sop ? `<h2 class="sum-h">🧭 ${sm.sop.title}</h2><div class="sum-sop">${sm.sop.steps.map(t => `<div>${t}</div>`).join('')}</div>` : ''}
        ${sm.threats ? `<h2 class="sum-h">⚠️ 常見資安威脅</h2><div class="sum-chips">${sm.threats.map(t => `<span>${t}</span>`).join('')}</div>` : ''}

        <h2 class="sum-h">📜 相關法規與責任</h2>
        <div class="sum-laws">
          ${sm.laws.map(l => `<div class="sum-law"><div class="sum-law-title">${l.title}</div><div class="sum-law-desc">${l.desc}</div></div>`).join('')}
        </div>

        <div class="sum-traps">
          <div class="sum-traps-head">🚨 容易搞錯的地方</div>
          ${sm.traps.map(t => `<div class="sum-trap">• ${t}</div>`).join('')}
        </div>

        <div class="sum-actions no-print">
          ${prev ? `<button class="btn btn-secondary" data-go="${prev.id}">← ${prev.title}</button>` : '<span></span>'}
          <button class="btn btn-primary" id="sum-course">🎬 前往本單元課程</button>
          ${next ? `<button class="btn btn-secondary" data-go="${next.id}">${next.title} →</button>` : '<span></span>'}
        </div>
      </div>`;
    document.getElementById('sum-print').onclick = () => window.print();
    document.getElementById('sum-course').onclick = () => renderRoute('cover', courseId, user.role);
    main.querySelectorAll('[data-go]').forEach(b => b.onclick = () => renderRoute('summary_unit', b.dataset.go));
  }

  const SURVEY = Data.SURVEY, calcSUS = Data.calcSUS;
  // ===== 滿意度問卷頁 =====
  function renderSurvey() {
    const user = Data.getCurrentUser();
    const main = document.getElementById('main-content');
    const finalProg = Data.getProgress(user.empId, 'final_' + user.role);
    const done = Data.getSurvey(user.empId);
    if (done) {
      main.innerHTML = `<div class="svy-wrap"><a class="btn-back-menu" onclick="App.go('menu')">← 回課程選單</a>
        <div class="svy-thanks"><div class="svy-thanks-icon">💌</div><h2>您已經填寫過滿意度問卷</h2>
        <p>填寫時間：${formatTime(done.submittedAt)}<br>非常感謝您的回饋！</p></div></div>`;
      return;
    }
    if (finalProg.quizScore == null) {
      main.innerHTML = `<div class="svy-wrap"><a class="btn-back-menu" onclick="App.go('menu')">← 回課程選單</a>
        <div class="svy-thanks"><div class="svy-thanks-icon">🔒</div><h2>完成總測驗後就能填寫</h2>
        <p>請先完成所有單元與總測驗，再回來分享您的學習心得。</p></div></div>`;
      return;
    }
    const playedGame = Data.getLogs(user.empId).some(l => l.type === 'game_opened');
    const scale = SURVEY.likert;
    const likertRow = (id, text, no) => `
      <div class="svy-q" data-q="${id}">
        <div class="svy-q-text"><span class="svy-no">${no}</span>${text}</div>
        <div class="svy-scale">${scale.map((lab, k) => `
          <label class="svy-opt"><input type="radio" name="${id}" value="${k + 1}"><span class="svy-dot">${k + 1}</span><span class="svy-lab">${lab}</span></label>`).join('')}
        </div>
      </div>`;
    let no = 0;
    const secHtml = SURVEY.sections.map(sec => `
      <div class="svy-sec ${sec.game ? 'svy-game' : ''}">
        <h3>${sec.title}</h3>
        ${sec.game ? `<div class="svy-q svy-gate"><div class="svy-q-text">您是否玩過 3D 闖關遊戲？</div>
          <div class="svy-yn"><label><input type="radio" name="playedGame" value="yes" ${playedGame ? 'checked' : ''}> 有玩過</label>
          <label><input type="radio" name="playedGame" value="no"> 沒有玩過（跳過本部分）</label></div></div>` : ''}
        <div class="svy-items">${sec.items.map(it => likertRow(it.id, it.t, ++no)).join('')}</div>
      </div>`).join('');
    const susHtml = SURVEY.sus.map((t, i) => likertRow('SUS' + (i + 1), t, i + 1)).join('');
    const selfItems = SURVEY.self[user.role] || SURVEY.self.new_employee;
    const selfHtml = selfItems.map((it, i) => likertRow(it.id, it.t, i + 1)).join('');
    main.innerHTML = `
      <div class="svy-wrap">
        <a class="btn-back-menu" onclick="App.go('menu')">← 回課程選單</a>
        <div class="svy-head">
          <div class="svy-head-icon">📝</div>
          <h1>學習滿意度問卷</h1>
          <p>感謝您完成課程！請花約 5～8 分鐘填寫，您的回饋將用於改進課程與畢業專題研究，結果以匿名、整體統計方式呈現。</p>
          <div class="svy-progress"><div class="svy-progress-bar"><div id="svy-bar"></div></div><span id="svy-count"></span></div>
        </div>
        <div class="svy-part"><div class="svy-part-title">第一部分　課程滿意度</div><div class="svy-part-desc">請依您的感受，選擇最符合的程度</div>${secHtml}</div>
        <div class="svy-part"><div class="svy-part-title">第二部分　學習平台使用感受</div><div class="svy-part-desc">以下是關於整個學習平台（課程網站與 3D 遊戲）的使用感受，請憑第一印象作答</div><div class="svy-sec"><div class="svy-items">${susHtml}</div></div></div>
        <div class="svy-part"><div class="svy-part-title">第三部分　學習成效自評</div><div class="svy-part-desc">完成課程後，您認為自己的程度如何？</div><div class="svy-sec"><div class="svy-items">${selfHtml}</div></div></div>
        <div class="svy-part"><div class="svy-part-title">第四部分　意見回饋（選填）</div>
          <div class="svy-sec">${SURVEY.open.map(o => `<label class="svy-open"><span>${o.t}</span><textarea id="${o.id}" rows="3" maxlength="500" placeholder="請輸入…"></textarea></label>`).join('')}</div></div>
        <div class="svy-err" id="svy-err"></div>
        <div class="svy-submit"><button class="btn btn-primary" id="svy-submit">送出問卷</button></div>
      </div>`;
    const gameSec = main.querySelector('.svy-game .svy-items');
    function required() {
      const ids = [];
      SURVEY.sections.forEach(sec => { if (sec.game && main.querySelector('input[name=playedGame]:checked')?.value !== 'yes') return; sec.items.forEach(it => ids.push(it.id)); });
      SURVEY.sus.forEach((_, i) => ids.push('SUS' + (i + 1)));
      selfItems.forEach(it => ids.push(it.id));
      return ids;
    }
    function refresh() {
      const show = main.querySelector('input[name=playedGame]:checked')?.value === 'yes';
      gameSec.style.display = show ? '' : 'none';
      const req = required(), n = req.filter(id => main.querySelector(`input[name="${id}"]:checked`)).length;
      document.getElementById('svy-bar').style.width = (n * 100 / req.length) + '%';
      document.getElementById('svy-count').textContent = `已完成 ${n} / ${req.length} 題`;
    }
    main.querySelectorAll('input[type=radio]').forEach(r => r.addEventListener('change', () => { r.closest('.svy-q')?.classList.remove('svy-miss'); refresh(); }));
    if (!main.querySelector('input[name=playedGame]:checked')) gameSec.style.display = 'none';
    refresh();
    document.getElementById('svy-submit').addEventListener('click', () => {
      const req = required();
      const missing = req.filter(id => !main.querySelector(`input[name="${id}"]:checked`));
      main.querySelectorAll('.svy-miss').forEach(e => e.classList.remove('svy-miss'));
      if (!main.querySelector('input[name=playedGame]:checked')) missing.unshift('playedGame');
      if (missing.length) {
        missing.forEach(id => { const q = id === 'playedGame' ? main.querySelector('.svy-gate') : main.querySelector(`.svy-q[data-q="${id}"]`); if (q) q.classList.add('svy-miss'); });
        document.getElementById('svy-err').textContent = `還有 ${missing.length} 題尚未作答（已用紅框標示）`;
        const first = main.querySelector('.svy-miss'); if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      const val = id => { const r = main.querySelector(`input[name="${id}"]:checked`); return r ? parseInt(r.value) : null; };
      const answers = {};
      req.forEach(id => { if (!id.startsWith('SUS')) answers[id] = val(id); });
      const sus = SURVEY.sus.map((_, i) => val('SUS' + (i + 1)));
      const open = {}; SURVEY.open.forEach(o => { open[o.id] = document.getElementById(o.id).value.trim(); });
      Data.saveSurvey(user.empId, {
        role: user.role, playedGame: main.querySelector('input[name=playedGame]:checked').value === 'yes',
        answers, sus, susScore: calcSUS(sus), open, finalScore: finalProg.quizScore, submittedAt: new Date().toISOString()
      });
      Data.addLog(user.empId, 'survey_submitted', '填寫滿意度問卷');
      main.innerHTML = `<div class="svy-wrap"><div class="svy-thanks"><div class="svy-thanks-icon">🎉</div><h2>感謝您的填寫！</h2>
        <p>您的回饋對我們非常重要，將用於改進課程內容。</p><a class="btn-back-menu" onclick="App.go('menu')">← 回課程選單</a></div></div>`;
      window.scrollTo(0, 0); document.body.scrollTop = 0;
    });
  }

  // =====================================================================
  // ===== 求助資源 =====
  // 公司內部窗口請依實際情況修改 RESOURCES.internal
  // =====================================================================
  const RESOURCES = {
    internal: [
      { icon: '🧑‍💼', title: '直屬主管', desc: '工作上遇到任何問題，可以先找直屬主管討論', note: '若主管本身就是事件當事人，請改找人資或申訴窗口' },
      { icon: '🏢', title: '人力資源部', desc: '職場霸凌、性騷擾申訴，以及勞動權益相關問題', note: '請依公司公告的申訴管道提出' },
      { icon: '🛡️', title: '個資窗口／資安窗口', desc: '個資外洩、可疑郵件、電腦中毒等資安事件', note: '發現異常請立即通報，不要自行處理或隱瞞' },
      { icon: '🦺', title: '職業安全衛生人員', desc: '工作環境的安全隱憂、職業災害通報', note: '' },
    ],
    situations: [
      { icon: '🔒', title: '發現個資可能外洩', tag: '個資', steps: ['立即通報主管與個資窗口', '保留相關紀錄，不要自行刪除', '配合公司查明，並依規定通知當事人'] },
      { icon: '⚠️', title: '發生職災或看到危險', tag: '職安', steps: ['先確保自身與同事安全', '通報主管與職安人員', '對處理結果有疑慮，可撥 1955 諮詢'] },
      { icon: '🎣', title: '收到可疑郵件、訊息', tag: '資安', steps: ['不點連結、不開附件、不回覆', '向 IT 或資安窗口通報', '已經被騙或匯款，立即撥 165'] },
      { icon: '😣', title: '遭受職場霸凌', tag: '霸凌', steps: ['記錄日期、經過、證據與目擊者', '向公司申訴管道提出申訴', '公司未妥善處理，可撥 1955 尋求協助'] },
      { icon: '🚫', title: '遭受性騷擾', tag: '性騷擾', steps: ['保留對話、訊息等證據', '向公司性騷擾申訴管道提出', '可向地方政府勞工主管機關申訴，或撥 113'] },
      { icon: '💙', title: '心情低落、壓力很大', tag: '身心', steps: ['找信任的人聊聊', '使用公司的員工協助方案（如有）', '24 小時都可以撥 1925 安心專線'] },
    ],
    hotlines: [
      { num: '1955', title: '勞工諮詢申訴專線', desc: '勞動部｜勞動權益、職場霸凌、性騷擾等勞動問題，24 小時、免付費' },
      { num: '113', title: '保護專線', desc: '衛生福利部｜性騷擾、性侵害、家庭暴力等，24 小時' },
      { num: '165', title: '反詐騙諮詢專線', desc: '內政部警政署｜詐騙、可疑訊息查證' },
      { num: '1925', title: '安心專線', desc: '衛生福利部｜心理諮詢，24 小時、免付費' },
    ],
    laws: [
      { title: '個人資料保護法', url: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=I0050021', unit: '個資管理' },
      { title: '職業安全衛生法', url: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=N0060001', unit: '職業安全衛生、職場霸凌' },
      { title: '性別平等工作法', url: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=N0030014', unit: '職場性騷擾防治' },
      { title: '勞動基準法', url: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=N0030001', unit: '勞動權益' },
      { title: '資通安全管理法', url: 'https://law.moj.gov.tw/LawClass/LawAll.aspx?pcode=A0030297', unit: '資訊安全' },
    ],
  };
  function renderResources() {
    const user = Data.getCurrentUser();
    try { Data.addLog(user.empId, 'resources_view', '查看求助資源'); } catch (e) {}
    const main = document.getElementById('main-content');
    main.innerHTML = `
      <div class="res-wrap">
        <a class="btn-back-menu" onclick="App.go('menu')">← 回課程選單</a>
        <div class="page-header" style="text-align:center; margin: 10px 0 22px;">
          <h1 class="page-title" style="font-size:32px; letter-spacing:6px;">求助資源</h1>
          <div style="width:44px; height:3px; background:var(--primary); margin:14px auto;"></div>
          <p style="color:var(--text-light);">遇到職場問題時，你不是一個人。以下是可以尋求協助的管道</p>
        </div>
        <div class="res-safe">🤝 <b>申訴與通報都受到保護：</b>公司應對申訴內容保密，也不可以因為你提出申訴或協助調查，而對你做出不利的處分。</div>

        <h2 class="sum-h">🧭 遇到狀況，這樣做</h2>
        <div class="res-situations">
          ${RESOURCES.situations.map(s => `
            <div class="res-sit"><div class="res-sit-head"><span class="res-sit-icon">${s.icon}</span><div><div class="res-sit-tag">${s.tag}</div><div class="res-sit-title">${s.title}</div></div></div>
              <ol>${s.steps.map(t => `<li>${t}</li>`).join('')}</ol></div>`).join('')}
        </div>

        <h2 class="sum-h">🏢 公司內部窗口</h2>
        <div class="res-internal">
          ${RESOURCES.internal.map(r => `<div class="res-int"><div class="res-int-icon">${r.icon}</div><div><div class="res-int-title">${r.title}</div><div class="res-int-desc">${r.desc}</div>${r.note ? `<div class="res-int-note">${r.note}</div>` : ''}</div></div>`).join('')}
        </div>

        <h2 class="sum-h">📞 外部諮詢專線</h2>
        <div class="res-hotlines">
          ${RESOURCES.hotlines.map(h => `<a class="res-hot" href="tel:${h.num}"><div class="res-hot-num">${h.num}</div><div><div class="res-hot-title">${h.title}</div><div class="res-hot-desc">${h.desc}</div></div></a>`).join('')}
        </div>
        <p class="res-hint">📱 用手機瀏覽時，點專線號碼就能直接撥打。</p>

        <h2 class="sum-h">📜 相關法規（全國法規資料庫）</h2>
        <div class="res-laws">
          ${RESOURCES.laws.map(l => `<a class="res-law" href="${l.url}" target="_blank" rel="noopener"><span>📖 ${l.title}</span><small>${l.unit}</small><b>↗</b></a>`).join('')}
        </div>
        <p class="res-hint">本頁資訊僅供參考，實際權益與程序請以法規及主管機關公告為準。</p>
      </div>`;
  }

  // ===== 3D 闖關遊戲頁 =====
  const GAME_URLS = {
    new_employee: 'https://juliachiao.github.io/3d-space/employee.html',
    manager:      'https://juliachiao.github.io/3d-space/manager.html'
  };
  function renderGame() {
    const user = Data.getCurrentUser();
    const isManager = user.role === 'manager';
    const url = isManager ? GAME_URLS.manager : GAME_URLS.new_employee;
    try { Data.addLog(user.empId, 'game_opened', `開啟 3D 闖關遊戲（${isManager ? '主管篇' : '員工篇'}）`); } catch (e) {}
    document.getElementById('main-content').innerHTML = `
      <div class="game-page">
        <div class="game-page-top">
          <a class="btn-back-menu" onclick="App.go('menu')">← 回課程選單</a>
          <div class="game-page-title">🎮 Aery 3D 闖關遊戲・${isManager ? '主管篇' : '員工篇'}</div>
          <a class="btn-game-newtab ${isManager ? 'game-mgr' : 'game-emp'}" href="${url}" target="_blank" rel="noopener">↗ 全螢幕開啟</a>
        </div>
        <div class="game-frame-wrap">
          <iframe src="${url}" title="Aery 3D 闖關遊戲" allow="fullscreen; autoplay" allowfullscreen></iframe>
        </div>
        <p class="game-page-tip">💡 點一下遊戲畫面就能開始操作，按 Esc 可以叫回滑鼠。用手機玩的話，建議點右上角「全螢幕開啟」。</p>
      </div>
    `;
  }

  // ===== 總測驗頁 =====
  function renderFinalExam(role) {
    const user = Data.getCurrentUser();
    const main = document.getElementById('main-content');
    const courseTitle = role === 'manager' ? '主管進階課' : '員工必修課';
    const lock = getFinalExamLockStatus(user.empId, role);

    if (lock.locked) {
      main.innerHTML = `
        <a class="btn-back-menu" onclick="App.go('menu')" style="margin-bottom:20px;">← 回課程選單</a>
        <h1 class="page-title" style="font-size:32px;">🎓 ${courseTitle}總測驗</h1>
        <div style="background:var(--card-bg); padding:60px; border-radius:16px; text-align:center; margin-top:20px;">
          <div style="font-size:60px;">🔒</div>
          <h3 style="margin:20px 0;">尚未解鎖</h3>
          <p style="color:var(--text-light);">請先完成以下單元課程，才能進行總測驗：</p>
          <p style="margin-top:12px; font-weight:600;">${lock.incomplete.map(c => c.title).join('、')}</p>
        </div>
      `;
      return;
    }

    const qs = FINAL_QUIZ_BANK[role] || [];
    main.innerHTML = `
      <a class="btn-back-menu" onclick="App.go('menu')" style="margin-bottom:20px;">← 回課程選單</a>
      <h1 class="page-title" style="font-size:32px;">🎓 ${courseTitle}總測驗</h1>
      <p class="page-subtitle">共 ${qs.length} 題　｜　80 分通過　｜　預定學習時間 20 分鐘</p>
      <div class="course-content" id="final-exam-section">
        ${renderFinalQuiz(role)}
        <div style="text-align:right; margin-top:16px;">
          <button class="btn btn-primary" id="submit-final-exam">送出總測驗</button>
        </div>
      </div>
    `;

    document.getElementById('submit-final-exam').addEventListener('click', () => {
      const score = gradeFinalQuiz(role);
      try { Data.addQuizAttempt(user.empId, 'final_' + role, score, finalItemResults(role)); } catch (e) {}
      Data.setProgress(user.empId, 'final_' + role, { quizScore: score, completed: score >= 80 });
      Data.addLog(user.empId, 'final_exam_submitted', `總測驗(${role}) 得 ${score} 分`);
      renderFinalExamResults(role, score);
      document.getElementById('final-exam-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderFinalExamResults(role, score) {
    const qs = FINAL_QUIZ_BANK[role] || [];
    const passed = score >= 80;
    const section = document.getElementById('final-exam-section');
    if (!section) return;

    const groups = [
      { key: 'tf',     label: '⭕ 是非題', items: [] },
      { key: 'single', label: '📝 選擇題', items: [] },
      { key: 'multi',  label: '☑️ 多選題', items: [] }
    ];
    qs.forEach((q, qi) => {
      const g = groups.find(g => g.key === (q.type || 'single'));
      g.items.push({ q, qi });
    });

    const questionHTML = groups.filter(g => g.items.length).map(g => `
      <div class="quiz-group">
        <h4 class="quiz-group-title">${g.label}（共 ${g.items.length} 題）</h4>
        ${g.items.map(({ q, qi }, localIdx) => {
          const isMulti = q.type === 'multi';
          let isCorrect;
          if (isMulti) {
            const picked = Array.from(document.querySelectorAll(`input[name="fq${qi}"]:checked`)).map(el => parseInt(el.value)).sort();
            const answer = [...q.a].sort();
            isCorrect = picked.length === answer.length && picked.every((v, idx) => v === answer[idx]);
          } else {
            const picked = document.querySelector(`input[name="fq${qi}"]:checked`);
            const ua = picked ? parseInt(picked.value) : null;
            isCorrect = ua === q.a;
          }
          const correctSet = isMulti ? q.a : [q.a];
          const optionsHTML = q.opts.map((opt, oi) => {
            let cls = 'result-opt';
            let icon = '○';
            if (correctSet.includes(oi)) { cls += ' result-opt-correct'; icon = '✓'; }
            return `<div class="${cls}">${icon} ${opt}</div>`;
          }).join('');
          return `
            <div class="quiz-result-item ${isCorrect ? 'result-correct' : 'result-wrong'}">
              <div class="result-q-header">
                <span class="result-badge">${isCorrect ? '✓ 答對' : '✗ 答錯'}</span>
                <span class="result-q-text">Q${localIdx + 1}. ${q.q}</span>
              </div>
              <div class="result-options">${optionsHTML}</div>
            </div>`;
        }).join('')}
      </div>
    `).join('');

    section.innerHTML = `
      <div class="quiz-score-card ${passed ? 'score-pass' : 'score-fail'}">
        <div class="score-big">${score} 分</div>
        <div class="score-detail">${passed ? '通過 ✓ 恭喜完成總測驗！' : '未通過，可重新作答練習'}</div>
      </div>
      ${Data.getSurvey(Data.getCurrentUser().empId) ? '' : `<div class="final-svy-cta"><div><b>📝 最後一步：填寫學習滿意度問卷</b><div style="font-size:13.5px;color:var(--text-light);margin-top:4px;">約 5～8 分鐘，您的回饋能幫助我們改進課程</div></div><button class="btn btn-primary" onclick="App.go('survey')">前往填寫 →</button></div>`}
      ${questionHTML}
      <div style="display:flex; gap:12px; justify-content:flex-end; margin-top:20px;">
        <button class="btn btn-secondary" id="retake-final-exam">🔄 重新作答</button>
        <a class="btn-back-menu" onclick="App.go('menu')">← 回課程選單</a>
      </div>
    `;

    document.getElementById('retake-final-exam').addEventListener('click', () => {
      renderRoute('final_exam', role);
    });
  }


  // ===== 課程封面頁 =====
  function renderCover(courseId, role) {
    const user = Data.getCurrentUser();
    const main = document.getElementById('main-content');
    const allCourses = [...(Data.COURSES.new_employee || []), ...(Data.COURSES.manager || [])];
    const course = allCourses.find(c => c.id === courseId);
    if (!course) return renderMenu();

    const p = Data.getProgress(user.empId, courseId);
    const roleCourses = Data.COURSES[role] || [];
    const courseIdx = roleCourses.findIndex(c => c.id === courseId);
    const col = BRANCH_COLORS[courseIdx >= 0 ? courseIdx % BRANCH_COLORS.length : 0];
    const intro = COURSE_INTRO[courseId];

    const btnLabel = p.completed ? '重新學習'
      : (p.videoWatched || p.videoWatchedSeconds > 0 ? '繼續學習' : '開始學習');

    const videoPct = (p.videoDuration && p.videoWatchedSeconds)
      ? Math.round(p.videoWatchedSeconds * 100 / p.videoDuration)
      : (p.videoWatched ? 100 : 0);
    let statusHtml = '';
    if (p.completed) {
      statusHtml = `<div class="cv-status cv-status-done">✅ 已完成｜測驗 ${p.quizScore} 分</div>`;
    } else if (p.videoWatched || p.videoWatchedSeconds > 0) {
      statusHtml = `<div class="cv-status cv-status-prog">▶ 學習中｜影片進度 ${videoPct}%</div>`;
    }

    const TAGLINES = {
      infosec:    '一封可疑的郵件，背後藏著什麼陷阱？',
      pdpa:       '每一筆資料，都是責任的起點',
      osh:        '安全，是每個人共同的責任',
      ai_policy:  'AI 是工具，規範是底線',
      bullying:   '尊重，從了解界線開始',
      harassment: '友善職場，從你我做起',
    };

    const duration = intro ? intro.duration : '約 10–15 分鐘';
    const quizCount = intro ? intro.quizCount : (QUIZ_BANK[courseId] || []).length;

    main.innerHTML = `
      <div class="cv-page" style="--bc:${col.c}">
        <div class="cv-topbar">
          <a class="btn-back-menu" onclick="App.go('menu')">← 回課程選單</a>

        </div>

        <div class="cv-blob cv-blob1"></div>
        <div class="cv-blob cv-blob2"></div>

        <div class="cv-body">
          <div class="cv-badge">Unit ${String(courseIdx + 1).padStart(2,'0')} ・ ${role === 'manager' ? '主管人員' : '新進人員'} 必修</div>
          <div class="cv-icon">${course.icon}</div>
          <h1 class="cv-title">${course.title}</h1>
          <p class="cv-tagline">${TAGLINES[courseId] || course.desc}</p>
          <div class="cv-meta">
            <span>⏱ ${duration}</span>
            <span class="cv-sep">|</span>
            <span>🎬 影片教材</span>
            <span class="cv-sep">|</span>
            <span>📝 ${quizCount} 道測驗</span>
            <span class="cv-sep">|</span>
            <span>✅ 80 分通過</span>
          </div>
          ${statusHtml}
          <button class="cv-start-btn" id="cv-start-btn">${btnLabel} →</button>
          ${SUMMARY[courseId] && (Data.COURSES[user.role] || []).some(c => c.id === courseId) ? `<div><a class="cv-sum-link" onclick="App.go('summary_unit','${courseId}')">📋 先看本單元重點整理</a></div>` : ''}
        </div>
      </div>
    `;

    document.getElementById('cv-start-btn').addEventListener('click', () => {
      renderRoute('course', courseId, role);
    });
  }

  // ===== 課程前導頁 =====
  function renderIntro(courseId, role) {
    const user = Data.getCurrentUser();
    const main = document.getElementById('main-content');
    const allCourses = [...(Data.COURSES.new_employee || []), ...(Data.COURSES.manager || [])];
    const course = allCourses.find(c => c.id === courseId);
    if (!course) return renderMenu();

    const p = Data.getProgress(user.empId, courseId);
    const intro = COURSE_INTRO[courseId];
    const roleCourses = Data.COURSES[role] || [];
    const courseIdx = roleCourses.findIndex(c => c.id === courseId);
    const col = BRANCH_COLORS[courseIdx >= 0 ? courseIdx % BRANCH_COLORS.length : 0];
    const objs = COURSE_OBJECTIVES[courseId] || [];
    const quizCount = intro ? intro.quizCount : (QUIZ_BANK[courseId] || []).length;
    const duration = intro ? intro.duration : '約 10–15 分鐘';

    // 進度狀態
    const videoPct = (p.videoDuration && p.videoWatchedSeconds)
      ? Math.round(p.videoWatchedSeconds * 100 / p.videoDuration)
      : (p.videoWatched ? 100 : 0);
    let progressHtml = '';
    if (p.completed) {
      progressHtml = `<div class="ci-status-badge ci-status-done">✅ 已完成｜測驗 ${p.quizScore} 分</div>`;
    } else if (p.videoWatched || p.videoWatchedSeconds > 0) {
      progressHtml = `
        <div class="ci-prog-wrap">
          <div class="ci-prog-label">目前進度 ${videoPct}%</div>
          <div class="ci-prog-bar"><div class="ci-prog-fill" style="width:${videoPct}%"></div></div>
        </div>`;
    }

    const btnLabel = p.completed ? '重新學習' : (p.videoWatched || p.videoWatchedSeconds > 0 ? '繼續學習' : '開始學習');

    // 場景故事 or 簡介卡
    const storyCard = intro ? `
      <div class="ci-card">
        <div class="ci-card-label">🎬 課程故事情境</div>
        <p class="ci-story-text">${intro.scenario}</p>
        <div class="ci-characters">
          ${intro.characters.map(c => `
            <div class="ci-char">
              <span class="ci-char-icon">${c.icon}</span>
              <span class="ci-char-name">${c.name}</span>
              <span class="ci-char-role">${c.role}</span>
            </div>
          `).join('')}
        </div>
      </div>` : `
      <div class="ci-card">
        <div class="ci-card-label">📖 課程簡介</div>
        <p class="ci-story-text">${course.desc}</p>
      </div>`;

    // 重點概念（僅 infosec 有）
    const conceptsSection = intro ? `
      <div class="ci-concepts-section">
        <div class="ci-section-title">💡 本課重點概念</div>
        <div class="ci-concepts-grid">
          ${intro.keyPoints.map(kp => `
            <div class="ci-concept-card" style="--bc:${col.c}; --bbg:${col.bg}">
              <div class="ci-concept-icon">${kp.icon}</div>
              <div class="ci-concept-label">${kp.label}</div>
              <div class="ci-concept-desc">${kp.desc}</div>
            </div>`).join('')}
        </div>
      </div>` : '';

    main.innerHTML = `
      <a class="btn-back-menu" onclick="App.go('cover','${courseId}','${role}')" style="margin-bottom:20px;">← 回課程封面</a>

      <div class="ci-hero" style="--bc:${col.c}">
        <div class="ci-hero-inner">
          <div class="ci-hero-icon">${course.icon}</div>
          <div class="ci-hero-text">
            <div class="ci-hero-badge">Unit ${String(courseIdx + 1).padStart(2,'0')} ・ ${role === 'manager' ? '主管人員' : '新進人員'}</div>
            <h1 class="ci-title">${course.title}</h1>
            <p class="ci-desc-text">${course.desc}</p>
            <div class="ci-meta-row">
              <span class="ci-meta-pill">⏱ ${duration}</span>
              <span class="ci-meta-pill">🎬 影片教材</span>
              <span class="ci-meta-pill">📝 ${quizCount} 道測驗</span>
              <span class="ci-meta-pill">✅ 80 分通過</span>
            </div>
          </div>
        </div>
        ${progressHtml}
      </div>

      <div class="ci-grid">
        ${storyCard}
        <div class="ci-card">
          <div class="ci-card-label">🎯 學習目標</div>
          <div class="ci-obj-list">
            ${objs.map((o, i) => `
              <div class="ci-obj-item">
                <span class="ci-obj-num">${i + 1}</span>
                <span>${o}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <div class="ci-structure-section">
        <div class="ci-section-title">📋 課程架構</div>
        <div class="ci-steps">
          <div class="ci-step ${p.videoWatched ? 'ci-step-done' : ''}">
            <div class="ci-step-num">01</div>
            <div class="ci-step-body">
              <div class="ci-step-icon">🎬</div>
              <div class="ci-step-label">觀看影片</div>
              <div class="ci-step-detail">${intro ? intro.videoTitle : '課程教學影片'}</div>
              <div class="ci-step-sub">${duration}</div>
            </div>
            ${p.videoWatched ? '<div class="ci-step-check">✓ 已完成</div>' : ''}
          </div>
          <div class="ci-step-arrow">▶</div>
          <div class="ci-step ${p.quizScore != null ? 'ci-step-done' : ''}">
            <div class="ci-step-num">02</div>
            <div class="ci-step-body">
              <div class="ci-step-icon">📝</div>
              <div class="ci-step-label">完成測驗</div>
              <div class="ci-step-detail">${quizCount} 道選擇題</div>
              <div class="ci-step-sub">80 分以上完課</div>
            </div>
            ${p.quizScore != null ? `<div class="ci-step-check">✓ ${p.quizScore} 分</div>` : ''}
          </div>
        </div>
      </div>

      ${conceptsSection}

      <div class="ci-cta-row">
        <button class="ci-start-btn" id="ci-start-btn" style="--bc:${col.c}">${btnLabel} →</button>
      </div>
    `;

    document.getElementById('ci-start-btn').addEventListener('click', () => {
      renderRoute('course', courseId, role);
    });
  }

  // ===== 首頁：課程架構圖 =====
  function renderHome() {
    const user = Data.getCurrentUser();
    const main = document.getElementById('main-content');
    const overall = Data.getEmployeeOverallProgress(user.empId);
    const myCourses = Data.COURSES[user.role] || [];
    const isManager = user.role === 'manager';

    const totalStudySec = myCourses.reduce((sum, c) => sum + (Data.getProgress(user.empId, c.id).studySeconds || 0), 0);
    const quizScores = myCourses.map(c => Data.getProgress(user.empId, c.id).quizScore).filter(s => s != null);
    const avgScore = quizScores.length ? Math.round(quizScores.reduce((a, b) => a + b, 0) / quizScores.length) : null;
    const totalWrong = myCourses.reduce((sum, c) => sum + Data.getWrongAnswers(user.empId, c.id).length, 0);
    const allDone = overall.percent >= 100;

    const empCourses = Data.COURSES.new_employee || [];
    const mgrCourses = Data.COURSES.manager || [];

    function courseNodeHTML(course, role, num, colorIdx) {
      const isMine = user.role === role;
      const p = isMine ? Data.getProgress(user.empId, course.id) : {};
      let statusLabel = '未開始', statusCls = 'arch-status-pending';
      if (isMine) {
        if (p.completed)                                { statusLabel = '✅ 已完成'; statusCls = 'arch-status-done'; }
        else if (p.videoWatched || p.quizScore != null) { statusLabel = '▶ 進行中';  statusCls = 'arch-status-prog'; }
      }
      const objs = COURSE_OBJECTIVES[course.id] || [];
      const col = BRANCH_COLORS[colorIdx % BRANCH_COLORS.length];
      return `
        <div class="csd-course-col" style="--bc:${col.c}; --bbg:${col.bg}">
          <div class="csd-cn ${isMine ? 'csd-cn-mine' : 'csd-cn-other'} ${isMine && p.completed ? 'csd-cn-done' : ''}"
               ${isMine ? `data-course-id="${course.id}" data-role="${role}"` : ''}>
            <div class="csd-cn-icon">${course.icon}</div>
            <div class="csd-cn-num">Unit ${String(num).padStart(2,'0')}</div>
            <div class="csd-cn-title">${course.title}</div>
            ${isMine ? `<span class="mm-node-status ${statusCls}">${statusLabel}</span>` : ''}
            <div class="csd-cn-divider"></div>
            <div class="csd-cn-subs">
              ${objs.map(o => `<div class="csd-cn-sub"><span class="csd-cn-dot">◆</span><span>${o}</span></div>`).join('')}
            </div>
            ${isMine ? `<div class="csd-cn-enter">點擊進入課程 →</div>` : `<div class="csd-cn-other-label">🔒 非本人路徑</div>`}
          </div>
        </div>
      `;
    }

    main.innerHTML = `
      <div class="home-hero">
        <div class="home-hero-inner">
          <div>
            <div class="home-welcome">歡迎回來，${user.name}${isManager ? '　主管' : ''}</div>
          </div>
          <div class="home-prog-block">
            <div class="home-prog-label">整體完成度</div>
            <div class="progress-bar home-prog-bar">
              <div class="progress-fill" style="width:${overall.percent}%;"></div>
            </div>
            <div class="home-prog-num">${overall.percent}%</div>
          </div>
        </div>
      </div>

      <div class="csd-section">
        <div class="csd-section-topbar">
          <a class="btn-back-menu csd-back-link" onclick="App.go('menu')">← 回課程選單</a>
          <div class="csd-section-label">課程架構圖</div>
        </div>

        <div class="csd-tree">
          <div class="csd-root-row">
            <div class="csd-root-node">
              <span class="csd-root-icon">📚</span>
              <div class="csd-root-info">
                <div class="csd-root-title">職場法律必修課</div>
                <div class="csd-root-sub">企業法遵數位訓練課程</div>
              </div>
              <span class="csd-root-badge">${overall.completed} / ${overall.total} 門完成</span>
            </div>
          </div>

          <div class="csd-stem"></div>

          <div class="csd-branches">
            <div class="csd-branch ${!isManager ? 'csd-branch-active' : 'csd-branch-inactive'}">
              <div class="csd-branch-hdr">
                <span>👤</span>
                <span>新進人員路徑</span>
                ${!isManager ? '<span class="csd-path-tag">我的路徑</span>' : ''}
              </div>
              <div class="csd-branch-vline"></div>
              <div class="csd-courses-row" style="--cols:${empCourses.length}">
                ${empCourses.map((c, i) => courseNodeHTML(c, 'new_employee', i + 1, i)).join('')}
              </div>
            </div>

            <div class="csd-branch ${isManager ? 'csd-branch-active' : 'csd-branch-inactive'}">
              <div class="csd-branch-hdr">
                <span>👔</span>
                <span>主管人員路徑</span>
                ${isManager ? '<span class="csd-path-tag">我的路徑</span>' : ''}
              </div>
              <div class="csd-branch-vline"></div>
              <div class="csd-courses-row" style="--cols:${mgrCourses.length}">
                ${mgrCourses.map((c, i) => courseNodeHTML(c, 'manager', i + 1, i + 4)).join('')}
              </div>
            </div>
          </div>

          ${allDone ? `<div class="mm-done-banner" style="margin-top:28px;"><span>🎉</span><span>恭喜！您已完成本學習路徑的所有課程</span></div>` : ''}
        </div>
      </div>

      <div class="home-stats-section">
        <div class="home-stats-title">📈 學習數據</div>
        <div class="dash-stats">
          <div class="dash-stat-card">
            <div class="dash-stat-icon">📚</div>
            <div class="dash-stat-num">${overall.completed}<span class="dash-stat-sub">/${overall.total}</span></div>
            <div class="dash-stat-label">課程完成</div>
          </div>
          <div class="dash-stat-card">
            <div class="dash-stat-icon">⏱️</div>
            <div class="dash-stat-num">${formatStudyTime(totalStudySec)}</div>
            <div class="dash-stat-label">總學習時間</div>
          </div>
          <div class="dash-stat-card">
            <div class="dash-stat-icon">📊</div>
            <div class="dash-stat-num">${avgScore != null ? avgScore + '<span class="dash-stat-sub">分</span>' : '--'}</div>
            <div class="dash-stat-label">測驗平均分</div>
          </div>
          <div class="dash-stat-card ${totalWrong ? 'dash-stat-warn' : ''}">
            <div class="dash-stat-icon">📝</div>
            <div class="dash-stat-num">${totalWrong || '--'}</div>
            <div class="dash-stat-label">錯題待複習</div>
          </div>
        </div>
      </div>
    `;

    main.querySelectorAll('.csd-cn-mine[data-course-id]').forEach(el => {
      el.addEventListener('click', () => renderRoute('course', el.dataset.courseId, el.dataset.role));
    });
  }

  const BRANCH_COLORS = [
    { c: '#5B8DEF', bg: '#EEF3FD' },
    { c: '#3ABFB1', bg: '#E5F7F6' },
    { c: '#F0A030', bg: '#FEF5E7' },
    { c: '#E05C5C', bg: '#FDECEA' },
    { c: '#9B6BE8', bg: '#F3ECFF' },
    { c: '#4BAE76', bg: '#EBF8F1' },
  ];

  function courseItemHTML(course, user, num) {
    const p = Data.getProgress(user.empId, course.id);
    let statusLabel = '未開始', statusCls = 'arch-status-pending';
    if (p.completed)                               { statusLabel = '✅ 已完成'; statusCls = 'arch-status-done'; }
    else if (p.videoWatched || p.quizScore != null){ statusLabel = '▶ 進行中';  statusCls = 'arch-status-prog'; }

    const objs = COURSE_OBJECTIVES[course.id] || [];
    const col = BRANCH_COLORS[(num - 1) % BRANCH_COLORS.length];
    return `
      <div class="mm-branch" style="--i:${num - 1}; --bc:${col.c}; --bbg:${col.bg}">
        <div class="mm-node-card ${p.completed ? 'mm-node-done' : ''}" data-course-id="${course.id}">
          <div class="mm-node-top">
            <span class="mm-unit-num">Unit ${String(num).padStart(2,'0')}</span>
            <span class="mm-unit-icon">${course.icon}</span>
          </div>
          <div class="mm-node-title">${course.title}</div>
          <span class="mm-node-status ${statusCls}">${statusLabel}</span>
          <div class="mm-node-divider"></div>
          <div class="mm-subs">
            ${objs.map(o => `<div class="mm-sub"><span class="mm-sub-dot">◆</span><span>${o}</span></div>`).join('')}
          </div>
          <div class="mm-enter">點擊進入課程 →</div>
        </div>
      </div>
    `;
  }




  // ===== 操作說明 =====
  function renderGuide() {
    document.getElementById('main-content').innerHTML = `
      <div class="guide-wrap">
        <a class="btn-back-menu" onclick="App.go('menu')">← 回課程選單</a>
        <div class="guide-header">
          <h1 class="page-title">操作說明</h1>
          <p class="guide-subtitle">三個步驟，輕鬆完成職場法律必修課程</p>
        </div>

        <div class="guide-steps">
          <div class="guide-step-card">
            <div class="guide-step-num">01</div>
            <div class="guide-step-icon">🗺️</div>
            <div class="guide-step-title">選擇課程</div>
            <div class="guide-step-desc">登入後首頁即顯示您的課程架構圖。瀏覽各單元的學習目標，點擊課程卡片即可進入。</div>
          </div>
          <div class="guide-step-card">
            <div class="guide-step-num">02</div>
            <div class="guide-step-icon">🎬</div>
            <div class="guide-step-title">觀看教學影片</div>
            <div class="guide-step-desc">每門課程包含一支教學影片。完整觀看後系統自動記錄進度，確保不遺漏任何重點。</div>
          </div>
          <div class="guide-step-card">
            <div class="guide-step-num">03</div>
            <div class="guide-step-icon">✏️</div>
            <div class="guide-step-title">完成課後測驗</div>
            <div class="guide-step-desc">影片結束後進行測驗，即時查看分數與每題解析。測驗可重複作答，直到完全理解為止。</div>
          </div>
        </div>

        <div class="guide-tips">
          <div class="guide-tips-hd">💡 實用小技巧</div>
          <div class="guide-tips-grid">
            <div class="guide-tip-item">
              <span class="guide-tip-ico">📊</span>
              <div>
                <div class="guide-tip-head">掌握學習數據</div>
                <div class="guide-tip-body">首頁課程架構圖下方顯示課程完成數、總學習時間與測驗平均分，隨時掌握自己的學習狀況。</div>
              </div>
            </div>
            <div class="guide-tip-item">
              <span class="guide-tip-ico">🔄</span>
              <div>
                <div class="guide-tip-head">測驗可重複作答</div>
                <div class="guide-tip-body">每次測驗皆可查看答題解析，建議確認所有題目都答對後再進入下一門課程。</div>
              </div>
            </div>
            <div class="guide-tip-item">
              <span class="guide-tip-ico">📝</span>
              <div>
                <div class="guide-tip-head">善用錯題本</div>
                <div class="guide-tip-body">課程頁面下方的錯題複習區，以及首頁下方的「錯題待複習」數字，都可幫助您鎖定需要加強的題目。</div>
              </div>
            </div>
          </div>
        </div>

      </div>
    `;
  }

  // ===== 課程內錯題複習區塊 =====
  function renderWrongAnswerSection(empId, courseId) {
    const area = document.getElementById('wrong-answer-section');
    if (!area) return;
    const wrongs = Data.getWrongAnswers(empId, courseId);
    if (!wrongs.length) { area.innerHTML = ''; return; }

    const isOpen = area.querySelector('.wrong-section-body') && !area.querySelector('.wrong-section-body').classList.contains('hidden');

    area.innerHTML = `
      <div class="wrong-section">
        <div class="wrong-section-header" id="wrong-toggle">
          <span>📝 錯題複習 — 上次測驗答錯 ${wrongs.length} 題</span>
          <span class="wrong-toggle-icon">${isOpen ? '▲' : '▼'}</span>
        </div>
        <div class="wrong-section-body ${isOpen ? '' : 'hidden'}">
          ${wrongs.map(item => `
            <div class="wrong-item">
              <div class="wrong-q">Q. ${item.q}</div>
              ${item.opts.map((opt, oi) => `
                <div class="${oi === item.a ? 'result-opt result-opt-correct' : oi === item.ua ? 'result-opt result-opt-wrong' : 'result-opt'}">
                  ${oi === item.a ? '✓' : oi === item.ua ? '✗' : '○'} ${opt}
                </div>
              `).join('')}
              ${item.explain ? `<div class="result-explain">💡 ${item.explain}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('wrong-toggle').addEventListener('click', () => {
      const body = area.querySelector('.wrong-section-body');
      const icon = area.querySelector('.wrong-toggle-icon');
      body.classList.toggle('hidden');
      icon.textContent = body.classList.contains('hidden') ? '▼' : '▲';
    });
  }

  // ===== 錯題本頁（保留供路由使用）=====
  function renderWrongAnswers() {
    const user = Data.getCurrentUser();
    const main = document.getElementById('main-content');
    const myCourses = Data.COURSES[user.role] || [];

    const sections = myCourses.map(c => {
      const p = Data.getProgress(user.empId, c.id);
      const wrongs = Data.getWrongAnswers(user.empId, c.id);
      let body;
      if (p.quizScore == null) {
        body = `<div class="wrong-empty">尚未完成測驗</div>`;
      } else if (!wrongs.length) {
        body = `<div class="wrong-empty" style="color:#4a8a4a;">✓ 全部答對，繼續保持！</div>`;
      } else {
        body = wrongs.map(item => `
          <div class="wrong-item">
            <div class="wrong-q">Q. ${item.q}</div>
            ${item.opts.map((opt, oi) => `
              <div class="${oi === item.a ? 'result-opt result-opt-correct' : oi === item.ua ? 'result-opt result-opt-wrong' : 'result-opt'}">
                ${oi === item.a ? '✓' : oi === item.ua ? '✗' : '○'} ${opt}
              </div>
            `).join('')}
            ${item.explain ? `<div class="result-explain">💡 ${item.explain}</div>` : ''}
          </div>
        `).join('');
      }
      const badge = wrongs.length ? `<span class="wrong-badge">${wrongs.length} 題待複習</span>` : '';
      return `
        <div class="notes-card">
          <div class="notes-card-title" style="justify-content:space-between;">
            <div style="display:flex; align-items:center; gap:8px;">
              <span>${c.icon}</span><span>${c.title}</span>
            </div>
            ${badge}
          </div>
          ${body}
        </div>
      `;
    }).join('');

    const totalWrong = myCourses.reduce((sum, c) => sum + Data.getWrongAnswers(user.empId, c.id).length, 0);

    main.innerHTML = `
      <h1 class="page-title">錯題本</h1>
      <p class="page-subtitle">${totalWrong ? `共 ${totalWrong} 題待複習 — 針對答錯的題目加強學習` : '目前沒有錯題，繼續保持！'}</p>
      <div style="max-width:720px; margin:0 auto;">${sections}</div>
      <a class="btn-back-menu is-bottom" onclick="App.go('menu')">← 回課程選單</a>
    `;
  }


  // ===== 學習計時器 =====
  let _studyTimer = { empId: null, courseId: null, start: null };

  function startStudyTimer(empId, courseId) {
    flushStudyTimer();
    _studyTimer = { empId, courseId, start: Date.now() };
  }

  function flushStudyTimer() {
    const { empId, courseId, start } = _studyTimer;
    if (empId && courseId && start) {
      const elapsed = Math.round((Date.now() - start) / 1000);
      if (elapsed >= 5) {
        const p = Data.getProgress(empId, courseId);
        Data.setProgress(empId, courseId, { studySeconds: (p.studySeconds || 0) + elapsed });
      }
    }
    _studyTimer = { empId: null, courseId: null, start: null };
  }

  function formatStudyTime(secs) {
    secs = Math.floor(secs || 0);
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m`;
    if (secs > 0) return `${secs}s`;
    return '--';
  }

  // ===== 課程內容頁 =====
  function renderCourse(courseId, role) {
    const user = Data.getCurrentUser();
    const course = (Data.COURSES[role] || []).find(c => c.id === courseId);
    if (!course) return renderHome();

    const isMine = user.role === role;
    const main = document.getElementById('main-content');

    if (!isMine) {
      main.innerHTML = `
        <h1 class="page-title">${course.title}</h1>
        <div style="background:var(--card-bg); padding:60px; border-radius:16px; text-align:center; margin-top:40px;">
          <div style="font-size:60px;">📚</div>
          <h3 style="margin:20px 0;">此課程屬於另一路徑</h3>
          <p style="color:var(--text-light);">您可以瀏覽課程概要,但學習紀錄不會被列入。</p>
          <p style="margin-top:12px;">課程簡介: ${course.desc}</p>
        </div>
        <a class="btn-back-menu is-bottom" onclick="App.go('menu')">← 回課程選單</a>
      `;
      return;
    }

    Data.addLog(user.empId, 'enter_course', `進入課程: ${course.title}`);
    const p = Data.getProgress(user.empId, courseId);
    const videoCfg = Data.getVideoConfig(courseId);
    const hasVideo = !!videoCfg.url;

    const ytId = hasVideo ? extractYouTubeId(videoCfg.url) : null;

    const videoBlock = hasVideo ? `
      ${ytId
        ? `<style>
             #ytc-wrap:fullscreen { display:flex; flex-direction:column; height:100vh; background:#000; }
             #ytc-wrap:-webkit-full-screen { display:flex; flex-direction:column; height:100vh; background:#000; }
             #ytc-wrap:fullscreen #course-video,
             #ytc-wrap:-webkit-full-screen #course-video { flex:1 1 auto; height:auto; aspect-ratio:unset; border-radius:0; }
           </style>
           <div id="ytc-wrap" style="position:relative;">
             <div id="course-video" data-yt-id="${ytId}" style="width:100%; aspect-ratio:16/9; border-radius:12px 12px 0 0; background:#000; overflow:hidden; pointer-events:none;"></div>
             <div style="background:#1a1a1a; border-radius:0 0 12px 12px; padding:10px 14px; display:flex; align-items:center; gap:14px;">
               <button class="ytc-play" type="button" style="background:none; border:none; color:#fff; font-size:20px; cursor:pointer; width:28px;">▶</button>
               <button class="ytc-mute" type="button" style="background:none; border:none; color:#fff; font-size:16px; cursor:pointer; width:24px;">🔊</button>
               <span class="ytc-time" style="color:#ccc; font-size:13px; min-width:100px;">0:00 / 0:00</span>
               <div style="flex:1; height:5px; background:#444; border-radius:3px; overflow:hidden; pointer-events:none;">
                 <div class="ytc-bar-fill" style="width:0%; height:100%; background:#e04b4b;"></div>
               </div>
               <button class="ytc-fullscreen" type="button" title="全螢幕" style="background:none; border:none; color:#fff; font-size:17px; cursor:pointer; width:26px;">⛶</button>
             </div>
             <div style="font-size:11px; color:var(--text-light); margin-top:4px;">🔒 為確保觀看紀錄真實，本影片進度條無法拖動快轉，請完整觀看。</div>
           </div>`
        : `<video id="course-video" controls preload="metadata"
             style="width:100%; max-height:480px; border-radius:12px; background:#000;"
             src="${videoCfg.url}"></video>`}
      <div id="video-progress-info" style="margin-top:12px; padding:12px 16px; background:rgba(170,184,208,0.1); border-radius:8px; font-size:13px;">
        <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
          <span>📺 觀看進度</span>
          <span id="vp-text">尚未開始</span>
        </div>
        <div class="progress-bar" style="width:100%; height:8px;">
          <div class="progress-fill" id="vp-bar" style="width:0%;"></div>
        </div>
        <div style="margin-top:8px; color:var(--text-light); font-size:12px;">
          ※ 系統將自動記錄您的觀看時長與位置,跳過的片段不會列入觀看完成
        </div>
      </div>
      <div style="display:flex; justify-content:flex-end; margin-top:10px;">
        <button id="btn-add-bm" class="btn btn-secondary" style="font-size:12px; padding:6px 14px;">📌 加書籤</button>
      </div>
      <div id="bm-input-wrap" class="hidden" style="margin-top:8px; display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
        <input type="text" id="bm-note-input" placeholder="書籤備註（選填）"
          style="flex:1; min-width:140px; padding:8px 12px; border:1px solid var(--border); border-radius:8px; font-size:13px; font-family:inherit;" />
        <button id="bm-confirm" class="btn btn-primary" style="font-size:13px; padding:6px 14px; white-space:nowrap;">確定加入</button>
        <button id="bm-cancel" class="btn btn-secondary" style="font-size:13px; padding:6px 14px;">取消</button>
      </div>
      <div id="bookmarks-area" style="margin-top:8px;"></div>
    ` : `
      <div class="video-placeholder">
        <span style="position:absolute; bottom:20px; right:20px; font-size:14px; opacity:0.8;">教材開發中,敬請期待...</span>
      </div>
      <div style="text-align:right; margin-bottom:8px;">
        <button class="btn ${p.videoWatched ? 'btn-secondary' : 'btn-primary'}" id="mark-watched">
          ${p.videoWatched ? '✓ 已標記為觀看完成' : '標記為觀看完成 (示範用)'}
        </button>
      </div>
    `;

    main.innerHTML = `
      <a class="btn-back-menu" onclick="App.go('cover','${courseId}','${role}')" style="margin-bottom:20px;">← 回課程封面</a>
      <h1 class="page-title" style="font-size:32px;">${course.icon} ${course.title}</h1>
      <p class="page-subtitle">${course.desc}</p>

      <div class="course-content">
        <h3 style="margin-bottom:16px; letter-spacing:2px;">1. 觀看影片${videoCfg.title ? ` — ${videoCfg.title}` : ''}</h3>
        ${videoBlock}

        <div class="quiz-section" style="margin-top:32px;">
          <h3 style="margin-bottom:16px; letter-spacing:2px;">2. 單元測驗</h3>
          ${renderQuiz(courseId)}
          <div style="text-align:right; margin-top:16px;">
            <button class="btn btn-primary" id="submit-quiz">送出測驗</button>
          </div>
        </div>

        ${p.completed ? `
          <div style="margin-top:32px; padding:24px; background:#d4ecd4; border-radius:12px; text-align:center;">
            <strong style="color:#4a8a4a;">🎉 您已完成此課程!</strong>
            <div style="margin-top:8px; color:#4a8a4a;">最後完成時間: ${formatTime(p.lastAt)}</div>
            ${p.quizScore != null ? `<div style="margin-top:4px;">測驗分數: ${p.quizScore} 分</div>` : ''}
          </div>
        ` : ''}

        <div id="wrong-answer-section" style="margin-top:32px;"></div>
      </div>
    `;

    if (hasVideo) {
      attachVideoTracking(user.empId, courseId, course);
    } else {
      const mw = document.getElementById('mark-watched');
      if (mw) mw.addEventListener('click', () => {
        Data.setProgress(user.empId, courseId, { videoWatched: true });
        Data.addLog(user.empId, 'video_watched', `(示範模式) 觀看影片: ${course.title}`);
        checkComplete(user.empId, courseId);
        toast('已記錄影片觀看完成', 'success');
        renderRoute('course', courseId, role);
      });
    }

    bindSubmitQuiz(courseId, role);
    renderWrongAnswerSection(user.empId, courseId);
    startStudyTimer(user.empId, courseId);
  }

  function bindSubmitQuiz(courseId, role) {
    const btn = document.getElementById('submit-quiz');
    if (!btn) return;
    btn.addEventListener('click', () => {
      const qs = QUIZ_BANK[courseId] || [];
      const userAnswers = qs.map((q, qi) => {
        const picked = document.querySelector(`input[name="q${qi}"]:checked`);
        return picked ? parseInt(picked.value) : -1;
      });
      const unanswered = userAnswers.filter(a => a === -1).length;
      if (unanswered > 0) {
        toast(`還有 ${unanswered} 題未作答`, 'error');
        return;
      }
      const correct = userAnswers.filter((ans, i) => ans === qs[i].a).length;
      const score = qs.length ? Math.round(correct * 100 / qs.length) : 0;
      const user = Data.getCurrentUser();
      Data.setProgress(user.empId, courseId, { quizScore: score });
      Data.addLog(user.empId, 'quiz_submitted', `測驗: ${courseId} 得 ${score} 分`);
      try { Data.addQuizAttempt(user.empId, courseId, score, qs.map((q, i) => ({ q: q.q, ok: userAnswers[i] === q.a }))); } catch (e) {}
      const wrongs = qs.reduce((acc, q, i) => {
        if (userAnswers[i] !== q.a) acc.push({ q: q.q, opts: q.opts, a: q.a, ua: userAnswers[i], explain: q.explain });
        return acc;
      }, []);
      Data.saveWrongAnswers(user.empId, courseId, wrongs);
      checkComplete(user.empId, courseId);
      renderQuizResults(courseId, userAnswers, role);
      renderWrongAnswerSection(user.empId, courseId);
      document.querySelector('.quiz-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function renderQuizResults(courseId, userAnswers, role) {
    const qs = QUIZ_BANK[courseId] || [];
    const correct = userAnswers.filter((ans, i) => ans === qs[i].a).length;
    const score = qs.length ? Math.round(correct * 100 / qs.length) : 0;
    const passed = score >= 80;

    const questionHTML = qs.map((q, i) => {
      const ua = userAnswers[i];
      const isCorrect = ua === q.a;
      const optionsHTML = q.opts.map((opt, oi) => {
        let cls = 'result-opt';
        let icon = '○';
        if (oi === q.a)              { cls += ' result-opt-correct'; icon = '✓'; }
        else if (oi === ua && !isCorrect) { cls += ' result-opt-wrong';   icon = '✗'; }
        return `<div class="${cls}">${icon} ${opt}</div>`;
      }).join('');

      return `
        <div class="quiz-result-item ${isCorrect ? 'result-correct' : 'result-wrong'}">
          <div class="result-q-header">
            <span class="result-badge">${isCorrect ? '✓ 答對' : '✗ 答錯'}</span>
            <span class="result-q-text">Q${i + 1}. ${q.q}</span>
          </div>
          <div class="result-options">${optionsHTML}</div>
          ${q.explain ? `<div class="result-explain">💡 ${q.explain}</div>` : ''}
        </div>`;
    }).join('');

    const section = document.querySelector('.quiz-section');
    if (!section) return;
    section.innerHTML = `
      <h3 style="margin-bottom:16px; letter-spacing:2px;">2. 單元測驗 — 結果分析</h3>
      <div class="quiz-score-card ${passed ? 'score-pass' : 'score-fail'}">
        <div class="score-big">${score} 分</div>
        <div class="score-detail">${correct} / ${qs.length} 題答對　${passed ? '通過 ✓' : '未通過，可重新作答練習'}</div>
      </div>
      ${questionHTML}
      <div style="display:flex; gap:12px; justify-content:flex-end; margin-top:20px;">
        <button class="btn btn-secondary" id="retake-quiz">🔄 重新作答</button>
        ${passed ? `<button class="btn btn-primary" onclick="App.go('cover',courseId,role)">回課程封面 →</button>` : ''}
      </div>
    `;

    document.getElementById('retake-quiz').addEventListener('click', () => {
      section.innerHTML = `
        <h3 style="margin-bottom:16px; letter-spacing:2px;">2. 單元測驗</h3>
        ${renderQuiz(courseId)}
        <div style="text-align:right; margin-top:16px;">
          <button class="btn btn-primary" id="submit-quiz">送出測驗</button>
        </div>
      `;
      bindSubmitQuiz(courseId, role);
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  // ===== HTML5 影片觀看進度追蹤 =====
  function attachVideoTracking(empId, courseId, course) {
    const el = document.getElementById('course-video');
    if (!el) return;

    const prog = Data.getProgress(empId, courseId);
    let lastTime = prog.videoLastPosition || 0;
    // 已看過的最遠位置,至少要有「累積觀看秒數」跟「上次播放位置」兩者中較大的一個,
    // 避免使用者重新整理頁面後,續播機制反而被「防跳關」鎖住播不回去
    const initialMaxWatched = Math.max(prog.videoWatchedSeconds || 0, lastTime);

    const video = (el.tagName === 'DIV' && el.dataset.ytId)
      ? createYouTubeController('course-video', el.dataset.ytId, initialMaxWatched)
      : el;
    currentVideoController = video;
    if (el.tagName === 'DIV') attachCustomYTControls(video, 'ytc-wrap');

    let segStart = null;
    let lastFlush = 0;
    let playCount = 0;
    const REQUIRED_RATIO = 0.9;  // 觀看 90% 以上才視為完成

    // 設定影片初始 metadata 與續播位置
    video.addEventListener('loadedmetadata', () => {
      Data.setVideoMeta(empId, courseId, {
        videoDuration: Math.floor(video.duration)
      });
      if (lastTime > 0 && lastTime < video.duration - 5) {
        video.currentTime = lastTime;
      }
      updateProgressUI(empId, courseId);
    });

    // 播放開始
    video.addEventListener('play', () => {
      segStart = video.currentTime;
      playCount++;
      // 資料寫入延後到下一個 tick，避免跟按鈕圖示更新搶在同一瞬間執行造成卡頓
      setTimeout(() => {
        Data.addLog(empId, 'video_play', `▶ 播放: ${course.title} (從 ${formatSec(segStart)})`);
      }, 0);
    });

    // 暫停或結束: 記錄當前播放區段
    function flushSegment() {
      if (segStart != null && video.currentTime > segStart) {
        Data.recordVideoSegment(empId, courseId, segStart, video.currentTime);
        segStart = video.currentTime;
        updateProgressUI(empId, courseId);
      }
    }

    video.addEventListener('pause', () => {
      const pausedAt = video.currentTime;
      // 資料寫入延後到下一個 tick，讓暫停按鈕圖示先完成畫面更新，操作起來才不會感覺卡頓
      setTimeout(() => {
        flushSegment();
        Data.addLog(empId, 'video_pause', `⏸ 暫停於 ${formatSec(pausedAt)}`);
      }, 0);
    });

    // 持續播放: 每 3 秒記錄一次區段
    video.addEventListener('timeupdate', () => {
      if (segStart == null) return;
      if (video.currentTime - lastFlush >= 3) {
        Data.recordVideoSegment(empId, courseId, segStart, video.currentTime);
        segStart = video.currentTime;
        lastFlush = video.currentTime;
        updateProgressUI(empId, courseId);
      }
    });

    // 使用者跳轉
    video.addEventListener('seeked', () => {
      const newTime = video.currentTime;
      if (segStart != null && Math.abs(newTime - segStart) > 2) {
        Data.addLog(empId, 'video_seek', `⏩ 跳轉至 ${formatSec(newTime)}`);
        segStart = newTime;
        lastFlush = newTime;
      }
    });

    // 影片結束
    video.addEventListener('ended', () => {
      flushSegment();
      Data.addLog(empId, 'video_ended', `✓ 播放結束: ${course.title}`);
      const finalProg = Data.getProgress(empId, courseId);
      const ratio = finalProg.videoDuration ? finalProg.videoWatchedSeconds / finalProg.videoDuration : 0;
      if (ratio >= REQUIRED_RATIO && !finalProg.videoWatched) {
        Data.setProgress(empId, courseId, { videoWatched: true });
        Data.addLog(empId, 'video_watched', `🎬 達成觀看門檻 (${Math.round(ratio*100)}%)`);
        toast(`觀看進度達 ${Math.round(ratio*100)}%,影片完成!`, 'success');
        checkComplete(empId, courseId);
      } else if (ratio < REQUIRED_RATIO) {
        toast(`觀看進度 ${Math.round(ratio*100)}%,需達 ${REQUIRED_RATIO*100}% 才算完成`, 'error');
      }
      updateProgressUI(empId, courseId);
    });

    // 視窗關閉前 flush 最後片段
    window.addEventListener('beforeunload', flushSegment);

    // ===== 影片書籤 =====
    renderBookmarks(empId, courseId);

    const btnBm = document.getElementById('btn-add-bm');
    const bmWrap = document.getElementById('bm-input-wrap');
    let bmCapturedTime = 0;

    if (btnBm) btnBm.addEventListener('click', () => {
      bmCapturedTime = video.currentTime;
      const isHidden = bmWrap.classList.contains('hidden');
      bmWrap.classList.toggle('hidden');
      if (isHidden) {
        document.getElementById('bm-note-input').value = '';
        document.getElementById('bm-note-input').focus();
      }
    });

    document.getElementById('bm-confirm')?.addEventListener('click', () => {
      const note = document.getElementById('bm-note-input').value.trim();
      Data.addBookmark(empId, courseId, bmCapturedTime, note);
      bmWrap.classList.add('hidden');
      toast(`📌 書籤已加入 ${formatSec(bmCapturedTime)}`, 'success');
      renderBookmarks(empId, courseId);
    });

    document.getElementById('bm-cancel')?.addEventListener('click', () => {
      bmWrap.classList.add('hidden');
    });

    document.getElementById('bm-note-input')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('bm-confirm').click();
      if (e.key === 'Escape') document.getElementById('bm-cancel').click();
    });
  }

  function renderBookmarks(empId, courseId) {
    const area = document.getElementById('bookmarks-area');
    if (!area) return;
    const bookmarks = Data.getBookmarks(empId, courseId);
    if (!bookmarks.length) { area.innerHTML = ''; return; }
    area.innerHTML = `
      <div class="bm-wrap">
        <div class="bm-header">📌 書籤列表（${bookmarks.length} 個）</div>
        ${bookmarks.map(b => `
          <div class="bm-item">
            <span class="bm-time" data-time="${b.time}">${formatSec(b.time)}</span>
            <span class="bm-note">${b.note || '(無備註)'}</span>
            <button class="bm-del" data-id="${b.id}">✕</button>
          </div>
        `).join('')}
      </div>
    `;
    area.querySelectorAll('.bm-time').forEach(el => {
      el.addEventListener('click', () => {
        if (!currentVideoController) return;
        const target = parseFloat(el.dataset.time);
        if (typeof currentVideoController.requestSeek === 'function') {
          const ok = currentVideoController.requestSeek(target);
          if (!ok) toast('這個書籤位置還沒真正看過,已跳到目前看過的最遠位置', 'error');
        } else {
          currentVideoController.currentTime = target;
        }
        currentVideoController.play();
      });
    });
    area.querySelectorAll('.bm-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        Data.deleteBookmark(empId, courseId, btn.dataset.id);
        renderBookmarks(empId, courseId);
      });
    });
  }

  function updateProgressUI(empId, courseId) {
    const p = Data.getProgress(empId, courseId);
    const dur = p.videoDuration || 0;
    const watched = p.videoWatchedSeconds || 0;
    const ratio = dur ? Math.min(1, watched / dur) : 0;
    const bar = document.getElementById('vp-bar');
    const txt = document.getElementById('vp-text');
    if (bar) bar.style.width = (ratio * 100).toFixed(1) + '%';
    if (txt) {
      txt.textContent = `${formatSec(watched)} / ${formatSec(dur)} (${(ratio*100).toFixed(1)}%)${p.videoWatched ? ' ✓ 已達門檻' : ''}`;
    }
  }

  function formatSec(s) {
    s = Math.floor(s || 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2,'0')}`;
  }

  function checkComplete(empId, courseId) {
    const p = Data.getProgress(empId, courseId);
    if (p.videoWatched && p.quizScore != null && p.quizScore >= 80 && !p.completed) {
      Data.setProgress(empId, courseId, { completed: true });
      Data.addLog(empId, 'course_completed', `完成課程: ${courseId}`);
    }
  }

  // ===== 測驗題庫 =====
  const QUIZ_BANK = {
    pdpa: [
      { q: '下列何者不屬於《個資法》中最高等級保護的「特種個資」？', opts: ['健康檢查報告', '指紋識別', '工會成員身分', '車牌號碼與 GPS 位置'], a: 3,
        explain: '健康檢查報告、指紋識別、工會成員身分皆屬於《個資法》中最高等級保護的特種個資；車牌號碼與 GPS 位置屬於一般個資（能拼湊識別身分的資訊）。' },
      { q: '關於「桌面清空原則」，當你暫時離開座位 10 分鐘時，該如何處理寫有客戶個資的紙張？', opts: ['拿另一張紙蓋起來即可', '鎖進抽屜或隨身帶走', '翻面放置，確保字體朝下', '留在桌上，反正辦公室有門禁'], a: 1,
        explain: '標準做法是鎖進抽屜或直接隨身帶走，蓋起來、翻面或留在桌上都無法真正防止他人窺視或取得個資。' },
      { q: '個資管理分為四個階段：「蒐集、處理、利用、銷毀」。關於「蒐集」階段，下列敘述何者正確？', opts: ['只要是為了辦理業務，不需要特別告知客戶', '蒐集必須合法，且須告知保存期限與接觸人員', '只要客戶同意，就可以將其電話用於任何其他行銷目的', '只有紙本資料才算蒐集，口頭詢問不算'], a: 1,
        explain: '蒐集個資須合法為之，且必須告知當事人資料會存多久、誰會接觸到，這是蒐集階段的告知義務。' },
      { q: '小強要寄送一份含 500 位 VIP 名單的加密 Excel 給廠商，下列哪種做法最專業？', opts: ['檔案加密，並將密碼寫在同一封信的標題中', '檔案加密，並在下一封郵件告知密碼', '檔案加密，並透過不同管道（如 Teams 或手機）告知密碼', '直接寄出，主旨寫上「絕密，請勿外傳」'], a: 2,
        explain: '檔案加密並透過不同管道告知密碼，稱為「管道分離」，可避免密碼與檔案同時遭到攔截而失守。' },
      { q: '關於不需要的個資文件銷毀，下列做法何者最能避免漏洞？', opts: ['當作背面紙或廢紙重複使用', '直接丟入回收箱，環保省事', '使用碎紙機切成「長條狀」即可', '使用碎紙機確保切成「顆粒狀碎斷」'], a: 3,
        explain: '含個資的文件唯一歸宿是碎紙機，且必須確認切成「顆粒狀碎斷」，僅切成長條狀仍有被拼湊還原的風險。' },
      { q: '根據影片內容，個資外洩引發的民事損害賠償最高可達多少金額？', opts: ['2 萬元', '2,000 萬元', '2 億元', '無限制'], a: 2,
        explain: '影片中 Aery 提到，個資外洩的民事損害賠償最高可達 2 億元，這是法律紅線而非僅是公司內部規則。' },
      { q: '當發生個資異常疑似事件時，應遵循的 SOP 流程簡稱為？', opts: ['疑、查、報', '查、追、刪', '報、檢、封', '疑、封、毀'], a: 0,
        explain: '影片提到的 SOP 為「疑、查、報」：第一時間發現異常，立即查證並回報主管，不應因害怕而隱瞞。' },
      { q: '小誠提到：「如果我把客戶辦信用卡的電話，拿去私下問他要不要買保險」，這樣的行為屬於下列何種違規？', opts: ['蒐集不合法', '逾越特定目的之利用', '銷毀不徹底', '傳輸未加密'], a: 1,
        explain: '將個資用於原本蒐集目的以外的用途，屬於「逾越特定目的」的違規利用行為。' },
      { q: '關於密碼設定，影片中小妤建議的強密碼標準為何？', opts: ['4 位數字即可，方便記憶', '使用生日或電話號碼，較好回想', '建議使用 12 位以上的強密碼', '全公司使用同一組密碼以便管理'], a: 2,
        explain: '小妤建議密碼應使用 12 位以上的強密碼，保護力才足夠；簡單數字或個人資訊當密碼都容易被破解。' },
      { q: '根據影片內容，下列關於企業處理個資異常事件的敘述，何者正確？', opts: ['只有收到正式申訴信，公司才需要展開調查', '即使尚未收到正式申訴，只要發現或知悉疑似個資異常事件，就應主動通報並及時啟動調查與處理', '調查沒有時間限制，可以視情況拖延', '為了避免驚動客戶，應先隱瞞事件再私下處理'], a: 1,
        explain: '發現或知悉疑似個資異常事件時，不必等到正式申訴，就應立即通報主管與個資窗口，並及時啟動調查與處理；依《個人資料保護法》，查明後也要以適當方式通知當事人。' }
    ],
    osh: [
      { q: '小強站在椅子上拿高處文件，這屬於哪一種職業安全風險？', opts: ['資訊安全風險', '跌倒風險', '火災風險', '網路風險'], a: 1,
        explain: '站上椅子拿高處物品屬於典型的「跌倒風險」，應改用合適工具或請人協助。' },
      { q: '只要沒有真的受傷，就不算職安違規。', opts: ['是', '否'], a: 1,
        explain: '職安違規的認定不是以「有無受傷」為標準，只要行為本身違反安全規範，即便沒有造成傷害，仍屬於違規行為。' },
      { q: '下列哪一項是勞工的基本義務？', opts: ['忽略危險快速完成工作', '正確使用設備與防護措施', '把危險交給別人處理', '不需要遵守工作守則'], a: 1,
        explain: '依職業安全衛生法，勞工有義務正確使用雇主提供的設備與防護措施，並遵守工作守則。' },
      { q: '你發現茶水間地板濕滑，最正確的做法是？', opts: ['當作沒看到', '快速跑過去', '提醒同事並立即通報', '等別人處理'], a: 2,
        explain: '發現危害應立即提醒周圍同事並通報，避免有人因濕滑地板而滑倒受傷。' },
      { q: '長時間姿勢不良造成的肩頸痠痛，也屬於職業安全衛生的一部分。', opts: ['是', '否'], a: 0,
        explain: '職業安全衛生不僅涵蓋立即性的意外傷害，長期姿勢不良造成的肌肉骨骼問題同樣屬於職業健康議題。' },
      { q: '「看、避、報」中的「避」是指什麼？', opts: ['避開主管', '避免危險行為，選擇安全方式', '避免工作', '避免與同事合作'], a: 1,
        explain: '「避」是指發現危險後應避免從事該危險行為，選擇安全的替代方式處理。' },
      { q: '如果需要拿高處物品，最安全的做法是？', opts: ['直接踩椅子', '跳起來拿', '使用合適工具或尋求協助', '放棄不拿'], a: 2,
        explain: '應使用合適的工具（如安全梯凳）或請同事協助，而非踩椅子或跳躍拿取，避免跌倒風險。' },
      { q: '「看、避、報」中的「報」是指什麼？', opts: ['報告主管職安已改善', '發現危害立即通報，避免擴大', '報告當天工作進度', '呈報年度考核'], a: 1,
        explain: '「報」是指發現危害後應立即通報相關人員，避免危害範圍擴大或再次發生。' },
      { q: '使用滅火器前，下列敘述何者正確？', opts: ['不需要確認火勢大小，直接使用即可', '火勢過大時應先確保自身安全並通報，勿逕自撲滅', '滅火器人人都能操作，不需訓練', '滅火器過期沒關係，還是能使用'], a: 1,
        explain: '火勢過大時應以自身安全為優先，先撤離並通報，不應逕自嘗試撲滅，以免造成更嚴重的傷害。' },
      { q: '進行有噪音、粉塵等作業環境時，配戴防護具（如耳罩、口罩）的正確觀念為何？', opts: ['只有資深員工才需要配戴', '覺得麻煩可以不戴', '依作業性質配戴合適防護具，是保護自己的基本責任', '防護具僅在稽核當天配戴即可'], a: 2,
        explain: '配戴防護具是保護自身健康的基本責任，應依作業性質全程配戴，不因資深與否或稽核與否而有差別。' }
    ],
    ai_policy: [
      { q: '小強把包含客戶姓名、電話與交易紀錄的完整資料直接輸入 AI，只要能提升效率就是可以接受的。', opts: ['是', '否'], a: 1,
        explain: '完整客戶個資不應直接輸入 AI 工具，應先去識別化，否則有資料外洩與違反個資規範的風險。' },
      { q: '根據課程內容，下列哪一項是正確的 AI 使用原則？', opts: ['AI 結果可以直接對外使用，不需檢查', 'AI 可以完全取代人工判斷', '使用 AI 前應先進行資料去識別化', '所有免費 AI 工具都能安心使用'], a: 2,
        explain: '使用 AI 前應先將個資去識別化，AI 產出也需要人工查證，不能完全取代人工判斷。' },
      { q: '小美想利用 AI 分析客戶消費趨勢，下列哪個做法最合適？', opts: ['上傳完整客戶資料提高分析準確度', '刪除姓名、電話等個資後再分析', '使用任何網路上的 AI 工具即可', '直接相信 AI 產出的所有內容'], a: 1,
        explain: '應先刪除姓名、電話等可識別個資後再進行分析，兼顧分析需求與個資保護。' },
      { q: '公司 AI 使用 SOP 中的「查」代表什麼？', opts: ['查詢更多 AI 工具', '檢查同事是否使用 AI', 'AI 結果必須人工查證', '查閱客戶完整資料'], a: 2,
        explain: '「查」是指 AI 產出的內容必須經過人工查證，確認正確性後才能使用。' },
      { q: 'AI 生成的內容可能出現「看似正確但實際錯誤」的情況。', opts: ['是', '否'], a: 0,
        explain: '這種現象稱為「AI 幻覺」，AI 有時會生成看似合理但實際錯誤的資訊，使用前務必查證。' },
      { q: '以下哪一項屬於課程提到的 AI 使用風險？', opts: ['資料外洩', 'AI 幻覺（錯誤資訊）', '法律與責任風險', '以上皆是'], a: 3,
        explain: '資料外洩、AI 幻覺、法律與責任風險都是使用 AI 時應注意的風險，缺一不可留意。' },
      { q: '員工使用 AI 工具生成的文字或圖片，若涉及他人受著作權保護的內容，下列敘述何者正確？', opts: ['AI 生成的內容一定沒有著作權問題，可以直接使用', '仍可能涉及智慧財產權風險，使用前應確認來源與授權', '只要沒有營利就不算侵權', '只要註明「AI 生成」就不會有法律責任'], a: 1,
        explain: 'AI 生成內容仍可能涉及智慧財產權風險，使用前應確認來源與授權，註明「AI 生成」並不能免除法律責任。' },
      { q: '公司規定僅能使用清單內經核准的 AI 工具，主要目的是為了？', opts: ['限制員工使用新技術', '確保資料安全與符合公司資安規範', '增加員工的工作負擔', '避免員工使用免費工具'], a: 1,
        explain: '限制使用經核准的 AI 工具，主要是為了確保資料安全並符合公司資安規範，而非單純限制新技術或增加負擔。' },
      { q: '使用 AI 協助產出的報告或文件，若要直接對外使用，應該如何處理？', opts: ['不需要特別標註，直接視為員工原創', '應依公司規範適度標註 AI 協助之情形，並經人工確認內容正確性', '只要客戶沒發現就沒關係', '只要格式正確即可對外發布'], a: 1,
        explain: '對外使用的內容應依公司規範標註 AI 協助情形，並經人工確認內容正確性後才能發布。' },
      { q: '公司內部尚未公開的商業策略、合約內容或技術文件，不應直接輸入公開的 AI 工具中。', opts: ['是', '否'], a: 0,
        explain: '公司機密文件（商業策略、合約、技術文件）不應輸入公開 AI 工具，以避免機密資訊外洩。' }
    ],
    infosec: [
      { q: '在劇中，小強收到的電子郵件有明顯破綻，下列何者是判斷它是「釣魚郵件」的最關鍵線索？', opts: ['內容關於績效獎金補發', '要求點擊連結確認銀行帳號', '寄件者地址後綴為 @gmail.com', '信件語氣過於客氣'], a: 2,
        explain: '劇中小誠發現寄件人是 hr-systex@gmail.com，並質疑公司應使用官方信箱而非一般 Gmail，這是判斷釣魚郵件最關鍵的破綻。' },
      { q: '當小強說「不點就拿不到錢欸」時，這正中了駭客利用人性中的哪一種弱點？', opts: ['同情心', '急迫感與貪婪', '正義感', '恐懼感'], a: 1,
        explain: '小強因害怕錯過獎金而急於點擊，正是駭客利用「急迫感與貪婪」的典型手法。Aery 提醒：駭客攻擊往往利用的是人性，而非技術。' },
      { q: '資安核心概念「CIA 三要素」中的「I」是指「完整性」，它的具體定義是什麼？', opts: ['確保資料不被未授權的人看到', '確保資料不被意外或非法竄改', '確保系統在需要時能正常運作', '確保密碼設定超過 12 位元'], a: 1,
        explain: '小妤說明：完整性（Integrity）代表資料不能被竄改，例如帳號或金額若被非法修改，就是破壞了完整性。' },
      { q: '劇中提到，如果讓病毒進入系統導致資料損毀，除了技術損失外，還可能涉及哪方面的法律責任？', opts: ['違反著作權法', '妨害電腦使用罪', '違反交通安全法規', '詐欺罪'], a: 1,
        explain: '劇中提到若病毒進入系統造成設備故障或資料損毀，行為可能涉及刑法中的「妨害電腦使用罪」。' },
      { q: '角色 Aery 提到的「常見資安威脅」清單中，不包含下列哪一項？', opts: ['弱密碼（如 123456）', '不明隨身碟', '假冒同事傳送的請求檔案', '電腦硬體螢幕故障'], a: 3,
        explain: 'Aery 列出的常見威脅包括：釣魚信件、弱密碼（如 123456 或生日）、不明隨身碟、假冒同事傳訊。電腦硬體螢幕故障屬於設備問題，不屬於資安威脅。' },
      { q: '小妤強調遇到資安事件要記住三步驟「疑、查、報」，其中的「查」是指什麼？', opts: ['查詢自己的銀行餘額', '查詢網路上的懶人包', '確認訊息來源，或詢問 IT 部門', '檢查電腦是否已經中毒'], a: 2,
        explain: '「查」的具體作法是確認訊息來源是否合法，或直接詢問 IT 部門，不應自行上網搜尋，以免被進一步誤導。' },
      { q: '根據劇中邏輯，誰才是組織中最重要的資安「防線」？', opts: ['只有專業的 IT 人員', '公司的最高負責人', 'Aery 虛擬機器人', '每一位多確認一步的員工'], a: 3,
        explain: '劇中強調資安不只是 IT 的責任，每一位願意「多確認一步」的員工，都是組織最重要的防線。' },
      { q: '根據小妤的解釋，如果公司的獎金資料外洩，被未經授權的人看到，這會破壞「CIA 三要素」中的哪一項？', opts: ['可用性', '完整性', '機密性', '穩定性'], a: 2,
        explain: '機密性（Confidentiality）定義為「資料不能被未授權的人看到」，獎金資料外洩讓不該看到的人看到，正是破壞了機密性。' },
      { q: '劇中 Aery 提到，如果不小心點擊釣魚信件導致客戶資料外洩，公司除了技術層面的影響外，還可能會面臨什麼後果？', opts: ['違反個資保護規定，甚至面臨罰款', '必須強制關閉所有伺服器一個月', '系統會自動封鎖所有外部電子郵件', '員工會立刻被移送法辦'], a: 0,
        explain: '客戶資料外洩會使公司違反個人資料保護法，主管機關可對企業開罰，嚴重者需承擔民事賠償責任，也會損害公司商譽。' },
      { q: '遇到資安事件的「疑、查、報」三步驟中，最後一步的「報」具體應該怎麼做？', opts: ['報警並立刻聯絡新聞媒體', '使用公司資安通報機制回報', '在個人社群媒體上發文警告親友', '直接回信給寄件者要求說明'], a: 1,
        explain: '「報」是指使用公司內部的資安通報機制進行回報，每一次通報都可能阻止後續更大的風險蔓延。切勿公開或自行回覆。' }
    ],
    bullying: [
      { q: '小強主管在辦公室當眾羞辱小誠「沒帶腦袋上班」，並隨即要求他明天去倉庫點貨且扣發獎金。事後小強辯稱：「我才罵這一次，以前法律不是說要『持續發生』才算霸凌嗎？」<br><br>問題：根據 2026 年新法紅線，下列敘述何者正確？',
        opts: ['只要不是「持續發生」，單次嚴重的言語辱罵並不構成霸凌。', '只要造成身心危害，即便單次嚴重的人格侮辱，霸凌即可成立。', '若企業未訂定防治措施導致霸凌發生，最高行政罰鍰為 100 萬元。', '霸凌導致員工發生職業病時，最高可重罰企業 75 萬元。'], a: 1,
        explain: '未訂防治措施最高罰 75 萬；霸凌導致職業病最高可重罰 300 萬，C、D 選項數字對調為陷阱。' },
      { q: '小妤主管下班後與同事喝咖啡，無意間聽到「耳語」傳聞某部門發生霸凌事件，但目前並無受害者正式提交書面申訴。<br><br>問題：此時小妤主管與公司管理層應如何處理？',
        opts: ['為了程序正義，必須等待受害者寫正式申訴信後才能啟動調查處置。', '若採取「被動等待」而不作為，最高可能面臨 100 萬元的罰鍰。', '應立即啟動調查，且 100 人以上企業，調查小組中外部專業人士比例不得少於 1/3。', '為了維護公司名譽，應先找雙方主管「搓湯圓」和解。'], a: 1,
        explain: '法律不看形式，只要主管「知悉」就負有主動釐清義務；外部專業人士比例應為 1/2，C 選項為陷阱。' },
      { q: '公司負責人經認定有霸凌行為，受害者向地方主管機關提起外部申訴。進入勞動法庭後，公司因平時管理紀錄不全，拿不出完整的出勤紀錄或防治紀錄。<br><br>問題：下列關於此案例法律後果的敘述，哪一項是錯誤的？',
        opts: ['若負責人經認定霸凌成立，將面臨 1 萬至 100 萬元的個人罰鍰，且不得由公司代付。', '在《勞動事件法》下，雇主若拿不出管理紀錄，法院得直接認定勞方的主張為真實。', '違規企業將被強制公布名稱與負責人姓名，這對商譽是不可逆的損害。', '雇主有權在調查期間隨意調動申訴人的職位，作為經營需要的調整。'], a: 3,
        explain: '此屬違法的報復行為，此類調動命令一律無效，並非雇主的合法權利。' },
      { q: '小強打算在霸凌案調查結束後，找個「經營需要」的理由，把提起申訴的小誠調去偏遠分公司，理由是「眼不見為淨」。<br><br>問題：下列敘述何者正確？',
        opts: ['只要主管有正當的經營考量，調動申訴人職位就不算違法。', '此屬違法的報復行為；若被認定違法，調動命令一律無效，小誠可向法院聲請「定暫時狀態處分」，要求回復原職並照領薪水。', '只要調動後薪資不變，就不構成報復行為。', '主管只要事後補一份調動理由書，就能合法化這次調動。'], a: 1,
        explain: '法律嚴禁對申訴人或協助調查者予以不利處分，違法的報復性處分一律無效。' },
      { q: '小誠向公司申訴遭到小強霸凌，調查程序啟動後，小誠擔心與小強在辦公室見面會造成壓力。<br><br>問題：在調查期間，主管依據法規有權採取下列哪項處置來保護被害人？',
        opts: ['為了保護被害人，主管有權先行「暫停被申訴人（小強）職務」。', '強制要求被害人（小誠）請假在家，且不支薪。', '立即將雙方調往不同縣市的分公司，不論其意願。', '為了維持中立，禁止雙方在調查結束前領取任何獎金。'], a: 0,
        explain: '調查期間主管有權暫停被申訴人職權以保護被害人；若查無實據，公司須補發停職期間薪資。' },
      { q: '主管小強為了息事寧人，找受害者到辦公室喝咖啡，並提議：「大家各退一步，搓湯圓（和解）一下就好，不要把事情鬧大。」<br><br>問題：關於「強制和解」，下列敘述何者符合法律紅線？',
        opts: ['主管有責任負責調解，因此可以要求申訴人必須接受和解。', '只要有 HR 在場，即便申訴人不情願，和解依然有效。', '雇主協調的前提是「申訴人完全自願」，絕對不能強制。', '500 人以上的企業，主管可以強制要求申訴人接受心理諮商以代替調查。'], a: 2,
        explain: '一旦強迫和解或程序有瑕疵，主管機關會認定調查無效並命令重查。' },
      { q: '小強心想：「員工只要一離職，之前的霸凌申訴應該就不了了之了吧？」<br><br>問題：根據新法規定的申訴時效，下列敘述何者正確？',
        opts: ['員工一旦離職，即喪失申訴權利。', '霸凌行為終了起 3 年內均可申訴；若在職期間發生，離職之日起 1 年內仍可提起申訴。', '申訴時效僅限於霸凌發生後 6 個月內。', '只要員工簽署離職同意書，即視為放棄一切申訴權利。'], a: 1,
        explain: '申訴時效為霸凌行為終了起 3 年內，在職期間發生者離職後 1 年內仍可提起，員工離職不代表申訴權消滅。' },
      { q: '公司平時未落實出勤紀錄、防治紀錄等文書留存，某次霸凌訴訟中，公司拿不出任何管理紀錄或調查軌跡。<br><br>問題：根據《勞動事件法》的舉證責任轉換規定，公司最可能面臨的後果為何？',
        opts: ['只需自行負擔訴訟費用即可，不影響判決結果。', '法院會要求勞工提出更完整的證據，公司無須負擔額外責任。', '公司可主張員工誣告而免除舉證責任。', '法院得直接認定勞工的主張為真實，公司等同自動敗訴。'], a: 3,
        explain: '雇主負有文書提出義務，拿不出管理紀錄，法院可直接認定勞工主張為真實，等同自動敗訴。' },
      { q: '小妤提醒主管們，處理霸凌案件時要落實「通、調、密、記」原則。<br><br>問題：下列哪一項做法符合這個原則？',
        opts: ['為了讓同事互相警惕，可以在部門群組公告誰被申訴、申訴內容為何。', '調查過程應保密，不讓其他同事知悉申訴內容，並完整記錄每一次警告與評估事由。', '只要口頭溝通過就好，不需要留下任何書面紀錄。', '由申訴人自行負責保密，公司不需要另外規範。'], a: 1,
        explain: '調查過程務必保密以避免二次傷害，且每一次警告、每一份評估事由都要留下完整書面紀錄。' },
      { q: '問題：根據影片內容，企業要真正落實霸凌防治，最根本的做法應該是？',
        opts: ['等到發生申訴案件後，再臨時擬定處理流程即可。', '將霸凌定義與處理流程明訂於工作規則並公告周知，建立至少兩種以上申訴管道，並定期辦理主管教育訓練。', '只要準備好高額罰鍰的預算，出事時直接繳罰款即可。', '由各部門主管自行決定是否要處理下屬的申訴。'], a: 1,
        explain: '企業應把霸凌定義與處理流程明訂於工作規則並公告，建立多元申訴管道，並定期辦理主管教育訓練，而非等出事才臨時處理。' }
    ],
    harassment: [
      { q: '關於「2026 年新法」對性騷擾事件發生的時間與空間認定，下列何者正確？',
        opts: ['僅限於辦公室內發生的行為才算性騷擾', '若發生在「非工作時間」，人資可直接以「場外事件」為由拒絕受理', '保護範圍已延伸至「非工作時間」，只要是同一單位或業務往來對象的持續性騷擾皆適用', '下班後的私人聚會完全不屬於公司管轄範圍'], a: 2,
        explain: '2026 年新法將保護範圍延伸至非工作時間，只要騷擾行為發生在同一單位成員或業務往來對象之間並具持續性，公司仍負有處置義務，不能以「場外」為由拒絕受理。' },
      { q: '若行為人利用「職務指揮、監督權力」進行騷擾，在法律上屬於何種定義？',
        opts: ['一般性騷擾', '權勢性騷擾', '職場霸凌', '私人糾紛'], a: 1,
        explain: '利用職務上指揮、監督關係進行騷擾，法律上定義為「權勢性騷擾」，與一般性騷擾在法律效果上有所區別（例如懲罰性賠償金）。' },
      { q: '針對「權勢性騷擾」，法院最高可判賠多少倍的懲罰性賠償金？',
        opts: ['1 倍', '2 倍', '3 倍', '5 倍'], a: 2,
        explain: '對於具指揮監督關係者利用機會騷擾，法院可依法判賠 1 至 3 倍的懲罰性賠償金，上限為 3 倍。' },
      { q: '規模超過百人的公司，在組成「申訴調查小組」時，成員結構有何法定要求？',
        opts: ['必須全部由公司內部資深主管組成', '成員必須包含具備性別意識的「外部專業人士」', '只需要法務人員參與即可', '由受害者的直屬主管擔任負責人'], a: 1,
        explain: '調查小組需納入具備性別意識的外部專業人士，以確保程序客觀公正，避免因全由內部人員組成而產生偏頗疑慮。' },
      { q: '根據新法，雇主對於性騷擾申訴人，至少應提供幾次心理諮商協助？',
        opts: ['1 次', '2 次', '3 次', '5 次'], a: 1,
        explain: '雇主對申訴人至少應提供 2 次心理諮商協助，作為法定防治與補救措施的一部分。' },
      { q: '下列何者符合「知悉即啟動」的雙軌原則？',
        opts: ['必須等受害者遞交正式申訴書後，公司才能啟動程序', '只要雇主知悉疑似性騷擾情事，不論有無正式申訴書，都必須啟動處置程序', '僅針對傳聞進行非正式調查，無須記錄', '只要行為人否認，公司即可停止後續動作'], a: 1,
        explain: '「知悉即啟動」原則不論是否有正式申訴書，只要雇主知悉疑似情事，就必須啟動處置程序並留下紀錄，不能因行為人否認就停止調查。' },
      { q: '調查期間，雇主為了隔離雙方，下列哪一項做法屬於「法規紅線（違法行為）」？',
        opts: ['暫時停止行為人的職務', '調整行為人的辦公位置', '將「申訴人（受害人）」調職並採取減薪處理', '調整行為人的業務內容'], a: 2,
        explain: '對申訴人（受害人）進行調職並減薪屬於違法的報復性處分，雇主應針對行為人採取隔離措施，而非懲罰申訴人。' },
      { q: '若雇主認定性騷擾屬實且情節重大，行使「不經預告解僱權」的法律時效為何？',
        opts: ['7 天內', '15 天內', '30 天內', '60 天內'], a: 2,
        explain: '依勞動基準法規定，雇主行使不經預告解僱權，須自知悉其情形之日起 30 日內為之，逾期不得行使。' },
      { q: '若雇主知悉性騷擾卻未採取立即有效的補救措施，行政罰鍰上限最高為多少？',
        opts: ['50 萬元', '100 萬元', '150 萬元', '200 萬元'], a: 1,
        explain: '依《性別工作平等法》規定，雇主知悉性騷擾情事而未採取立即有效之糾正及補救措施，最高可處 100 萬元罰鍰。' },
      { q: '若雇主無法證明已盡防治責任，除了罰鍰，還可能面臨什麼民事後果？',
        opts: ['吊銷公司執照', '負責人入獄服刑', '與行為人連帶負擔民事損害賠償', '無須承擔額外責任'], a: 2,
        explain: '若雇主無法證明已盡到性騷擾防治義務，須與行為人一同對受害人連帶負擔民事損害賠償責任。' }
    ]
  };

  // ===== 總測驗題庫 =====
  const FINAL_QUIZ_BANK = {
    manager: [
      // ---- 1-10：職場霸凌預防舉措 ----
      { q: '主管在會議中對下屬說了一次極為羞辱人格的話，事後辯稱「只罵一次不算霸凌」。根據新法紅線，下列敘述何者正確？',
        opts: ['只要不是持續發生，就不構成霸凌', '只要造成身心危害，單次嚴重侮辱即可成立霸凌', '必須累積三次以上才能認定', '只有肢體行為才算霸凌'], a: 1 },
      { q: '主管僅從第三方口中聽聞疑似霸凌情事，尚未收到任何正式申訴書。此時公司的法定義務為何？',
        opts: ['等到收到正式申訴書才需處理', '無須處理，除非受害人主動要求', '只要「知悉」即須主動釐清事實並採取措施', '可交由當事人私下和解即可'], a: 2 },
      { q: '100 人以上企業組成霸凌調查小組時，外部專業人士的比例規定為何？',
        opts: ['不得少於 1/4', '不得少於 1/3', '不得少於 1/2', '沒有比例限制'], a: 2 },
      { q: '若企業未訂定霸凌防治措施，主管機關最高可開罰多少？',
        opts: ['15 萬元', '75 萬元', '150 萬元', '300 萬元'], a: 1 },
      { q: '若霸凌導致勞工發生職業病，企業最高可能面臨的罰鍰為何？',
        opts: ['75 萬元', '100 萬元', '300 萬元', '500 萬元'], a: 2 },
      { q: '調查期間，主管將提起申訴的員工調往偏遠分公司，理由是「業務需要」。下列敘述何者正確？',
        opts: ['只要理由合理，就不算違法', '這是違法的報復行為，調動命令一律無效', '只要沒有減薪，就不構成報復', '主管有權自行決定人事調動，不受限制'], a: 1 },
      { q: '關於霸凌案件的和解，下列敘述何者正確？',
        opts: ['主管可主動安排雙方見面協調，強制達成共識', '只要 HR 在場見證，強制和解就合法', '和解的前提是申訴人完全自願，不得強迫', '500 人以上企業可用心理諮商取代調查'], a: 2 },
      { q: '員工在職期間遭受霸凌，之後離職，關於申訴時效下列何者正確？',
        opts: ['離職即喪失申訴權利', '離職之日起 1 年內仍可提起申訴', '只能在霸凌發生後 3 個月內申訴', '簽署離職同意書即視為放棄申訴權'], a: 1 },
      { q: '公司平時未落實出勤與防治紀錄，訴訟時拿不出相關文件，依《勞動事件法》舉證責任轉換規定，最可能的後果為何？',
        opts: ['法院會要求勞工補足證據', '法院得直接認定勞工主張為真實，企業等同自動敗訴', '沒有實質影響', '公司可主張員工誣告免責'], a: 1 },
      { q: '企業要真正落實霸凌防治，下列做法何者最根本？',
        opts: ['出事後再臨時擬定處理流程', '準備好罰鍰預算，出事直接繳款了事', '將霸凌定義與處理流程明訂於工作規則、建立多元申訴管道並定期辦理教育訓練', '交由各部門主管自行決定是否處理'], a: 2 },
      // ---- 11-20：職場性騷擾防治 ----
      { q: '主管與下屬在下班後的私人聚會中發生疑似性騷擾情事。根據 2026 年新法，公司應如何處理？',
        opts: ['非工作時間發生，公司無管轄權', '只要是私人聚會就無須受理', '只要屬於同一單位或業務往來對象間的持續性騷擾，公司仍負處置義務', '只有在辦公室內發生才需要處理'], a: 2 },
      { q: '主管利用職務上的指揮監督權力對下屬進行性騷擾，法律上稱為：',
        opts: ['一般性騷擾', '權勢性騷擾', '職場霸凌', '一般糾紛'], a: 1 },
      { q: '針對權勢性騷擾，法院最高可判賠幾倍的懲罰性賠償金？',
        opts: ['1 倍', '2 倍', '3 倍', '5 倍'], a: 2 },
      { q: '規模超過百人的企業，性騷擾申訴調查小組的組成有何法定要求？',
        opts: ['全部由內部資深主管組成即可', '須包含具備性別意識的外部專業人士', '只需法務代表出席', '由受害者的直屬主管主導調查'], a: 1 },
      { q: '依新法規定，雇主對性騷擾申訴人至少應提供幾次心理諮商協助？',
        opts: ['1 次', '2 次', '3 次', '5 次'], a: 1 },
      { q: '「知悉即啟動」的雙軌原則是指：',
        opts: ['一定要有正式申訴書才能啟動程序', '不論有無正式申訴，雇主知悉即須啟動處置程序', '僅能進行非正式的口頭了解', '行為人否認時，公司即可終止調查'], a: 1 },
      { q: '調查期間，下列哪項做法屬於違法的報復行為？',
        opts: ['暫時停止行為人職務', '調整行為人辦公位置', '將申訴人調職並減薪', '調整行為人業務內容'], a: 2 },
      { q: '雇主認定性騷擾情節重大，欲行使不經預告解僱權，法定時效為知悉之日起幾日內？',
        opts: ['7 日', '15 日', '30 日', '60 日'], a: 2 },
      { q: '雇主知悉性騷擾情事卻未採取立即有效補救措施，行政罰鍰上限為多少？',
        opts: ['50 萬元', '100 萬元', '150 萬元', '200 萬元'], a: 1 },
      { q: '若雇主無法證明已盡防治責任，除罰鍰外，還可能面臨什麼民事後果？',
        opts: ['公司執照被吊銷', '負責人一律入獄', '與行為人連帶負擔民事損害賠償', '無須承擔額外責任'], a: 2 },
      // ---- 21-25：是非題（綜合霸凌＋性騷擾影片內容）----
      { type: 'tf', q: '職場霸凌的認定必須要有持續發生的行為，單次事件絕對不構成霸凌。',
        opts: ['是', '否'], a: 1 },
      { type: 'tf', q: '100 人以上企業的霸凌調查小組，外部專業人士比例不得少於二分之一。',
        opts: ['是', '否'], a: 0 },
      { type: 'tf', q: '只要沒有收到正式申訴書，主管就不需要啟動任何調查程序。',
        opts: ['是', '否'], a: 1 },
      { type: 'tf', q: '性騷擾申訴調查期間，公司可以將申訴人調職並減薪，以降低雙方接觸機會。',
        opts: ['是', '否'], a: 1 },
      { type: 'tf', q: '雇主知悉性騷擾情事卻未採取立即有效補救措施，最高可處 100 萬元行政罰鍰。',
        opts: ['是', '否'], a: 0 },
      // ---- 26-30：多選題（可多選，綜合霸凌＋性騷擾影片內容）----
      { type: 'multi', q: '下列哪些屬於「職場霸凌五大構成要件」的內容？（可多選）',
        opts: ['發生於勞動場所', '利用職務權勢關係', '逾越業務合理範圍', '造成受害者身心健康損害', '一定要有肢體衝突才算'], a: [0,1,2,3] },
      { type: 'multi', q: '依新法規定，企業在處理職場霸凌或性騷擾申訴案件時，下列哪些做法是正確的？（可多選）',
        opts: ['只要「知悉」即須啟動處置程序', '調查過程應保密，避免二次傷害', '為求盡快結案，可強制雙方和解', '每一次警告與評估事由都要完整記錄', '為防止誤報，可先對申訴人進行不利處分'], a: [0,1,3] },
      { type: 'multi', q: '關於霸凌／性騷擾案件申訴人的保護措施，下列哪些正確？（可多選）',
        opts: ['調查期間可暫停被申訴人職權', '可提供或轉介心理諮商資源給申訴人', '可強制申訴人先請假且不支薪', '若查無實據，須補發停職期間薪資', '可將申訴人調往外縣市分公司，不論其意願'], a: [0,1,3] },
      { type: 'multi', q: '下列哪些是雇主未盡防治義務時，可能面臨的法律後果？（可多選）',
        opts: ['行政罰鍰', '與行為人連帶負擔民事損害賠償', '企業名稱與負責人姓名被強制公布', '自動獲得減刑或減輕處分優惠', '訴訟時舉證責任轉換由雇主負擔'], a: [0,1,2,4] },
      { type: 'multi', q: '關於霸凌／性騷擾案件的申訴時效與程序時限，下列哪些正確？（可多選）',
        opts: ['霸凌申訴時效為行為終了起 3 年內', '性騷擾不經預告解僱權須於知悉之日起 30 日內行使', '調查程序原則上應於 2 個月內結案', '只要超過任何時效，當事人即完全喪失法律保護', '在職期間發生的霸凌，離職後 1 年內仍可申訴'], a: [0,1,2,4] }
    ],
    new_employee: [
      // ---- 1-20：AI使用管理辦法／職業安全衛生／資訊安全通識／個資管理與實務 ----
      { q: '小強直接將完整客戶資料輸入 AI 工具生成報告，最大的風險是：',
        opts: ['電腦變慢', '資料可能外洩與違反個資規範', 'AI 速度太快', '格式不美觀'], a: 1 },
      { q: 'AI 使用時，下列哪項最符合公司規範？',
        opts: ['使用任何免費 AI 工具', '將內部機密完整上傳', '使用公司核可且合規的平台', 'AI 生成內容不需查證'], a: 2 },
      { q: '下列哪種資料最不應輸入公開 AI 系統？',
        opts: ['公開新聞內容', '客戶姓名與電話', '已公開產品資訊', '公司公告內容'], a: 1 },
      { q: '關於 AI 使用原則，下列何者正確？',
        opts: ['AI 可完全取代人工判斷', 'AI 結果不需驗證', '最終責任仍在使用者', 'AI 內容一定正確'], a: 2 },
      { q: '發現辦公室地面濕滑時，員工最適當的做法是：',
        opts: ['當沒看到', '繞過去即可', '立即通報並提醒他人', '拍照上網抱怨'], a: 2 },
      { q: '小強站在椅子上拿高處文件，這主要涉及哪種職安風險？',
        opts: ['網路風險', '跌倒風險', '食安問題', '著作權問題'], a: 1 },
      { q: '依職業安全衛生概念，下列何者屬於「慢性職業傷害」？',
        opts: ['瞬間割傷', '電線爆炸', '長期姿勢不良造成肌肉骨骼問題', '茶水燙傷'], a: 2 },
      { q: '收到不明 Email 要求更新帳密時，正確做法為：',
        opts: ['立即點擊', '先登入看看', '依資安 SOP 通報', '轉傳同事詢問'], a: 2 },
      { q: '下列何者屬於資安異常事件？',
        opts: ['正常登入系統', '發現異常大量登入通知', '修改桌布', '使用滑鼠'], a: 1 },
      { q: '公司規範禁止使用中國來源 AI 模型，主要原因是：',
        opts: ['使用介面不好看', '法遵、資安與資料跨境風險', '電腦會變慢', 'AI 回答太長'], a: 1 },
      { q: '依職場法遵觀念，「知悉即啟動」是指：',
        opts: ['只有正式申訴才算', '知道風險後應立即採取行動', '先觀察幾週再說', '必須等主管同意'], a: 1 },
      { q: 'AI 生成的內容若引用錯誤數據，責任通常由誰承擔？',
        opts: ['AI 公司', '無人負責', '使用者與企業', '網路平台'], a: 2 },
      { q: '職安中的「看、避、報」原則，「報」是指：',
        opts: ['向朋友聊天', '發社群限動', '發現異常立即通報', '等主管發現'], a: 2 },
      { q: '下列哪個行為最符合「安全與合規文化」？',
        opts: ['發現問題先隱瞞', '擔心麻煩所以不通報', '主動辨識風險並依 SOP 處理', '私下散播未確認消息'], a: 2 },
      { q: '下列何者屬於「特種個資」，須受《個資法》最高等級保護？',
        opts: ['姓名與公司職稱', '健康檢查報告', '公司電話總機號碼', '產品型號'], a: 1 },
      { q: '員工將客戶辦信用卡的聯絡電話，私下拿去詢問對方是否要購買保險，這屬於下列何種違規？',
        opts: ['蒐集不合法', '逾越特定目的之利用', '銷毀不徹底', '傳輸未加密'], a: 1 },
      { q: '根據 2026 年新法紅線，下列敘述何者正確？',
        opts: ['霸凌行為必須「持續發生」才能成立', '只要造成身心危害，單次嚴重的人格侮辱即可成立霸凌', '主管只要沒有動手就不算霸凌', '只有書面申訴才算正式霸凌案件'], a: 1 },
      { q: '若行為人利用「職務指揮、監督權力」對下屬進行性騷擾，法律上稱為：',
        opts: ['一般性騷擾', '權勢性騷擾', '職場霸凌', '私人糾紛'], a: 1 },
      { q: '調查性騷擾申訴期間，下列哪一項做法屬於違法的報復行為？',
        opts: ['暫時停止行為人的職務', '調整行為人的辦公位置', '將申訴人（受害人）調職並減薪', '調整行為人的業務內容'], a: 2 },
      { q: '若企業平時未落實出勤紀錄與防治紀錄，訴訟時拿不出管理紀錄，最可能面臨的後果是：',
        opts: ['法院會自動判企業勝訴', '法院得直接認定勞工主張為真實，企業等同自動敗訴', '沒有任何影響', '只需口頭說明即可'], a: 1 },
      // ---- 21-25：是非題（綜合四個單元）----
      { type: 'tf', q: '個資外洩若造成民事損害賠償，最高可達 2 億元。',
        opts: ['是', '否'], a: 0 },
      { type: 'tf', q: '只要密碼設定超過 4 位數字，就符合資安要求的強密碼標準。',
        opts: ['是', '否'], a: 1 },
      { type: 'tf', q: '使用 AI 工具前，應先將客戶個資去識別化再輸入。',
        opts: ['是', '否'], a: 0 },
      { type: 'tf', q: '只要沒有正式書面申訴，公司就不需要處理任何疑似異常事件。',
        opts: ['是', '否'], a: 1 },
      { type: 'tf', q: '職業安全衛生只關注立即性意外傷害，不包含長期姿勢不良造成的健康問題。',
        opts: ['是', '否'], a: 1 },
      // ---- 26-30：多選題（可多選，綜合四個單元）----
      { type: 'multi', q: '下列哪些屬於「個資管理與實務」課程中提到的個資生命週期階段？（可多選）',
        opts: ['蒐集', '處理', '利用', '銷毀', '販售'], a: [0,1,2,3] },
      { type: 'multi', q: '依課程內容，下列哪些是正確的 AI 使用注意事項？（可多選）',
        opts: ['上傳前先將個資去識別化', 'AI 結果需經人工查證', '使用公司核准的合規工具', '只要沒有營利就可以使用任何受著作權保護的內容', '對外使用需標註 AI 協助情形'], a: [0,1,2,4] },
      { type: 'multi', q: '下列哪些屬於職場常見的資安威脅或社交工程手法？（可多選）',
        opts: ['釣魚郵件', '弱密碼', '不明隨身碟', '假冒同事傳訊息', '定期更新系統軟體'], a: [0,1,2,3] },
      { type: 'multi', q: '關於職業安全衛生的「看、避、報」原則，下列哪些正確？（可多選）',
        opts: ['看到危害要先確認情況', '避免從事危險行為，選擇安全方式', '發現異常要立即通報', '只要沒有真的受傷就不用通報', '通報是為了避免危害擴大'], a: [0,1,2,4] },
      { type: 'multi', q: '依個資法及相關規範，下列哪些做法符合合規要求？（可多選）',
        opts: ['蒐集個資須告知用途與保存期限', '離開座位應將個資文件收好（桌面清空）', '檔案傳輸時密碼與檔案應透過不同管道告知', '個資文件可作背面紙重複使用', '銷毀文件須確保切成顆粒狀碎斷'], a: [0,1,2,4] }
    ]
  };

  function renderQuiz(courseId) {
    const qs = QUIZ_BANK[courseId] || [];
    return qs.map((q, qi) => `
      <div class="quiz-question">
        <div class="q-text">Q${qi+1}. ${q.q}</div>
        <div class="quiz-options">
          ${q.opts.map((o, oi) => `
            <label class="quiz-option">
              <input type="radio" name="q${qi}" value="${oi}" style="margin-right:8px;" />
              <span>${o}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `).join('');
  }

  function gradeQuiz(courseId) {
    const qs = QUIZ_BANK[courseId] || [];
    let correct = 0;
    qs.forEach((q, qi) => {
      const picked = document.querySelector(`input[name="q${qi}"]:checked`);
      if (picked && parseInt(picked.value) === q.a) correct++;
    });
    return qs.length ? Math.round(correct * 100 / qs.length) : 0;
  }

  // ===== 總測驗：渲染與計分（支援單選／是非／多選）=====
  function renderFinalQuiz(role) {
    const qs = FINAL_QUIZ_BANK[role] || [];
    const groups = [
      { key: 'tf',     label: '⭕ 是非題', items: [] },
      { key: 'single', label: '📝 選擇題', items: [] },
      { key: 'multi',  label: '☑️ 多選題', items: [] }
    ];
    qs.forEach((q, qi) => {
      const g = groups.find(g => g.key === (q.type || 'single'));
      g.items.push({ q, qi });
    });

    return groups.filter(g => g.items.length).map(g => `
      <div class="quiz-group">
        <h4 class="quiz-group-title">${g.label}（共 ${g.items.length} 題）</h4>
        ${g.items.map(({ q, qi }, localIdx) => {
          const isMulti = q.type === 'multi';
          return `
          <div class="quiz-question">
            <div class="q-text">Q${localIdx + 1}. ${q.q}${isMulti ? ' <span style="color:var(--brand); font-size:12px;">（多選）</span>' : ''}</div>
            <div class="quiz-options">
              ${q.opts.map((o, oi) => `
                <label class="quiz-option">
                  <input type="${isMulti ? 'checkbox' : 'radio'}" name="fq${qi}" value="${oi}" style="margin-right:8px;" />
                  <span>${o}</span>
                </label>
              `).join('')}
            </div>
          </div>
        `;
        }).join('')}
      </div>
    `).join('');
  }

  // 總測驗每一題對或錯（數據分析用）
  function finalItemResults(role) {
    const qs = FINAL_QUIZ_BANK[role] || [];
    return qs.map((q, qi) => {
      let ok;
      if (q.type === 'multi') {
        const picked = Array.from(document.querySelectorAll(`input[name="fq${qi}"]:checked`)).map(el => parseInt(el.value)).sort();
        const answer = [...q.a].sort();
        ok = picked.length === answer.length && picked.every((v, idx) => v === answer[idx]);
      } else {
        const picked = document.querySelector(`input[name="fq${qi}"]:checked`);
        ok = !!picked && parseInt(picked.value) === q.a;
      }
      return { q: q.q, ok };
    });
  }

  function gradeFinalQuiz(role) {
    const qs = FINAL_QUIZ_BANK[role] || [];
    let correct = 0;
    qs.forEach((q, qi) => {
      if (q.type === 'multi') {
        const picked = Array.from(document.querySelectorAll(`input[name="fq${qi}"]:checked`)).map(el => parseInt(el.value)).sort();
        const answer = [...q.a].sort();
        const match = picked.length === answer.length && picked.every((v, idx) => v === answer[idx]);
        if (match) correct++;
      } else {
        const picked = document.querySelector(`input[name="fq${qi}"]:checked`);
        if (picked && parseInt(picked.value) === q.a) correct++;
      }
    });
    return qs.length ? Math.round(correct * 100 / qs.length) : 0;
  }

  // 檢查該角色所有單元課程是否都已完成
  function getFinalExamLockStatus(empId, role) {
    const courses = Data.COURSES[role] || [];
    const incomplete = courses.filter(c => !Data.getProgress(empId, c.id).completed);
    return { locked: incomplete.length > 0, incomplete };
  }


  function formatTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  }

  function downloadDemo(name) {
    toast(`(示範) 開始下載 ${name}`, 'success');
  }

  // ===== 啟動 =====
  function start() {
    bindLogin();
    bindNav();
    bindLanding();
    window.addEventListener('beforeunload', flushStudyTimer);
    if (Data.isUsingFallback && Data.isUsingFallback()) {
      const warn = document.createElement('div');
      warn.style.cssText = 'position:relative; background:#c0392b; color:#fff; text-align:center; padding:10px 40px; font-size:13px; z-index:5000;';
      warn.innerHTML = '⚠️ 目前瀏覽器封鎖了本機儲存功能（常見於 App 內建瀏覽器，如 LINE），示範帳號仍可正常登入使用，但學習進度不會被保存。建議改用 Safari 或 Chrome 開啟本網站。' +
        '<button type="button" style="position:absolute; right:12px; top:6px; background:none; border:none; color:#fff; font-size:16px; cursor:pointer;">✕</button>';
      document.body.insertBefore(warn, document.body.firstChild);
      warn.querySelector('button').addEventListener('click', () => warn.remove());
    }
    const u = Data.getCurrentUser();
    if (u) enterApp();
  }

  return { start, go: renderRoute, downloadDemo, logout };
})();

document.addEventListener('DOMContentLoaded', App.start);
