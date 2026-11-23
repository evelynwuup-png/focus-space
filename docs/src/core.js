const DEFAULT_DATE = '2026-11-21';

function uid(prefix = 'item') {
  const random = Math.random().toString(36).slice(2, 9);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createInitialState(date = DEFAULT_DATE) {
  return {
    schemaVersion: 1,
    workspace: {
      id: uid('space'),
      name: 'Focus Space',
      timezone: 'Asia/Shanghai',
      createdAt: date,
      updatedAt: date,
    },
    tasks: [],
    events: [],
    notes: [],
    memos: [],
    questions: [],
    review: {
      date,
      highlight: '',
      challenge: '',
      tomorrow: '',
      rating: 0,
    },
    activity: [],
  };
}

export function createTask(title, plannedDate = DEFAULT_DATE, options = {}) {
  return {
    id: uid('task'),
    title: title.trim(),
    plannedDate,
    status: options.status || 'pending',
    priority: options.priority || 'medium',
    project: options.project || '个人成长',
    dueAt: options.dueAt || null,
    createdAt: plannedDate,
    completedAt: null,
    tags: options.tags || [],
    description: options.description || '',
    deletedAt: null,
    version: 1,
  };
}

function withActivity(state, action, entityId, date) {
  return {
    ...state,
    activity: [
      ...(state.activity || []),
      { id: uid('activity'), action, entityId, occurredAt: date },
    ],
  };
}

export function toggleTask(state, taskId, date = DEFAULT_DATE) {
  const tasks = state.tasks.map((task) => {
    if (task.id !== taskId) return task;
    const completed = task.status !== 'completed';
    return {
      ...task,
      status: completed ? 'completed' : 'pending',
      completedAt: completed ? date : null,
    };
  });
  return withActivity({ ...state, tasks }, 'task_toggled', taskId, date);
}

export function addNote(state, title, body, date = DEFAULT_DATE) {
  const note = {
    id: uid('note'),
    title: title.trim(),
    body: body.trim(),
    recordedAt: date,
    createdAt: date,
    updatedAt: date,
    deletedAt: null,
    version: 1,
  };
  return withActivity({ ...state, notes: [note, ...state.notes] }, 'note_created', note.id, date);
}

export function addMemo(state, body, date = DEFAULT_DATE) {
  const memo = { id: uid('memo'), title: body.trim().slice(0, 36), body: body.trim(), createdAt: date, updatedAt: date, deletedAt: null, version: 1 };
  return withActivity({ ...state, memos: [memo, ...(state.memos || [])] }, 'memo_created', memo.id, date);
}

export function updateEntity(state, collection, entityId, changes, date = DEFAULT_DATE) {
  if (!['tasks', 'notes', 'memos', 'questions', 'events'].includes(collection)) return state;
  const updated = (state[collection] || []).map((item) => item.id === entityId ? { ...item, ...changes, updatedAt: date, version: (item.version || 1) + 1 } : item);
  return withActivity({ ...state, [collection]: updated }, `${collection.slice(0, -1)}_updated`, entityId, date);
}

export function moveToTrash(state, collection, entityId, date = DEFAULT_DATE) {
  if (!['tasks', 'notes', 'memos', 'questions', 'events'].includes(collection)) return state;
  const updated = (state[collection] || []).map((item) => item.id === entityId ? { ...item, deletedAt: date, deleteBatchId: uid('delete'), updatedAt: date } : item);
  return withActivity({ ...state, [collection]: updated }, `${collection.slice(0, -1)}_deleted`, entityId, date);
}

export function restoreFromTrash(state, collection, entityId, date = DEFAULT_DATE) {
  if (!['tasks', 'notes', 'memos', 'questions', 'events'].includes(collection)) return state;
  const updated = (state[collection] || []).map((item) => item.id === entityId ? { ...item, deletedAt: null, restoredAt: date, updatedAt: date } : item);
  return withActivity({ ...state, [collection]: updated }, `${collection.slice(0, -1)}_restored`, entityId, date);
}

export function permanentlyDelete(state, collection, entityId, date = DEFAULT_DATE) {
  if (!['tasks', 'notes', 'memos', 'questions', 'events'].includes(collection)) return state;
  return withActivity({ ...state, [collection]: (state[collection] || []).filter((item) => item.id !== entityId) }, `${collection.slice(0, -1)}_purged`, entityId, date);
}

export function addQuestion(state, title, description, date = DEFAULT_DATE) {
  const question = {
    id: uid('question'),
    title: title.trim(),
    description: description.trim(),
    status: 'open',
    createdAt: date,
    updatedAt: date,
  };
  return withActivity({ ...state, questions: [question, ...state.questions] }, 'question_created', question.id, date);
}

export function updateReview(state, review, date = DEFAULT_DATE) {
  return {
    ...state,
    review: { ...state.review, ...review, date },
    workspace: { ...state.workspace, updatedAt: date },
  };
}

function isDueSoon(task, selectedDate) {
  if (!task.dueAt || task.status === 'completed' || task.status === 'cancelled') return false;
  return task.dueAt.slice(0, 10) >= selectedDate;
}

export function getDashboardStats(state, selectedDate = DEFAULT_DATE) {
  const dayTasks = state.tasks.filter(
    (task) => !task.deletedAt && task.plannedDate === selectedDate && task.status !== 'cancelled',
  );
  const completed = dayTasks.filter((task) => task.status === 'completed').length;
  const dueSoon = state.tasks.filter((task) => !task.deletedAt && isDueSoon(task, selectedDate)).length;
  return {
    total: dayTasks.length,
    completed,
    completionRate: dayTasks.length ? Math.round((completed / dayTasks.length) * 100) : 0,
    dueSoon,
  };
}

export function exportBackup(state) {
  return JSON.stringify(
    {
      format: 'focus-space-backup',
      formatVersion: 1,
      exportedAt: new Date().toISOString(),
      data: clone(state),
    },
    null,
    2,
  );
}

export function importBackup(serialized) {
  let parsed;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new Error('备份文件格式无效');
  }
  const data = parsed?.data || parsed;
  if (
    !data ||
    !Array.isArray(data.tasks) ||
    !Array.isArray(data.events) ||
    !Array.isArray(data.notes) ||
    (data.memos !== undefined && !Array.isArray(data.memos)) ||
    !Array.isArray(data.questions) ||
    !data.review ||
    typeof data.review !== 'object'
  ) {
    throw new Error('备份文件格式无效');
  }
  return {
    ...createInitialState(data.review.date || DEFAULT_DATE),
    ...clone(data),
    memos: clone(data.memos || []),
    schemaVersion: 1,
  };
}
