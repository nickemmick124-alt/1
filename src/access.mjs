export function hostEmail(value) {
  if (typeof value !== 'string') return null;
  const email=value.trim().toLowerCase();
  if (email.length>254 || /[\u0000-\u001f\u007f]/.test(email) || !/^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$/.test(email)) return null;
  return email;
}

export async function isApprovedHost(user, env) {
  const email=hostEmail(user?.email);
  if (!user?.id || !email) return false;
  if (!env.DB) throw new Error('Host access storage unavailable');
  return !!await env.DB.prepare('SELECT email FROM host_access WHERE email = ?').bind(email).first();
}
