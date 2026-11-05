// Smoke test for an installed release, e.g. in a sub folder on PHP 8.0 / MariaDB:
//   node scripts/smoke-release.mjs http://host/folder username password
import { createHmac } from 'node:crypto';
const [B, username, password] = process.argv.slice(2);
let failed = 0;
const ok = (n, c, x = '') => { if (!c) failed++; console.log(`${c ? '  ok ' : 'FAIL '} ${n}${c ? '' : ' ' + x}`); };
const j = async (method, path, { token, launch, body } = {}) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (launch) headers['X-Launch-Token'] = launch;
  const r = await fetch(`${B}${path}`, { method, headers, body: body && JSON.stringify(body) });
  const text = await r.text(); let json = {}; try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text };
};
const html = await (await fetch(`${B}/login`)).text();
ok('app served with rewritten base href', new URL(B).pathname === '/' ? true : html.includes(`<base href="${new URL(B).pathname}/">`), html.slice(0, 200));
const js = html.match(/src="(main-[^"]+)"/)?.[1];
ok('bundle is reachable', js && (await fetch(`${B}/${js}`)).status === 200);
ok('source is blocked', (await fetch(`${B}/src/App.php`)).status === 403);
ok('config is blocked', (await fetch(`${B}/config/config.php`)).status === 403);
const token = (await j('POST', '/api/auth/login', { body: { username, password } })).json.token;
ok('admin signs in', !!token);
const c = (await j('POST', '/api/connections', { token, body: { version: '1.1', name: 'Test LMS' } })).json.connection;
ok('connection created', !!c?.shared_secret);
const o = (await j('POST', '/api/objects', { token, body: { type: 'quiz', title: 'Tëst ünicode ✓' } })).json.object;
o.content.questions = [{ id: 'q1', type: 'single', text: 'Pick', points: 1, options: [{ id: 'a', text: 'A', correct: true }, { id: 'b', text: 'B' }] }];
await j('PUT', `/api/objects/${o.id}`, { token, body: { title: o.title, description: '', content: o.content } });
ok('quiz publishes', (await j('POST', `/api/objects/${o.id}/publish`, { token })).status === 200);

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const form = new FormData(); form.append('file', new Blob([png], { type: 'image/png' }), 'dot.png');
const up = await (await fetch(`${B}/api/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form })).json();
const served = await fetch(`${B}/${up.url}`);
ok('image upload and serve', served.status === 200 && served.headers.get('content-type') === 'image/png', JSON.stringify(up));
const evil = new FormData(); evil.append('file', new Blob(['<?php echo 1;'], { type: 'image/png' }), 'x.php');
ok('non-image refused', (await fetch(`${B}/api/media`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: evil })).status === 422);

const enc = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (x) => '%' + x.charCodeAt(0).toString(16).toUpperCase());
const url = `${B}/lti/1.1/launch/${o.public_id}`;
const p = { lti_message_type: 'basic-lti-launch-request', lti_version: 'LTI-1p0', resource_link_id: 'r1', user_id: 'u1', roles: 'Learner', lis_person_name_full: 'Ann Lëarner',
  oauth_version: '1.0', oauth_nonce: String(Date.now()), oauth_timestamp: String(Math.floor(Date.now() / 1000)), oauth_consumer_key: c.consumer_key, oauth_signature_method: 'HMAC-SHA1' };
const base = 'POST&' + enc(url) + '&' + enc(Object.keys(p).sort().map((k) => `${enc(k)}=${enc(p[k])}`).join('&'));
p.oauth_signature = createHmac('sha1', `${enc(c.shared_secret)}&`).update(base).digest('base64');
const r = await fetch(url, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(p) });
const loc = r.headers.get('location') ?? '';
ok('LTI 1.1 launch in this location', r.status === 302 && loc.startsWith(`${B}/play/`), `${r.status} ${loc}`);
const play = await fetch(loc);
ok('player page is embeddable', play.status === 200 && play.headers.get('content-security-policy').includes('frame-ancestors *'));
ok('admin pages are not embeddable', (await fetch(`${B}/login`)).headers.get('content-security-policy').includes("'none'"));
const launch = loc.split('/').pop();
const s = await j('GET', '/api/play/session', { launch });
ok('session loads, unicode intact', s.json.object?.title === 'Tëst ünicode ✓' && s.json.learner?.name === 'Ann Lëarner', s.text);
const sub = await j('POST', '/api/play/submit', { launch, body: { answers: { q1: 'a' } } });
ok('quiz scored', sub.json.attempt?.result?.detail?.percentage === 100, sub.text);
const results = await j('GET', `/api/objects/${o.id}/results`, { token });
ok('result visible to author', results.json.attempts?.[0]?.score === 1, results.text);
process.exit(failed ? 1 : 0);
