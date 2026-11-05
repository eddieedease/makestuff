<?php
declare(strict_types=1);

/*
 * A fake LMS for development. It plays the platform side of LTI so launches,
 * deep linking and grade passback can be tried end to end. Its verification
 * code is written separately from the backend's on purpose: it is a second
 * opinion on the signatures, not a copy.
 *
 * Browser-facing URLs use localhost; server-to-server URLs use Docker names.
 */
const TOOL_BROWSER = 'http://localhost:8090';
const TOOL_INTERNAL = 'http://web';
const ISSUER = 'http://mock-lms';
const CLIENT_ID = 'mock-client';
const KEY_FILE = '/tmp/mock-lms-key.pem';
const LOG_FILE = '/tmp/mock-lms-log.json';
const CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/';
const DL = 'https://purl.imsglobal.org/spec/lti-dl/claim/';
const AGS = 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint';

function b64u(string $d): string { return rtrim(strtr(base64_encode($d), '+/', '-_'), '='); }
function ub64u(string $d): string { return (string) base64_decode(strtr($d, '-_', '+/')); }
function e(string $v): string { return htmlspecialchars($v, ENT_QUOTES); }

function privateKey(): string {
    if (!is_file(KEY_FILE)) {
        openssl_pkey_export(openssl_pkey_new(['private_key_bits' => 2048]), $pem);
        file_put_contents(KEY_FILE, $pem);
    }
    return (string) file_get_contents(KEY_FILE);
}
function jwk(): array {
    $d = openssl_pkey_get_details(openssl_pkey_get_private(privateKey()));
    return ['kty' => 'RSA', 'alg' => 'RS256', 'use' => 'sig', 'kid' => 'mock-1', 'n' => b64u($d['rsa']['n']), 'e' => b64u($d['rsa']['e'])];
}
function signJwt(array $payload): string {
    $data = b64u(json_encode(['alg' => 'RS256', 'typ' => 'JWT', 'kid' => 'mock-1'])) . '.' . b64u(json_encode($payload));
    openssl_sign($data, $sig, privateKey(), OPENSSL_ALGO_SHA256);
    return $data . '.' . b64u($sig);
}
function log_event(string $kind, array $data): void {
    $log = is_file(LOG_FILE) ? json_decode((string) file_get_contents(LOG_FILE), true) : [];
    array_unshift($log, ['at' => gmdate('H:i:s'), 'kind' => $kind] + $data);
    file_put_contents(LOG_FILE, json_encode(array_slice($log, 0, 30)));
}
function der(int $tag, string $c): string {
    $l = strlen($c);
    if ($l < 128) { return chr($tag) . chr($l) . $c; }
    $b = ltrim(pack('N', $l), "\0");
    return chr($tag) . chr(0x80 + strlen($b)) . $b . $c;
}
function jwkPem(array $k): string {
    $i = static function (string $v): string { $v = ltrim($v, "\0"); return der(2, ord($v[0]) > 127 ? "\0$v" : $v); };
    $rsa = der(0x30, $i(ub64u($k['n'])) . $i(ub64u($k['e'])));
    $spki = der(0x30, der(0x30, der(6, hex2bin('2a864886f70d010101')) . der(5, '')) . der(3, "\0" . $rsa));
    return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki)) . "-----END PUBLIC KEY-----\n";
}
/** Verifies a JWT from the tool against the tool's published key set. */
function verifyToolJwt(string $jwt): ?array {
    $p = explode('.', $jwt);
    if (count($p) !== 3) { return null; }
    $head = json_decode(ub64u($p[0]), true);
    $keys = json_decode((string) @file_get_contents(TOOL_INTERNAL . '/lti/1.3/jwks'), true)['keys'] ?? [];
    foreach ($keys as $k) {
        if ($k['kid'] === ($head['kid'] ?? '') && ($head['alg'] ?? '') === 'RS256'
            && openssl_verify("$p[0].$p[1]", ub64u($p[2]), jwkPem($k), OPENSSL_ALGO_SHA256) === 1) {
            return json_decode(ub64u($p[1]), true);
        }
    }
    return null;
}
function pct(string $s): string { return str_replace('%7E', '~', rawurlencode($s)); }
function oauthSign(string $method, string $url, array $params, string $secret): string {
    unset($params['oauth_signature']);
    $enc = [];
    foreach ($params as $k => $v) { $enc[pct((string) $k)] = pct((string) $v); }
    ksort($enc, SORT_STRING);
    $q = [];
    foreach ($enc as $k => $v) { $q[] = "$k=$v"; }
    return base64_encode(hash_hmac('sha1', "$method&" . pct($url) . '&' . pct(implode('&', $q)), pct($secret) . '&', true));
}
function autoPost(string $url, array $fields): void {
    echo '<!doctype html><form id=f method=post action="' . e($url) . '">';
    foreach ($fields as $k => $v) { echo '<input type=hidden name="' . e($k) . '" value="' . e((string) $v) . '">'; }
    echo '</form><script>f.submit()</script>';
}

