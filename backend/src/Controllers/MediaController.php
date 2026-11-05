<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Response;

final class MediaController
{
    /** SVG is left out deliberately: it can carry scripts. */
    private const TYPES = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/gif' => 'gif', 'image/webp' => 'webp'];
    private const MAX_BYTES = 8 * 1024 * 1024;

    public function upload(Request $r): void
    {
        $user = Auth::require($r);
        $file = $r->files['file'] ?? null;
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            throw new HttpError(422, 'The upload did not arrive. Images can be up to 8 MB.');
        }
        if ($file['size'] > self::MAX_BYTES) {
            throw new HttpError(422, 'Images can be up to 8 MB');
        }
        $mime = (string) (new \finfo(FILEINFO_MIME_TYPE))->file($file['tmp_name']);
        if (!isset(self::TYPES[$mime])) {
            throw new HttpError(422, 'Use a JPG, PNG, GIF or WebP image');
        }
        $name = bin2hex(random_bytes(16)) . '.' . self::TYPES[$mime];
        if (!move_uploaded_file($file['tmp_name'], APP_ROOT . '/storage/uploads/' . $name)) {
            throw new HttpError(500, 'Could not store the image. Check that storage/uploads is writable.');
        }
        Db::run('INSERT INTO media (file_name, original_name, mime, size_bytes, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?)', [
            $name, mb_substr((string) $file['name'], 0, 255), $mime, (int) $file['size'], $user['id'], Db::now(),
        ]);
        Response::json(['url' => 'media/' . $name, 'name' => $file['name']], 201);
    }

    public function serve(Request $r): void
    {
        $name = $r->params['name'];
        if (!preg_match('/^[a-f0-9]{32}\.(jpg|png|gif|webp)$/', $name)) {
            throw new HttpError(404, 'Not found');
        }
        $mime = Db::value('SELECT mime FROM media WHERE file_name = ?', [$name]);
        $path = APP_ROOT . '/storage/uploads/' . $name;
        if ($mime === null || !is_file($path)) {
            throw new HttpError(404, 'Not found');
        }
        header('Content-Type: ' . $mime);
        header('Content-Length: ' . filesize($path));
        header('Cache-Control: public, max-age=31536000, immutable');
        readfile($path);
    }
}
