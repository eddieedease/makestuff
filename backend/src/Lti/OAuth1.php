<?php
declare(strict_types=1);

namespace App\Lti;

/** OAuth 1.0a HMAC-SHA1, the signature scheme of LTI 1.1. */
final class OAuth1
{
    public static function encode(string $value): string
    {
        return str_replace('%7E', '~', rawurlencode($value));
    }

    public static function signature(string $method, string $url, array $params, string $secret, string $tokenSecret = ''): string
    {
        unset($params['oauth_signature']);
        $pairs = [];
        foreach ($params as $key => $value) {
            foreach ((array) $value as $item) {
                $pairs[] = [self::encode((string) $key), self::encode((string) $item)];
            }
        }
        usort($pairs, static function (array $a, array $b): int {
            return $a[0] === $b[0] ? strcmp($a[1], $b[1]) : strcmp($a[0], $b[0]);
        });
        $query = implode('&', array_map(static fn (array $p) => $p[0] . '=' . $p[1], $pairs));
        $base = strtoupper($method) . '&' . self::encode(self::normalizeUrl($url)) . '&' . self::encode($query);
        $key = self::encode($secret) . '&' . self::encode($tokenSecret);
        return base64_encode(hash_hmac('sha1', $base, $key, true));
    }

    /** Scheme and host lowercase, default ports dropped, query removed (it is part of the params). */
    private static function normalizeUrl(string $url): string
    {
        $p = parse_url($url);
        $scheme = strtolower((string) ($p['scheme'] ?? 'http'));
        $host = strtolower((string) ($p['host'] ?? ''));
        $port = isset($p['port']) && !(($scheme === 'http' && $p['port'] === 80) || ($scheme === 'https' && $p['port'] === 443))
            ? ':' . $p['port'] : '';
        return $scheme . '://' . $host . $port . ($p['path'] ?? '');
    }
}