$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);

if ($path === '/jwks') {
    header('Content-Type: application/json');
    echo json_encode(['keys' => [jwk()]]);
    return;
}

// LTI 1.1: sign a launch and post it from the browser.
if ($path === '/launch11') {
    $object = $_GET['object'] ?? 'demo-quiz';
    $role = $_GET['role'] ?? 'Learner';
    $user = $_GET['user'] ?? 'student-1';
    $url = TOOL_BROWSER . '/lti/1.1/launch/' . $object;
    $params = [
        'lti_message_type' => 'basic-lti-launch-request', 'lti_version' => 'LTI-1p0',
        'launch_presentation_locale' => $_GET['locale'] ?? 'en-GB',
        'resource_link_id' => "mock-$object", 'user_id' => $user, 'roles' => $role,
        'lis_person_name_full' => $role === 'Learner' ? 'Sam Student' : 'Tess Teacher',
        'lis_person_contact_email_primary' => 'sam@example.test', 'context_id' => 'c1', 'context_title' => 'Mock course',
        'lis_outcome_service_url' => 'http://mock-lms/outcomes', 'lis_result_sourcedid' => "grade:$user:$object",
        'oauth_version' => '1.0', 'oauth_nonce' => bin2hex(random_bytes(12)), 'oauth_timestamp' => (string) time(),
        'oauth_consumer_key' => 'mock-key', 'oauth_signature_method' => 'HMAC-SHA1', 'oauth_callback' => 'about:blank',
    ];
    $params['oauth_signature'] = oauthSign('POST', $url, $params, 'mock-secret');
    autoPost($url, $params);
    return;
}

// LTI 1.3 step 1: third-party initiated login.
if ($path === '/launch13') {
    $hint = b64u(json_encode(['object' => $_GET['object'] ?? 'demo-quiz', 'role' => $_GET['role'] ?? 'Learner', 'locale' => $_GET['locale'] ?? 'en-GB', 'deep' => isset($_GET['deep']), 'user' => $_GET['user'] ?? 'student-1']));
    header('Location: ' . TOOL_BROWSER . '/lti/1.3/login?' . http_build_query([
        'iss' => ISSUER, 'login_hint' => 'mock-user', 'client_id' => CLIENT_ID, 'lti_deployment_id' => '1',
        'target_link_uri' => TOOL_BROWSER . '/lti/1.3/launch?object=' . ($_GET['object'] ?? 'demo-quiz'), 'lti_message_hint' => $hint,
    ]));
    return;
}

