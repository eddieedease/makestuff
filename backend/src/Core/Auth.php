<?php
declare(strict_types=1);

namespace App\Core;

final class Auth
{
    private const TOKEN_DAYS = 14;
    private const MAX_FAILURES = 8;
    private const FAILURE_WINDOW = 900;

    public static function issueToken(int $userId): string
    {
        $token = bin2hex(random_bytes(32));
        Db::run('INSERT INTO auth_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)', [
            hash('sha256', $token), $userId, Db::now(self::TOKEN_DAYS * 86400), Db::now(),
        ]);
        return $token;
    }

    public static function revokeToken(string $token): void
    {
        Db::run('DELETE FROM auth_tokens WHERE token_hash = ?', [hash('sha256', $token)]);
    }

    public static function user(Request $request): ?array
    {
        $token = $request->bearerToken();
        if ($token === null) {
            return null;
        }
        return Db::one(
            'SELECT u.* FROM auth_tokens t JOIN users u ON u.id = t.user_id
             WHERE t.token_hash = ? AND t.expires_at > ? AND u.is_active = 1',
            [hash('sha256', $token), Db::now()]
        );
    }

    public static function require(Request $request): array
    {
        $user = self::user($request);
        if ($user === null) {
            throw new HttpError(401, 'Please sign in');
        }
        $user['id'] = (int) $user['id'];
        return $user;
    }

    public static function requireAdmin(Request $request): array
    {
        $user = self::require($request);
        if ($user['role'] !== 'admin') {
            throw new HttpError(403, 'Administrators only');
        }
        return $user;
    }

    public static function publicUser(array $u): array
    {
        return [
            'id' => (int) $u['id'],
            'username' => $u['username'],
            'email' => $u['email'],
            'name' => $u['name'],
            'role' => $u['role'],
            'is_active' => (bool) $u['is_active'],
            'last_login_at' => $u['last_login_at'],
        ];
    }

    public static function checkThrottle(string $key): void
    {
        $count = (int) Db::value(
            'SELECT COUNT(*) FROM login_failures WHERE key_hash = ? AND failed_at > ?',
            [hash('sha256', $key), Db::now(-self::FAILURE_WINDOW)]
        );
        if ($count >= self::MAX_FAILURES) {
            throw new HttpError(429, 'Too many failed attempts. Try again in 15 minutes.');
        }
    }

    public static function recordFailure(string $key): void
    {
        Db::run('INSERT INTO login_failures (key_hash, failed_at) VALUES (?, ?)', [hash('sha256', $key), Db::now()]);
        Db::run('DELETE FROM login_failures WHERE failed_at < ?', [Db::now(-self::FAILURE_WINDOW)]);
    }

    public static function clearFailures(string $key): void
    {
        Db::run('DELETE FROM login_failures WHERE key_hash = ?', [hash('sha256', $key)]);
    }
}
