import {
  addNote,
  addQuestion,
  createInitialState,
  createTask,
  exportBackup,
  getDashboardStats,
  importBackup,
  toggleTask,
  updateReview,
} from './core.js';
import { pullCloudState, pushCloudState } from './cloud-sync.js';

const STORAGE_KEY = 'focus-space-state-v1';
const TODAY = '2026-11-21';
const pageLabels = {
  dashboard: '总览',
  tasks: '任务中心',
  calendar: '日历中心',
  knowledge: '知识库',
  questions: '问题库',
  review: '复盘中心',
  history: '历史档案',
  settings: '设置与数据',
};

let currentView = 'dashboard';
let taskFilter = 'all';
let state = loadState();
let toastTimer;
let cloudSyncTimer;
let cloudSyncBusy = false;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  }[character]));
}

function demoState() {
  const base = createInitialState(TODAY);
  const tasks = [
    createTask('完成本周增长数据复盘', TODAY, { priority: 'high', project: '工作', status: 'completed' }),
    createTask('整理用户访谈记录', TODAY, { priority: 'medium', project: '工作', status: 'completed' }),
    createTask('学习 React Server Components', TODAY, { priority: 'high', project: '学习', status: 'in_progress' }),
    createTask('更新作品集首页文案', TODAY, { priority: 'medium', project: '个人项目', status: 'completed' }),
    createTask('阅读《设计心理学》第二章', TODAY, { priority: 'low', project: '学习', status: 'completed' }),
    createTask('准备下周一的分享提纲', TODAY, { priority: 'high', project: '工作', status: 'pending', dueAt: '2026-11-23T18:00:00' }),
    createTask('整理季度目标', '2026-11-23', { priority: 'medium', project: '个人成长', dueAt: '2026-11-25T18:00:00' }),
    createTask('更新投资组合说明', '2026-11-25', { priority: 'low', project: '个人项目', dueAt: '2026-11-27T18:00:00' }),
  ];
  tasks.forEach((task) => {
    if (task.status === 'completed') task.completedAt = TODAY;
  });
  base.tasks = tasks;
  base.events = [
    { id: 'event-1', title: '深度工作：产品方案', startAt: '2026-11-21T09:30:00', endAt: '2026-11-21T11:30:00', type: 'focus' },
    { id: 'event-2', title: '团队同步会', startAt: '2026-11-21T14:00:00', endAt: '2026-11-21T14:45:00', type: 'meeting' },
    { id: 'event-3', title: '晚间阅读', startAt: '2026-11-21T20:30:00', endAt: '2026-11-21T21:00:00', type: 'personal' },
  ];
  base.notes = [
    { id: 'note-1', title: '好的复盘应该先看事实', body: '先记录做了什么，再记录感受与判断。把事实和解释分开，复盘会更诚实。', recordedAt: TODAY, createdAt: TODAY, updatedAt: TODAY },
    { id: 'note-2', title: '让任务拥有明确的完成线', body: '任务不是“推进一下”，而是要能在结束时判断完成或未完成。', recordedAt: TODAY, createdAt: TODAY, updatedAt: TODAY },
  ];
  base.questions = [
    { id: 'question-1', title: '如何让每周复盘更接近真实产出？', description: '尝试同时记录结果、投入时间和未完成原因。', status: 'open', createdAt: TODAY, updatedAt: TODAY },
    { id: 'question-2', title: '怎样减少计划被临时事项打断？', description: '需要观察临时任务的来源和重复模式。', status: 'researching', createdAt: TODAY, updatedAt: TODAY },
    { id: 'question-3', title: '什么时候适合把任务拆成时间块？', description: '复杂任务需要在日历中预留明确的开始与结束时间。', status: 'open', createdAt: TODAY, updatedAt: TODAY },
  ];
  base.review = { date: TODAY, highlight: '今天完成了增长数据复盘，并把下周分享的准备拆成了可执行的小任务。', challenge: '', tomorrow: '', rating: 4 };
  return base;
}

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? importBackup(saved) : demoState();
  } catch {
    return demoState();
  }
}

