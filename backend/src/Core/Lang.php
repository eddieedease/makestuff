<?php
declare(strict_types=1);

namespace App\Core;

/**
 * Gettext-style translation: the English text is the key and src/Lang holds
 * one dictionary per extra language. Text without an entry stays English.
 * To add a language: add it to SUPPORTED and create src/Lang/<code>.php.
 */
final class Lang
{
    public const SUPPORTED = ['en', 'nl'];

    private static string $locale = 'en';
    private static array $dictionaries = [];

    public static function get(): string
    {
        return self::$locale;
    }

    public static function set(?string $locale): void
    {
        self::$locale = self::normalize($locale) ?? self::$locale;
    }

    /** "nl-BE" and "nl_NL" become "nl"; null when we do not speak it. */
    public static function normalize(?string $locale): ?string
    {
        $code = strtolower(substr(trim((string) $locale), 0, 2));
        return in_array($code, self::SUPPORTED, true) ? $code : null;
    }

    /** First language in an Accept-Language header that we support. */
    public static function fromHeader(string $header): ?string
    {
        foreach (explode(',', $header) as $part) {
            $code = self::normalize(explode(';', $part)[0]);
            if ($code !== null) {
                return $code;
            }
        }
        return null;
    }

    public static function t(string $text, array $params = []): string
    {
        $text = self::dictionary()[$text] ?? $text;
        foreach ($params as $key => $value) {
            $text = str_replace('{' . $key . '}', (string) $value, $text);
        }
        return $text;
    }

    private static function dictionary(): array
    {
        $locale = self::$locale;
        if ($locale === 'en') {
            return [];
        }
        return self::$dictionaries[$locale] ??= (array) require APP_ROOT . "/src/Lang/$locale.php";
    }
}
