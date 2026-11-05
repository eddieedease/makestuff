<?php
declare(strict_types=1);

namespace App\Core;

final class Url
{
    public static ?Request $request = null;

    /** Public URL of this install, without trailing slash. */
    public static function base(): string
    {
        $configured = (string) Config::get('app_url', '');
        if ($configured !== '') {
            return rtrim($configured, '/');
        }
        return self::detect();
    }

    /** Where the Angular app lives: separate in development, same origin in production. */
    public static function frontend(): string
    {
        $configured = (string) Config::get('frontend_url', '');
        return $configured !== '' ? rtrim($configured, '/') : self::base();
    }

    public static function detect(): string
    {
        $https = ($_SERVER['HTTPS'] ?? '') === 'on' || ($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https';
        $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
        return ($https ? 'https://' : 'http://') . $host . (self::$request ? self::$request->basePath : '');
    }
}
