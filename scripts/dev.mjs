import { createServer } from 'node:http';
import { mkdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { openDatabase } from './local-db.mjs';
execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'inherit' });
const { default: worker } = await import('../dist/server/index.js');
mkdirSync('.local', { recursive: true });
const local = openDatabase('.local/results.sqlite');
const port = Number(process.env.PORT || 5173);
const owner = process.env.LOCAL_OWNER_EMAIL || 'owner@finance.test';
const server = createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url, `http://127.0.0.1:${port}`);
    const headers = new Headers(incoming.headers);
    // Local sign-in simulation is isolated to this development server.
    const signedIn = /(?:^|; )finance_local_auth=1(?:;|$)/.test(headers.get('cookie') || '');
    headers.delete('oai-authenticated-user-id'); headers.delete('oai-authenticated-user-email');
    if (url.pathname === '/signin-with-chatgpt') { const role = ['player1', 'player2', 'player3'].includes(url.searchParams.get('as')) ? url.searchParams.get('as') : 'owner'; outgoing.writeHead(302, { 'location': url.searchParams.get('return_to')?.startsWith('/') && !url.searchParams.get('return_to').startsWith('//') ? url.searchParams.get('return_to') : '/', 'set-cookie': ['finance_local_auth=1; Path=/; HttpOnly; SameSite=Lax', `finance_local_role=${role}; Path=/; HttpOnly; SameSite=Lax`] }); outgoing.end(); return; }
    if (signedIn) { const role = (headers.get('cookie') || '').match(/finance_local_role=(player[123])/); const who = role ? role[1] : 'owner'; headers.set('oai-authenticated-user-id', 'local-' + who); headers.set('oai-authenticated-user-email', who === 'owner' ? owner : who + '@finance.test'); headers.set('oai-authenticated-user-full-name', who === 'owner' ? 'Local Owner' : 'Local ' + who); }
    let body = ''; for await (const chunk of incoming) body += chunk;
    const request = new Request(url, { method: incoming.method, headers, ...(incoming.method === 'GET' || incoming.method === 'HEAD' ? {} : { body }) });
    const response = await worker.fetch(request, { DB: local.DB, OWNER_EMAIL: owner });
    outgoing.writeHead(response.status, Object.fromEntries(response.headers)); outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (e) { console.error(e); outgoing.writeHead(500); outgoing.end('Local server error'); }
});
server.listen(port, '127.0.0.1', () => console.log(`Local: http://127.0.0.1:${port}`));
process.on('SIGINT', () => { server.close(); local.close(); process.exit(0); });
