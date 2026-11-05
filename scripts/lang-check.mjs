// Fails when a user-visible string has no Dutch entry, or when a Dutch entry
// is no longer used. Run with: node scripts/lang-check.mjs
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
let jsStrings = false;
const unquote = (q, s) => s.replace(/\\n/g, q === '"' || jsStrings ? '\n' : '\\n').replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
const STR = `(?:'((?:[^'\\\\]|\\\\.)*)'|"((?:[^"\\\\]|\\\\.)*)")`;
const grab = (text, re) => [...text.matchAll(re)].map((m) => (m[1] !== undefined ? unquote("'", m[1]) : unquote('"', m[2])));
let bad = 0;
const report = (side, found, dict) => {
  const missing = [...found].filter((s) => !(s in dict));
  const unused = Object.keys(dict).filter((k) => !found.has(k));
  missing.forEach((s) => console.log(`${side}: no Dutch for: ${JSON.stringify(s)}`));
  unused.forEach((s) => console.log(`${side}: unused entry: ${JSON.stringify(s)}`));
  bad += missing.length + unused.length;
  console.log(`${side}: ${found.size} strings, ${missing.length} missing, ${unused.length} unused`);
};

// Backend
const php = new Set();
for (const f of walk('backend/src').filter((p) => p.endsWith('.php') && !p.includes('/Lang/'))) {
  const t = readFileSync(f, 'utf8');
  for (const re of [new RegExp(`Lang::t\\(${STR}`, 'g'), new RegExp(`new HttpError\\(\\d+, ${STR}`, 'g'), new RegExp(`\\$this->field\\(${STR}`, 'g'), new RegExp(`RuntimeException\\(${STR}`, 'g')])
    grab(t, re).forEach((s) => php.add(s));
  if (f.endsWith('InstallController.php')) grab(t, new RegExp(`'(?:email|password|url)', (?:true|false), ${STR}`, 'g')).forEach((s) => php.add(s));
  if (f.endsWith('InstallController.php')) grab(t.match(/STEPS = \[(.*?)\]/s)[1], new RegExp(STR, 'g')).forEach((s) => php.add(s));
}
const nlPhp = JSON.parse(execFileSync('docker', ['compose', 'exec', '-T', 'web', 'php', '-r', 'echo json_encode(require "src/Lang/nl.php");'], { encoding: 'utf8' }));
// Technical errors from the mailer and HTTP client are meant for developers.
for (const s of [...php]) if (/^(Unsupported URL scheme|Could not sign JWT|PHP mail\(\) failed|STARTTLS failed|LMS |Invalid email address|Mail server said|Cannot reach mail|Request failed|Could not generate|The LMS connection no longer)/.test(s) && !(s in nlPhp)) php.delete(s);
report('backend', php, nlPhp);

// Frontend
jsStrings = true;
const ts = new Set();
for (const f of walk('frontend/src/app').filter((p) => p.endsWith('.ts') && !/\/i18n\/(nl|i18n)\.ts$/.test(p))) {
  const t = readFileSync(f, 'utf8');
  for (const re of [new RegExp(`${STR}\\s*\\|\\s*t\\b`, 'g'), new RegExp(`(?:\\bt|i18n\\.t|this\\.t)\\(${STR}`, 'g'), new RegExp(`\\b(?:label|blurb|hint|text)(?:: |=")${STR}`, 'g')])
    grab(t, re).filter((s) => s.trim()).forEach((s) => ts.add(s));
  // Branches of a condition, as in (busy ? 'Saving' : 'Save') | t
  for (const line of t.split('\n').filter((l) => /\| t\b|\bt\(.*\?|^\s*[?:] '|question = /.test(l)))
    grab(line, new RegExp(`(?:[?:]|question =)\\s*${STR}`, 'g')).filter((s) => /[A-Za-z]{2}/.test(s) && !/^(flex|hidden|text-\w+)$/.test(s)).forEach((s) => ts.add(s));
}
const nlTs = JSON.parse(execFileSync('node', ['--experimental-strip-types', '--no-warnings', '-e',
  `import('./frontend/src/app/i18n/nl.ts').then(m=>console.log(JSON.stringify(m.NL)))`], { encoding: 'utf8' }));
report('frontend', ts, nlTs);
process.exit(bad ? 1 : 0);
