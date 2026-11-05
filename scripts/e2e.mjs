// End-to-end check of the API and LTI flows against the Docker stack.
// Run with: node scripts/e2e.mjs
const API = 'http://localhost:8090', LMS = 'http://localhost:8093';
let passed = 0, failed = 0;
const ok = (name, cond, extra = '') => { cond ? passed++ : failed++; console.log(`${cond ? '  ok ' : 'FAIL '} ${name}${cond ? '' : ' ' + extra}`); };

async function api(method, path, { token, launch, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (launch) headers['X-Launch-Token'] = launch;
  const res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = {}; }
  return { status: res.status, json, text };
}
const login = async (u, p) => (await api('POST', '/api/auth/login', { body: { username: u, password: p } })).json.token;
const fields = (html) => Object.fromEntries([...html.matchAll(/name="([^"]+)" value="([^"]*)"/g)].map(m => [m[1], m[2].replaceAll('&quot;', '"').replaceAll('&amp;', '&').replaceAll('&#039;', "'")]));
const action = (html) => html.match(/action="([^"]+)"/)[1].replaceAll('&amp;', '&');
const post = (url, data) => fetch(url, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(data) });
const tokenFrom = (location) => location.split('/').pop();
const logEntry = async (kind, match) => (await (await fetch(LMS + '/log.json')).json()).find(e => e.kind === kind && JSON.stringify(e).includes(match));

async function launch11(object, user) {
  const html = await (await fetch(`${LMS}/launch11?object=${object}&user=${user}&role=Learner`)).text();
  return { url: action(html), data: fields(html) };
}
async function launch13(query) {
  const start = await fetch(`${LMS}/launch13?${query}`, { redirect: 'manual' });
  const login = await fetch(start.headers.get('location'), { redirect: 'manual' });
  const auth = login.headers.get('location');
  const html = await (await fetch(auth)).text();
  return { url: action(html), data: fields(html) };
}

console.log('Accounts and permissions');
const bad = await api('POST', '/api/auth/login', { body: { username: 'admin', password: 'nope' } });
ok('wrong password refused', bad.status === 401);
const admin = await login('admin', 'admin123'), user = await login('user', 'user123');
ok('both dev accounts sign in', admin && user);
const adminList = (await api('GET', '/api/objects', { token: admin })).json.objects;
const userList = (await api('GET', '/api/objects', { token: user })).json.objects;
ok('admin sees everything', adminList.length >= 3);
ok('user sees only own items', userList.length >= 2 && userList.every(o => o.owner.username === 'user'));
const scan = adminList.find(o => o.public_id === 'demo-scan');
ok('user cannot open admin item', (await api('GET', `/api/objects/${scan.id}`, { token: user })).status === 404);
ok('user cannot edit admin item', (await api('PUT', `/api/objects/${scan.id}`, { token: user, body: { title: 'x', content: {} } })).status === 404);
ok('user cannot delete admin item', (await api('DELETE', `/api/objects/${scan.id}`, { token: user })).status === 404);
ok('user cannot list users', (await api('GET', '/api/users', { token: user })).status === 403);
ok('user cannot read LTI secrets', (await api('GET', '/api/connections', { token: user })).status === 403);
ok('anonymous is refused', (await api('GET', '/api/objects')).status === 401);

const draft = (await api('POST', '/api/objects', { token: user, body: { type: 'quiz', title: 'Temp' } })).json.object;
const pub = await api('POST', `/api/objects/${draft.id}/publish`, { token: user });
ok('empty quiz cannot be published', pub.status === 422 && pub.json.details.problems.length > 0);
const users = (await api('GET', '/api/users', { token: admin })).json.users;
const adminId = users.find(u => u.username === 'admin').id;
ok('user cannot reassign', (await api('POST', `/api/objects/${draft.id}/owner`, { token: user, body: { owner_id: adminId } })).status === 403);
const moved = await api('POST', `/api/objects/${draft.id}/owner`, { token: admin, body: { owner_id: adminId } });
ok('admin reassigns item', moved.json.object.owner.id === adminId);
ok('item left the old owner', (await api('GET', `/api/objects/${draft.id}`, { token: user })).status === 404);
ok('admin deletes any item', (await api('DELETE', `/api/objects/${draft.id}`, { token: admin })).status === 200);

console.log('Installation safety');
for (const p of ['/src/App.php', '/config/config.php', '/bin/dev-setup.php', '/migrations/001_initial.sql', '/storage/uploads/.gitkeep'])
  ok(`${p} is blocked`, (await fetch(API + p, { redirect: 'manual' })).status === 403);
ok('installer locked', (await fetch(API + '/install', { redirect: 'manual' })).status === 403);

