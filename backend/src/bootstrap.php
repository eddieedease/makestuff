<?php
declare(strict_types=1);

define('APP_ROOT', dirname(__DIR__));

// No Composer on purpose: the release is a folder you can upload over FTP.
spl_autoload_register(static function (string $class): void {
    if (strncmp($class, 'App\\', 4) !== 0) {
        return;
    }
    $file = __DIR__ . '/' . str_replace('\\', '/', substr($class, 4)) . '.php';
    if (is_file($file)) {
        require $file;
    }
});
