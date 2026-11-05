<?php
declare(strict_types=1);

namespace App\Lti;

use App\Core\Db;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Response;
use App\Core\Url;

/** Launch sessions: the bridge from a verified LTI launch to the Angular player. */
final class Launch
{
    private const LIFETIME = 28800;

    public static function create(array $fields): string
    {
        $token = bin2hex(random_bytes(32));
        $fields += ['token_hash' => hash('sha256', $token), 'expires_at' => Db::now(self::LIFETIME), 'created_at' => Db::now()];
        $columns = implode(', ', array_keys($fields));
        $marks = implode(', ', array_fill(0, count($fields), '?'));
        Db::run("INSERT INTO launch_sessions ($columns) VALUES ($marks)", array_values($fields));
        Db::run('DELETE FROM launch_sessions WHERE expires_at < ?', [Db::now()]);
        return $token;
    }

    public static function fromRequest(Request $r, array $kinds): array
    {
        $session = Db::one('SELECT * FROM launch_sessions WHERE token_hash = ? AND expires_at > ?', [
            hash('sha256', $r->header('X-Launch-Token')), Db::now(),
        ]);
        if ($session === null || !in_array($session['kind'], $kinds, true)) {
            throw new HttpError(401, 'This session has expired. Open the activity again from your course.');
        }
        return $session;
    }

    /** Resolve the requested object, refusing anything unpublished. */
    public static function publishedObject(string $publicId): array
    {
        $object = $publicId === '' ? null : Db::one('SELECT id, title FROM learning_objects WHERE public_id = ? AND published_content IS NOT NULL', [$publicId]);
        if ($object === null) {
            throw new HttpError(404, 'This activity does not exist or is not published.');
        }
        return $object;
    }

    public static function isInstructor(array $roles): bool
    {
        foreach ($roles as $role) {
            if (preg_match('/instructor|faculty|staff|administrator|teachingassistant|contentdeveloper/i', (string) $role)) {
                return true;
            }
        }
        return false;
    }

    public static function redirectToPlayer(string $token): void
    {
        Response::redirect(Url::frontend() . '/play/' . $token);
    }

    public static function redirectToPicker(string $token): void
    {
        Response::redirect(Url::frontend() . '/pick/' . $token);
    }
}
