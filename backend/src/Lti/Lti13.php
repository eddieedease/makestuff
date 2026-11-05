<?php
declare(strict_types=1);

namespace App\Lti;

use App\Core\Db;
use App\Core\Http;
use App\Core\HttpError;
use App\Core\Url;

final class Lti13
{
    public const CLAIM = 'https://purl.imsglobal.org/spec/lti/claim/';
    public const DL_CLAIM = 'https://purl.imsglobal.org/spec/lti-dl/claim/';
    public const AGS_CLAIM = 'https://purl.imsglobal.org/spec/lti-ags/claim/endpoint';
    public const SCORE_SCOPE = 'https://purl.imsglobal.org/spec/lti-ags/scope/score';
    private const STATE_LIFETIME = 300;
    private const JWKS_MAX_AGE = 3600;
    private const CLOCK_SKEW = 60;

    public static function connection(string $issuer, string $clientId): array
    {
        $rows = Db::all(
            "SELECT * FROM lti_connections WHERE version = '1.3' AND issuer = ? AND is_active = 1" . ($clientId !== '' ? ' AND client_id = ?' : ''),
            $clientId !== '' ? [$issuer, $clientId] : [$issuer]
        );
        if (count($rows) !== 1) {
            throw new HttpError(401, 'This LMS is not connected. Ask your administrator to add it.');
        }
        return $rows[0];
    }

    /** Step 1 of the launch: send the browser to the LMS authorization endpoint. */
    public static function authRedirectUrl(array $connection, array $input): string
    {
        $target = (string) ($input['target_link_uri'] ?? '');
        if (strpos($target, Url::base() . '/') !== 0) {
            throw new HttpError(400, 'The launch points to another tool.');
        }
        $state = bin2hex(random_bytes(24));
        $nonce = bin2hex(random_bytes(24));
        Db::run('DELETE FROM lti_nonces WHERE expires_at < ?', [Db::now()]);
        Db::run('INSERT INTO lti_nonces (value_hash, connection_id, nonce, expires_at) VALUES (?, ?, ?, ?)', [
            hash('sha256', '1.3|' . $state), $connection['id'], $nonce, Db::now(self::STATE_LIFETIME),
        ]);
        $query = [
            'scope' => 'openid',
            'response_type' => 'id_token',
            'response_mode' => 'form_post',
            'prompt' => 'none',
            'client_id' => $connection['client_id'],
            'redirect_uri' => Url::base() . '/lti/1.3/launch',
            'login_hint' => (string) ($input['login_hint'] ?? ''),
            'state' => $state,
            'nonce' => $nonce,
        ];
        if (isset($input['lti_message_hint'])) {
            $query['lti_message_hint'] = (string) $input['lti_message_hint'];
        }
        $url = $connection['auth_login_url'];
        return $url . (strpos($url, '?') === false ? '?' : '&') . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
    }

