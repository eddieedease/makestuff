<?php
declare(strict_types=1);

/*
 * Development only: migrates the database and creates the demo accounts,
 * sample content and mock LMS connections. Refuses to run outside Docker dev,
 * so the well-known passwords below can never reach a real install.
 */
require dirname(__DIR__) . '/src/bootstrap.php';

use App\Controllers\ObjectController;
use App\Core\Config;
use App\Core\Db;
use App\Core\Migrator;
use App\Lti\Keys;
use App\Types\Registry;

if (PHP_SAPI !== 'cli' || !Config::isDev()) {
    fwrite(STDERR, "dev-setup only runs from the command line with MAKESTUFF_ENV=development\n");
    exit(1);
}

Migrator::run();
Keys::generate();

$accounts = [
    ['admin', 'admin123', 'Ada Admin', 'admin@makestuff.test', 'admin'],
    ['user', 'user123', 'Uma User', 'user@makestuff.test', 'user'],
];
foreach ($accounts as [$username, $password, $name, $email, $role]) {
    if (Db::value('SELECT id FROM users WHERE username = ?', [$username]) === null) {
        Db::run('INSERT INTO users (username, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
            $username, $email, $name, password_hash($password, PASSWORD_DEFAULT), $role, Db::now(),
        ]);
    }
}

if (Db::value("SELECT id FROM lti_connections WHERE name LIKE 'Mock LMS%' LIMIT 1") === null) {
    Db::run("INSERT INTO lti_connections (name, version, consumer_key, shared_secret, created_at) VALUES ('Mock LMS (LTI 1.1)', '1.1', 'mock-key', 'mock-secret', ?)", [Db::now()]);
    // Browser-facing URLs use localhost; server-to-server calls use the Docker service name.
    Db::run(
        "INSERT INTO lti_connections (name, version, issuer, client_id, deployment_ids, auth_login_url, auth_token_url, keyset_url, created_at)
         VALUES ('Mock LMS (LTI 1.3)', '1.3', 'http://mock-lms', 'mock-client', '1', 'http://localhost:8093/auth', 'http://mock-lms/token', 'http://mock-lms/jwks', ?)",
        [Db::now()]
    );
}

// Per item, so a new sample also reaches a database that already has content.
{
    $userId = (int) Db::value("SELECT id FROM users WHERE username = 'user'");
    $adminId = (int) Db::value("SELECT id FROM users WHERE username = 'admin'");

    $seed = require __DIR__ . '/dev-content.php';
    foreach ($seed as $item) {
        if (Db::value('SELECT id FROM learning_objects WHERE public_id = ?', [$item['public_id']]) !== null) {
            continue;
        }
        $problems = Registry::get($item['type'])->validate($item['content']);
        if ($problems !== []) {
            fwrite(STDERR, "Invalid sample '{$item['title']}': " . implode(' ', $problems) . "\n");
            exit(1);
        }
        $owner = $item['owner'] === 'admin' ? $adminId : $userId;
        $id = ObjectController::insert($owner, $item['type'], $item['title'], $item['description'], $item['content'], $item['public_id']);
        Db::run('UPDATE learning_objects SET published_content = content, published_at = ? WHERE id = ?', [Db::now(), $id]);
    }
}

echo "Development data ready.\n";
