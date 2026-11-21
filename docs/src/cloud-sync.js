import { exportBackup, importBackup } from './core.js';

const defaultFetcher = (...args) => fetch(...args);

export async function pullCloudState(fetcher = defaultFetcher) {
  const response = await fetcher('/api/state', { headers: { accept: 'application/json' } });
  if (response.status === 404) return { status: 'empty' };
  if (response.status === 401) return { status: 'unauthorized' };
  if (!response.ok) throw new Error('云端读取失败');
  const body = await response.json();
  const state = importBackup(body.backup);
  return { status: 'synced', state, updatedAt: body.updatedAt || null };
}

export async function pushCloudState(state, fetcher = defaultFetcher) {
  const response = await fetcher('/api/state', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: exportBackup(state),
  });
  if (response.status === 401) return { status: 'unauthorized' };
  if (!response.ok) throw new Error('云端保存失败');
  const body = await response.json();
  return { status: 'synced', updatedAt: body.updatedAt || null };
}
