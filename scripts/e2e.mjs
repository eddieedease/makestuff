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

const c = await launch13(`object=demo-scan&role=Instructor&user=teach${Date.now()}`);
const rc = await post(c.url, c.data);
const pc = tokenFrom(rc.headers.get('location'));
const sc = await api('POST', '/api/play/submit', { launch: pc, body: { answers: { s1: 5, s2: 1, s3: 5, s4: 5, s5: 5, s6: 5 } } });
ok('reversed scan scoring', sc.json.attempt.result.detail.overall === 100 && sc.json.attempt.result.detail.overallBand.title === 'Digitally confident', sc.text);
ok('scan scores every category', sc.json.attempt.result.detail.categories.length === 3 && sc.json.attempt.result.detail.categories.every((x) => x.percentage === 100), sc.text);
ok('category range gives its feedback', sc.json.attempt.result.detail.categories.find((x) => x.id === 'safety').band.title === 'Well protected', sc.text);
const low = await launch13(`object=demo-scan&role=Instructor&user=teach2${Date.now()}`);
const lowToken = tokenFrom((await post(low.url, low.data)).headers.get('location'));
const lowScore = await api('POST', '/api/play/submit', { launch: lowToken, body: { answers: { s1: 3, s2: 3, s3: 2, s4: 3, s5: 3, s6: 3 } } });
const safety = lowScore.json.attempt.result.detail.categories.find((x) => x.id === 'safety');
ok('other range gives other feedback', safety.percentage === 37.5 && safety.band.title === 'Needs attention', lowScore.text);
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

console.log('Quiz categories');
const student2 = `q${Date.now()}`;
const cat = await launch11('demo-quiz', student2);
const catPlay = tokenFrom((await post(cat.url, cat.data)).headers.get('location'));
const catRes = await api('POST', '/api/play/submit', { launch: catPlay, body: { answers: { q1: 'a', q2: ['a'], q3: 'f', q4: 'secure' } } });
const rows = Object.fromEntries(catRes.json.attempt.result.detail.categories.map((x) => [x.id, x.percentage]));
ok('score rolls up per category', rows.pw === 50 && rows.mail === 0 && rows.web === 100, catRes.text);
ok('category points are weighted', catRes.json.attempt.result.detail.percentage === 40, catRes.text);
const mk = (await api('POST', '/api/objects', { token: user, body: { type: 'quiz', title: 'Cat' } })).json.object;
mk.content.categories = [{ id: 'c1', name: 'One' }];
mk.content.questions = [{ id: 'q', type: 'single', text: 'Pick', points: 1, categoryId: '', options: [{ id: 'a', text: 'A', correct: true }, { id: 'b', text: 'B' }] }];
await api('PUT', `/api/objects/${mk.id}`, { token: user, body: { title: 'Cat', description: '', content: mk.content } });
const noCat = await api('POST', `/api/objects/${mk.id}/publish`, { token: user });
ok('question without category blocks publishing', noCat.status === 422 && noCat.json.details.problems.includes('Question 1 has no category.'), noCat.text);
await api('DELETE', `/api/objects/${mk.id}`, { token: user });

console.log('Scan score ranges');
const scanItem = (await api('GET', `/api/objects/${scan.id}`, { token: admin })).json.object;
const overlap = { ...scanItem.content, bands: [...scanItem.content.bands, { id: 'x', categoryId: 'safety', min: 50, max: 80, title: 'T', advice: 'A' }] };
const copy = (await api('POST', `/api/objects/${scan.id}/duplicate`, { token: admin })).json.object;
await api('PUT', `/api/objects/${copy.id}`, { token: admin, body: { title: 'Copy', description: '', content: overlap } });
const clash = await api('POST', `/api/objects/${copy.id}/publish`, { token: admin });
ok('overlapping ranges block publishing', clash.status === 422 && clash.json.details.problems.some((p) => p.includes('overlap')), clash.text);
await api('DELETE', `/api/objects/${copy.id}`, { token: admin });

