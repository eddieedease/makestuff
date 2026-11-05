<?php
declare(strict_types=1);

namespace App\Core;

/** Minimal outbound HTTP, used to talk to LMSs. */
final class Http
{
    /** @return array{status:int, body:string} */
    public static function request(string $method, string $url, array $headers = [], ?string $body = null): array
    {
        $scheme = parse_url($url, PHP_URL_SCHEME);
        if ($scheme !== 'http' && $scheme !== 'https') {
            throw new \RuntimeException('Unsupported URL scheme');
        }
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_CONNECTTIMEOUT => 5,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_FOLLOWLOCATION => false,
            CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        ]);
        if ($body !== null) {
            curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
        }
        $response = curl_exec($ch);
        if ($response === false) {
            $error = curl_error($ch);
            curl_close($ch);
            throw new \RuntimeException('Request failed: ' . $error);
        }
        $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
        curl_close($ch);
        return ['status' => $status, 'body' => (string) $response];
    }
}