function setCloudStatus(title, subtitle) {
  const card = document.querySelector('.sync-card');
  if (!card) return;
  const strong = card.querySelector('strong');
  const span = card.querySelector('span:not(.online-dot)');
  if (strong) strong.textContent = title;
  if (span) span.textContent = subtitle;
}

function persist(message = '已保存到本地') {
  localStorage.setItem(STORAGE_KEY, exportBackup(state));
  $('#lastSaved').textContent = '刚刚保存';
  setCloudStatus('本地已保存', '仅保存在此设备');
  if (message) showToast(message);
}

function queueCloudSync() {
  clearTimeout(cloudSyncTimer);
  setCloudStatus('等待同步', '本地记录已保存');
  cloudSyncTimer = setTimeout(() => syncToCloud(false), 550);
}

async function syncToCloud(showMessage = true) {
  if (cloudSyncBusy) return;
  cloudSyncBusy = true;
  setCloudStatus('正在同步', '连接云端工作区…');
  try {
    const result = await pushCloudState(state);
    if (result.status === 'synced') {
      setCloudStatus('云端已同步', '所有设备可访问');
      if (showMessage) showToast('已同步到云端');
    } else {
      setCloudStatus('仅本机保存', '登录后可开启云同步');
      if (showMessage) showToast('当前未连接云端，数据已保存在本机');
    }
  } catch {
    setCloudStatus('仅本机保存', '网络恢复后会继续同步');
    if (showMessage) showToast('云端暂时不可用，已保留本地记录');
  } finally {
    cloudSyncBusy = false;
  }
}

