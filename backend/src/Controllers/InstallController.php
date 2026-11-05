<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Config;
use App\Core\Db;
use App\Core\Mailer;
use App\Core\Migrator;
use App\Core\Request;
use App\Core\Response;
use App\Core\Url;
use App\Lti\Keys;

/**
 * Web installer. Server-rendered on purpose: it has to work before anything
 * else does. Steps: requirements, database, site and email, first admin.
 */
final class InstallController
{
    private const STEPS = ['Requirements', 'Database', 'Site & email', 'Admin account', 'Done'];

    public function handle(Request $r): void
    {
        session_name('makestuff_install');
        session_set_cookie_params(['httponly' => true, 'samesite' => 'Lax', 'path' => $r->basePath . '/install']);
        session_start();

        if (Config::installed() && empty($_SESSION['just_finished'])) {
            Response::errorPage('Already installed', 'This site is set up. To reinstall, remove config/config.php first.', 403);
            return;
        }
        $_SESSION['csrf'] ??= bin2hex(random_bytes(16));
        $_SESSION['data'] ??= [];

        // Step 5 can only be reached by finishing; failed requirements block everything else.
        $step = !empty($_SESSION['just_finished']) ? 5 : max(1, min(4, (int) ($r->query['step'] ?? 1)));
        if ($step > 1 && $step < 5 && !$this->requirementsMet()) {
            Response::redirect($r->basePath . '/install?step=1');
            return;
        }
        $error = null;
        $notice = null;

        if ($r->method === 'POST') {
            if (!hash_equals($_SESSION['csrf'], (string) ($r->post['csrf'] ?? ''))) {
                $error = 'Your session expired. Please try again.';
            } else {
                try {
                    if ($step === 2) {
                        $this->saveDatabase($r);
                        Response::redirect($r->basePath . '/install?step=3');
                        return;
                    }
                    if ($step === 3) {
                        $this->saveSite($r);
                        if (isset($r->post['test_mail'])) {
                            Mailer::send($_SESSION['data']['mail'], $_SESSION['data']['mail']['from_email'], 'Makestuff test email', "Your email settings work.\n");
                            $notice = 'Test email sent to ' . $_SESSION['data']['mail']['from_email'] . '. Check your inbox.';
                        } else {
                            Response::redirect($r->basePath . '/install?step=4');
                            return;
                        }
                    }
                    if ($step === 4) {
                        $this->finish($r);
                        $_SESSION['just_finished'] = true;
                        Response::redirect($r->basePath . '/install?step=5');
                        return;
                    }
                } catch (\Throwable $e) {
                    $error = $e->getMessage();
                }
            }
        }
        if ($step > 2 && empty($_SESSION['data']['db']) && $step < 5) {
            Response::redirect($r->basePath . '/install?step=2');
            return;
        }
        if ($step > 3 && empty($_SESSION['data']['mail']) && $step < 5) {
            Response::redirect($r->basePath . '/install?step=3');
            return;
        }

        $methods = [1 => 'requirements', 2 => 'databaseForm', 3 => 'siteForm', 4 => 'adminForm', 5 => 'done'];
        $body = $this->{$methods[$step]}($r);
        if ($step === 5) {
            $_SESSION = [];
            session_destroy();
        }
        Response::html($this->layout($step, $body, $error, $notice));
    }

    private function saveDatabase(Request $r): void
    {
        $db = [
            'host' => trim((string) ($r->post['host'] ?? '')),
            'port' => (int) ($r->post['port'] ?? 3306),
            'name' => trim((string) ($r->post['name'] ?? '')),
            'user' => trim((string) ($r->post['user'] ?? '')),
            'pass' => (string) ($r->post['pass'] ?? ''),
        ];
        $_SESSION['data']['db'] = $db;
        try {
            $pdo = Db::connect($db);
        } catch (\PDOException $e) {
            unset($_SESSION['data']['db_ok']);
            throw new \RuntimeException('Could not connect: ' . $e->getMessage());
        }
        if ($pdo->query("SHOW TABLES LIKE 'users'")->fetchColumn() !== false) {
            throw new \RuntimeException('This database already contains a users table. Use an empty database.');
        }
    }