// LTI 1.3 step 2: the authorization endpoint answers with a signed id_token.
if ($path === '/auth') {
    $hint = json_decode(ub64u($_GET['lti_message_hint'] ?? ''), true) ?: [];
    if (($_GET['redirect_uri'] ?? '') !== TOOL_BROWSER . '/lti/1.3/launch' || ($_GET['client_id'] ?? '') !== CLIENT_ID) {
        http_response_code(400); echo 'invalid redirect_uri or client'; return;
    }
    $object = $hint['object'] ?? 'demo-quiz';
    $role = $hint['role'] ?? 'Learner';
    $claims = [
        'iss' => ISSUER, 'aud' => CLIENT_ID, 'sub' => $hint['user'] ?? 'student-1', 'iat' => time(), 'exp' => time() + 300,
        'nonce' => $_GET['nonce'], 'name' => $role === 'Learner' ? 'Sam Student' : 'Tess Teacher', 'email' => 'sam@example.test',
        CLAIM . 'version' => '1.3.0', CLAIM . 'deployment_id' => '1',
        CLAIM . 'roles' => ["http://purl.imsglobal.org/vocab/lis/v2/membership#$role"],
        CLAIM . 'context' => ['id' => 'c1', 'title' => 'Mock course'],
        CLAIM . 'launch_presentation' => ['locale' => $hint['locale'] ?? 'en-GB'],
    ];
    if (!empty($hint['deep'])) {
        $claims[CLAIM . 'message_type'] = 'LtiDeepLinkingRequest';
        $claims[DL . 'deep_linking_settings'] = ['deep_link_return_url' => 'http://localhost:8093/deep-return', 'accept_types' => ['ltiResourceLink'], 'accept_multiple' => false, 'data' => 'mock-data'];
    } else {
        $claims[CLAIM . 'message_type'] = 'LtiResourceLinkRequest';
        $claims[CLAIM . 'target_link_uri'] = TOOL_BROWSER . "/lti/1.3/launch?object=$object";
        $claims[CLAIM . 'resource_link'] = ['id' => "mock13-$object"];
        $claims[AGS] = ['scope' => ['https://purl.imsglobal.org/spec/lti-ags/scope/score'], 'lineitem' => "http://mock-lms/ags/$object?type=x"];
    }
    autoPost($_GET['redirect_uri'], ['id_token' => signJwt($claims), 'state' => $_GET['state'] ?? '']);
    return;
}

// Deep linking: the tool posts back the chosen item.
if ($path === '/deep-return') {
    $claims = verifyToolJwt($_POST['JWT'] ?? '');
    $valid = $claims && $claims['iss'] === CLIENT_ID && $claims['aud'] === ISSUER
        && $claims[CLAIM . 'message_type'] === 'LtiDeepLinkingResponse' && ($claims[DL . 'data'] ?? '') === 'mock-data';
    $item = $claims[DL . 'content_items'][0] ?? [];
    log_event('deep link', ['valid' => (bool) $valid, 'title' => $item['title'] ?? '?', 'url' => $item['url'] ?? '?']);
    echo '<body style="font-family:system-ui;padding:2rem">' . ($valid ? '<h2>Linked: ' . e($item['title']) . '</h2><p>The JWT signature checked out.</p>' : '<h2>Invalid deep link response</h2>');
    return;
}

// AGS step 1: token endpoint. Checks the tool's signed client assertion.
if ($path === '/token') {
    $claims = verifyToolJwt($_POST['client_assertion'] ?? '');
    if (!$claims || $claims['iss'] !== CLIENT_ID || $claims['aud'] !== 'http://mock-lms/token' || ($_POST['grant_type'] ?? '') !== 'client_credentials') {
        log_event('token REFUSED', []);
        http_response_code(401); echo '{"error":"invalid_client"}'; return;
    }
    header('Content-Type: application/json');
    echo json_encode(['access_token' => 'mock-token', 'token_type' => 'bearer', 'expires_in' => 3600, 'scope' => $_POST['scope'] ?? '']);
    return;
}

// AGS step 2: receive the score.
if (preg_match('#^/ags/([^/]+)/scores$#', $path, $m)) {
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($auth !== 'Bearer mock-token' || strpos($_SERVER['CONTENT_TYPE'] ?? '', 'score+json') === false || ($_GET['type'] ?? '') !== 'x') {
        log_event('score REFUSED', []);
        http_response_code(401); return;
    }
    $score = json_decode((string) file_get_contents('php://input'), true);
    log_event('grade LTI 1.3', ['object' => $m[1], 'user' => $score['userId'], 'score' => $score['scoreGiven'] . '/' . $score['scoreMaximum']]);
    http_response_code(204);
    return;
}