    /** Step 2: validate the id_token the LMS posted back. Returns connection and claims. */
    public static function validate(string $state, string $idToken): array
    {
        $stateHash = hash('sha256', '1.3|' . $state);
        $row = Db::one('SELECT * FROM lti_nonces WHERE value_hash = ? AND expires_at > ?', [$stateHash, Db::now()]);
        if ($row === null || Db::run('DELETE FROM lti_nonces WHERE value_hash = ?', [$stateHash])->rowCount() !== 1) {
            throw new HttpError(401, 'This launch has expired. Open the activity again from your course.');
        }
        $connection = Db::one('SELECT * FROM lti_connections WHERE id = ? AND is_active = 1', [$row['connection_id']]);
        if ($connection === null) {
            throw new HttpError(401, 'This LMS is not connected any more.');
        }

        [$header, $claims, $signed, $signature] = Jwt::parse($idToken);
        if (($header['alg'] ?? '') !== 'RS256') {
            throw new HttpError(401, 'Unsupported token algorithm.');
        }
        if (!Jwt::verifySignature($signed, $signature, self::findKey($connection, (string) ($header['kid'] ?? '')))) {
            throw new HttpError(401, 'The launch token signature is invalid.');
        }

        $audience = (array) ($claims['aud'] ?? []);
        $now = time();
        if (($claims['iss'] ?? '') !== $connection['issuer'] || !in_array($connection['client_id'], $audience, true)) {
            throw new HttpError(401, 'The launch token was issued for someone else.');
        }
        if (count($audience) > 1 && ($claims['azp'] ?? '') !== $connection['client_id']) {
            throw new HttpError(401, 'The launch token was issued for someone else.');
        }
        if ((int) ($claims['exp'] ?? 0) + self::CLOCK_SKEW < $now || (int) ($claims['iat'] ?? 0) - self::CLOCK_SKEW > $now) {
            throw new HttpError(401, 'The launch token is outside its validity window.');
        }
        if (!hash_equals((string) $row['nonce'], (string) ($claims['nonce'] ?? ''))) {
            throw new HttpError(401, 'The launch token does not match this launch.');
        }
        if (($claims[self::CLAIM . 'version'] ?? '') !== '1.3.0') {
            throw new HttpError(400, 'Unsupported LTI version.');
        }
        $deployment = (string) ($claims[self::CLAIM . 'deployment_id'] ?? '');
        $allowed = array_filter(array_map('trim', explode(',', (string) $connection['deployment_ids'])), 'strlen');
        if ($deployment === '' || ($allowed !== [] && !in_array($deployment, $allowed, true))) {
            throw new HttpError(401, 'This deployment is not registered. Add its deployment ID to the connection.');
        }
        return [$connection, $claims];
    }

    /** Look the key up in the cached key set; refetch once on an unknown kid (key rotation). */
    private static function findKey(array $connection, string $kid): array
    {
        $fresh = $connection['jwks_fetched_at'] !== null && strtotime($connection['jwks_fetched_at'] . ' UTC') > time() - self::JWKS_MAX_AGE;
        $keys = $fresh ? (array) json_decode((string) $connection['jwks_cache'], true) : self::fetchKeys($connection);
        $key = self::match($keys, $kid);
        if ($key === null && $fresh) {
            $key = self::match(self::fetchKeys($connection), $kid);
        }
        if ($key === null) {
            throw new HttpError(401, 'The LMS signing key could not be found.');
        }
        return $key;
    }

    private static function match(array $keys, string $kid): ?array
    {
        foreach ($keys as $key) {
            if (($key['kid'] ?? '') === $kid) {
                return $key;
            }
        }
        return null;
    }

    private static function fetchKeys(array $connection): array
    {
        try {
            $response = Http::request('GET', $connection['keyset_url'], ['Accept: application/json']);
        } catch (\RuntimeException $e) {
            throw new HttpError(502, 'Could not reach the LMS key set: ' . $e->getMessage());
        }
        $decoded = json_decode($response['body'], true);
        if ($response['status'] !== 200 || !isset($decoded['keys']) || !is_array($decoded['keys'])) {
            throw new HttpError(502, 'The LMS key set could not be read.');
        }
        Db::run('UPDATE lti_connections SET jwks_cache = ?, jwks_fetched_at = ? WHERE id = ?', [json_encode($decoded['keys']), Db::now(), $connection['id']]);
        return $decoded['keys'];
    }

    /** OAuth2 client-credentials token, authenticated with a JWT signed by our key. */
    public static function accessToken(array $connection, string $scope): string
    {
        $now = time();
        $assertion = Jwt::sign([
            'iss' => $connection['client_id'],
            'sub' => $connection['client_id'],
            'aud' => $connection['auth_token_url'],
            'iat' => $now,
            'exp' => $now + 300,
            'jti' => bin2hex(random_bytes(16)),
        ], Keys::privatePem(), Keys::kid());
        $response = Http::request('POST', $connection['auth_token_url'], ['Content-Type: application/x-www-form-urlencoded', 'Accept: application/json'], http_build_query([
            'grant_type' => 'client_credentials',
            'client_assertion_type' => 'urn:ietf:params:oauth:client-assertion-type:jwt-bearer',
            'client_assertion' => $assertion,
            'scope' => $scope,
        ]));
        $decoded = json_decode($response['body'], true);
        if ($response['status'] !== 200 || empty($decoded['access_token'])) {
            throw new \RuntimeException('LMS token request failed with HTTP ' . $response['status']);
        }
        return (string) $decoded['access_token'];
    }
}