    private function saveSite(Request $r): void
    {
        $url = rtrim(trim((string) ($r->post['app_url'] ?? '')), '/');
        if (!preg_match('#^https?://#i', $url)) {
            throw new \RuntimeException('The site address must start with http:// or https://');
        }
        $from = trim((string) ($r->post['from_email'] ?? ''));
        if (!filter_var($from, FILTER_VALIDATE_EMAIL)) {
            throw new \RuntimeException('Enter a valid sender email address');
        }
        $_SESSION['data']['site_name'] = trim((string) ($r->post['site_name'] ?? '')) ?: 'Makestuff';
        $_SESSION['data']['app_url'] = $url;
        $_SESSION['data']['mail'] = [
            'host' => trim((string) ($r->post['mail_host'] ?? '')),
            'port' => (int) ($r->post['mail_port'] ?? 587),
            'encryption' => in_array($r->post['mail_encryption'] ?? '', ['', 'tls', 'ssl'], true) ? $r->post['mail_encryption'] : 'tls',
            'user' => trim((string) ($r->post['mail_user'] ?? '')),
            'pass' => (string) ($r->post['mail_pass'] ?? ''),
            'from_email' => $from,
            'from_name' => trim((string) ($r->post['from_name'] ?? '')) ?: 'Makestuff',
        ];
    }

    /** The config file is written last: if anything fails the installer stays available. */
    private function finish(Request $r): void
    {
        $name = trim((string) ($r->post['name'] ?? ''));
        $username = trim((string) ($r->post['username'] ?? ''));
        $email = trim((string) ($r->post['email'] ?? ''));
        $password = (string) ($r->post['password'] ?? '');
        $_SESSION['data']['admin'] = compact('name', 'username', 'email');

        if ($name === '' || !preg_match('/^[A-Za-z0-9._-]{3,64}$/', $username)) {
            throw new \RuntimeException('Enter a name and a username of 3 to 64 letters, digits, dots, dashes or underscores');
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new \RuntimeException('Enter a valid email address');
        }
        if (strlen($password) < 8) {
            throw new \RuntimeException('Use a password of at least 8 characters');
        }
        if ($password !== (string) ($r->post['password2'] ?? '')) {
            throw new \RuntimeException('The two passwords do not match');
        }
        if (!is_writable(dirname(Config::path()))) {
            throw new \RuntimeException('The config folder is not writable');
        }

        $data = $_SESSION['data'];
        Db::use(Db::connect($data['db']));
        Migrator::run();
        Keys::generate();
        if (Db::value('SELECT id FROM users WHERE username = ?', [$username]) === null) {
            Db::run("INSERT INTO users (username, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, 'admin', ?)", [
                $username, $email, $name, password_hash($password, PASSWORD_DEFAULT), Db::now(),
            ]);
        }

        $config = [
            'env' => 'production',
            'site_name' => $data['site_name'],
            'app_url' => $data['app_url'],
            'frontend_url' => '',
            'secret' => bin2hex(random_bytes(32)),
            'db' => $data['db'],
            'mail' => $data['mail'],
        ];
        $php = "<?php\n// Written by the installer.\nreturn " . var_export($config, true) . ";\n";
        if (file_put_contents(Config::path(), $php, LOCK_EX) === false) {
            throw new \RuntimeException('Could not write config/config.php');
        }
        @chmod(Config::path(), 0640);
        $_SESSION['data']['finished_url'] = $data['app_url'];
    }

    private function requirementsMet(): bool
    {
        return array_filter($this->checks(), static fn (array $check) => !$check[1]) === [];
    }