console.log('Decision tree');
const student3 = `d${Date.now()}`;
const tl = await launch13(`object=demo-tree&role=Learner&user=${student3}`);
const treePlay = tokenFrom((await post(tl.url, tl.data)).headers.get('location'));
const tree = await api('GET', '/api/play/session', { launch: treePlay });
const treeText = JSON.stringify(tree.json.object.content);
ok('browser gets the first step only', tree.json.object.content.start.id === 'start' && !tree.json.object.content.nodes);
ok('no endings, scores or targets leak', !/targetId|score|great|glowing|lost customer/i.test(treeText), treeText);
const walk = (path) => api('POST', '/api/play/check', { launch: treePlay, body: { id: 'walk', answer: path } });
ok('a choice leads to the next step', (await walk(['c1'])).json.node.id === 'listen');
ok('choice feedback is returned', (await walk(['c1'])).json.feedback.startsWith('Good start'));
ok('a choice from another step is refused', (await walk(['c3'])).status === 422);
ok('a made-up choice is refused', (await walk(['nope'])).status === 422);
ok('unknown check item is refused', (await api('POST', '/api/play/check', { launch: treePlay, body: { id: 'great', answer: [] } })).status === 404);
ok('cannot finish before an ending', (await api('POST', '/api/play/submit', { launch: treePlay, body: { answers: { path: ['c1'] } } })).status === 422);
ok('cannot claim the best ending', (await api('POST', '/api/play/submit', { launch: treePlay, body: { answers: { path: ['c3'] } } })).status === 422);
const loop = await walk(['c2', 'c5', 'c4']);
ok('loops back through a step work', loop.json.node.id === 'okay' && loop.json.node.kind === 'end', loop.text);
const treeDone = await api('POST', '/api/play/submit', { launch: treePlay, body: { answers: { path: ['c2', 'c5', 'c4'] } } });
const treeResult = treeDone.json.attempt?.result;
ok('ending decides the score', treeResult?.detail.percentage === 60 && treeResult.passed === true && treeResult.detail.ending.title === 'Solved, just', treeDone.text);
ok('result shows the path taken', treeResult?.detail.trail.length === 3 && treeResult.detail.trail[0].choice.startsWith('Explain'), treeDone.text);
ok('tree grade reaches the LMS', (await logEntry('grade LTI 1.3', student3))?.score === '60/100', JSON.stringify(await logEntry('grade LTI 1.3', student3)));
await api('POST', '/api/play/restart', { launch: treePlay });
await api('POST', '/api/play/submit', { launch: treePlay, body: { answers: { path: ['c2', 'c6'] } } });
ok('a worse retake keeps the best grade', (await logEntry('grade LTI 1.3', student3))?.score === '60/100');

const treeDraft = (await api('POST', '/api/objects', { token: user, body: { type: 'decision_tree', title: 'T' } })).json.object;
ok('new tree publishes as created', (await api('POST', `/api/objects/${treeDraft.id}/publish`, { token: user })).status === 200);
const broken = structuredClone(treeDraft.content);
broken.nodes[0].choices.push({ id: 'dead', text: 'Dead end', feedback: '', targetId: 'gone' });
broken.nodes.push({ id: 'orphan', kind: 'step', title: 'Orphan', text: 'x', choices: [{ id: 'o', text: 'x', feedback: '', targetId: broken.startId }] });
broken.nodes.push({ id: 'trap', kind: 'step', title: 'Trap', text: 'x', choices: [{ id: 't', text: 'x', feedback: '', targetId: 'trap' }] });
broken.nodes[0].choices.push({ id: 'in', text: 'Into trap', feedback: '', targetId: 'trap' });
await api('PUT', `/api/objects/${treeDraft.id}`, { token: user, body: { title: 'T', description: '', content: broken } });
const treeProblems = (await api('POST', `/api/objects/${treeDraft.id}/publish`, { token: user })).json.details?.problems ?? [];
ok('choice into nothing is caught', treeProblems.some((p) => p.includes('leads nowhere')), JSON.stringify(treeProblems));
ok('unreachable step is caught', treeProblems.some((p) => p.startsWith('"Orphan" cannot be reached')), JSON.stringify(treeProblems));
ok('dead-end loop is caught', treeProblems.some((p) => p.startsWith('"Trap" never leads')), JSON.stringify(treeProblems));
await api('DELETE', `/api/objects/${treeDraft.id}`, { token: user });

