<?php
declare(strict_types=1);

namespace App\Lti;

use App\Core\Db;

/** This tool's RSA key pair. LMSs fetch the public half from /lti/1.3/jwks. */
final class Keys
{
    public static function generate(): void
    {
        if (Db::value("SELECT value FROM settings WHERE name = 'lti_private_key'") !== null) {
            return;
        }
        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        if ($key === false || !openssl_pkey_export($key, $pem)) {
            throw new \RuntimeException('Could not generate an RSA key: ' . openssl_error_string());
        }
        Db::run("INSERT INTO settings (name, value) VALUES ('lti_private_key', ?), ('lti_kid', ?)", [$pem, bin2hex(random_bytes(8))]);
    }

    public static function privatePem(): string
    {
        self::generate();
        return (string) Db::value("SELECT value FROM settings WHERE name = 'lti_private_key'");
    }

    public static function kid(): string
    {
        self::generate();
        return (string) Db::value("SELECT value FROM settings WHERE name = 'lti_kid'");
    }

    public static function publicJwk(): array
    {
        $details = openssl_pkey_get_details(openssl_pkey_get_private(self::privatePem()));
        return [
            'kty' => 'RSA',
            'alg' => 'RS256',
            'use' => 'sig',
            'kid' => self::kid(),
            'n' => Jwt::b64($details['rsa']['n']),
            'e' => Jwt::b64($details['rsa']['e']),
        ];
    }
}
