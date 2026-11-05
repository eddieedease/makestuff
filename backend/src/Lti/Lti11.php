<?php
declare(strict_types=1);

namespace App\Lti;

use App\Core\Db;
use App\Core\HttpError;

final class Lti11
{
    private const TIMESTAMP_WINDOW = 600;

    /** Checks the signed launch and returns the matching connection. */
    public static function verify(string $url, array $params): array
    {
        if (($params['lti_message_type'] ?? '') !== 'basic-lti-launch-request') {
            throw new HttpError(400, 'Unsupported LTI message type.');
        }
        if (!in_array($params['lti_version'] ?? '', ['LTI-1p0', 'LTI-1.0', 'LTI-1p1', 'LTI-1p2'], true)) {
            throw new HttpError(400, 'Unsupported LTI version.');
        }
        if (empty($params['resource_link_id'])) {
            throw new HttpError(400, 'The launch has no resource_link_id.');
        }
        if (($params['oauth_signature_method'] ?? '') !== 'HMAC-SHA1') {
            throw new HttpError(401, 'Unsupported signature method.');
        }
        $connection = Db::one(
            "SELECT * FROM lti_connections WHERE version = '1.1' AND consumer_key = ? AND is_active = 1",
            [(string) ($params['oauth_consumer_key'] ?? '')]
        );
        if ($connection === null) {
            throw new HttpError(401, 'This LMS is not connected. Ask your administrator to add it.');
        }
        if (abs(time() - (int) ($params['oauth_timestamp'] ?? 0)) > self::TIMESTAMP_WINDOW) {
            throw new HttpError(401, 'The launch request is too old. Check that the LMS clock is right.');
        }
        $expected = OAuth1::signature('POST', $url, $params, (string) $connection['shared_secret']);
        if (!hash_equals($expected, (string) ($params['oauth_signature'] ?? ''))) {
            throw new HttpError(401, 'The launch signature is invalid. Check the key, secret and launch URL.');
        }

        // Only signed requests reach this point, so nonces cannot be used to fill the table.
        Db::run('DELETE FROM lti_nonces WHERE expires_at < ?', [Db::now()]);
        try {
            Db::run('INSERT INTO lti_nonces (value_hash, connection_id, expires_at) VALUES (?, ?, ?)', [
                hash('sha256', '1.1|' . $connection['id'] . '|' . ($params['oauth_nonce'] ?? '')),
                $connection['id'],
                Db::now(self::TIMESTAMP_WINDOW * 2),
            ]);
        } catch (\PDOException $e) {
            throw new HttpError(401, 'This launch link was already used. Open the activity again from your course.');
        }
        return $connection;
    }
}
