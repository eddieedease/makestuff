<?php
declare(strict_types=1);

namespace App\Core;

final class Response
{
    public static function json($data, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store');
        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
    }

    public static function html(string $html, int $status = 200): void
    {
        http_response_code($status);
        header('Content-Type: text/html; charset=utf-8');
        echo $html;
    }

    public static function redirect(string $url): void
    {
        http_response_code(302);
        header('Location: ' . $url);
    }

    /** HTML page that immediately posts a form, used to send data back to an LMS. */
    public static function autoPost(string $url, array $fields): void
    {
        $inputs = '';
        foreach ($fields as $name => $value) {
            $inputs .= sprintf('<input type="hidden" name="%s" value="%s">', self::e($name), self::e((string) $value));
        }
        self::html('<!doctype html><meta charset="utf-8"><title>Redirecting</title><form id="f" method="post" action="'
            . self::e($url) . '">' . $inputs . '<noscript><button>Continue</button></noscript></form>'
            . '<script>document.getElementById("f").submit()</script>');
    }

    public static function e(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
    }

    /** Readable error page for failed LTI launches; the learner sees this inside the LMS. */
    public static function errorPage(string $title, string $message, int $status): void
    {
        self::html('<!doctype html><meta charset="utf-8"><title>' . self::e($title) . '</title>'
            . '<body style="font-family:system-ui,sans-serif;max-width:32rem;margin:3rem auto;padding:0 1rem;color:#1c1917">'
            . '<h1 style="font-size:1.25rem">' . self::e($title) . '</h1><p>' . self::e($message) . '</p>', $status);
    }
}