console.log('Concept map');
const student4 = `m${Date.now()}`;
const ml = await launch11('demo-map', student4);
const mapPlay = tokenFrom((await post(ml.url, ml.data)).headers.get('location'));
const map = await api('GET', '/api/play/session', { launch: mapPlay });
ok('map reaches the player', map.json.object.content.nodes.length === 6 && map.json.object.content.settings.reveal === 'progressive', map.text);
const allIds = map.json.object.content.nodes.map((n) => n.id);
ok('cannot finish with ideas unopened', (await api('POST', '/api/play/submit', { launch: mapPlay, body: { answers: { visited: allIds.slice(0, 3) } } })).status === 422);
ok('made-up ideas do not count', (await api('POST', '/api/play/submit', { launch: mapPlay, body: { answers: { visited: ['a', 'b', 'c', 'd', 'e', 'f'] } } })).status === 422);
const mapDone = await api('POST', '/api/play/submit', { launch: mapPlay, body: { answers: { visited: allIds } } });
ok('finishing the map scores 100%', mapDone.json.attempt?.result?.score === 1 && mapDone.json.attempt.result.detail.visited === 6, mapDone.text);
ok('map completion reaches the LMS', (await logEntry('grade LTI 1.1', student4))?.score === '1.0000');
const mapDraft = (await api('POST', '/api/objects', { token: user, body: { type: 'concept_map', title: 'M' } })).json.object;
ok('new map publishes as created', (await api('POST', `/api/objects/${mapDraft.id}/publish`, { token: user })).status === 200);
const lonely = structuredClone(mapDraft.content);
lonely.settings.reveal = 'progressive';
lonely.nodes.push({ id: 'lone', title: 'Lone', text: 'x', categoryId: '', x: 0, y: 0 });
lonely.edges.push({ id: 'bad', from: 'lone', to: 'gone', label: '' });
await api('PUT', `/api/objects/${mapDraft.id}`, { token: user, body: { title: 'M', description: '', content: lonely } });
const mapProblems = (await api('POST', `/api/objects/${mapDraft.id}/publish`, { token: user })).json.details?.problems ?? [];
ok('unconnected idea is caught', mapProblems.some((p) => p.startsWith('"Lone" is not connected')), JSON.stringify(mapProblems));
ok('broken connection is caught', mapProblems.includes('A connection does not join two ideas.'), JSON.stringify(mapProblems));
await api('DELETE', `/api/objects/${mapDraft.id}`, { token: user });

console.log('Languages');
const nlHeaders = { 'Content-Type': 'application/json', 'Accept-Language': 'nl' };
const nlError = await (await fetch(API + '/api/auth/login', { method: 'POST', headers: nlHeaders, body: '{"username":"x","password":"y"}' })).json();
ok('API errors follow Accept-Language', nlError.error === 'Onjuiste gebruikersnaam of wachtwoord', JSON.stringify(nlError));
const nlDraft = await (await fetch(API + '/api/objects', { method: 'POST', headers: { ...nlHeaders, Authorization: `Bearer ${user}` }, body: '{"type":"scan","title":"T"}' })).json();
ok('new content starts in that language', nlDraft.object.content.scale[0].label === 'Helemaal oneens');
const nlPublish = await (await fetch(`${API}/api/objects/${nlDraft.object.id}/publish`, { method: 'POST', headers: { ...nlHeaders, Authorization: `Bearer ${user}` } })).json();
ok('publish problems are translated', nlPublish.details.problems.includes('Voeg minstens één categorie toe.'), JSON.stringify(nlPublish));
await api('DELETE', `/api/objects/${nlDraft.object.id}`, { token: user });
const nl13 = await launch13('object=demo-quiz&role=Learner&user=dutch13&locale=nl-NL');
const nlS13 = await api('GET', '/api/play/session', { launch: tokenFrom((await post(nl13.url, nl13.data)).headers.get('location')) });
ok('LTI 1.3 launch carries the LMS language', nlS13.json.locale === 'nl', JSON.stringify(nlS13.json.locale));
const nl11Html = await (await fetch(`${LMS}/launch11?object=demo-quiz&user=dutch11&role=Learner&locale=nl-BE`)).text();
const nlS11 = await api('GET', '/api/play/session', { launch: tokenFrom((await post(action(nl11Html), fields(nl11Html))).headers.get('location')) });
ok('LTI 1.1 launch carries the LMS language', nlS11.json.locale === 'nl', JSON.stringify(nlS11.json.locale));
const enHtml = await (await fetch(`${LMS}/launch11?object=demo-quiz&user=en11&role=Learner&locale=fr-FR`)).text();
const frS = await api('GET', '/api/play/session', { launch: tokenFrom((await post(action(enHtml), fields(enHtml))).headers.get('location')) });
ok('unsupported LMS language leaves the choice to the browser', frS.json.locale === null);
const setNl = await api('PUT', '/api/auth/me', { token: user, body: { locale: 'nl' } });
ok('language is saved on the account', setNl.json.user.locale === 'nl' && (await api('GET', '/api/auth/me', { token: user })).json.user.locale === 'nl');
await api('PUT', '/api/auth/me', { token: user, body: { locale: 'en' } });

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