console.log('LTI 1.1');
const student = `s${Date.now()}`;
let l = await launch11('demo-quiz', student);
const forged = await post(l.url, { ...l.data, roles: 'Instructor' });
ok('tampered launch refused', forged.status === 401);
const res = await post(l.url, l.data);
ok('signed launch redirects to player', res.status === 302 && res.headers.get('location').includes('/play/'), res.status);
ok('replayed launch refused', (await post(l.url, l.data)).status === 401);
const play = tokenFrom(res.headers.get('location'));
const sess = await api('GET', '/api/play/session', { launch: play });
ok('session loads', sess.status === 200 && sess.json.learner.name === 'Sam Student');
ok('no answers leak to browser', !/correct|accepted/.test(JSON.stringify(sess.json.object.content)), JSON.stringify(sess.json.object.content).slice(0, 200));
ok('quiz answers cannot be probed', (await api('POST', '/api/play/check', { launch: play, body: { id: 'q1', answer: 'a' } })).status === 403);
ok('bad token refused', (await api('GET', '/api/play/session', { launch: 'x' })).status === 401);
const submit = await api('POST', '/api/play/submit', { launch: play, body: { answers: { q1: 'a', q2: ['a', 'b'], q3: 't', q4: 'Secure ' } } });
ok('all correct scores 100%', submit.json.attempt?.result?.detail?.percentage === 100 && submit.json.attempt.result.passed === true, submit.text);
ok('grade reached the LMS', submit.json.attempt.passback_status === 'sent', submit.text);
const g11 = await logEntry('grade LTI 1.1', student);
ok('LMS verified signature and stored 1.0', g11?.score === '1.0000', JSON.stringify(g11));
ok('double submit refused', (await api('POST', '/api/play/submit', { launch: play, body: { answers: {} } })).status === 409);
await api('POST', '/api/play/restart', { launch: play });
await api('POST', '/api/play/submit', { launch: play, body: { answers: { q1: 'b' } } });
await api('POST', '/api/play/restart', { launch: play });
const third = await api('POST', '/api/play/submit', { launch: play, body: { answers: { q1: 'b' } } });
ok('retake keeps best grade in LMS', third.json.attempt.result.detail.percentage === 0 && (await logEntry('grade LTI 1.1', student)).score === '1.0000');
ok('maxAttempts is enforced', third.json.can_retake === false && (await api('POST', '/api/play/restart', { launch: play })).status === 403);

console.log('LTI 1.3');
const s13 = `t${Date.now()}`;
const a = await launch13(`object=demo-elearning&role=Learner&user=${s13}`);
const tampered = { ...a.data, id_token: a.data.id_token.slice(0, -6) + 'AAAAAA' };
ok('bad signature refused', (await post(a.url, tampered)).status === 401);
const b = await launch13(`object=demo-elearning&role=Learner&user=${s13}`);
const r13 = await post(b.url, b.data);
ok('launch redirects to player', r13.status === 302, `${r13.status} ${await r13.text()}`);
ok('state cannot be replayed', (await post(b.url, b.data)).status === 401);
const p13 = tokenFrom(r13.headers.get('location'));
const s = await api('GET', '/api/play/session', { launch: p13 });
ok('e-learning segments arrive', s.json.object.content.pages.length === 3);
const qSeg = s.json.object.content.pages[1].segments.find(x => x.kind === 'question');
ok('inline question has no answers', qSeg && !/correct|feedback/.test(JSON.stringify(qSeg)), JSON.stringify(qSeg));
const wrong = await api('POST', '/api/play/check', { launch: p13, body: { id: qSeg.question.id, answer: 'o1' } });
ok('inline check returns feedback', wrong.json.correct === false && wrong.json.optionFeedback.o1?.length > 0, wrong.text);
const q2 = s.json.object.content.pages[2].segments.find(x => x.kind === 'question');
await api('POST', '/api/play/progress', { launch: p13, body: { progress: 0.5, state: { page: 1 } } });
const resumed = await api('GET', '/api/play/session', { launch: p13 });
ok('progress resumes', resumed.json.attempt.state.page === 1 && resumed.json.attempt.progress === 0.5);
const done = await api('POST', '/api/play/submit', { launch: p13, body: { answers: { [qSeg.question.id]: 'o2', [q2.question.id]: ['o1'] } } });
ok('half right scores 50%', done.json.attempt.result.detail.percentage === 50 && done.json.attempt.passback_status === 'sent', done.text);
const g13 = await logEntry('grade LTI 1.3', s13);
ok('AGS score arrived', g13?.score === '50/100', JSON.stringify(g13));

const c = await launch13(`object=demo-scan&role=Instructor&user=teach`);
const rc = await post(c.url, c.data);
const pc = tokenFrom(rc.headers.get('location'));
const sc = await api('POST', '/api/play/submit', { launch: pc, body: { answers: { s1: 5, s2: 1, s3: 5, s4: 5, s5: 5, s6: 5 } } });
ok('reversed scan scoring', sc.json.attempt.result.detail.overall === 100 && sc.json.attempt.result.detail.overallBand.title === 'Digitally confident', sc.text);
ok('instructor launches are not graded', sc.json.attempt.passback_status === 'none');

console.log('Deep linking');
const d = await launch13('deep=1&role=Instructor');
const rd = await post(d.url, d.data);
ok('opens the picker', rd.headers.get('location')?.includes('/pick/'), rd.status);
const pick = tokenFrom(rd.headers.get('location'));
const list = await api('GET', '/api/pick', { launch: pick });
ok('lists published items', list.json.objects.length >= 3);
ok('picker token cannot play', (await api('GET', '/api/play/session', { launch: pick })).status === 401);
const chosen = await api('POST', '/api/pick', { launch: pick, body: { public_ids: ['demo-quiz'] } });
const back = await (await post(chosen.json.return_url, { JWT: chosen.json.jwt })).text();
ok('LMS accepted the signed response', back.includes('Linked: Web safety basics'), back.slice(0, 200));

console.log('Unpublished content');
const quiz = userList.find(o => o.public_id === 'demo-quiz');
await api('POST', `/api/objects/${quiz.id}/unpublish`, { token: user });
const u = await launch11('demo-quiz', 'student-x');
ok('unpublished item cannot launch', (await post(u.url, u.data)).status === 404);
await api('POST', `/api/objects/${quiz.id}/publish`, { token: user });

console.log('Results');
const results = await api('GET', `/api/objects/${quiz.id}/results`, { token: user });
ok('results list attempts', results.json.attempts.some(x => x.score === 1 && x.lms === 'Mock LMS (LTI 1.1)'));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
