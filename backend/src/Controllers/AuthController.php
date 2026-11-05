<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Config;
use App\Core\Db;
use App\Core\HttpError;
use App\Core\Lang;
use App\Core\Mailer;
use App\Core\Request;
use App\Core\Response;
use App\Core\Url;

final class AuthController
{
    public function login(Request $r): void
    {
        $login = $r->str('username');
        $key = 'login|' . strtolower($login) . '|' . $r->ip();
        Auth::checkThrottle($key);

        $user = Db::one('SELECT * FROM users WHERE username = ? OR email = ?', [$login, $login]);
        if ($user === null || !$user['is_active'] || !password_verify((string) $r->input('password', ''), $user['password_hash'])) {
            Auth::recordFailure($key);
            throw new HttpError(401, 'Wrong username or password');
        }
        Auth::clearFailures($key);
        Db::run('UPDATE users SET last_login_at = ? WHERE id = ?', [Db::now(), $user['id']]);
        Db::run('DELETE FROM auth_tokens WHERE expires_at < ?', [Db::now()]);
        Response::json(['token' => Auth::issueToken((int) $user['id']), 'user' => Auth::publicUser($user)]);
    }

    public function logout(Request $r): void
    {
        $token = $r->bearerToken();
        if ($token !== null) {
            Auth::revokeToken($token);
        }
        Response::json(['ok' => true]);
    }

    public function me(Request $r): void
    {
        Response::json(['user' => Auth::publicUser(Auth::require($r))]);
    }

    public function updateMe(Request $r): void
    {
        $user = Auth::require($r);
        $name = $r->str('name') ?: $user['name'];
        $email = $r->str('email') ?: $user['email'];
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            throw new HttpError(422, 'Enter a valid email address');
        }
        if (Db::value('SELECT id FROM users WHERE email = ? AND id <> ?', [$email, $user['id']]) !== null) {
            throw new HttpError(409, 'That email address is already in use');
        }
        $password = (string) $r->input('new_password', '');
        if ($password !== '') {
            if (!password_verify((string) $r->input('current_password', ''), $user['password_hash'])) {
                throw new HttpError(422, 'Your current password is not correct');
            }
            UserController::assertPassword($password);
            Db::run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $user['id']]);
        }
        $locale = $r->input('locale') === null ? $user['locale'] : Lang::normalize($r->str('locale'));
        Db::run('UPDATE users SET name = ?, email = ?, locale = ? WHERE id = ?', [$name, $email, $locale, $user['id']]);
        Response::json(['user' => Auth::publicUser(Db::one('SELECT * FROM users WHERE id = ?', [$user['id']]))]);
    }

    /** Always answers the same way, so it cannot be used to discover accounts. */
    public function forgot(Request $r): void
    {
        $email = $r->str('email');
        $key = 'forgot|' . $r->ip();
        Auth::checkThrottle($key);
        Auth::recordFailure($key);

        $user = Db::one('SELECT * FROM users WHERE email = ? AND is_active = 1', [$email]);
        if ($user !== null) {
            $token = bin2hex(random_bytes(32));
            Db::run('DELETE FROM password_resets WHERE user_id = ? OR expires_at < ?', [$user['id'], Db::now()]);
            Db::run('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)', [
                hash('sha256', $token), $user['id'], Db::now(3600),
            ]);
            $link = Url::frontend() . '/reset-password/' . $token;
            Lang::set($user['locale']);
            try {
                Mailer::send(Config::get('mail', []), $user['email'], Lang::t('Reset your password'),
                    Lang::t("Hi {name},\n\nOpen this link within an hour to choose a new password:\n\n{link}\n\nDidn't ask for this? You can ignore this email.\n", ['name' => $user['name'], 'link' => $link]));
            } catch (\Throwable $e) {
                error_log('[makestuff] password reset mail failed: ' . $e->getMessage());
            }
        }
        Response::json(['ok' => true]);
    }

    public function reset(Request $r): void
    {
        $password = (string) $r->input('password', '');
        UserController::assertPassword($password);
        $hash = hash('sha256', $r->str('token'));
        $row = Db::one('SELECT user_id FROM password_resets WHERE token_hash = ? AND expires_at > ?', [$hash, Db::now()]);
        if ($row === null) {
            throw new HttpError(422, 'This link has expired. Request a new one.');
        }
        Db::run('UPDATE users SET password_hash = ? WHERE id = ?', [password_hash($password, PASSWORD_DEFAULT), $row['user_id']]);
        Db::run('DELETE FROM password_resets WHERE user_id = ?', [$row['user_id']]);
        Db::run('DELETE FROM auth_tokens WHERE user_id = ?', [$row['user_id']]);
        Response::json(['ok' => true]);
    }
}
