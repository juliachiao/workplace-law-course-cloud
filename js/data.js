/* ========================================================
   data.js — 共用資料層 (localStorage)
   - employees:      員工帳號清單
   - currentUser:    當前登入員工
   - currentAdmin:   當前登入管理員
   - learningLogs:   學習行為紀錄
   - progress:       每位員工每門課程的學習進度
   ======================================================== */

const Data = (function () {
  const KEYS = {
    EMPLOYEES: 'tp_employees',
    CURRENT_USER: 'tp_current_user',
    CURRENT_ADMIN: 'tp_current_admin',
    LOGS: 'tp_learning_logs',
    PROGRESS: 'tp_progress',
    ADMINS: 'tp_admins',
    VIDEO_CONFIG: 'tp_video_config',
    CONFIG_VERSION: 'tp_config_version',
    DEADLINE: 'tp_deadline',
    ANNOUNCEMENTS: 'tp_announcements',
    NOTICES_READ: 'tp_notices_read',
    WRONG_ANSWERS: 'tp_wrong_answers',
    BOOKMARKS: 'tp_bookmarks',
    QUIZ_ATTEMPTS: 'tp_quiz_attempts',  // 每一次測驗的作答明細（數據分析用）
    SURVEYS: 'tp_surveys'               // 滿意度問卷
  };

  // 內建課程資料 (對應 PDF 內容)
  const COURSES = {
    new_employee: [
      { id: 'pdpa',       title: '個資管理與實務',   icon: '📇', desc: '了解個人資料保護法規範與實務應用' },
      { id: 'osh',        title: '職業安全衛生',     icon: '🛡️', desc: '職場安全與衛生基本知識' },
      { id: 'ai_policy',  title: 'AI 使用管理辦法',  icon: '🤖', desc: '人工智慧使用規範與倫理' },
      { id: 'infosec',    title: '資訊安全通識',     icon: '🔐', desc: '資安基本概念與威脅防範' }
    ],
    manager: [
      { id: 'bullying',   title: '職場霸凌預防舉措', icon: '🚫', desc: '預防職場不法侵害管理者責任' },
      { id: 'harassment', title: '職場性騷擾防治',   icon: '⚠️', desc: '主管在性騷擾防治的法定責任' }
    ]
  };

  // 取/存（若瀏覽器封鎖 localStorage，自動退回記憶體暫存模式，避免整站直接掛掉）
  let memoryFallback = null;
  let usingFallback = false;

  function checkStorageAvailable() {
    try {
      const testKey = '__tp_storage_test__';
      localStorage.setItem(testKey, '1');
      localStorage.removeItem(testKey);
      return true;
    } catch (e) {
      return false;
    }
  }

  if (!checkStorageAvailable()) {
    usingFallback = true;
    memoryFallback = {};
    console.warn('[systex] localStorage 無法使用，已切換為暫存模式（資料不會保存，重新整理將重置）。');
  }

  function get(key, def) {
    if (usingFallback) {
      return key in memoryFallback ? memoryFallback[key] : def;
    }
    let v;
    try { v = localStorage.getItem(key); } catch (e) { return def; }
    if (!v) return def;
    try { return JSON.parse(v); } catch { return def; }
  }
  function set(key, val) {
    if (usingFallback) { memoryFallback[key] = val; return; }
    try { localStorage.setItem(key, JSON.stringify(val)); }
    catch (e) { usingFallback = true; memoryFallback = memoryFallback || {}; memoryFallback[key] = val; }
  }
  function isUsingFallback() { return usingFallback; }

  // ===== 初始化預設管理員與示範員工 =====
  function init() {
    const admins = get(KEYS.ADMINS, null);
    if (!admins) {
      set(KEYS.ADMINS, [
        { username: 'admin', password: 'admin123', name: '系統管理員' }
      ]);
    }
    const emps = get(KEYS.EMPLOYEES, null);
    if (!emps) {
      set(KEYS.EMPLOYEES, [
        { empId: 'E001', name: '王小明', email: 'ming@systex.com', dept: '研發部', role: 'new_employee', password: 'E001', active: true, createdAt: new Date().toISOString() },
        { empId: 'E002', name: '陳大華', email: 'hua@systex.com', dept: '業務部', role: 'manager',      password: 'E002', active: true, createdAt: new Date().toISOString() },
        { empId: 'E003', name: '林美玲', email: 'ling@systex.com', dept: '人資部', role: 'new_employee', password: 'E003', active: true, createdAt: new Date().toISOString() }
      ]);
    }
    if (!get(KEYS.LOGS, null)) set(KEYS.LOGS, []);
    if (!get(KEYS.PROGRESS, null)) set(KEYS.PROGRESS, {});
    // ===== 內容版本控管 =====
    // 每次想強制讓所有訪客（不管新舊瀏覽器）都套用最新的影片設定,
    // 只要把下面這個數字加 1,存檔重新上傳,大家打開網站就會自動套用最新版本。
    const CURRENT_CONFIG_VERSION = 6;

    // 這裡列出「目前最新、正確」的影片設定,以後新增/更換課程影片,直接改這裡
    const LATEST_VIDEO_CONFIG = {
      infosec:   { url: 'https://youtu.be/6alE9ARHadI', title: '資訊安全通識教材' },
      pdpa:      { url: 'https://youtu.be/tM3N_2ZEMZo', title: '個資管理與實務教材' },
      bullying:  { url: 'https://youtu.be/s2jhJCXkCTk', title: '職場霸凌預防舉措教材' },
      osh:       { url: 'https://youtu.be/MjhhoNG-nBk', title: '職業安全衛生教材' },
      ai_policy: { url: 'https://youtu.be/DJkC9ct782Q', title: 'AI人工智慧使用方法教材' }
    };

    const storedVersion = get(KEYS.CONFIG_VERSION, 0);
    if (storedVersion < CURRENT_CONFIG_VERSION) {
      // 版本落後,合併最新設定(保留其他未列出的課程設定,只強制更新這裡列出的項目)
      set(KEYS.VIDEO_CONFIG, { ...get(KEYS.VIDEO_CONFIG, {}), ...LATEST_VIDEO_CONFIG });
      set(KEYS.CONFIG_VERSION, CURRENT_CONFIG_VERSION);
    } else if (!get(KEYS.VIDEO_CONFIG, null)) {
      set(KEYS.VIDEO_CONFIG, LATEST_VIDEO_CONFIG);
    }
  }

  // ===== 影片設定 =====
  function getVideoConfig(courseId) {
    const all = get(KEYS.VIDEO_CONFIG, {});
    return courseId ? (all[courseId] || {}) : all;
  }
  function setVideoConfig(courseId, cfg) {
    const all = get(KEYS.VIDEO_CONFIG, {});
    all[courseId] = { ...(all[courseId] || {}), ...cfg };
    set(KEYS.VIDEO_CONFIG, all);
  }
  function clearVideoConfig(courseId) {
    const all = get(KEYS.VIDEO_CONFIG, {});
    delete all[courseId];
    set(KEYS.VIDEO_CONFIG, all);
  }

  // ===== 影片觀看區段合併 (用於計算真實觀看時長與防快轉) =====
  function mergeSegments(segments) {
    if (!segments || !segments.length) return [];
    const sorted = segments.slice().sort((a,b) => a[0] - b[0]);
    const merged = [sorted[0].slice()];
    for (let i = 1; i < sorted.length; i++) {
      const last = merged[merged.length - 1];
      const cur = sorted[i];
      if (cur[0] <= last[1] + 1) {
        last[1] = Math.max(last[1], cur[1]);
      } else {
        merged.push(cur.slice());
      }
    }
    return merged;
  }
  function totalWatched(segments) {
    return mergeSegments(segments).reduce((s, seg) => s + (seg[1] - seg[0]), 0);
  }

  function recordVideoSegment(empId, courseId, start, end) {
    if (end <= start) return;
    const p = getProgress(empId, courseId);
    const segs = (p.videoSegments || []).concat([[Math.floor(start), Math.floor(end)]]);
    const merged = mergeSegments(segs);
    const watched = totalWatched(merged);
    setProgress(empId, courseId, {
      videoSegments: merged,
      videoWatchedSeconds: watched,
      videoLastPosition: Math.floor(end)
    });
  }

  function setVideoMeta(empId, courseId, meta) {
    setProgress(empId, courseId, meta);
  }

  // ===== 員工管理 =====
  function getEmployees() { return get(KEYS.EMPLOYEES, []); }
  function setEmployees(arr) { set(KEYS.EMPLOYEES, arr); }
  function getEmployee(empId) { return getEmployees().find(e => e.empId === empId); }

  function addEmployee(emp) {
    const list = getEmployees();
    if (list.find(e => e.empId === emp.empId)) {
      throw new Error('員工編號 ' + emp.empId + ' 已存在');
    }
    list.push({
      ...emp,
      active: emp.active !== false,
      password: emp.password || emp.empId,
      createdAt: new Date().toISOString()
    });
    setEmployees(list);
  }

  function updateEmployee(empId, patch) {
    const list = getEmployees();
    const i = list.findIndex(e => e.empId === empId);
    if (i < 0) throw new Error('找不到員工');
    list[i] = { ...list[i], ...patch };
    setEmployees(list);
  }

  function deleteEmployee(empId) {
    setEmployees(getEmployees().filter(e => e.empId !== empId));
    const prog = get(KEYS.PROGRESS, {});
    delete prog[empId];
    set(KEYS.PROGRESS, prog);
  }

  // ===== CSV 匯入/匯出 =====
  function parseCSV(text) {
    const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) throw new Error('CSV 內容不足');
    const headers = lines[0].split(',').map(h => h.trim());
    return lines.slice(1).map(line => {
      const cells = line.split(',').map(c => c.trim());
      const obj = {};
      headers.forEach((h, i) => obj[h] = cells[i] || '');
      return obj;
    });
  }

  function importEmployeesFromCSV(text) {
    const rows = parseCSV(text);
    let success = 0, failed = 0, errors = [];
    rows.forEach((row, idx) => {
      try {
        const emp = {
          empId: row.empId || row['員工編號'],
          name:  row.name  || row['姓名'],
          email: row.email || row['Email'] || row['電子郵件'],
          dept:  row.dept  || row['部門'],
          role:  (row.role || row['身份'] || '').includes('主管') || row.role === 'manager' ? 'manager' : 'new_employee',
          password: row.password || row['密碼']
        };
        if (!emp.empId || !emp.name) throw new Error('缺少必要欄位');
        addEmployee(emp);
        success++;
      } catch (e) {
        failed++;
        errors.push(`第 ${idx+2} 列: ${e.message}`);
      }
    });
    return { success, failed, errors };
  }

  function exportEmployeesToCSV() {
    const headers = ['empId','name','email','dept','role','active','createdAt'];
    const rows = getEmployees().map(e => headers.map(h => e[h]).join(','));
    return '﻿' + headers.join(',') + '\n' + rows.join('\n');
  }

  function exportLearningRecordsToCSV() {
    const headers = ['員工編號','姓名','部門','身份','課程','狀態','影片觀看率','觀看秒數','影片時長(秒)','最後位置(秒)','測驗分數','最後學習時間'];
    const employees = getEmployees();
    const progress = get(KEYS.PROGRESS, {});
    const lines = [headers.join(',')];

    employees.forEach(emp => {
      const courses = COURSES[emp.role] || [];
      courses.forEach(c => {
        const p = (progress[emp.empId] && progress[emp.empId][c.id]) || {};
        const ratio = (p.videoDuration && p.videoWatchedSeconds)
          ? Math.round(p.videoWatchedSeconds * 100 / p.videoDuration) : (p.videoWatched ? 100 : 0);
        lines.push([
          emp.empId,
          emp.name,
          emp.dept,
          emp.role === 'manager' ? '主管' : '新進人員',
          c.title,
          p.completed ? '已完成' : (p.videoWatched || p.quizScore != null ? '進行中' : '未開始'),
          ratio + '%',
          p.videoWatchedSeconds || 0,
          p.videoDuration || '-',
          p.videoLastPosition || 0,
          p.quizScore != null ? p.quizScore : '-',
          p.lastAt || '-'
        ].join(','));
      });
    });
    return '﻿' + lines.join('\n');
  }

  function downloadFile(filename, content) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ===== 登入相關 =====
  function loginEmployee(empId, password) {
    const emp = getEmployee(empId);
    if (!emp) throw new Error('員工編號不存在');
    if (!emp.active) throw new Error('帳號已停用');
    if (emp.password !== password) throw new Error('密碼錯誤');
    set(KEYS.CURRENT_USER, emp);
    addLog(empId, 'login', '員工登入');
    return emp;
  }

  function loginAdmin(username, password) {
    const admins = get(KEYS.ADMINS, []);
    const a = admins.find(x => x.username === username && x.password === password);
    if (!a) throw new Error('帳號或密碼錯誤');
    set(KEYS.CURRENT_ADMIN, a);
    return a;
  }

  function logoutUser() {
    const u = getCurrentUser();
    localStorage.removeItem(KEYS.CURRENT_USER);
    if (u) try { addLog(u.empId, 'logout', '員工登出'); } catch(e) {}
  }
  function logoutAdmin() { localStorage.removeItem(KEYS.CURRENT_ADMIN); }
  function getCurrentUser() { return get(KEYS.CURRENT_USER, null); }
  function getCurrentAdmin() { return get(KEYS.CURRENT_ADMIN, null); }

  // ===== 學習紀錄與進度 =====
  function addLog(empId, type, detail) {
    const logs = get(KEYS.LOGS, []);
    logs.push({ empId, type, detail, at: new Date().toISOString() });
    if (logs.length > 5000) logs.shift();
    set(KEYS.LOGS, logs);
  }

  function getLogs(empId) {
    const logs = get(KEYS.LOGS, []);
    return empId ? logs.filter(l => l.empId === empId) : logs;
  }

  function getProgress(empId, courseId) {
    const all = get(KEYS.PROGRESS, {});
    return (all[empId] && all[empId][courseId]) || {};
  }

  function setProgress(empId, courseId, patch) {
    const all = get(KEYS.PROGRESS, {});
    if (!all[empId]) all[empId] = {};
    if (!all[empId][courseId]) all[empId][courseId] = {};
    all[empId][courseId] = { ...all[empId][courseId], ...patch, lastAt: new Date().toISOString() };
    set(KEYS.PROGRESS, all);
  }

  function getEmployeeOverallProgress(empId) {
    const emp = getEmployee(empId);
    if (!emp) return { percent: 0, completed: 0, total: 0 };
    const courses = COURSES[emp.role] || [];
    let completed = 0;
    courses.forEach(c => {
      const p = getProgress(empId, c.id);
      if (p.completed) completed++;
    });
    return {
      percent: courses.length ? Math.round(completed * 100 / courses.length) : 0,
      completed,
      total: courses.length
    };
  }

  // ===== 統計 =====
  function getStats() {
    const emps = getEmployees();
    let totalCourses = 0, completedCourses = 0, activeEmps = 0;
    emps.forEach(e => {
      if (!e.active) return;
      activeEmps++;
      const p = getEmployeeOverallProgress(e.empId);
      totalCourses += p.total;
      completedCourses += p.completed;
    });
    return {
      totalEmployees: emps.length,
      activeEmployees: activeEmps,
      totalCourses,
      completedCourses,
      completionRate: totalCourses ? Math.round(completedCourses * 100 / totalCourses) : 0
    };
  }

  // ===== 完課截止日 =====
  function getDeadline() { return get(KEYS.DEADLINE, null); }
  function setDeadline(dateStr) { set(KEYS.DEADLINE, dateStr); }
  function clearDeadline() { localStorage.removeItem(KEYS.DEADLINE); }

  // ===== 管理員公告 =====
  function getAnnouncements() {
    return get(KEYS.ANNOUNCEMENTS, []);
  }
  function addAnnouncement(obj) {
    const list = getAnnouncements();
    const ann = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2,5),
      title: obj.title,
      content: obj.content,
      type: obj.type || 'info',
      expiry: obj.expiry || null,
      createdAt: new Date().toISOString()
    };
    list.unshift(ann);
    set(KEYS.ANNOUNCEMENTS, list);
    return ann;
  }
  function deleteAnnouncement(id) {
    set(KEYS.ANNOUNCEMENTS, getAnnouncements().filter(a => a.id !== id));
    const read = get(KEYS.NOTICES_READ, {});
    Object.keys(read).forEach(empId => {
      if (Array.isArray(read[empId])) read[empId] = read[empId].filter(x => x !== id);
    });
    set(KEYS.NOTICES_READ, read);
  }
  function getUnreadAnnouncements(empId) {
    const now = new Date();
    const read = get(KEYS.NOTICES_READ, {});
    const readIds = read[empId] || [];
    return getAnnouncements().filter(a => {
      if (readIds.includes(a.id)) return false;
      if (a.expiry && new Date(a.expiry) < now) return false;
      return true;
    });
  }
  function markAnnouncementsRead(empId, ids) {
    const read = get(KEYS.NOTICES_READ, {});
    const existing = read[empId] || [];
    read[empId] = [...new Set([...existing, ...ids])];
    set(KEYS.NOTICES_READ, read);
  }

  // 重置示範資料 (僅供 demo)
  // =====================================================================
  // ===== 滿意度問卷（總測驗完成後填寫）=====
  // 題目都集中在這裡，要改題目只需修改這個物件；題目 id 不要重複
  // =====================================================================
  const SURVEY = {
    likert: ['非常不同意', '不同意', '普通', '同意', '非常同意'],
    sections: [
      { id: 'A', title: '一、教材內容', items: [
        { id: 'A1', t: '課程內容清楚、容易理解' },
        { id: 'A2', t: '課程內容與職場工作相關、實用' },
        { id: 'A3', t: '課程的份量與學習時間安排適當' } ] },
      { id: 'B', title: '二、影片教學', items: [
        { id: 'B1', t: '影片長度適中，不會太長或太短' },
        { id: 'B2', t: '情境劇的呈現方式有助於我理解內容' } ] },
      { id: 'C', title: '三、測驗與複習', items: [
        { id: 'C1', t: '單元測驗能幫助我檢核學習成果' },
        { id: 'C2', t: '錯題本與題目解析有助於我複習' },
        { id: 'C3', t: '重點整理方便我快速複習課程重點' } ] },
      { id: 'D', title: '四、3D 闖關遊戲', game: true, items: [
        { id: 'D1', t: '3D 闖關遊戲有趣，能吸引我投入學習' },
        { id: 'D2', t: '遊戲裡的情境與小遊戲，能加深我對課程內容的印象' },
        { id: 'D3', t: '遊戲的操作方式與引導提示清楚' } ] },
      { id: 'E', title: '五、整體滿意度', items: [
        { id: 'E1', t: '整體而言，我對這門課程感到滿意' },
        { id: 'E2', t: '我願意推薦這門課程給同事或同學' } ] },
    ],
    // 系統易用性量表（System Usability Scale, SUS）：奇數題為正向題、偶數題為反向題
    sus: [
      '我想我會願意經常使用這個學習平台',
      '我覺得這個學習平台過於複雜',
      '我覺得這個學習平台很容易使用',
      '我想我需要有技術人員的協助，才能使用這個學習平台',
      '我覺得這個學習平台的各項功能整合得很好',
      '我覺得這個學習平台有太多不一致的地方',
      '我想大部分的人都能很快學會使用這個學習平台',
      '我覺得這個學習平台使用起來很不方便',
      '使用這個學習平台時，我覺得很有信心',
      '我需要先學會很多事情，才能開始使用這個學習平台',
    ],
    self: {
      new_employee: [
        { id: 'S1', t: '我了解一般個資與特種個資的差異，並知道如何妥善處理個資' },
        { id: 'S2', t: '我能辨識辦公室常見的職安風險，並知道「看、避、報」的做法' },
        { id: 'S3', t: '我知道使用 AI 工具前要去識別化，並查證 AI 產出的內容' },
        { id: 'S4', t: '我能辨識釣魚郵件的特徵，並知道遇到資安事件該如何處理' } ],
      manager: [
        { id: 'S1', t: '我能判斷職場霸凌的情形，並了解主管的處理原則' },
        { id: 'S2', t: '我知道主管「知悉」性騷擾後應立即採取的處理流程' },
        { id: 'S3', t: '我了解處理申訴時應保密，並避免對申訴人做出不利的處置' },
        { id: 'S4', t: '我有信心在實際工作中，處理類似的職場事件' } ],
    },
    open: [
      { id: 'O1', t: '這門課程中，您覺得最有幫助的部分是什麼？' },
      { id: 'O2', t: '您覺得哪些地方需要改進？' },
      { id: 'O3', t: '其他建議或想法' },
    ],
  };
  // SUS 計分：奇數題（分數 − 1）、偶數題（5 − 分數），加總 × 2.5，滿分 100
  function calcSUS(arr) {
    if (!arr || arr.length !== 10 || arr.some(v => !v)) return null;
    return arr.reduce((s, v, i) => s + (i % 2 === 0 ? v - 1 : 5 - v), 0) * 2.5;
  }

  function saveSurvey(empId, data) { const all = get(KEYS.SURVEYS, {}); all[empId] = data; set(KEYS.SURVEYS, all); }
  function getSurvey(empId) { return get(KEYS.SURVEYS, {})[empId] || null; }
  function getAllSurveys() { return get(KEYS.SURVEYS, {}); }

  // ===== 測驗作答明細（每次作答都保留，用於題目分析、前後次比較）=====
  function addQuizAttempt(empId, quizId, score, items) {
    const all = get(KEYS.QUIZ_ATTEMPTS, []);
    all.push({
      id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7),
      empId, quizId, score, items, at: new Date().toISOString()
    });
    if (all.length > 5000) all.shift();
    set(KEYS.QUIZ_ATTEMPTS, all);
  }
  function getQuizAttempts(empId) {
    const all = get(KEYS.QUIZ_ATTEMPTS, []);
    return empId ? all.filter(a => a.empId === empId) : all;
  }

  // ===== 完整備份（JSON）：匯出、匯入合併 =====
  // 用途：在不同電腦收集的資料，可以各自匯出後，再匯入到同一台電腦合併分析
  const BACKUP_KEYS = ['EMPLOYEES', 'LOGS', 'PROGRESS', 'WRONG_ANSWERS', 'BOOKMARKS', 'QUIZ_ATTEMPTS', 'SURVEYS'];
  function exportBackup() {
    const data = {};
    BACKUP_KEYS.forEach(k => { data[k] = get(KEYS[k], null); });
    return JSON.stringify({ app: 'workplace-law-course', version: 1, exportedAt: new Date().toISOString(), data }, null, 1);
  }
  function importBackupMerge(text) {
    const obj = JSON.parse(text);
    if (!obj || obj.app !== 'workplace-law-course' || !obj.data) throw new Error('不是本系統匯出的備份檔');
    const d = obj.data, summary = { employees: 0, logs: 0, attempts: 0 };
    // 員工：以員工編號合併
    if (Array.isArray(d.EMPLOYEES)) {
      const emps = getEmployees();
      d.EMPLOYEES.forEach(e => { if (e && e.empId && !emps.some(x => x.empId === e.empId)) { emps.push(e); summary.employees++; } });
      setEmployees(emps);
    }
    // 學習進度：同一人同一課程，保留較新的那筆
    if (d.PROGRESS) {
      const all = get(KEYS.PROGRESS, {});
      Object.entries(d.PROGRESS).forEach(([empId, courses]) => {
        all[empId] = all[empId] || {};
        Object.entries(courses || {}).forEach(([cid, p]) => {
          const cur = all[empId][cid];
          if (!cur || (p.lastAt || '') > (cur.lastAt || '')) all[empId][cid] = p;
        });
      });
      set(KEYS.PROGRESS, all);
    }
    // 操作紀錄、作答明細：去除重複後合併
    if (Array.isArray(d.LOGS)) {
      const logs = get(KEYS.LOGS, []), seen = new Set(logs.map(l => l.at + l.empId + l.type));
      d.LOGS.forEach(l => { const k = l.at + l.empId + l.type; if (!seen.has(k)) { seen.add(k); logs.push(l); summary.logs++; } });
      logs.sort((a, b) => (a.at || '').localeCompare(b.at || ''));
      set(KEYS.LOGS, logs);
    }
    if (Array.isArray(d.QUIZ_ATTEMPTS)) {
      const at = get(KEYS.QUIZ_ATTEMPTS, []), seen = new Set(at.map(a => a.id));
      d.QUIZ_ATTEMPTS.forEach(a => { if (!seen.has(a.id)) { seen.add(a.id); at.push(a); summary.attempts++; } });
      set(KEYS.QUIZ_ATTEMPTS, at);
    }
    ['WRONG_ANSWERS', 'BOOKMARKS', 'SURVEYS'].forEach(k => {
      if (d[k]) set(KEYS[k], { ...d[k], ...get(KEYS[k], {}) });
    });
    return summary;
  }

  // ===== 雲端登入用：設定目前使用者、整理／還原單一學員的所有資料 =====
  function setCurrentUser(emp) { set(KEYS.CURRENT_USER, emp); }
  function upsertEmployee(emp) {
    const list = getEmployees();
    const i = list.findIndex(e => e.empId === emp.empId);
    if (i >= 0) list[i] = { ...list[i], ...emp }; else list.push(emp);
    setEmployees(list);
    return list.find(e => e.empId === emp.empId);
  }
  // 把某位學員的所有學習資料打包（上傳雲端用）
  function exportUserBundle(empId) {
    return {
      progress: (get(KEYS.PROGRESS, {})[empId]) || {},
      logs: get(KEYS.LOGS, []).filter(l => l.empId === empId).slice(-800),
      attempts: get(KEYS.QUIZ_ATTEMPTS, []).filter(a => a.empId === empId),
      wrong: (get(KEYS.WRONG_ANSWERS, {})[empId]) || {},
      bookmarks: (get(KEYS.BOOKMARKS, {})[empId]) || {},
      survey: (get(KEYS.SURVEYS, {})[empId]) || null
    };
  }
  // 把雲端的資料合併回這台電腦（換裝置登入、後台載入雲端數據時使用）
  function importUserBundle(empId, b) {
    if (!b) return;
    const prog = get(KEYS.PROGRESS, {}); prog[empId] = prog[empId] || {};
    Object.entries(b.progress || {}).forEach(([cid, p]) => {
      const cur = prog[empId][cid];
      if (!cur || (p.lastAt || '') >= (cur.lastAt || '')) prog[empId][cid] = p;
    });
    set(KEYS.PROGRESS, prog);
    const logs = get(KEYS.LOGS, []), seenL = new Set(logs.map(l => l.at + l.empId + l.type));
    (b.logs || []).forEach(l => { const k = l.at + l.empId + l.type; if (!seenL.has(k)) { seenL.add(k); logs.push({ ...l, empId }); } });
    logs.sort((x, y) => (x.at || '').localeCompare(y.at || ''));
    set(KEYS.LOGS, logs);
    const at = get(KEYS.QUIZ_ATTEMPTS, []), seenA = new Set(at.map(a => a.id));
    (b.attempts || []).forEach(a => { if (!seenA.has(a.id)) { seenA.add(a.id); at.push({ ...a, empId }); } });
    set(KEYS.QUIZ_ATTEMPTS, at);
    const w = get(KEYS.WRONG_ANSWERS, {}); w[empId] = { ...(b.wrong || {}), ...(w[empId] || {}) }; set(KEYS.WRONG_ANSWERS, w);
    const bm = get(KEYS.BOOKMARKS, {}); bm[empId] = { ...(b.bookmarks || {}), ...(bm[empId] || {}) }; set(KEYS.BOOKMARKS, bm);
    if (b.survey) { const sv = get(KEYS.SURVEYS, {}); if (!sv[empId]) { sv[empId] = b.survey; set(KEYS.SURVEYS, sv); } }
  }

  function resetAll() {
    Object.values(KEYS).forEach(k => localStorage.removeItem(k));
    init();
  }

  return {
    COURSES,
    init,
    isUsingFallback,
    getEmployees, getEmployee, addEmployee, updateEmployee, deleteEmployee,
    importEmployeesFromCSV, exportEmployeesToCSV, exportLearningRecordsToCSV,
    downloadFile,
    loginEmployee, loginAdmin, logoutUser, logoutAdmin,
    getCurrentUser, getCurrentAdmin,
    addLog, getLogs,
    getProgress, setProgress, getEmployeeOverallProgress,
    getStats, resetAll,
    getVideoConfig, setVideoConfig, clearVideoConfig,
    recordVideoSegment, setVideoMeta, totalWatched, mergeSegments,
    getDeadline, setDeadline, clearDeadline,
    getAnnouncements, addAnnouncement, deleteAnnouncement,
    getUnreadAnnouncements, markAnnouncementsRead,
    saveWrongAnswers, getWrongAnswers,
    addBookmark, getBookmarks, deleteBookmark,
    addQuizAttempt, getQuizAttempts, exportBackup, importBackupMerge,
    setCurrentUser, upsertEmployee, exportUserBundle, importUserBundle,
    SURVEY, calcSUS, saveSurvey, getSurvey, getAllSurveys
  };

  // ===== 錯題本 =====
  function saveWrongAnswers(empId, courseId, items) {
    const all = get(KEYS.WRONG_ANSWERS, {});
    if (!all[empId]) all[empId] = {};
    all[empId][courseId] = items;
    set(KEYS.WRONG_ANSWERS, all);
  }
  function getWrongAnswers(empId, courseId) {
    const all = get(KEYS.WRONG_ANSWERS, {});
    if (!courseId) return (all[empId]) || {};
    return (all[empId] && all[empId][courseId]) || [];
  }

  // ===== 影片書籤 =====
  function addBookmark(empId, courseId, time, note) {
    const all = get(KEYS.BOOKMARKS, {});
    if (!all[empId]) all[empId] = {};
    if (!all[empId][courseId]) all[empId][courseId] = [];
    all[empId][courseId].push({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 4),
      time: Math.floor(time),
      note: note || '',
      createdAt: new Date().toISOString()
    });
    set(KEYS.BOOKMARKS, all);
  }
  function getBookmarks(empId, courseId) {
    const all = get(KEYS.BOOKMARKS, {});
    if (!courseId) return (all[empId]) || {};
    return (all[empId] && all[empId][courseId]) || [];
  }
  function deleteBookmark(empId, courseId, id) {
    const all = get(KEYS.BOOKMARKS, {});
    if (all[empId] && all[empId][courseId]) {
      all[empId][courseId] = all[empId][courseId].filter(b => b.id !== id);
      set(KEYS.BOOKMARKS, all);
    }
  }
})();

Data.init();
