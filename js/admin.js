/* ============================================================
   admin.js — 管理後台邏輯
   ============================================================ */

const Admin = (function () {

  function toast(msg, type = '') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show ' + type;
    setTimeout(() => el.classList.remove('show'), 2500);
  }

  // ===== 登入 =====
  function bindLogin() {
    document.getElementById('admin-login-form').addEventListener('submit', e => {
      e.preventDefault();
      const u = document.getElementById('admin-username').value.trim();
      const p = document.getElementById('admin-password').value;
      try {
        Data.loginAdmin(u, p);
        enterAdmin();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  function enterAdmin() {
    document.getElementById('admin-login-page').classList.add('hidden');
    document.getElementById('admin-page').classList.remove('hidden');
    bindMenu();
    showPage('dashboard');
  }

  function bindMenu() {
    document.querySelectorAll('.sidebar-menu a[data-page]').forEach(a => {
      a.addEventListener('click', () => {
        document.querySelectorAll('.sidebar-menu a').forEach(x => x.classList.remove('active'));
        a.classList.add('active');
        showPage(a.dataset.page);
      });
    });
    document.getElementById('admin-logout').addEventListener('click', () => {
      if (confirm('確定要登出後台?')) {
        Data.logoutAdmin();
        location.reload();
      }
    });
  }

  function showPage(p) {
    ({
      dashboard:     renderDashboard,
      analytics:     renderAnalytics,
      survey:        renderSurveyResults,
      employees:     renderEmployees,
      videos:        renderVideos,
      learning:      renderLearning,
      logs:          renderLogs,
      export:        renderExport,
      deadline:      renderDeadline,
      announcements: renderAnnouncements
    }[p] || renderDashboard)();
  }

  // ===== 公告欄管理 =====
  function renderAnnouncements() {
    const list = Data.getAnnouncements();
    const typeLabel = { info: '一般', warning: '注意', urgent: '緊急' };
    const typeColor = { info: '#5a6b8c', warning: '#e67e22', urgent: '#c0392b' };

    document.getElementById('admin-content').innerHTML = `
      <div class="admin-header">
        <h1>公告欄管理</h1>
      </div>

      <div class="stat-card" style="margin-bottom:24px;">
        <h3 style="margin-bottom:16px;">新增公告</h3>
        <div class="form-group">
          <label>公告標題 *</label>
          <input type="text" id="ann-title" placeholder="請輸入公告標題" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; font-size:14px; font-family:inherit;" />
        </div>
        <div class="form-group">
          <label>公告內容 *</label>
          <textarea id="ann-content" rows="4" placeholder="請輸入公告內容..." style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; font-size:14px; font-family:inherit; resize:vertical;"></textarea>
        </div>
        <div style="display:flex; gap:16px; flex-wrap:wrap;">
          <div class="form-group" style="flex:1; min-width:160px;">
            <label>公告類型</label>
            <select id="ann-type" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; font-size:14px;">
              <option value="info">📘 一般通知</option>
              <option value="warning">⚠️ 注意事項</option>
              <option value="urgent">🚨 緊急公告</option>
            </select>
          </div>
          <div class="form-group" style="flex:1; min-width:160px;">
            <label>到期日 (選填，到期後不顯示)</label>
            <input type="date" id="ann-expiry" style="width:100%; padding:10px; border:1px solid var(--border); border-radius:8px; font-size:14px;" />
          </div>
        </div>
        <button class="btn btn-primary" id="btn-add-ann" style="margin-top:8px;">發布公告</button>
      </div>

      <h3 style="margin-bottom:16px;">已發布公告 (${list.length} 則)</h3>
      <div id="ann-list">
        ${list.length === 0 ? '<div style="text-align:center; padding:40px; color:var(--text-light);">目前沒有公告</div>' :
          list.map(a => {
            const expired = a.expiry && new Date(a.expiry) < new Date();
            return `
            <div class="ann-item" data-id="${a.id}" style="background:#fff; border:1px solid var(--border); border-left:4px solid ${typeColor[a.type] || '#5a6b8c'}; border-radius:8px; padding:16px 20px; margin-bottom:12px; ${expired ? 'opacity:0.5;' : ''}">
              <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
                <div style="flex:1;">
                  <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                    <span style="background:${typeColor[a.type] || '#5a6b8c'}; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px;">${typeLabel[a.type] || a.type}</span>
                    ${expired ? '<span style="background:#999; color:#fff; font-size:11px; padding:2px 8px; border-radius:4px;">已到期</span>' : ''}
                    <strong style="font-size:15px;">${escapeHtml(a.title)}</strong>
                  </div>
                  <div style="color:var(--text-light); font-size:13px; white-space:pre-wrap;">${escapeHtml(a.content)}</div>
                  <div style="margin-top:8px; font-size:12px; color:#aaa;">
                    發布時間：${formatTime(a.createdAt)}
                    ${a.expiry ? `　到期日：${a.expiry}` : ''}
                  </div>
                </div>
                <button class="btn btn-danger btn-sm" onclick="Admin.deleteAnn('${a.id}')" style="flex-shrink:0; padding:6px 14px; font-size:13px;">刪除</button>
              </div>
            </div>`;
          }).join('')}
      </div>
    `;

    document.getElementById('btn-add-ann').onclick = () => {
      const title = document.getElementById('ann-title').value.trim();
      const content = document.getElementById('ann-content').value.trim();
      const type = document.getElementById('ann-type').value;
      const expiry = document.getElementById('ann-expiry').value;
      if (!title || !content) { toast('請填寫標題與內容', 'error'); return; }
      Data.addAnnouncement({ title, content, type, expiry: expiry || null });
      toast('公告已發布', 'success');
      renderAnnouncements();
    };
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ===== 截止日設定 =====
  function renderDeadline() {
    const current = Data.getDeadline();
    const today = new Date().toISOString().split('T')[0];
    let statusHTML = '';
    if (current) {
      const d = new Date(current);
      const daysLeft = Math.ceil((d - new Date()) / 86400000);
      const label = daysLeft < 0
        ? `<span style="color:#d04040;">已逾期 ${Math.abs(daysLeft)} 天</span>`
        : daysLeft === 0
          ? `<span style="color:#d04040;">今天截止</span>`
          : `<span style="color:#4a8a4a;">距今還有 ${daysLeft} 天</span>`;
      statusHTML = `<div style="margin-top:12px; font-size:14px;">目前截止日：<strong>${current}</strong>　${label}</div>`;
    } else {
      statusHTML = `<div style="margin-top:12px; font-size:14px; color:var(--text-light);">目前尚未設定截止日</div>`;
    }

    document.getElementById('admin-content').innerHTML = `
      <div class="admin-header"><h1>完課截止日設定</h1></div>
      <div class="stat-card" style="max-width:560px;">
        <h3 style="margin-bottom:20px; letter-spacing:2px;">⏰ 設定員工完課期限</h3>
        <p style="color:var(--text-light); font-size:14px; margin-bottom:20px; line-height:1.7;">
          設定後，員工登入時將看到「距離完課截止日 X 天」的提醒橫幅。<br>
          逾期 3 天內顯示橘色警告，當天或逾期顯示紅色緊急提示。
        </p>
        <div class="form-group">
          <label>完課截止日期</label>
          <input type="date" id="deadline-input" min="${today}"
            value="${current || ''}"
            style="padding:10px 14px; border:1px solid var(--border); border-radius:8px; font-size:15px; font-family:inherit; width:220px;" />
        </div>
        ${statusHTML}
        <div style="display:flex; gap:12px; margin-top:24px;">
          <button class="btn btn-primary" id="save-deadline-btn">儲存截止日</button>
          ${current ? `<button class="btn btn-secondary" id="clear-deadline-btn">清除設定</button>` : ''}
        </div>
      </div>
    `;

    document.getElementById('save-deadline-btn').addEventListener('click', () => {
      const val = document.getElementById('deadline-input').value;
      if (!val) { toast('請選擇日期', 'error'); return; }
      Data.setDeadline(val);
      toast('截止日已儲存', 'success');
      renderDeadline();
    });

    const clrBtn = document.getElementById('clear-deadline-btn');
    if (clrBtn) clrBtn.addEventListener('click', () => {
      Data.clearDeadline();
      toast('截止日已清除', 'success');
      renderDeadline();
    });
  }

  // ===== 課程影片設定 =====
  function renderVideos() {
    const all = [
      ...Data.COURSES.new_employee.map(c => ({...c, role:'new_employee'})),
      ...Data.COURSES.manager.map(c => ({...c, role:'manager'}))
    ];

    document.getElementById('admin-content').innerHTML = `
      <div class="admin-header">
        <h1>課程影片設定</h1>
      </div>

      <div class="stat-card" style="margin-bottom:24px; background:rgba(170,184,208,0.1);">
        <strong>📌 設定方式</strong>
        <ul style="margin:12px 0 0 24px; line-height:1.9; color:var(--text-light); font-size:14px;">
          <li>將影片檔案 (.mp4) 放入 <code style="background:#fff; padding:2px 8px; border-radius:4px;">platform/videos/</code> 資料夾,再填入路徑 (如 <code style="background:#fff; padding:2px 8px; border-radius:4px;">videos/pdpa.mp4</code>)</li>
          <li>也支援任何外部影片 URL (例如 CDN、YouTube 直連、雲端儲存)</li>
          <li>員工觀看時,系統會自動記錄觀看時長、跳轉行為、是否真的看完 (預設門檻 90%)</li>
        </ul>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>課程</th>
            <th>身份</th>
            <th>影片網址 / 路徑</th>
            <th>顯示名稱</th>
            <th>狀態</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          ${all.map(c => {
            const cfg = Data.getVideoConfig(c.id);
            return `
              <tr>
                <td><strong>${c.icon} ${c.title}</strong></td>
                <td><span class="tag ${c.role === 'manager' ? 'tag-pink' : 'tag-blue'}">${c.role === 'manager' ? '主管' : '新進'}</span></td>
                <td>
                  <input type="text" id="vurl-${c.id}" value="${cfg.url || ''}" placeholder="videos/${c.id}.mp4 或 https://..."
                         style="width:100%; padding:6px 10px; border:1px solid var(--border); border-radius:6px; background:rgba(255,255,255,0.8);" />
                </td>
                <td>
                  <input type="text" id="vtitle-${c.id}" value="${cfg.title || ''}" placeholder="(選填)"
                         style="width:160px; padding:6px 10px; border:1px solid var(--border); border-radius:6px; background:rgba(255,255,255,0.8);" />
                </td>
                <td>${cfg.url ? '<span class="tag tag-green">已設定</span>' : '<span class="tag tag-gray">未設定</span>'}</td>
                <td>
                  <button class="icon-btn" onclick="Admin.saveVideo('${c.id}')">儲存</button>
                  <button class="icon-btn danger" onclick="Admin.clearVideo('${c.id}')">清除</button>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  function saveVideo(courseId) {
    const url = document.getElementById('vurl-' + courseId).value.trim();
    const title = document.getElementById('vtitle-' + courseId).value.trim();
    if (!url) {
      toast('請輸入影片網址', 'error');
      return;
    }
    Data.setVideoConfig(courseId, { url, title });
    toast('影片設定已儲存', 'success');
    renderVideos();
  }

  function clearVideo(courseId) {
    if (!confirm('清除此課程的影片設定?')) return;
    Data.clearVideoConfig(courseId);
    toast('已清除', 'success');
    renderVideos();
  }

  // ===== 儀表板 =====
  function renderDashboard() {
    const stats = Data.getStats();
    const main = document.getElementById('admin-content');

    main.innerHTML = `
      <div class="admin-header">
        <h1>儀表板</h1>
        <div style="color:var(--text-light); font-size:14px;">${new Date().toLocaleString('zh-TW')}</div>
      </div>

      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-label">總員工數</div>
          <div class="stat-value">${stats.totalEmployees}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">啟用中</div>
          <div class="stat-value green">${stats.activeEmployees}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">完成課程數</div>
          <div class="stat-value orange">${stats.completedCourses} / ${stats.totalCourses}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">整體完成率</div>
          <div class="stat-value">${stats.completionRate}%</div>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: 240px 1fr; gap:20px; margin-bottom:20px;">
        <div class="stat-card" style="display:flex; flex-direction:column; align-items:center; justify-content:center;">
          <h3 style="margin-bottom:16px; letter-spacing:2px; align-self:flex-start;">🎯 整體完成率</h3>
          ${renderCompletionDonut(stats.completionRate)}
        </div>
        <div class="stat-card">
          <h3 style="margin-bottom:16px; letter-spacing:2px;">📊 各課程完成率比較</h3>
          ${renderCourseBarChart()}
        </div>
      </div>

      <div class="stat-card" style="margin-bottom:20px;">
        <h3 style="margin-bottom:16px; letter-spacing:2px;">📋 各課程完成情形明細</h3>
        ${renderCourseStats()}
      </div>

      <div class="stat-card">
        <h3 style="margin-bottom:16px; letter-spacing:2px;">🕒 最近登入紀錄</h3>
        ${renderRecentLogs()}
      </div>
    `;
  }

  // ===== 整體完成率甜甜圈圖 =====
  function renderCompletionDonut(pct) {
    const r = 62, cx = 80, cy = 80;
    const circumference = 2 * Math.PI * r;
    const offset = circumference * (1 - pct / 100);
    const color = pct >= 80 ? '#2e8b57' : pct >= 50 ? '#d4941e' : '#c0392b';
    return `
      <svg width="160" height="160" viewBox="0 0 160 160">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#eef1f6" stroke-width="16"/>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="16"
          stroke-dasharray="${circumference.toFixed(1)}" stroke-dashoffset="${offset.toFixed(1)}"
          stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"
          style="transition: stroke-dashoffset 0.6s ease;"/>
        <text x="${cx}" y="${cy - 4}" text-anchor="middle" font-size="30" font-weight="700" fill="var(--text-main)">${pct}%</text>
        <text x="${cx}" y="${cy + 20}" text-anchor="middle" font-size="12" fill="var(--text-light)">全公司完成率</text>
      </svg>
    `;
  }

  // ===== 各課程完成率長條圖 =====
  function renderCourseBarChart() {
    const employees = Data.getEmployees();
    const all = [...Data.COURSES.new_employee.map(c => ({...c, role:'new_employee'})),
                 ...Data.COURSES.manager.map(c => ({...c, role:'manager'}))];

    const shortNames = {
      pdpa: '個資', osh: '職安', ai_policy: 'AI', infosec: '資安',
      bullying: '霸凌', harassment: '性騷'
    };

    const bars = all.map(c => {
      const targets = employees.filter(e => e.role === c.role && e.active);
      const done = targets.filter(e => Data.getProgress(e.empId, c.id).completed).length;
      const pct = targets.length ? Math.round(done * 100 / targets.length) : 0;
      return { id: c.id, label: shortNames[c.id] || c.title.slice(0, 2), pct, role: c.role };
    });

    const chartW = 600, chartH = 200, barW = 60, gap = 34;
    const baseY = 165, maxBarH = 130;
    const startX = (chartW - (bars.length * barW + (bars.length - 1) * gap)) / 2;

    const barsSvg = bars.map((b, i) => {
      const x = startX + i * (barW + gap);
      const h = (b.pct / 100) * maxBarH;
      const y = baseY - h;
      const color = b.role === 'manager' ? '#b04060' : '#3d5a99';
      return `
        <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="6" fill="${color}" style="transition: height 0.5s ease;"/>
        <text x="${x + barW/2}" y="${y - 8}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text-main)">${b.pct}%</text>
        <text x="${x + barW/2}" y="${baseY + 20}" text-anchor="middle" font-size="12" fill="var(--text-light)">${b.label}</text>
      `;
    }).join('');

    return `
      <svg width="100%" viewBox="0 0 ${chartW} ${chartH}" style="max-width:100%;">
        <line x1="${startX - 10}" y1="${baseY}" x2="${chartW - (startX - 10)}" y2="${baseY}" stroke="#e2e6ee" stroke-width="1"/>
        ${barsSvg}
      </svg>
      <div style="display:flex; gap:18px; justify-content:center; margin-top:8px; font-size:12px; color:var(--text-light);">
        <span><span style="display:inline-block; width:10px; height:10px; background:#3d5a99; border-radius:2px; margin-right:5px;"></span>新進人員課程</span>
        <span><span style="display:inline-block; width:10px; height:10px; background:#b04060; border-radius:2px; margin-right:5px;"></span>主管課程</span>
      </div>
    `;
  }

  function renderCourseStats() {
    const employees = Data.getEmployees();
    const all = [...Data.COURSES.new_employee.map(c => ({...c, role:'new_employee'})),
                 ...Data.COURSES.manager.map(c => ({...c, role:'manager'}))];

    return all.map(c => {
      const targets = employees.filter(e => e.role === c.role && e.active);
      const done = targets.filter(e => Data.getProgress(e.empId, c.id).completed).length;
      const pct = targets.length ? Math.round(done * 100 / targets.length) : 0;
      return `
        <div style="margin-bottom:14px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <span>${c.icon} ${c.title} <span style="color:var(--text-light); font-size:12px;">(${c.role === 'manager' ? '主管' : '新進'})</span></span>
            <span style="color:var(--text-light); font-size:13px;">${done} / ${targets.length} (${pct}%)</span>
          </div>
          <div class="progress-bar" style="width:100%;">
            <div class="progress-fill" style="width:${pct}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderRecentLogs() {
    const logs = Data.getLogs().slice(-10).reverse();
    if (!logs.length) return '<div class="empty-state">尚無紀錄</div>';
    return `
      <table class="data-table" style="background: transparent; box-shadow:none;">
        <thead><tr><th>時間</th><th>員工</th><th>動作</th><th>內容</th></tr></thead>
        <tbody>
          ${logs.map(l => {
            const emp = Data.getEmployee(l.empId);
            return `<tr>
              <td>${formatTime(l.at)}</td>
              <td>${emp ? emp.name : l.empId}</td>
              <td>${typeLabel(l.type)}</td>
              <td>${l.detail || '-'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
  }

  // ===== 員工管理 =====
  function renderEmployees() {
    const employees = Data.getEmployees();
    document.getElementById('admin-content').innerHTML = `
      <div class="admin-header">
        <h1>員工管理</h1>
        <div>
          <button class="btn btn-secondary" id="btn-import">📥 匯入 CSV</button>
          <button class="btn btn-primary" id="btn-add-emp">+ 新增員工</button>
        </div>
      </div>

      <div class="action-bar">
        <input type="text" class="search-input" id="emp-search" placeholder="🔍 搜尋員工編號 / 姓名 / 部門..." />
        <select class="search-input" id="emp-role-filter" style="flex:0 0 180px;">
          <option value="">全部身份</option>
          <option value="new_employee">新進人員</option>
          <option value="manager">主管</option>
        </select>
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>員工編號</th>
            <th>姓名</th>
            <th>Email</th>
            <th>部門</th>
            <th>身份</th>
            <th>狀態</th>
            <th>建立日</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="emp-tbody"></tbody>
      </table>
    `;

    renderEmpRows(employees);

    document.getElementById('btn-add-emp').addEventListener('click', () => openEmpModal());
    document.getElementById('btn-import').addEventListener('click', () => {
      document.getElementById('import-modal').classList.add('show');
    });

    document.getElementById('emp-search').addEventListener('input', filterEmps);
    document.getElementById('emp-role-filter').addEventListener('change', filterEmps);

    bindEmpForm();
    bindImport();
  }

  function filterEmps() {
    const kw = document.getElementById('emp-search').value.toLowerCase();
    const role = document.getElementById('emp-role-filter').value;
    let list = Data.getEmployees();
    if (kw) list = list.filter(e =>
      e.empId.toLowerCase().includes(kw) ||
      e.name.toLowerCase().includes(kw) ||
      (e.dept || '').toLowerCase().includes(kw)
    );
    if (role) list = list.filter(e => e.role === role);
    renderEmpRows(list);
  }

  function renderEmpRows(list) {
    const tbody = document.getElementById('emp-tbody');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:40px;">無資料</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(e => `
      <tr>
        <td><strong>${e.empId}</strong></td>
        <td>${e.name}</td>
        <td>${e.email || '-'}</td>
        <td>${e.dept || '-'}</td>
        <td><span class="tag ${e.role === 'manager' ? 'tag-pink' : 'tag-blue'}">${e.role === 'manager' ? '主管' : '新進'}</span></td>
        <td>${e.active !== false ? '<span class="tag tag-green">啟用</span>' : '<span class="tag tag-gray">停用</span>'}</td>
        <td>${e.createdAt ? e.createdAt.slice(0,10) : '-'}</td>
        <td>
          <button class="icon-btn" onclick="Admin.editEmp('${e.empId}')">編輯</button>
          <button class="icon-btn" onclick="Admin.toggleEmp('${e.empId}')">${e.active !== false ? '停用' : '啟用'}</button>
          <button class="icon-btn danger" onclick="Admin.deleteEmp('${e.empId}')">刪除</button>
        </td>
      </tr>
    `).join('');
  }

  function openEmpModal(emp) {
    document.getElementById('emp-modal-title').textContent = emp ? '編輯員工' : '新增員工';
    document.getElementById('emp-orig-id').value = emp ? emp.empId : '';
    document.getElementById('emp-id').value = emp ? emp.empId : '';
    document.getElementById('emp-id').disabled = !!emp;
    document.getElementById('emp-name').value = emp ? emp.name : '';
    document.getElementById('emp-email').value = emp ? (emp.email || '') : '';
    document.getElementById('emp-dept').value = emp ? (emp.dept || '') : '';
    document.getElementById('emp-role').value = emp ? emp.role : 'new_employee';
    document.getElementById('emp-password').value = '';
    document.getElementById('emp-modal').classList.add('show');
  }

  function bindEmpForm() {
    const form = document.getElementById('emp-form');
    form.onsubmit = e => {
      e.preventDefault();
      const orig = document.getElementById('emp-orig-id').value;
      const data = {
        empId: document.getElementById('emp-id').value.trim(),
        name: document.getElementById('emp-name').value.trim(),
        email: document.getElementById('emp-email').value.trim(),
        dept: document.getElementById('emp-dept').value.trim(),
        role: document.getElementById('emp-role').value,
        password: document.getElementById('emp-password').value || undefined
      };
      try {
        if (orig) {
          Data.updateEmployee(orig, data);
          toast('員工資料已更新', 'success');
        } else {
          Data.addEmployee(data);
          toast('新增成功!預設密碼為員工編號', 'success');
        }
        document.getElementById('emp-modal').classList.remove('show');
        renderEmployees();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
  }

  function bindImport() {
    document.getElementById('csv-file').onchange = e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const result = Data.importEmployeesFromCSV(reader.result);
          const box = document.getElementById('import-result');
          box.style.display = 'block';
          box.innerHTML = `
            <div style="padding:16px; background: ${result.failed === 0 ? '#d4ecd4' : '#fff4cc'}; border-radius:8px;">
              <strong>${result.failed === 0 ? '✅' : '⚠️'} 匯入結果:</strong>
              成功 ${result.success} 筆,失敗 ${result.failed} 筆
              ${result.errors.length ? '<div style="margin-top:8px; font-size:13px; color:var(--accent-red);">' + result.errors.map(e => '• ' + e).join('<br>') + '</div>' : ''}
            </div>
          `;
          if (result.success > 0) {
            toast(`成功匯入 ${result.success} 筆員工資料`, 'success');
            setTimeout(() => {
              document.getElementById('import-modal').classList.remove('show');
              renderEmployees();
            }, 1500);
          }
        } catch (err) {
          toast(err.message, 'error');
        }
      };
      reader.readAsText(file, 'UTF-8');
    };

    document.getElementById('download-sample').onclick = () => {
      const csv = '﻿empId,name,email,dept,role,password\nE101,張三,zhang@systex.com,研發部,new_employee,\nE102,李四,li@systex.com,業務部,manager,\nE103,王五,wang@systex.com,行銷部,new_employee,';
      Data.downloadFile('員工匯入範例.csv', csv);
    };
  }

  // ===== 學習狀況 =====
  function renderLearning() {
    document.getElementById('admin-content').innerHTML = `
      <div class="admin-header">
        <h1>學習狀況</h1>
        <button class="btn btn-primary" id="btn-export-learning">📥 匯出學習紀錄</button>
      </div>

      <div class="action-bar">
        <input type="text" class="search-input" id="learn-search" placeholder="🔍 搜尋員工..." />
      </div>

      <table class="data-table">
        <thead>
          <tr>
            <th>員工編號</th>
            <th>姓名</th>
            <th>部門</th>
            <th>身份</th>
            <th>學習進度</th>
            <th>最後登入</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody id="learn-tbody"></tbody>
      </table>
    `;

    renderLearnRows(Data.getEmployees());

    document.getElementById('learn-search').addEventListener('input', e => {
      const kw = e.target.value.toLowerCase();
      renderLearnRows(Data.getEmployees().filter(em =>
        em.empId.toLowerCase().includes(kw) ||
        em.name.toLowerCase().includes(kw) ||
        (em.dept || '').toLowerCase().includes(kw)
      ));
    });

    document.getElementById('btn-export-learning').addEventListener('click', () => {
      const csv = Data.exportLearningRecordsToCSV();
      Data.downloadFile(`學習紀錄_${new Date().toISOString().slice(0,10)}.csv`, csv);
      toast('學習紀錄已匯出', 'success');
    });
  }

  function renderLearnRows(list) {
    const tbody = document.getElementById('learn-tbody');
    if (!list.length) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:40px;">無資料</td></tr>';
      return;
    }
    tbody.innerHTML = list.map(e => {
      const p = Data.getEmployeeOverallProgress(e.empId);
      const logs = Data.getLogs(e.empId).filter(l => l.type === 'login');
      const lastLogin = logs.length ? logs[logs.length - 1].at : null;
      return `
        <tr>
          <td><strong>${e.empId}</strong></td>
          <td>${e.name}</td>
          <td>${e.dept || '-'}</td>
          <td><span class="tag ${e.role === 'manager' ? 'tag-pink' : 'tag-blue'}">${e.role === 'manager' ? '主管' : '新進'}</span></td>
          <td>
            <div class="progress-bar"><div class="progress-fill" style="width:${p.percent}%;"></div></div>
            <span style="font-size:13px;">${p.completed}/${p.total} (${p.percent}%)</span>
          </td>
          <td>${lastLogin ? formatTime(lastLogin) : '<span style="color:#bbb;">尚未登入</span>'}</td>
          <td>
            <button class="icon-btn" onclick="Admin.showDetail('${e.empId}')">查看詳情</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function showDetail(empId) {
    const emp = Data.getEmployee(empId);
    if (!emp) return;
    const courses = Data.COURSES[emp.role] || [];
    const logs = Data.getLogs(empId).slice(-20).reverse();

    document.getElementById('detail-title').textContent = `${emp.name} (${emp.empId}) 的學習詳情`;
    document.getElementById('detail-body').innerHTML = `
      <div style="margin-bottom:24px;">
        <strong>基本資料</strong><br>
        <div style="margin-top:8px; color:var(--text-light); font-size:14px;">
          部門: ${emp.dept || '-'} | Email: ${emp.email || '-'} | 身份: ${emp.role === 'manager' ? '主管人員' : '新進人員'}
        </div>
      </div>

      <h4 style="margin-bottom:12px;">課程進度</h4>
      <table class="data-table" style="margin-bottom:24px;">
        <thead><tr><th>課程</th><th>影片觀看率</th><th>觀看時長</th><th>測驗</th><th>狀態</th><th>最後</th></tr></thead>
        <tbody>
          ${courses.map(c => {
            const p = Data.getProgress(empId, c.id);
            const dur = p.videoDuration || 0;
            const watched = p.videoWatchedSeconds || 0;
            const ratio = dur ? Math.round(watched * 100 / dur) : (p.videoWatched ? 100 : 0);
            return `<tr>
              <td>${c.icon} ${c.title}</td>
              <td>
                <div class="progress-bar"><div class="progress-fill" style="width:${ratio}%;"></div></div>
                <span style="font-size:12px;">${ratio}%</span>
              </td>
              <td style="font-size:12px;">${formatSecAdmin(watched)} / ${formatSecAdmin(dur)}</td>
              <td>${p.quizScore != null ? p.quizScore + ' 分' : '-'}</td>
              <td>${p.completed ? '<span class="tag tag-green">完成</span>' : (p.videoWatched || p.quizScore != null ? '<span class="tag tag-blue">進行中</span>' : '<span class="tag tag-gray">未開始</span>')}</td>
              <td style="font-size:12px;">${p.lastAt ? formatTime(p.lastAt) : '-'}</td>
            </tr>`;
          }).join('')}
        </tbody>
      </table>

      <h4 style="margin-bottom:12px;">最近活動紀錄</h4>
      <div style="max-height:240px; overflow-y:auto; background:#f9f9f9; padding:12px; border-radius:8px;">
        ${logs.length ? logs.map(l => `
          <div style="padding:6px 0; border-bottom:1px solid #eee; font-size:13px;">
            <span style="color:var(--text-light);">${formatTime(l.at)}</span>
            &nbsp;<span class="tag tag-blue" style="font-size:11px;">${typeLabel(l.type)}</span>
            &nbsp;${l.detail || ''}
          </div>
        `).join('') : '<div style="text-align:center; color:#aaa;">無紀錄</div>'}
      </div>
    `;
    document.getElementById('detail-modal').classList.add('show');
  }

  // ===== 登入紀錄 =====
  function renderLogs() {
    document.getElementById('admin-content').innerHTML = `
      <div class="admin-header">
        <h1>登入與學習紀錄</h1>
        <button class="btn btn-secondary" id="btn-export-logs">📥 匯出全部紀錄</button>
      </div>

      <div class="action-bar">
        <input type="text" class="search-input" id="log-search" placeholder="🔍 搜尋員工編號..." />
        <select class="search-input" id="log-type" style="flex:0 0 200px;">
          <option value="">全部類型</option>
          <option value="login">登入</option>
          <option value="logout">登出</option>
          <option value="enter_course">進入課程</option>
          <option value="video_play">播放影片</option>
          <option value="video_pause">暫停影片</option>
          <option value="video_seek">影片跳轉</option>
          <option value="video_ended">影片結束</option>
          <option value="video_watched">影片達標</option>
          <option value="quiz_submitted">送出測驗</option>
          <option value="course_completed">完成課程</option>
        </select>
      </div>

      <table class="data-table">
        <thead>
          <tr><th>時間</th><th>員工</th><th>姓名</th><th>動作</th><th>詳情</th></tr>
        </thead>
        <tbody id="logs-tbody"></tbody>
      </table>
    `;

    renderLogRows();

    document.getElementById('log-search').addEventListener('input', renderLogRows);
    document.getElementById('log-type').addEventListener('change', renderLogRows);
    document.getElementById('btn-export-logs').addEventListener('click', () => {
      const logs = Data.getLogs();
      const headers = ['時間','員工編號','姓名','類型','內容'];
      const lines = [headers.join(',')];
      logs.forEach(l => {
        const emp = Data.getEmployee(l.empId);
        lines.push([l.at, l.empId, emp ? emp.name : '', typeLabel(l.type), (l.detail || '').replace(/,/g,'、')].join(','));
      });
      Data.downloadFile(`登入紀錄_${new Date().toISOString().slice(0,10)}.csv`, '﻿' + lines.join('\n'));
      toast('紀錄已匯出', 'success');
    });
  }

  function renderLogRows() {
    const kw = document.getElementById('log-search').value.toLowerCase();
    const type = document.getElementById('log-type').value;
    let logs = Data.getLogs().slice().reverse();
    if (kw) logs = logs.filter(l => l.empId.toLowerCase().includes(kw));
    if (type) logs = logs.filter(l => l.type === type);

    const tbody = document.getElementById('logs-tbody');
    if (!logs.length) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:40px;">無紀錄</td></tr>';
      return;
    }
    tbody.innerHTML = logs.slice(0, 200).map(l => {
      const emp = Data.getEmployee(l.empId);
      return `<tr>
        <td>${formatTime(l.at)}</td>
        <td><strong>${l.empId}</strong></td>
        <td>${emp ? emp.name : '-'}</td>
        <td><span class="tag tag-blue">${typeLabel(l.type)}</span></td>
        <td>${l.detail || '-'}</td>
      </tr>`;
    }).join('');
  }

  // ===== 匯出專區 =====
  function renderExport() {
    document.getElementById('admin-content').innerHTML = `
      <div class="admin-header">
        <h1>資料匯出</h1>
      </div>

      <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:20px;">
        <div class="stat-card">
          <h3>👥 員工名單</h3>
          <p style="color:var(--text-light); margin:12px 0;">匯出所有員工帳號清單(CSV 格式)</p>
          <button class="btn btn-primary" id="exp-emp">下載員工名單</button>
        </div>

        <div class="stat-card">
          <h3>📚 學習紀錄</h3>
          <p style="color:var(--text-light); margin:12px 0;">匯出每位員工的課程學習狀況</p>
          <button class="btn btn-primary" id="exp-learn">下載學習紀錄</button>
        </div>

        <div class="stat-card">
          <h3>📝 操作紀錄</h3>
          <p style="color:var(--text-light); margin:12px 0;">匯出所有員工登入與學習行為紀錄</p>
          <button class="btn btn-primary" id="exp-logs">下載操作紀錄</button>
        </div>

        <div class="stat-card" style="border:2px solid #2f80ed; background:#f2f8ff;">
          <h3>☁️ 雲端數據</h3>
          <p style="color:var(--text-light); margin:12px 0;">把用 Google／Microsoft 365 登入的學員資料，從雲端載入到這台電腦。載入後，數據分析和下方的匯出都會包含這些學員。第一次使用需要用管理員的 Google 帳號登入。</p>
          <button class="btn btn-primary" id="exp-cloud">載入雲端數據</button>
        </div>

        <div class="stat-card" style="border:2px solid #6c5ce7; background:#f6f4ff;">
          <h3>📦 完整數據（Excel）</h3>
          <p style="color:var(--text-light); margin:12px 0;">一個檔案包含所有數據：學員總表、單元學習紀錄、測驗作答紀錄、逐題作答明細、題目分析、操作紀錄、滿意度問卷（每項一個工作表），可直接用來做評鑑分析。</p>
          <button class="btn btn-primary" id="exp-all">下載完整數據</button>
        </div>

        <div class="stat-card">
          <h3>🗄️ 備份與合併</h3>
          <p style="color:var(--text-light); margin:12px 0;">學員在不同電腦上學習時：在每台電腦下載備份檔，再到同一台電腦「匯入合併」，就能一起分析。</p>
          <div style="display:flex; gap:8px; flex-wrap:wrap;">
            <button class="btn btn-primary" id="exp-backup">下載備份檔</button>
            <button class="btn btn-secondary" id="imp-backup">匯入合併</button>
          </div>
          <input type="file" id="imp-backup-file" accept=".json,application/json" style="display:none;">
        </div>

        <div class="stat-card" style="border:1px solid #f0c0c0;">
          <h3 style="color:var(--accent-red);">⚠️ 重置示範資料</h3>
          <p style="color:var(--text-light); margin:12px 0;">清空所有資料,還原為預設示範狀態</p>
          <button class="btn btn-danger" id="reset-all">重置所有資料</button>
        </div>
      </div>
    `;

    document.getElementById('exp-emp').onclick = () => {
      Data.downloadFile(`員工名單_${new Date().toISOString().slice(0,10)}.csv`, Data.exportEmployeesToCSV());
      toast('員工名單已匯出', 'success');
    };
    document.getElementById('exp-learn').onclick = () => {
      Data.downloadFile(`學習紀錄_${new Date().toISOString().slice(0,10)}.csv`, Data.exportLearningRecordsToCSV());
      toast('學習紀錄已匯出', 'success');
    };
    document.getElementById('exp-logs').onclick = () => {
      const logs = Data.getLogs();
      const headers = ['時間','員工編號','類型','內容'];
      const lines = [headers.join(',')];
      logs.forEach(l => lines.push([l.at, l.empId, typeLabel(l.type), (l.detail || '').replace(/,/g,'、')].join(',')));
      Data.downloadFile(`操作紀錄_${new Date().toISOString().slice(0,10)}.csv`, '﻿' + lines.join('\n'));
      toast('操作紀錄已匯出', 'success');
    };
    document.getElementById('exp-all').onclick = downloadAllExcel;
    document.getElementById('exp-cloud').onclick = () => loadCloud(null);
    document.getElementById('exp-backup').onclick = () => {
      const blob = new Blob([Data.exportBackup()], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `學習數據備份_${new Date().toISOString().slice(0,10)}.json`; document.body.appendChild(a); a.click(); a.remove();
      toast('備份檔已下載', 'success');
    };
    const impFile = document.getElementById('imp-backup-file');
    document.getElementById('imp-backup').onclick = () => impFile.click();
    impFile.onchange = () => {
      const f = impFile.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const sm = Data.importBackupMerge(r.result);
          toast(`合併完成：新增 ${sm.employees} 位員工、${sm.attempts} 筆作答、${sm.logs} 筆紀錄`, 'success');
        } catch (e) { toast('匯入失敗：' + e.message, 'error'); }
        impFile.value = '';
      };
      r.readAsText(f);
    };
    document.getElementById('reset-all').onclick = () => {
      if (confirm('將清空所有員工、學習紀錄並還原預設資料,確定?')) {
        Data.resetAll();
        toast('已重置,請重新登入', 'success');
        setTimeout(() => location.reload(), 1200);
      }
    };
  }

  // =====================================================================
  // ===== 數據分析（形成性／總結性評鑑用）=====
  // =====================================================================
  const QUIZ_META = () => {
    const m = {};
    Data.COURSES.new_employee.forEach(c => { m[c.id] = { title: c.title, role: 'new_employee', icon: c.icon }; });
    Data.COURSES.manager.forEach(c => { m[c.id] = { title: c.title, role: 'manager', icon: c.icon }; });
    m.final_new_employee = { title: '新進人員總測驗', role: 'new_employee', icon: '🎓' };
    m.final_manager = { title: '主管總測驗', role: 'manager', icon: '🎓' };
    return m;
  };
  const roleName = r => r === 'manager' ? '主管' : '新進人員';
  const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null;
  const fmt1 = v => v == null ? '-' : (Math.round(v * 10) / 10).toString();
  const pctTxt = v => v == null ? '-' : Math.round(v) + '%';

  // 依「人」整理每份測驗的第一次、最後一次作答
  function attemptsByPerson(quizId, empIds) {
    const res = {};
    Data.getQuizAttempts().filter(a => a.quizId === quizId && (!empIds || empIds.has(a.empId)))
      .sort((a, b) => (a.at || '').localeCompare(b.at || ''))
      .forEach(a => { (res[a.empId] = res[a.empId] || []).push(a); });
    return res;
  }
  // 計算某份測驗的成效（沒有作答明細時，退回使用最後分數）
  function quizSummary(quizId, targets) {
    const ids = new Set(targets.map(e => e.empId));
    const byP = attemptsByPerson(quizId, ids);
    const first = [], last = [], counts = [];
    targets.forEach(e => {
      const list = byP[e.empId];
      if (list && list.length) { first.push(list[0].score); last.push(list[list.length - 1].score); counts.push(list.length); }
      else { const p = Data.getProgress(e.empId, quizId); if (p.quizScore != null) { first.push(p.quizScore); last.push(p.quizScore); counts.push(1); } }
    });
    return { n: last.length, firstAvg: avg(first), lastAvg: avg(last), attemptsAvg: avg(counts), pass: last.filter(s => s >= 80).length, last };
  }
  // 題目分析：用每個人「第一次」作答計算答對率（難度指標 P 值）
  function itemAnalysis(quizId, targets) {
    const ids = new Set(targets.map(e => e.empId));
    const byP = attemptsByPerson(quizId, ids);
    const items = [];
    Object.values(byP).forEach(list => {
      (list[0].items || []).forEach((it, i) => {
        items[i] = items[i] || { q: it.q, n: 0, ok: 0 };
        items[i].n++; if (it.ok) items[i].ok++;
      });
    });
    return items.map((it, i) => ({ no: i + 1, q: it.q, n: it.n, p: it.n ? it.ok * 100 / it.n : null }));
  }

  let anRole = 'all', anQuiz = null;
  function renderAnalytics() {
    const meta = QUIZ_META();
    const emps = Data.getEmployees().filter(e => e.active !== false && (anRole === 'all' || e.role === anRole));
    const courseList = [...Data.COURSES.new_employee.map(c => ({ ...c, role: 'new_employee' })), ...Data.COURSES.manager.map(c => ({ ...c, role: 'manager' }))]
      .filter(c => anRole === 'all' || c.role === anRole);
    const quizIds = courseList.map(c => c.id).concat(anRole === 'all' ? ['final_new_employee', 'final_manager'] : ['final_' + anRole]);
    if (!anQuiz || !quizIds.includes(anQuiz)) anQuiz = quizIds[0];

    // ---- 總覽 ----
    const started = emps.filter(e => Data.getLogs(e.empId).length || courseList.some(c => Object.keys(Data.getProgress(e.empId, c.id)).length));
    const compRates = emps.map(e => Data.getEmployeeOverallProgress(e.empId).percent);
    const unitLast = [];
    courseList.forEach(c => { quizSummary(c.id, emps.filter(e => e.role === c.role)).last.forEach(s => unitLast.push(s)); });
    const finals = (anRole === 'all' ? ['new_employee', 'manager'] : [anRole]).map(r => quizSummary('final_' + r, emps.filter(e => e.role === r)));
    const finN = finals.reduce((a, f) => a + f.n, 0), finPass = finals.reduce((a, f) => a + f.pass, 0);
    const studyMins = emps.map(e => courseList.filter(c => c.role === e.role).reduce((a, c) => a + (Data.getProgress(e.empId, c.id).studySeconds || 0), 0) / 60).filter(m => m > 0);
    const gameLogs = Data.getLogs().filter(l => l.type === 'game_opened' && emps.some(e => e.empId === l.empId));

    // ---- 各單元成效 ----
    const unitRows = courseList.map(c => {
      const t = emps.filter(e => e.role === c.role);
      const done = t.filter(e => Data.getProgress(e.empId, c.id).completed).length;
      const vid = t.filter(e => Data.getProgress(e.empId, c.id).videoWatched).length;
      const qs = quizSummary(c.id, t);
      const st = t.map(e => (Data.getProgress(e.empId, c.id).studySeconds || 0) / 60).filter(m => m > 0);
      const diff = qs.firstAvg != null && qs.lastAvg != null ? qs.lastAvg - qs.firstAvg : null;
      return `<tr><td>${c.icon} ${c.title}<br><small style="color:var(--text-light)">${roleName(c.role)}</small></td>
        <td>${t.length}</td><td>${t.length ? pctTxt(done * 100 / t.length) : '-'}</td><td>${t.length ? pctTxt(vid * 100 / t.length) : '-'}</td>
        <td>${qs.n}</td><td>${fmt1(qs.firstAvg)}</td><td>${fmt1(qs.lastAvg)}</td>
        <td style="color:${diff > 0 ? '#2e8b57' : 'inherit'}; font-weight:${diff > 0 ? 700 : 400}">${diff == null ? '-' : (diff > 0 ? '+' : '') + fmt1(diff)}</td>
        <td>${fmt1(qs.attemptsAvg)}</td><td>${st.length ? fmt1(avg(st)) + ' 分' : '-'}</td></tr>`;
    }).join('');

    // ---- 部門比較 ----
    const depts = [...new Set(emps.map(e => e.dept || '未填部門'))];
    const deptRows = depts.map(d => {
      const t = emps.filter(e => (e.dept || '未填部門') === d);
      const rate = avg(t.map(e => Data.getEmployeeOverallProgress(e.empId).percent));
      const sc = [];
      t.forEach(e => (Data.COURSES[e.role] || []).forEach(c => { const p = Data.getProgress(e.empId, c.id); if (p.quizScore != null) sc.push(p.quizScore); }));
      return `<tr><td>${escapeHtml(d)}</td><td>${t.length}</td><td>${pctTxt(rate)}</td><td>${fmt1(avg(sc))}</td></tr>`;
    }).join('');

    // ---- 校內／校外、登入方式比較 ----
    const grpKey = e => e.group || (e.cloudUid ? '校外' : '示範／員工編號帳號');
    const groups = [...new Set(emps.map(grpKey))];
    const groupRows = groups.map(g => {
      const t = emps.filter(e => grpKey(e) === g);
      const rate = avg(t.map(e => Data.getEmployeeOverallProgress(e.empId).percent));
      const sc = []; t.forEach(e => (Data.COURSES[e.role] || []).forEach(c => { const p = Data.getProgress(e.empId, c.id); if (p.quizScore != null) sc.push(p.quizScore); }));
      const fin = t.map(e => Data.getProgress(e.empId, 'final_' + e.role).quizScore).filter(v => v != null);
      return `<tr><td>${escapeHtml(g)}</td><td>${t.length}</td><td>${pctTxt(rate)}</td><td>${fmt1(avg(sc))}</td><td>${fmt1(avg(fin))}</td></tr>`;
    }).join('');

    const idKey = e => e.identity || '未填（示範／員工編號帳號）';
    const idRows = [...new Set(emps.map(idKey))].map(g => {
      const t = emps.filter(e => idKey(e) === g);
      const rate = avg(t.map(e => Data.getEmployeeOverallProgress(e.empId).percent));
      const sc = []; t.forEach(e => (Data.COURSES[e.role] || []).forEach(c => { const p = Data.getProgress(e.empId, c.id); if (p.quizScore != null) sc.push(p.quizScore); }));
      const fin = t.map(e => Data.getProgress(e.empId, 'final_' + e.role).quizScore).filter(v => v != null);
      return `<tr><td>${escapeHtml(g)}</td><td>${t.length}</td><td>${pctTxt(rate)}</td><td>${fmt1(avg(sc))}</td><td>${fmt1(avg(fin))}</td></tr>`;
    }).join('');

    const quizOptions = quizIds.map(id => `<option value="${id}" ${id === anQuiz ? 'selected' : ''}>${meta[id].icon} ${meta[id].title}</option>`).join('');
    const main = document.getElementById('admin-content');
    main.innerHTML = `
      <div class="admin-header">
        <h1>數據分析</h1>
        <div class="an-filter">
          ${[['all', '全部'], ['new_employee', '新進人員'], ['manager', '主管']].map(([v, t]) => `<button class="an-chip ${anRole === v ? 'on' : ''}" data-role="${v}">${t}</button>`).join('')}
        </div>
      </div>
      <div class="an-note an-cloud-row">
        <span>☁️ 用 Google／Microsoft 365 登入的學員，學習紀錄存在雲端。分析前請先按「載入雲端數據」，把所有人的最新資料抓下來。</span>
        <button class="btn btn-primary" id="an-cloud">☁️ 載入雲端數據</button>
      </div>

      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">已開始學習人數</div><div class="stat-value">${started.length} <small>/ ${emps.length}</small></div></div>
        <div class="stat-card"><div class="stat-label">平均完成率</div><div class="stat-value green">${pctTxt(avg(compRates))}</div></div>
        <div class="stat-card"><div class="stat-label">單元測驗平均分數</div><div class="stat-value orange">${fmt1(avg(unitLast))}</div></div>
        <div class="stat-card"><div class="stat-label">總測驗通過率（80 分）</div><div class="stat-value">${finN ? pctTxt(finPass * 100 / finN) : '-'} <small>${finN ? finPass + ' / ' + finN + ' 人' : ''}</small></div></div>
        <div class="stat-card"><div class="stat-label">平均學習時間</div><div class="stat-value">${studyMins.length ? fmt1(avg(studyMins)) : '-'} <small>分鐘</small></div></div>
        <div class="stat-card"><div class="stat-label">3D 遊戲開啟</div><div class="stat-value">${new Set(gameLogs.map(l => l.empId)).size} <small>人 / ${gameLogs.length} 次</small></div></div>
      </div>

      <div class="stat-card an-block">
        <h3>📚 各單元學習成效</h3>
        <p class="an-desc">「首次平均」是每位學員第一次作答的分數，「最後平均」是最近一次作答的分數，兩者的差距可以看出訂正、重考後的進步幅度。</p>
        <div class="an-table-wrap"><table class="data-table">
          <thead><tr><th>單元</th><th>對象人數</th><th>完成率</th><th>影片完成率</th><th>測驗人數</th><th>首次平均</th><th>最後平均</th><th>進步</th><th>平均作答次數</th><th>平均學習時間</th></tr></thead>
          <tbody>${unitRows || '<tr><td colspan="10" style="text-align:center;color:var(--text-light)">尚無資料</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="stat-card an-block">
        <div class="an-head"><h3>📊 分數分布與題目分析</h3><select id="an-quiz" class="an-select">${quizOptions}</select></div>
        <div class="an-two">
          <div><h4 class="an-sub">分數分布（最近一次作答）</h4><div id="an-hist"></div></div>
          <div><h4 class="an-sub">題目答對率（每人第一次作答）</h4><div id="an-items"></div></div>
        </div>
      </div>

      <div class="stat-card an-block">
        <h3>🏫 校內／校外比較</h3>
        <div class="an-table-wrap"><table class="data-table">
          <thead><tr><th>受測者來源</th><th>人數</th><th>平均完成率</th><th>單元測驗平均分數</th><th>總測驗平均分數</th></tr></thead>
          <tbody>${groupRows || '<tr><td colspan="5" style="text-align:center;color:var(--text-light)">尚無資料</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="stat-card an-block">
        <h3>🧑‍🤝‍🧑 身分類別比較</h3>
        <p class="an-desc">學生、一般員工使用員工篇；老師、主管使用主管篇。</p>
        <div class="an-table-wrap"><table class="data-table">
          <thead><tr><th>身分</th><th>人數</th><th>平均完成率</th><th>單元測驗平均分數</th><th>總測驗平均分數</th></tr></thead>
          <tbody>${idRows || '<tr><td colspan="5" style="text-align:center;color:var(--text-light)">尚無資料</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="stat-card an-block">
        <h3>🏢 部門比較</h3>
        <div class="an-table-wrap"><table class="data-table">
          <thead><tr><th>部門</th><th>人數</th><th>平均完成率</th><th>單元測驗平均分數</th></tr></thead>
          <tbody>${deptRows || '<tr><td colspan="4" style="text-align:center;color:var(--text-light)">尚無資料</td></tr>'}</tbody>
        </table></div>
      </div>
    `;
    main.querySelectorAll('.an-chip').forEach(b => b.onclick = () => { anRole = b.dataset.role; renderAnalytics(); });
    main.querySelector('#an-cloud').onclick = () => loadCloud(renderAnalytics);
    const sel = main.querySelector('#an-quiz');
    sel.onchange = () => { anQuiz = sel.value; drawQuizDetail(); };
    function drawQuizDetail() {
      const role = meta[anQuiz].role, t = emps.filter(e => e.role === role);
      const qs = quizSummary(anQuiz, t);
      // 分數分布長條圖
      const bins = [['0-59', 0, 59], ['60-69', 60, 69], ['70-79', 70, 79], ['80-89', 80, 89], ['90-100', 90, 100]];
      const cnt = bins.map(([, a, b]) => qs.last.filter(s => s >= a && s <= b).length);
      const mx = Math.max(1, ...cnt), W = 360, H = 190, bw = 48, gap = 22, x0 = (W - (5 * bw + 4 * gap)) / 2;
      document.getElementById('an-hist').innerHTML = qs.n ? `
        <svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:420px">
          <line x1="${x0 - 6}" y1="150" x2="${W - x0 + 6}" y2="150" stroke="#e2e6ee"/>
          ${cnt.map((c, i) => { const h = c / mx * 115, x = x0 + i * (bw + gap); return `
            <rect x="${x}" y="${150 - h}" width="${bw}" height="${h}" rx="5" fill="${i === 0 ? '#c0392b' : i < 3 ? '#d4941e' : '#2e8b57'}"/>
            <text x="${x + bw / 2}" y="${144 - h}" text-anchor="middle" font-size="13" font-weight="700" fill="var(--text-main)">${c}</text>
            <text x="${x + bw / 2}" y="170" text-anchor="middle" font-size="11.5" fill="var(--text-light)">${bins[i][0]}</text>`; }).join('')}
        </svg>
        <div class="an-mini">作答人數 ${qs.n}　｜　平均 ${fmt1(qs.lastAvg)} 分　｜　通過率 ${pctTxt(qs.pass * 100 / qs.n)}</div>` : '<p class="an-empty">尚無作答資料</p>';
      // 題目答對率
      const items = itemAnalysis(anQuiz, t);
      document.getElementById('an-items').innerHTML = items.length ? `
        <div class="an-items">${items.map(it => {
          const tag = it.p == null ? '' : it.p < 50 ? '<span class="an-tag bad">需檢視</span>' : it.p > 90 ? '<span class="an-tag easy">偏易</span>' : '';
          const col = it.p == null ? '#ccc' : it.p < 50 ? '#c0392b' : it.p < 70 ? '#d4941e' : '#2e8b57';
          return `<div class="an-item"><div class="an-item-top"><span class="an-qno">${it.no}</span><span class="an-q" title="${escapeHtml(it.q || '')}">${escapeHtml(it.q || '')}</span>${tag}<b>${pctTxt(it.p)}</b></div>
            <div class="progress-bar"><div class="progress-fill" style="width:${it.p || 0}%; background:${col}"></div></div></div>`; }).join('')}</div>
        <p class="an-desc" style="margin-top:10px">答對率低於 50% 的題目建議檢視：可能是題目敘述不清楚，或教材沒有講清楚這個觀念。</p>`
        : '<p class="an-empty">尚無逐題作答資料。<br><small>（系統更新後的作答才會記錄每一題的對錯）</small></p>';
    }
    drawQuizDetail();
  }

  // =====================================================================
  // ===== 滿意度問卷結果 =====
  // =====================================================================
  let svRole = 'all';
  const sd = arr => { if (arr.length < 2) return null; const m = arr.reduce((a, b) => a + b, 0) / arr.length; return Math.sqrt(arr.reduce((a, b) => a + (b - m) * (b - m), 0) / (arr.length - 1)); };
  function susGrade(s) {
    if (s == null) return '-';
    if (s >= 85) return '優秀';
    if (s >= 72) return '良好';
    if (s >= 68) return '高於平均';
    if (s >= 51) return '尚可';
    return '待改進';
  }
  function renderSurveyResults() {
    const S = Data.SURVEY;
    const emps = Data.getEmployees().filter(e => e.active !== false && (svRole === 'all' || e.role === svRole));
    const all = Data.getAllSurveys();
    const rows = emps.map(e => ({ e, s: all[e.empId] })).filter(x => x.s);
    const finished = emps.filter(e => Data.getProgress(e.empId, 'final_' + e.role).quizScore != null);
    const susScores = rows.map(x => x.s.susScore).filter(v => v != null);
    const susAvg = susScores.length ? susScores.reduce((a, b) => a + b, 0) / susScores.length : null;
    const allLikert = []; rows.forEach(x => Object.values(x.s.answers || {}).forEach(v => allLikert.push(v)));
    const e1 = rows.map(x => (x.s.answers || {}).E1).filter(Boolean);
    const f1 = v => v == null ? '-' : (Math.round(v * 100) / 100).toFixed(2);
    const itemRow = (id, text, getVal) => {
      const vals = rows.map(x => getVal(x.s)).filter(v => v != null);
      const cnt = [1, 2, 3, 4, 5].map(k => vals.filter(v => v === k).length);
      const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      const bar = vals.length ? cnt.map((c, k) => `<span style="flex:${c || 0.0001}; background:${['#d9534f', '#f0ad4e', '#c8ccd4', '#7cc49a', '#2e8b57'][k]}" title="${k + 1} 分：${c} 人"></span>`).join('') : '';
      return `<tr><td class="sv-id">${id}</td><td>${escapeHtml(text)}</td><td>${vals.length}</td><td><b>${f1(mean)}</b></td><td>${f1(sd(vals))}</td>
        <td><div class="sv-dist">${bar}</div><div class="sv-dist-n">${cnt.join(' / ')}</div></td></tr>`;
    };
    const head = '<thead><tr><th>題號</th><th>題目</th><th>人數</th><th>平均</th><th>標準差</th><th>分布（1～5 分人數）</th></tr></thead>';
    const satRows = S.sections.map(sec => `<tr class="sv-sec-row"><td colspan="6">${sec.title}${sec.game ? '（只統計玩過遊戲的人）' : ''}</td></tr>` +
      sec.items.map(it => itemRow(it.id, it.t, s => (s.answers || {})[it.id])).join('')).join('');
    const susRows = S.sus.map((t, i) => itemRow('SUS' + (i + 1), t + (i % 2 ? '（反向題）' : ''), s => (s.sus || [])[i])).join('');
    const selfRoles = svRole === 'all' ? ['new_employee', 'manager'] : [svRole];
    const selfRows = selfRoles.map(r => `<tr class="sv-sec-row"><td colspan="6">${r === 'manager' ? '主管篇' : '員工篇'}</td></tr>` +
      S.self[r].map(it => itemRow(it.id, it.t, s => s.role === r ? (s.answers || {})[it.id] : null)).join('')).join('');
    const bins = [[0, 51], [51, 68], [68, 72], [72, 85], [85, 101]], binLab = ['待改進 <51', '尚可 51–67', '高於平均 68–71', '良好 72–84', '優秀 85+'];
    const susDist = bins.map(([a, b]) => susScores.filter(v => v >= a && v < b).length);
    const opens = S.open.map(o => {
      const list = rows.map(x => ({ who: x.e, t: (x.s.open || {})[o.id] })).filter(x => x.t);
      return `<div class="sv-open"><h4>${o.t}（${list.length} 則）</h4>${list.length ? list.map(x => `<div class="sv-open-item">「${escapeHtml(x.t)}」<span>— ${x.who.role === 'manager' ? '主管篇' : '員工篇'}${x.who.group ? '・' + x.who.group : ''}</span></div>`).join('') : '<p class="an-empty">尚無回答</p>'}</div>`;
    }).join('');
    const main = document.getElementById('admin-content');
    main.innerHTML = `
      <div class="admin-header"><h1>問卷結果</h1>
        <div class="an-filter">${[['all', '全部'], ['new_employee', '員工篇'], ['manager', '主管篇']].map(([v, t]) => `<button class="an-chip ${svRole === v ? 'on' : ''}" data-role="${v}">${t}</button>`).join('')}</div></div>
      ${typeof Cloud !== 'undefined' && Cloud.isReady && Cloud.isReady() ? `<div class="an-note an-cloud-row"><span>☁️ 分析前請先載入雲端數據，才會包含用 Google 登入的學員</span><button class="btn btn-primary" id="sv-cloud">☁️ 載入雲端數據</button></div>` : ''}
      <div class="stat-grid">
        <div class="stat-card"><div class="stat-label">問卷回收</div><div class="stat-value">${rows.length} <small>/ ${finished.length} 位完成總測驗者</small></div></div>
        <div class="stat-card"><div class="stat-label">回收率</div><div class="stat-value green">${finished.length ? Math.round(rows.length * 100 / finished.length) + '%' : '-'}</div></div>
        <div class="stat-card"><div class="stat-label">整體滿意度（E1）</div><div class="stat-value orange">${f1(e1.length ? e1.reduce((a, b) => a + b, 0) / e1.length : null)} <small>/ 5</small></div></div>
        <div class="stat-card"><div class="stat-label">課程滿意度（全部題目平均）</div><div class="stat-value">${f1(allLikert.length ? allLikert.reduce((a, b) => a + b, 0) / allLikert.length : null)} <small>/ 5</small></div></div>
        <div class="stat-card"><div class="stat-label">SUS 易用性分數</div><div class="stat-value">${susAvg == null ? '-' : susAvg.toFixed(1)} <small>${susGrade(susAvg)}</small></div></div>
      </div>
      <div class="stat-card an-block"><h3>📊 SUS 系統易用性</h3>
        <p class="an-desc">SUS（System Usability Scale）滿分 100 分，68 分為一般系統的平均水準，高於 68 分代表易用性在平均以上。計分方式：奇數題（分數 − 1）、偶數題（5 − 分數），加總後 × 2.5。</p>
        <div class="sv-sus-bars">${susDist.map((c, i) => `<div class="sv-sus-bar"><div class="sv-sus-fill" style="height:${susScores.length ? c * 100 / Math.max(...susDist, 1) : 0}%"></div><b>${c}</b><span>${binLab[i]}</span></div>`).join('')}</div>
      </div>
      <div class="stat-card an-block"><h3>😊 課程滿意度</h3><div class="an-table-wrap"><table class="data-table sv-table">${head}<tbody>${rows.length ? satRows : '<tr><td colspan="6" style="text-align:center;color:var(--text-light)">尚無資料</td></tr>'}</tbody></table></div></div>
      <div class="stat-card an-block"><h3>🎯 學習成效自評</h3><div class="an-table-wrap"><table class="data-table sv-table">${head}<tbody>${rows.length ? selfRows : '<tr><td colspan="6" style="text-align:center;color:var(--text-light)">尚無資料</td></tr>'}</tbody></table></div></div>
      <div class="stat-card an-block"><h3>🖥️ SUS 各題結果</h3><div class="an-table-wrap"><table class="data-table sv-table">${head}<tbody>${rows.length ? susRows : '<tr><td colspan="6" style="text-align:center;color:var(--text-light)">尚無資料</td></tr>'}</tbody></table></div></div>
      <div class="stat-card an-block"><h3>💬 開放式回饋</h3>${opens}</div>`;
    main.querySelectorAll('.an-chip').forEach(b => b.onclick = () => { svRole = b.dataset.role; renderSurveyResults(); });
    const cb = main.querySelector('#sv-cloud'); if (cb) cb.onclick = () => loadCloud(renderSurveyResults);
  }

  // ===== 載入雲端數據 =====
  async function loadCloud(after) {
    if (typeof Cloud === 'undefined' || !Cloud.isReady()) { toast('雲端登入尚未設定，請先完成 firebase-config.js 的設定', 'error'); return; }
    toast('正在載入雲端數據…');
    try {
      const r = await Cloud.adminLoadAll();
      toast(`已載入 ${r.count} 位雲端學員的資料（管理員：${r.admin}）`, 'success');
      if (after) after();
    } catch (e) { toast(e.message || '載入失敗', 'error'); }
  }

  // ===== 匯出：一份 Excel 包含所有數據 =====
  function buildAllSheets() {
    const meta = QUIZ_META();
    const emps = Data.getEmployees();
    const attempts = Data.getQuizAttempts().slice().sort((a, b) => (a.at || '').localeCompare(b.at || ''));
    const gameLogs = Data.getLogs().filter(l => l.type === 'game_opened');
    // 1. 學員總表
    const allCourses = [...Data.COURSES.new_employee, ...Data.COURSES.manager];
    const s1 = [['員工編號', '姓名', 'Email', '登入方式', '校內／校外', '身分類別', '部門', '教材', '完成單元數', '應完成單元數', '完成率(%)', '總學習時間(分)']
      .concat(allCourses.map(c => c.title + ' 分數'), ['總測驗分數', '總測驗通過', '開啟遊戲次數'])];
    emps.forEach(e => {
      const ov = Data.getEmployeeOverallProgress(e.empId);
      const study = (Data.COURSES[e.role] || []).reduce((a, c) => a + (Data.getProgress(e.empId, c.id).studySeconds || 0), 0);
      const fin = Data.getProgress(e.empId, 'final_' + e.role);
      s1.push([e.empId, e.name, e.email || '', e.provider || '員工編號', e.group || '', e.identity || '', e.dept || '', roleName(e.role), ov.completed, ov.total, ov.percent, Math.round(study / 6) / 10]
        .concat(allCourses.map(c => { const p = Data.getProgress(e.empId, c.id); return p.quizScore != null ? p.quizScore : ''; }),
          [fin.quizScore != null ? fin.quizScore : '', fin.quizScore != null ? (fin.quizScore >= 80 ? '是' : '否') : '', gameLogs.filter(l => l.empId === e.empId).length]));
    });
    // 2. 單元學習紀錄
    const s2 = [['員工編號', '姓名', '部門', '身分', '單元', '狀態', '影片已看完', '影片觀看秒數', '學習時間(分)', '最後測驗分數', '最後學習時間']];
    emps.forEach(e => (Data.COURSES[e.role] || []).forEach(c => {
      const p = Data.getProgress(e.empId, c.id);
      s2.push([e.empId, e.name, e.dept || '', roleName(e.role), c.title, p.completed ? '已完成' : (p.videoWatched || p.quizScore != null ? '進行中' : '未開始'),
        p.videoWatched ? '是' : '否', p.videoWatchedSeconds || 0, Math.round((p.studySeconds || 0) / 6) / 10, p.quizScore != null ? p.quizScore : '', p.lastAt || '']);
    }));
    // 3. 測驗作答紀錄（每次作答一列）
    const nth = {};
    const s3 = [['作答時間', '員工編號', '姓名', '身分', '測驗', '第幾次作答', '分數', '答對題數', '總題數']];
    const s4 = [['作答時間', '員工編號', '姓名', '測驗', '第幾次作答', '題號', '題目', '答對(1/0)']];
    attempts.forEach(a => {
      const e = emps.find(x => x.empId === a.empId) || {}, k = a.empId + '|' + a.quizId;
      nth[k] = (nth[k] || 0) + 1;
      const items = a.items || [];
      s3.push([a.at, a.empId, e.name || '', roleName(e.role), (meta[a.quizId] || {}).title || a.quizId, nth[k], a.score, items.filter(i => i.ok).length, items.length]);
      items.forEach((it, i) => s4.push([a.at, a.empId, e.name || '', (meta[a.quizId] || {}).title || a.quizId, nth[k], i + 1, it.q, it.ok ? 1 : 0]));
    });
    // 5. 題目分析
    const s5 = [['測驗', '題號', '題目', '作答人數（首次）', '答對率(%)', '建議']];
    Object.keys(meta).forEach(qid => {
      const t = emps.filter(e => e.role === meta[qid].role);
      itemAnalysis(qid, t).forEach(it => s5.push([meta[qid].title, it.no, it.q, it.n, it.p == null ? '' : Math.round(it.p), it.p == null ? '' : it.p < 50 ? '需檢視' : it.p > 90 ? '偏易' : '']));
    });
    // 6. 操作紀錄
    const s6 = [['時間', '員工編號', '姓名', '類型', '內容']];
    Data.getLogs().forEach(l => { const e = emps.find(x => x.empId === l.empId) || {}; s6.push([l.at, l.empId, e.name || '', typeLabel(l.type), l.detail || '']); });
    // 7. 滿意度問卷（每人一列）
    const SV = Data.SURVEY, svAll = Data.getAllSurveys();
    const likIds = []; SV.sections.forEach(sec => sec.items.forEach(it => likIds.push(it.id)));
    const s7 = [['員工編號', '姓名', '身分', '教材', '校內／校外', '填寫時間', '總測驗分數', '玩過遊戲']
      .concat(likIds, SV.sus.map((_, i) => 'SUS' + (i + 1)), ['SUS 分數', 'S1', 'S2', 'S3', 'S4'], SV.open.map(o => o.t))];
    Object.entries(svAll).forEach(([empId, r]) => {
      const e = emps.find(x => x.empId === empId) || {};
      s7.push([empId, e.name || '', e.identity || '', roleName(r.role), e.group || '', r.submittedAt || '', r.finalScore != null ? r.finalScore : '', r.playedGame ? '是' : '否']
        .concat(likIds.map(id => (r.answers || {})[id] != null ? r.answers[id] : ''), (r.sus || []).map(v => v == null ? '' : v),
          [r.susScore != null ? r.susScore : ''], ['S1', 'S2', 'S3', 'S4'].map(id => (r.answers || {})[id] != null ? r.answers[id] : ''), SV.open.map(o => (r.open || {})[o.id] || '')));
    });
    return [['學員總表', s1], ['單元學習紀錄', s2], ['測驗作答紀錄', s3], ['逐題作答明細', s4], ['題目分析', s5], ['操作紀錄', s6], ['滿意度問卷', s7]];
  }
  function downloadAllExcel() {
    const sheets = buildAllSheets();
    const date = new Date().toISOString().slice(0, 10);
    if (window.XLSX) {
      const wb = XLSX.utils.book_new();
      sheets.forEach(([name, rows]) => {
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = rows[0].map((h, i) => ({ wch: Math.min(40, Math.max(8, ...rows.slice(0, 200).map(r => String(r[i] == null ? '' : r[i]).length + 2))) }));
        XLSX.utils.book_append_sheet(wb, ws, name);
      });
      XLSX.writeFile(wb, `職場法律必修課_完整數據_${date}.xlsx`);
      toast('完整數據已下載', 'success');
    } else {
      // Excel 套件載入失敗時：改成每個工作表各下載一個 CSV
      sheets.forEach(([name, rows], i) => setTimeout(() => {
        const csv = '\uFEFF' + rows.map(r => r.map(v => { const t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join(',')).join('\n');
        Data.downloadFile(`${name}_${date}.csv`, csv);
      }, i * 400));
      toast('已改用 CSV 格式下載（共 ' + sheets.length + ' 個檔案）', 'success');
    }
  }

  // ===== 工具 =====
  function formatTime(iso) {
    if (!iso) return '-';
    const d = new Date(iso);
    return `${d.getFullYear()}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getDate().toString().padStart(2,'0')} ${d.getHours().toString().padStart(2,'0')}:${d.getMinutes().toString().padStart(2,'0')}`;
  }

  function typeLabel(t) {
    return ({
      login: '登入',
      logout: '登出',
      enter_course: '進入課程',
      video_play: '播放影片',
      video_pause: '暫停影片',
      video_seek: '影片跳轉',
      video_ended: '影片結束',
      video_watched: '影片達標',
      quiz_submitted: '送出測驗',
      course_completed: '完成課程',
      final_exam_submitted: '送出總測驗',
      game_opened: '開啟 3D 遊戲',
      summary_view: '查看重點整理',
      resources_view: '查看求助資源',
      survey_submitted: '填寫滿意度問卷'
    })[t] || t;
  }

  function formatSecAdmin(s) {
    s = Math.floor(s || 0);
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2,'0')}`;
  }

  // ===== 外部呼叫 =====
  function editEmp(id) { openEmpModal(Data.getEmployee(id)); }
  function saveVideoExt(id) { saveVideo(id); }
  function clearVideoExt(id) { clearVideo(id); }
  function toggleEmp(id) {
    const emp = Data.getEmployee(id);
    Data.updateEmployee(id, { active: !(emp.active !== false) });
    renderEmployees();
  }
  function deleteEmp(id) {
    if (confirm('確定刪除此員工?其學習紀錄一併刪除。')) {
      Data.deleteEmployee(id);
      toast('員工已刪除', 'success');
      renderEmployees();
    }
  }

  function deleteAnn(id) {
    if (confirm('確定刪除此公告?')) {
      Data.deleteAnnouncement(id);
      toast('公告已刪除', 'success');
      renderAnnouncements();
    }
  }

  function start() {
    bindLogin();
    if (Data.getCurrentAdmin()) enterAdmin();
  }

  return { start, editEmp, toggleEmp, deleteEmp, showDetail, saveVideo, clearVideo, deleteAnn };
})();

document.addEventListener('DOMContentLoaded', Admin.start);
