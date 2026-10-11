const GUEST_COOKIE = '__Host-cnh_guest';
const GUEST_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const guestHex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
async function guestTokenHash(token) {
  return guestHex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))));
}
export async function guestIdentity(request, env, now) {
  const cookies = (request.headers.get('cookie') || '').split(';').map(part => part.trim()).filter(part => part.startsWith(GUEST_COOKIE + '='));
  if (cookies.length !== 1) return null;
  const token = cookies[0].slice(GUEST_COOKIE.length + 1);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const hash = await guestTokenHash(token);
  const session = await env.DB.prepare('SELECT user_id, display_name FROM guest_sessions WHERE token_hash = ? AND expires_at > ?').bind(hash, now).first();
  return session ? { id: session.user_id, name: session.display_name, email: '', isGuest: true } : null;
}
export async function createGuest(env, name, now) {
  const token = guestHex(crypto.getRandomValues(new Uint8Array(32))), id = 'guest:' + crypto.randomUUID();
  await env.DB.prepare('DELETE FROM guest_sessions WHERE expires_at <= ?').bind(now).run();
  await env.DB.prepare('INSERT INTO guest_sessions (token_hash, user_id, display_name, created_at, expires_at) VALUES (?, ?, ?, ?, ?)').bind(await guestTokenHash(token), id, name, now, now + GUEST_LIFETIME_MS).run();
  return { identity: { id, name, email: '', isGuest: true }, cookie: `${GUEST_COOKIE}=${token}; Path=/; Secure; HttpOnly; SameSite=Lax; Max-Age=${GUEST_LIFETIME_MS / 1000}` };
}
