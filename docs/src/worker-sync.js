import { importBackup } from './core.js';

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function identityFrom(request) {
  const id = request.headers.get('oai-authenticated-user-id');
  const email = request.headers.get('oai-authenticated-user-email');
  return id ? { id, email } : null;
}

export async function handleStateRequest(request, env) {
  const identity = identityFrom(request);
  if (!identity) return json({ error: 'unauthorized' }, 401);
  if (!env?.DB) return json({ error: 'database_unavailable' }, 503);

  if (request.method === 'GET') {
    const row = await env.DB
      .prepare('SELECT state_json, updated_at FROM workspace_state WHERE user_id = ?1')
      .bind(identity.id)
      .first();
    if (!row) return json({ error: 'not_found' }, 404);
    return json({ backup: JSON.parse(row.state_json), updatedAt: row.updated_at });
  }

  if (request.method === 'PUT') {
    const payload = await request.json();
    const serialized = JSON.stringify(payload);
    importBackup(serialized);
    const updatedAt = new Date().toISOString();
    await env.DB
      .prepare(`INSERT INTO workspace_state (user_id, user_email, state_json, updated_at)
        VALUES (?1, ?2, ?3, ?4)
        ON CONFLICT(user_id) DO UPDATE SET
          user_email = excluded.user_email,
          state_json = excluded.state_json,
          updated_at = excluded.updated_at`)
      .bind(identity.id, identity.email || '', serialized, updatedAt)
      .run();
    return json({ status: 'synced', updatedAt });
  }

  return json({ error: 'method_not_allowed' }, 405);
}