    private function checks(): array
    {
        return [
            ['PHP 8.0 or newer (found ' . PHP_VERSION . ')', PHP_VERSION_ID >= 80000],
            ['PDO MySQL extension', extension_loaded('pdo_mysql')],
            ['OpenSSL extension (LTI 1.3 signing)', extension_loaded('openssl')],
            ['cURL extension (grade passback)', extension_loaded('curl')],
            ['mbstring extension', extension_loaded('mbstring')],
            ['fileinfo extension (image uploads)', extension_loaded('fileinfo')],
            ['config/ is writable', is_writable(APP_ROOT . '/config')],
            ['storage/uploads/ is writable', is_writable(APP_ROOT . '/storage/uploads')],
        ];
    }

    private function requirements(Request $r): string
    {
        $rows = '';
        foreach ($this->checks() as [$label, $passed]) {
            $rows .= '<li class="' . ($passed ? 'pass' : 'fail') . '">' . ($passed ? '✓' : '✕') . ' ' . Response::e($label) . '</li>';
        }
        $next = $this->requirementsMet()
            ? '<a class="btn" href="' . Response::e($r->basePath) . '/install?step=2">Continue</a>'
            : '<p class="err">Fix the items marked ✕ and reload this page. On shared hosting these are usually PHP settings in your control panel, or folder permissions (try 755 or 775).</p>';
        return "<h2>Check your server</h2><ul class=\"checks\">$rows</ul>$next";
    }

    private function databaseForm(Request $r): string
    {
        $d = $_SESSION['data']['db'] ?? ['host' => 'localhost', 'port' => 3306, 'name' => '', 'user' => '', 'pass' => ''];
        return '<h2>Database</h2><p>Create an empty MySQL or MariaDB database in your hosting control panel, then fill in its details.</p>'
            . $this->form(
                $this->field('Host', 'host', $d['host'])
                . $this->field('Port', 'port', (string) $d['port'], 'number')
                . $this->field('Database name', 'name', $d['name'])
                . $this->field('Username', 'user', $d['user'])
                . $this->field('Password', 'pass', '', 'password', false),
                '<button>Test and continue</button>'
            );
    }

    private function siteForm(Request $r): string
    {
        $d = $_SESSION['data'];
        $m = $d['mail'] ?? ['host' => '', 'port' => 587, 'encryption' => 'tls', 'user' => '', 'pass' => '', 'from_email' => '', 'from_name' => 'Makestuff'];
        $options = '';
        foreach (['tls' => 'STARTTLS', 'ssl' => 'SSL/TLS', '' => 'None'] as $value => $label) {
            $options .= '<option value="' . $value . '"' . ($m['encryption'] === $value ? ' selected' : '') . ">$label</option>";
        }
        return '<h2>Site and email</h2>'
            . $this->form(
                $this->field('Site name', 'site_name', $d['site_name'] ?? 'Makestuff')
                . $this->field('Site address', 'app_url', $d['app_url'] ?? Url::detect(), 'url', true, 'LMSs use this address. Use https in production: browsers block mixed content inside an LMS.')
                . '<h3>Email</h3><p>Used for password resets. Leave the mail server empty to use PHP\'s own mail function.</p>'
                . $this->field('Sender email', 'from_email', $m['from_email'], 'email')
                . $this->field('Sender name', 'from_name', $m['from_name'])
                . $this->field('Mail server (SMTP)', 'mail_host', $m['host'], 'text', false)
                . $this->field('Port', 'mail_port', (string) $m['port'], 'number', false)
                . '<label>Encryption<select name="mail_encryption">' . $options . '</select></label>'
                . $this->field('SMTP username', 'mail_user', $m['user'], 'text', false)
                . $this->field('SMTP password', 'mail_pass', $m['pass'], 'password', false),
                '<button>Continue</button> <button class="ghost" name="test_mail" value="1">Send test email</button>'
            );
    }

    private function adminForm(Request $r): string
    {
        $a = $_SESSION['data']['admin'] ?? ['name' => '', 'username' => '', 'email' => ''];
        return '<h2>First administrator</h2>'
            . $this->form(
                $this->field('Full name', 'name', $a['name'])
                . $this->field('Username', 'username', $a['username'])
                . $this->field('Email', 'email', $a['email'], 'email')
                . $this->field('Password', 'password', '', 'password', true, 'At least 8 characters.')
                . $this->field('Repeat password', 'password2', '', 'password'),
                '<button>Install</button>'
            );
    }

