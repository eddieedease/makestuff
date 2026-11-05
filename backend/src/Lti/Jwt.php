<?php
declare(strict_types=1);

namespace App\Lti;

use App\Core\HttpError;

/** RS256 JWTs and JWK handling on plain OpenSSL. */
final class Jwt
{
    public static function b64(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    public static function unb64(string $data): string
    {
        return (string) base64_decode(strtr($data, '-_', '+/'), true);
    }

    public static function sign(array $payload, string $privateKeyPem, string $kid): string
    {
        $head = self::b64(json_encode(['typ' => 'JWT', 'alg' => 'RS256', 'kid' => $kid]));
        $body = self::b64(json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
        if (!openssl_sign("$head.$body", $signature, $privateKeyPem, OPENSSL_ALGO_SHA256)) {
            throw new \RuntimeException('Could not sign JWT');
        }
        return "$head.$body." . self::b64($signature);
    }

    /** @return array{0: array, 1: array, 2: string, 3: string} header, payload, signed part, signature */
    public static function parse(string $token): array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            throw new HttpError(401, 'Malformed LTI token');
        }
        $header = json_decode(self::unb64($parts[0]), true);
        $payload = json_decode(self::unb64($parts[1]), true);
        if (!is_array($header) || !is_array($payload)) {
            throw new HttpError(401, 'Malformed LTI token');
        }
        return [$header, $payload, $parts[0] . '.' . $parts[1], self::unb64($parts[2])];
    }

    /** The algorithm is pinned here; it is never taken from the token. */
    public static function verifySignature(string $signed, string $signature, array $jwk): bool
    {
        if (($jwk['kty'] ?? '') !== 'RSA' || empty($jwk['n']) || empty($jwk['e'])) {
            return false;
        }
        return openssl_verify($signed, $signature, self::jwkToPem($jwk), OPENSSL_ALGO_SHA256) === 1;
    }

    public static function jwkToPem(array $jwk): string
    {
        $rsa = self::seq(self::int(self::unb64($jwk['n'])) . self::int(self::unb64($jwk['e'])));
        $algorithm = hex2bin('300d06092a864886f70d0101010500'); // rsaEncryption, NULL
        $spki = self::seq($algorithm . "\x03" . self::len(strlen($rsa) + 1) . "\x00" . $rsa);
        return "-----BEGIN PUBLIC KEY-----\n" . chunk_split(base64_encode($spki), 64, "\n") . "-----END PUBLIC KEY-----\n";
    }

    private static function int(string $bytes): string
    {
        $bytes = ltrim($bytes, "\x00");
        if ($bytes === '' || ord($bytes[0]) > 0x7f) {
            $bytes = "\x00" . $bytes;
        }
        return "\x02" . self::len(strlen($bytes)) . $bytes;
    }

    private static function seq(string $content): string
    {
        return "\x30" . self::len(strlen($content)) . $content;
    }

    private static function len(int $length): string
    {
        if ($length < 0x80) {
            return chr($length);
        }
        $bytes = ltrim(pack('N', $length), "\x00");
        return chr(0x80 | strlen($bytes)) . $bytes;
    }
}