// LTI 1.1 Basic Outcomes: verify OAuth header and body hash.
if ($path === '/outcomes') {
    $xml = (string) file_get_contents('php://input');
    $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    preg_match_all('/(oauth_\w+)="([^"]*)"/', $auth, $mm, PREG_SET_ORDER);
    $oauth = [];
    foreach ($mm as $x) { $oauth[$x[1]] = rawurldecode($x[2]); }
    $valid = ($oauth['oauth_body_hash'] ?? '') === base64_encode(sha1($xml, true))
        && ($oauth['oauth_signature'] ?? '') === oauthSign('POST', 'http://mock-lms/outcomes', $oauth, 'mock-secret');
    if (!$valid) {
        log_event('grade REFUSED', []);
        echo '<imsx_codeMajor>failure</imsx_codeMajor>'; return;
    }
    preg_match('#<sourcedId>(.*)</sourcedId>#', $xml, $sid);
    preg_match('#<textString>(.*)</textString>#', $xml, $val);
    log_event('grade LTI 1.1', ['sourcedid' => $sid[1] ?? '?', 'score' => $val[1] ?? '?']);
    header('Content-Type: application/xml');
    echo '<imsx_POXEnvelopeResponse><imsx_POXHeader><imsx_POXResponseHeaderInfo><imsx_statusInfo><imsx_codeMajor>success</imsx_codeMajor></imsx_statusInfo></imsx_POXResponseHeaderInfo></imsx_POXHeader></imsx_POXEnvelopeResponse>';
    return;
}

if ($path === '/log.json') {
    header('Content-Type: application/json');
    echo is_file(LOG_FILE) ? file_get_contents(LOG_FILE) : '[]';
    return;
}

// The course page.
$options = '';
foreach (['demo-elearning' => 'E-learning: Giving feedback that lands', 'demo-quiz' => 'Quiz: Web safety basics', 'demo-scan' => 'Scan: Digital skills', 'demo-tree' => 'Decision tree: The unhappy customer', 'demo-map' => 'Concept map: The water cycle', 'demo-sort' => 'Drag and drop: Which bin?', 'demo-match' => 'Drag and drop: Match the capitals', 'demo-order' => 'Drag and drop: Fire alarm steps'] as $id => $label) {
    $options .= "<option value=\"$id\">$label</option>";
}
?><!doctype html><meta charset="utf-8"><title>Mock LMS</title>
<style>
body{margin:0;font:15px/1.5 system-ui;background:#eef1f5;color:#1d2733}
header{background:#27496d;color:#fff;padding:.7rem 1.25rem;font-weight:600}
.wrap{display:grid;grid-template-columns:18rem 1fr;gap:1rem;padding:1rem;height:calc(100vh - 3.2rem);box-sizing:border-box}
aside{background:#fff;border-radius:.5rem;padding:1rem;overflow:auto}
label{display:block;font-size:.85rem;margin-bottom:.6rem}select{width:100%;padding:.35rem;margin-top:.15rem}
button{width:100%;padding:.45rem;margin-bottom:.35rem;border:0;border-radius:.35rem;background:#27496d;color:#fff;font:inherit;cursor:pointer}
button.alt{background:#5b7a99}iframe{width:100%;height:100%;border:0;background:#fff;border-radius:.5rem}
pre{font-size:.72rem;white-space:pre-wrap;background:#f4f6f8;padding:.5rem;border-radius:.35rem}
</style>
<header>Mock LMS · Development only</header>
<div class="wrap"><aside>
<label>Activity<select id="object"><?= $options ?></select></label>
<label>Launch as<select id="role"><option>Learner</option><option>Instructor</option></select></label>
<label>LMS language<select id="locale"><option value="en-GB">English</option><option value="nl-NL">Nederlands</option></select></label>
<label>Learner id<select id="user"><option>student-1</option><option>student-2</option></select></label>
<button onclick="go('/launch11')">Launch with LTI 1.1</button>
<button onclick="go('/launch13')">Launch with LTI 1.3</button>
<button class="alt" onclick="deep()">LTI 1.3 deep link picker</button>
<h4>Gradebook log</h4><pre id="log">[]</pre>
</aside><iframe id="frame" name="frame" title="Tool"></iframe></div>
<script>
const v=i=>document.getElementById(i).value;
const q=()=>`object=${v('object')}&role=${v('role')}&user=${v('user')}&locale=${v('locale')}`;
function go(p){document.getElementById('frame').src=p+'?'+q()}
function deep(){document.getElementById('frame').src='/launch13?deep=1&role=Instructor'}
async function poll(){document.getElementById('log').textContent=(await (await fetch('/log.json')).json()).map(e=>JSON.stringify(e)).join('\n')||'No grades yet'}
setInterval(poll,2000);poll();
</script>