async function initializeCloudSync() {
  setCloudStatus('连接云端', '正在检查工作区…');
  try {
    const result = await pullCloudState();
    if (result.status === 'synced') {
      state = result.state;
      localStorage.setItem(STORAGE_KEY, exportBackup(state));
      setCloudStatus('云端已同步', '所有设备可访问');
      render();
    } else if (result.status === 'empty') {
      await syncToCloud(false);
    } else {
      setCloudStatus('仅本机保存', '登录后可开启云同步');
    }
  } catch {
    setCloudStatus('仅本机保存', '网络恢复后会继续同步');
  }
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function formatDate(dateString) {
  const date = new Date(`${dateString}T12:00:00`);
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatDay(dateString) {
  return new Date(`${dateString}T12:00:00`).getDate();
}

function dayLabel(dateString) {
  return ['日', '一', '二', '三', '四', '五', '六'][new Date(`${dateString}T12:00:00`).getDay()];
}

function statusLabel(status) {
  return ({ pending: '待开始', in_progress: '进行中', completed: '已完成', cancelled: '已取消' }[status] || status);
}

function priorityLabel(priority) {
  return ({ high: '高优先级', medium: '中优先级', low: '低优先级' }[priority] || priority);
}

function isOverdue(task) {
  return task.status !== 'completed' && task.status !== 'cancelled' && task.dueAt && task.dueAt.slice(0, 10) < TODAY;
}

function render() {
  $('#pageTitle').textContent = pageLabels[currentView];
  $$('.nav-item[data-view]').forEach((item) => item.classList.toggle('active', item.dataset.view === currentView));
  $('#dashboardView').hidden = currentView !== 'dashboard';
  $('#subview').hidden = currentView === 'dashboard';
  if (currentView === 'dashboard') renderDashboard();
  else renderSubview();
}

function renderDashboard() {
  const stats = getDashboardStats(state, TODAY);
  $('#statCompleted').textContent = stats.completed;
  $('#statTotal').textContent = stats.total;
  $('#statRate').textContent = `${stats.completionRate}% 完成`;
  $('#statProgress').style.width = `${stats.completionRate}%`;
  $('#statQuestions').textContent = state.questions.filter((item) => item.status !== 'resolved').length;
  $('#navQuestionCount').textContent = state.questions.filter((item) => item.status !== 'resolved').length;
  $('#navTaskCount').textContent = state.tasks.filter((item) => item.status !== 'completed' && item.status !== 'cancelled').length;
  $('#allTaskCount').textContent = state.tasks.filter((item) => item.plannedDate === TODAY && item.status !== 'cancelled').length;
  $('#pendingTaskCount').textContent = state.tasks.filter((item) => item.plannedDate === TODAY && item.status !== 'completed' && item.status !== 'cancelled').length;
  $('#completedTaskCount').textContent = stats.completed;
  $('#noteCount').textContent = `${state.notes.filter((item) => item.recordedAt === TODAY).length} 条新笔记`;
  $('#questionCount').textContent = `${state.questions.filter((item) => item.status !== 'resolved').length} 个待解决问题`;
  $('#reviewHighlight').value = state.review.highlight || '';
  renderTasks();
  renderDueSoon();
  renderTimeline();
  renderDateStrip();
  renderRating();
}

function renderTasks() {
  const todayTasks = state.tasks.filter((task) => task.plannedDate === TODAY && task.status !== 'cancelled');
  const filtered = todayTasks.filter((task) => taskFilter === 'all' || (taskFilter === 'completed' ? task.status === 'completed' : task.status !== 'completed'));
  $('#taskList').innerHTML = filtered.length ? filtered.map((task) => taskMarkup(task)).join('') : '<div class="list-empty"><div><strong>这一栏暂时空了</strong>可以添加一项新的任务。</div></div>';
  $$('.task-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.taskFilter === taskFilter));
}

function taskMarkup(task) {
  const overdue = isOverdue(task);
  return `<div class="task-item">
    <input class="task-check" type="checkbox" data-task-id="${task.id}" ${task.status === 'completed' ? 'checked' : ''} aria-label="完成 ${escapeHTML(task.title)}" />
    <div class="task-content"><div class="task-title ${task.status === 'completed' ? 'completed' : ''}">${escapeHTML(task.title)}</div><div class="task-meta"><span class="priority-dot ${task.priority}"></span><span>${escapeHTML(priorityLabel(task.priority))}</span><span>·</span><span class="task-project">${escapeHTML(task.project)}</span></div></div>
    <span class="task-status ${overdue ? 'overdue' : task.status}">${overdue ? '已逾期' : statusLabel(task.status)}</span>
  </div>`;
}

function renderDueSoon() {
  const upcoming = state.tasks.filter((task) => task.dueAt && task.status !== 'completed' && task.status !== 'cancelled').sort((a, b) => a.dueAt.localeCompare(b.dueAt)).slice(0, 3);
  $('#dueCount').textContent = `${upcoming.length} 项`;
  $('#dueList').innerHTML = upcoming.length ? upcoming.map((task) => {
    const dueDate = task.dueAt.slice(0, 10);
    return `<div class="due-item"><div class="due-date"><strong>${formatDay(dueDate)}</strong><span>${dayLabel(dueDate)}</span></div><div class="due-copy"><strong>${escapeHTML(task.title)}</strong><span>${formatDate(dueDate)} · ${escapeHTML(task.project)}</span></div></div>`;
  }).join('') : '<div class="list-empty"><div>未来 7 天没有到期任务。</div></div>';
}

function renderDateStrip() {
  const dates = ['2026-11-19', '2026-11-20', TODAY, '2026-11-22', '2026-11-23', '2026-11-24'];
  $('#dateStrip').innerHTML = dates.map((date) => `<div class="date-pill ${date === TODAY ? 'today' : ''}"><strong>${formatDay(date)}</strong><span>周${dayLabel(date)}</span></div>`).join('');
}

function renderTimeline() {
  $('#timelineList').innerHTML = state.events.filter((event) => event.startAt.slice(0, 10) === TODAY).map((event) => {
    const time = event.startAt.slice(11, 16);
    return `<div class="timeline-row"><div class="timeline-time">${time}</div><div class="timeline-line"></div><div class="timeline-entry"><strong>${escapeHTML(event.title)}</strong><span>${event.endAt.slice(11, 16)} 结束 · ${event.type === 'meeting' ? '同步交流' : '专注安排'}</span></div></div>`;
  }).join('');
}

function renderRating() {
  $$('#ratingControl button').forEach((button) => button.classList.toggle('selected', Number(button.dataset.rating) <= (state.review.rating || 0)));
}

function renderSubview() {
  const title = pageLabels[currentView];
  const descriptions = {
    tasks: '把复杂的事情拆小，保持下一步清晰。', calendar: '让时间安排服务于真正重要的事情。', knowledge: '把今天的发现，变成以后可以复用的经验。', questions: '好问题值得被持续追踪，而不是被遗忘。', review: '用事实回看这一段时间，再决定下一步。', history: '你的完成记录、思考和成长轨迹。', settings: '数据属于你，也应该随时可带走。',
  };
  const action = currentView === 'tasks' ? '<button class="button button-primary" data-action="new-task">＋ 新建任务</button>' : currentView === 'knowledge' ? '<button class="button button-primary" data-action="new-note">＋ 记录知识</button>' : currentView === 'questions' ? '<button class="button button-primary" data-action="new-question">＋ 记录问题</button>' : '';
  $('#subview').innerHTML = `<div class="subview-header"><div><div class="eyebrow">FOCUS SPACE / ${title.toUpperCase()}</div><h1>${title}</h1><p>${descriptions[currentView]}</p></div><div class="subview-actions">${action}</div></div>${viewMarkup(currentView)}`;
}

function viewMarkup(view) {
  if (view === 'tasks') {
    const tasks = state.tasks.filter((task) => task.status !== 'cancelled');
    return `<div class="subview-grid"><section class="panel wide-panel"><div class="list-header"><button class="view-filter">全部项目⌄</button><button class="view-filter">按日期排序⌄</button></div><div class="task-list" style="margin-top:8px">${tasks.map(taskMarkup).join('')}</div></section><section class="panel"><div class="panel-heading compact"><div><h2>任务节奏</h2><p>保持稳定比一次完成更多更重要</p></div></div><div class="review-summary"><div class="review-date">本周完成率</div><h3 style="font-size:32px;margin-top:8px;color:var(--primary-strong)">78%</h3><p>你正在保持不错的推进节奏，优先完成高优先级任务。</p></div></section></div>`;
  }
  if (view === 'calendar') return `<section class="panel calendar-board"><div class="calendar-head"><div><h2>2026 年 11 月</h2><p style="margin-top:5px;color:var(--muted);font-size:11px">周六，11 月 21 日</p></div><div class="calendar-nav"><button>‹</button><button>›</button></div></div><div class="calendar-grid">${calendarCells()}</div></section>`;
  if (view === 'knowledge') return `<div class="note-grid">${state.notes.map((note) => `<article class="note-card"><span class="tag-chip">学习记录</span><h3 style="margin-top:13px">${escapeHTML(note.title)}</h3><p>${escapeHTML(note.body)}</p><div class="note-meta"><span>${formatDate(note.recordedAt)}</span><span>已保存</span></div></article>`).join('')}</div>`;
  if (view === 'questions') return `<section class="panel"><div class="question-list">${state.questions.map((question) => `<article class="question-card"><div class="question-mark">?</div><div style="min-width:0;flex:1"><h3>${escapeHTML(question.title)}</h3><p>${escapeHTML(question.description)}</p></div><span class="status-pill">${question.status === 'researching' ? '研究中' : '待解决'}</span></article>`).join('')}</div></section>`;
  if (view === 'review') return `<div class="review-list"><section class="panel review-summary"><div class="review-date">每日复盘 · ${formatDate(TODAY)}</div><h3 style="margin-top:9px">今天最重要的成果</h3><p>${escapeHTML(state.review.highlight || '还没有写下今天的成果。')}</p></section><section class="panel review-summary"><div class="review-date">本周复盘</div><h3 style="margin-top:9px">保持清晰，也保持弹性</h3><p>本周完成率 78%，完成 18 项任务，新增 6 条知识笔记，解决 2 个问题。</p></section></div>`;
  if (view === 'history') return `<div class="subview-grid"><section class="panel wide-panel"><div class="panel-heading"><div><h2>最近活动</h2><p>你的工作轨迹会留在这里</p></div></div><div class="timeline">${(state.activity || []).slice(-6).reverse().map((item) => `<div class="timeline-row"><div class="timeline-time">${item.occurredAt.slice(5)}</div><div class="timeline-line"></div><div class="timeline-entry"><strong>${item.action === 'task_toggled' ? '更新了一项任务' : item.action === 'note_created' ? '记录了一条知识' : '记录了一个问题'}</strong><span>本地保存 · ${item.entityId}</span></div></div>`).join('') || '<div class="list-empty">还没有活动记录。</div>'}</div></section><section class="panel"><div class="panel-heading compact"><div><h2>长期积累</h2><p>把注意力放回过程</p></div></div><div class="review-summary"><h3>数据总览</h3><p>任务 ${state.tasks.length} 项 · 笔记 ${state.notes.length} 条 · 问题 ${state.questions.length} 个</p></div></section></div>`;
  return `<div class="settings-grid"><section class="panel settings-card"><h2>本地数据</h2><p>这是一个公开的个人工作台，每台设备独立保存自己的记录。需要迁移到其他电脑时，请先导出完整备份，再在新设备导入。</p><div class="settings-actions"><button class="button button-primary" data-action="export">导出完整备份</button><button class="button button-secondary" data-action="import">导入备份</button></div></section><section class="panel settings-card"><h2>工作区偏好</h2><p>当前使用浅蓝与白色主题，适合长时间浏览和记录。此公开版本不要求登录，也不会自动上传你的个人记录。</p><div class="settings-actions"><button class="outline-button" style="width:auto;padding:0 12px">浅蓝白主题 · 已启用</button></div></section></div>`;
}

function calendarCells() {
  const days = Array.from({ length: 30 }, (_, index) => index + 1);
  return ['一', '二', '三', '四', '五', '六', '日'].map((day) => `<div class="calendar-cell muted" style="min-height:32px;padding:9px 8px;color:var(--muted);font-size:9px;font-weight:700">${day}</div>`).join('') + days.map((day) => {
    const current = day === 21;
    const event = day === 21 ? '<div class="calendar-event">今日 · 6 项任务</div>' : day === 23 ? '<div class="calendar-event">分享准备</div>' : '';
    return `<div class="calendar-cell ${current ? 'today' : ''}"><strong>${day}</strong>${event}</div>`;
  }).join('');
}

function openComposer(type) {
  const configs = {
    task: { eyebrow: '快速安排', title: '新建任务', fields: `<div class="form-field"><label for="composerTitle">任务名称</label><input id="composerTitle" name="title" required placeholder="例如：整理本周广告数据" /></div><div class="form-row"><div class="form-field"><label for="composerDate">计划日期</label><input id="composerDate" name="date" type="date" value="${TODAY}" required /></div><div class="form-field"><label for="composerPriority">优先级</label><select id="composerPriority" name="priority"><option value="high">高优先级</option><option value="medium" selected>中优先级</option><option value="low">低优先级</option></select></div></div><div class="form-field"><label for="composerProject">所属项目</label><input id="composerProject" name="project" value="个人成长" /></div>`, submit: '保存任务' },
    note: { eyebrow: '知识积累', title: '记录一条新知识', fields: `<div class="form-field"><label for="composerTitle">标题</label><input id="composerTitle" name="title" required placeholder="今天学到了什么？" /></div><div class="form-field"><label for="composerBody">内容</label><textarea id="composerBody" name="body" required placeholder="写下可以在未来复用的内容…"></textarea></div>`, submit: '保存笔记' },
    question: { eyebrow: '保持好奇', title: '记录一个问题', fields: `<div class="form-field"><label for="composerTitle">问题</label><input id="composerTitle" name="title" required placeholder="什么事情还没有想明白？" /></div><div class="form-field"><label for="composerBody">当前想法</label><textarea id="composerBody" name="body" placeholder="记录当前的假设、线索或下一步…"></textarea></div>`, submit: '保存问题' },
  };
  const config = configs[type];
  $('#modalEyebrow').textContent = config.eyebrow;
  $('#modalTitle').textContent = config.title;
  $('#composerForm').innerHTML = `${config.fields}<input type="hidden" name="type" value="${type}" /><div class="form-actions"><button type="button" class="button button-secondary" id="cancelComposer">取消</button><button class="button button-primary" type="submit">${config.submit}</button></div>`;
  $('#modalBackdrop').hidden = false;
  $('#composerTitle').focus();
}

function closeComposer() { $('#modalBackdrop').hidden = true; }

function submitComposer(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const type = formData.get('type');
  if (type === 'task') state = { ...state, tasks: [createTask(formData.get('title'), formData.get('date'), { priority: formData.get('priority'), project: formData.get('project') }), ...state.tasks] };
  if (type === 'note') state = addNote(state, formData.get('title'), formData.get('body'), TODAY);
  if (type === 'question') state = addQuestion(state, formData.get('title'), formData.get('body'), TODAY);
  closeComposer();
  persist(type === 'task' ? '任务已创建' : type === 'note' ? '知识已保存' : '问题已记录');
  render();
}

function exportData() {
  const blob = new Blob([exportBackup(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `focus-space-backup-${TODAY}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
  showToast('完整备份已导出');
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = importBackup(reader.result);
      persist('备份已导入');
      render();
    } catch (error) {
      showToast(error.message || '备份导入失败');
    }
  };
  reader.readAsText(file);
}

document.addEventListener('click', (event) => {
  const viewButton = event.target.closest('[data-view]');
  const viewLink = event.target.closest('[data-view-link]');
  const action = event.target.closest('[data-action]')?.dataset.action;
  if (viewButton) { currentView = viewButton.dataset.view; render(); return; }
  if (viewLink) { currentView = viewLink.dataset.viewLink; render(); return; }
  if (action === 'new-task') { openComposer('task'); return; }
  if (action === 'new-note') { openComposer('note'); return; }
  if (action === 'new-question') { openComposer('question'); return; }
  if (action === 'open-review') { $('#reviewHighlight').focus(); return; }
  if (action === 'import') { $('#backupInput').click(); return; }
  if (action === 'export') { exportData(); return; }
  if (action === 'sync') { syncToCloud(true); return; }
  const taskTab = event.target.closest('[data-task-filter]');
  if (taskTab) { taskFilter = taskTab.dataset.taskFilter; renderTasks(); return; }
  const rating = event.target.closest('[data-rating]');
  if (rating) { state = updateReview(state, { rating: Number(rating.dataset.rating) }, TODAY); renderRating(); persist(null); return; }
  if (event.target.closest('#closeModal') || event.target.closest('#cancelComposer')) closeComposer();
});

document.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-task-id]');
  if (!checkbox) return;
  state = toggleTask(state, checkbox.dataset.taskId, TODAY);
  persist(checkbox.checked ? '任务已完成' : '任务已恢复');
  render();
});

$('#composerForm').addEventListener('submit', submitComposer);
$('#exportButton').addEventListener('click', exportData);
$('#importButton').addEventListener('click', () => $('#backupInput').click());
$('#backupInput').addEventListener('change', (event) => { if (event.target.files[0]) importData(event.target.files[0]); event.target.value = ''; });
$('#closeModal').addEventListener('click', closeComposer);
$('#modalBackdrop').addEventListener('click', (event) => { if (event.target.id === 'modalBackdrop') closeComposer(); });
$('#saveReview').addEventListener('click', () => { state = updateReview(state, { highlight: $('#reviewHighlight').value }, TODAY); persist('今日复盘已保存'); render(); });
$('#globalSearch').addEventListener('input', (event) => {
  const query = event.target.value.trim().toLowerCase();
  if (!query) { if (currentView !== 'dashboard') { currentView = 'dashboard'; render(); } return; }
  currentView = 'tasks';
  renderSubview();
  const filtered = state.tasks.filter((task) => task.title.toLowerCase().includes(query));
  const list = $('#subview .task-list');
  if (list) list.innerHTML = filtered.length ? filtered.map(taskMarkup).join('') : '<div class="list-empty"><div><strong>没有找到匹配内容</strong>换个关键词试试看。</div></div>';
});

render();
