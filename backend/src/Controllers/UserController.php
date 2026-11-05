<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Response;

final class UserController
{
    public static function assertPassword(string $password): void
    {
        if (strlen($password) < 8) {
            throw new HttpError(422, 'Passwords need at least 8 characters');
        }
    }

    /** Admins get the full list; authors get nothing here. */
    public function index(Request $r): void
    {
        Auth::requireAdmin($r);
        $users = Db::all('SELECT u.*, (SELECT COUNT(*) FROM learning_objects o WHERE o.owner_id = u.id) AS object_count
                          FROM users u ORDER BY u.name');
        Response::json(['users' => array_map(static function (array $u): array {
            return Auth::publicUser($u) + ['object_count' => (int) $u['object_count']];
        }, $users)]);
    }

    public function create(Request $r): void
    {
        Auth::requireAdmin($r);
        $username = $r->str('username');
        $email = $r->str('email');
        $name = $r->str('name');
        $password = (string) $r->input('password', '');
        if (!preg_match('/^[A-Za-z0-9._-]{3,64}$/', $username)) {
            throw new HttpError(422, 'Usernames need 3 to 64 letters, digits, dots, dashes or underscores');
        }
        if ($name === '') {
            throw new HttpError(422, 'Enter a name');
        }
        self::assertUnique($username, $email, 0);
        self::assertPassword($password);
        $id = Db::insert('INSERT INTO users (username, email, name, password_hash, role, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
            $username, $email, $name, password_hash($password, PASSWORD_DEFAULT), self::role($r), Db::now(),
        ]);
        Response::json(['user' => Auth::publicUser(Db::one('SELECT * FROM users WHERE id = ?', [$id]))], 201);
    }

    public function update(Request $r): void
    {
        $admin = Auth::requireAdmin($r);
        $id = (int) $r->params['id'];
        $user = Db::one('SELECT * FROM users WHERE id = ?', [$id]);
        if ($user === null) {
            throw new HttpError(404, 'User not found');
        }
        $email = $r->str('email') ?: $user['email'];
        $name = $r->str('name') ?: $user['name'];
        $role = self::role($r, $user['role']);
        $active = (bool) $r->input('is_active', (bool) $user['is_active']);
        self::assertUnique($user['username'], $email, $id);
        if ($id === $admin['id'] && ($role !== 'admin' || !$active)) {
            throw new HttpError(422, 'You cannot remove your own administrator access');
        }
        Db::run('UPDATE users SET email = ?, name = ?, role = ?, is_active = ? WHERE id = ?', [$email, $name, $role, $active ? 1 : 0, $id]);
        $password = (string) $r->input('password', '');
        if ($password !== '') {
            self::assertPassword($password);
            Db::run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $id]);
            Db::run('DELETE FROM auth_tokens WHERE user_id = ?', [$id]);
        }
        if (!$active) {
            Db::run('DELETE FROM auth_tokens WHERE user_id = ?', [$id]);
        }
        Response::json(['user' => Auth::publicUser(Db::one('SELECT * FROM users WHERE id = ?', [$id]))]);
    }

    /** Content survives its author: it moves to the admin who deletes the account. */
    public function delete(Request $r): void
    {
        $admin = Auth::requireAdmin($r);
        $id = (int) $r->params['id'];
        if ($id === $admin['id']) {
            throw new HttpError(422, 'You cannot delete your own account');
        }
        Db::pdo()->beginTransaction();
        Db::run('UPDATE learning_objects SET owner_id = ? WHERE owner_id = ?', [$admin['id'], $id]);
        Db::run('UPDATE media SET owner_id = ? WHERE owner_id = ?', [$admin['id'], $id]);
        Db::run('DELETE FROM users WHERE id = ?', [$id]);
        Db::pdo()->commit();
        Response::json(['ok' => true]);
    }

    private static function role(Request $r, string $default = 'user'): string
    {
        $role = $r->str('role', $default);
        if ($role !== 'admin' && $role !== 'user') {
            throw new HttpError(422, 'Unknown role');
        }
        return $role;
    }

    private static function assertUnique(string $username, string $email, int $ignoreId): void
    {
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new HttpError(422, 'Enter a valid email address');
        }
        if (Db::value('SELECT id FROM users WHERE (username = ? OR email = ?) AND id <> ?', [$username, $email, $ignoreId]) !== null) {
            throw new HttpError(409, 'That username or email address is already in use');
        }
    }
}