    private function done(Request $r): string
    {
        $url = (string) ($_SESSION['data']['finished_url'] ?? Url::base());
        return '<h2>All set</h2><p>Makestuff is installed. The installer has locked itself.</p>'
            . '<a class="btn" href="' . Response::e($url) . '/login">Go to sign in</a>';
    }

    private function form(string $fields, string $actions): string
    {
        return '<form method="post"><input type="hidden" name="csrf" value="' . Response::e($_SESSION['csrf']) . '">'
            . $fields . '<div class="actions">' . $actions . '</div></form>';
    }

    private function field(string $label, string $name, string $value, string $type = 'text', bool $required = true, string $hint = ''): string
    {
        return '<label>' . Response::e($label)
            . '<input type="' . $type . '" name="' . $name . '" value="' . Response::e($value) . '"' . ($required ? ' required' : '') . '>'
            . ($hint !== '' ? '<small>' . Response::e($hint) . '</small>' : '') . '</label>';
    }

    private function layout(int $step, string $body, ?string $error, ?string $notice): string
    {
        $steps = '';
        foreach (self::STEPS as $index => $label) {
            $class = $index + 1 === $step ? 'now' : ($index + 1 < $step ? 'past' : '');
            $steps .= '<li class="' . $class . '">' . $label . '</li>';
        }
        $alert = ($error !== null ? '<p class="err">' . Response::e($error) . '</p>' : '')
            . ($notice !== null ? '<p class="ok">' . Response::e($notice) . '</p>' : '');
        return <<<HTML
<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Install Makestuff</title><style>
*{box-sizing:border-box}body{margin:0;background:#f5f2ec;color:#1f1b16;font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:34rem;margin:0 auto;padding:2.5rem 1rem}h1{font-size:1.5rem;margin:0 0 1.25rem}h2{font-size:1.2rem;margin:0 0 .75rem}h3{font-size:1rem;margin:1.5rem 0 .25rem}
ol{list-style:none;display:flex;flex-wrap:wrap;gap:.25rem 1rem;padding:0;margin:0 0 1.25rem;font-size:.85rem;color:#8a8175}li.now{color:#1f1b16;font-weight:600}li.past{color:#2e6b4f}
.card{background:#fff;border:1px solid #e3ddd2;border-radius:.75rem;padding:1.5rem}p{margin:0 0 1rem}
label{display:block;font-size:.9rem;font-weight:500;margin-bottom:.9rem}input,select{display:block;width:100%;margin-top:.25rem;padding:.55rem .65rem;font:inherit;border:1px solid #cfc7b9;border-radius:.5rem;background:#fff}
small{display:block;font-weight:400;color:#6e665b;margin-top:.25rem}.actions{margin-top:1.25rem;display:flex;gap:.5rem;flex-wrap:wrap}
button,.btn{display:inline-block;background:#1f1b16;color:#fff;border:0;border-radius:.5rem;padding:.6rem 1.1rem;font:inherit;font-weight:600;text-decoration:none;cursor:pointer}
.ghost{background:transparent;color:#1f1b16;box-shadow:inset 0 0 0 1px #cfc7b9}.err{background:#fbe9e5;color:#8c2a17;padding:.6rem .8rem;border-radius:.5rem}.ok{background:#e4f2ea;color:#1e5a3f;padding:.6rem .8rem;border-radius:.5rem}
.checks{list-style:none;padding:0;margin:0 0 1.25rem}.checks li{padding:.2rem 0}.pass{color:#2e6b4f}.fail{color:#8c2a17;font-weight:600}
</style></head><body><main><h1>Install Makestuff</h1><ol>{$steps}</ol><div class="card">{$alert}{$body}</div></main></body></html>
HTML;
    }
}
