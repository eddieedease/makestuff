<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Settings come from config/config.php (written by the installer) or, in the
 * Docker development stack, from MAKESTUFF_* environment variables.
 */
final class Config
{
    private static ?array $values = null;

    public static function path(): string
    {
        return APP_ROOT . '/config/config.php';
    }

    public static function installed(): bool
    {
        return self::all() !== [];
    }

    public static function all(): array
    {
        if (self::$values !== null) {
            return self::$values;
        }
        if (getenv('MAKESTUFF_ENV')) {
            return self::$values = self::fromEnv();
        }
        $path = self::path();
        return self::$values = is_file($path) ? (array) require $path : [];
    }

    public static function get(string $key, $default = null)
    {
        $value = self::all();
        foreach (explode('.', $key) as $part) {
            if (!is_array($value) || !array_key_exists($part, $value)) {
                return $default;
            }
            $value = $value[$part];
        }
        return $value;
    }

    public static function isDev(): bool
    {
        return self::get('env') === 'development';
    }

    private static function fromEnv(): array
    {
        return [
            'env' => getenv('MAKESTUFF_ENV'),
            'site_name' => 'Makestuff',
            'app_url' => getenv('MAKESTUFF_APP_URL') ?: '',
            'frontend_url' => getenv('MAKESTUFF_FRONTEND_URL') ?: '',
            'secret' => getenv('MAKESTUFF_SECRET') ?: '',
            'db' => [
                'host' => getenv('MAKESTUFF_DB_HOST'),
                'port' => (int) getenv('MAKESTUFF_DB_PORT'),
                'name' => getenv('MAKESTUFF_DB_NAME'),
                'user' => getenv('MAKESTUFF_DB_USER'),
                'pass' => getenv('MAKESTUFF_DB_PASS'),
            ],
            'mail' => [
                'host' => getenv('MAKESTUFF_MAIL_HOST') ?: '',
                'port' => (int) (getenv('MAKESTUFF_MAIL_PORT') ?: 25),
                'encryption' => '',
                'user' => '',
                'pass' => '',
                'from_email' => 'noreply@makestuff.test',
                'from_name' => 'Makestuff',
            ],
        ];
    }
}
