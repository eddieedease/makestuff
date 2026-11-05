<?php
declare(strict_types=1);

namespace App\Lti;

use App\Core\Db;
use App\Core\Http;

/** Sends grades to the LMS: Basic Outcomes for LTI 1.1, Assignment and Grade Services for 1.3. */
final class Outcomes
{
    /**
     * A failing LMS must not cost the learner their result, so errors are
     * stored on the attempt and shown to the author instead of thrown.
     */
    public static function send(array $session, int $attemptId): void
    {
        $eligible = $session['kind'] === 'play' && $session['role'] === 'learner' && $session['connection_id'] !== null
            && ($session['outcome_url'] !== null || $session['ags_lineitem'] !== null);
        if (!$eligible) {
            return;
        }
        // Retakes never lower a grade: the LMS always gets the best attempt.
        $best = (float) Db::value(
            "SELECT MAX(score) FROM attempts WHERE object_id = ? AND learner_ref = ? AND resource_link_id <=> ? AND connection_id <=> ? AND status = 'completed'",
            [$session['object_id'], $session['learner_ref'], $session['resource_link_id'], $session['connection_id']]
        );
        try {
            $connection = Db::one('SELECT * FROM lti_connections WHERE id = ?', [$session['connection_id']]);
            if ($connection === null) {
                throw new \RuntimeException('The LMS connection no longer exists');
            }
            if ($session['lti_version'] === '1.3') {
                self::sendAgs($session, $connection, $best);
            } else {
                self::sendBasicOutcome($session, $connection, $best);
            }
            Db::run("UPDATE attempts SET passback_status = 'sent', passback_error = NULL WHERE id = ?", [$attemptId]);
        } catch (\Throwable $e) {
            error_log('[makestuff] grade passback failed: ' . $e->getMessage());
            Db::run("UPDATE attempts SET passback_status = 'failed', passback_error = ? WHERE id = ?", [mb_substr($e->getMessage(), 0, 500), $attemptId]);
        }
    }

    private static function sendAgs(array $session, array $connection, float $score): void
    {
        $token = Lti13::accessToken($connection, Lti13::SCORE_SCOPE);
        $url = self::scoresUrl($session['ags_lineitem']);
        $response = Http::request('POST', $url, [
            'Authorization: Bearer ' . $token,
            'Content-Type: application/vnd.ims.lis.v1.score+json',
        ], json_encode([
            'userId' => $session['learner_ref'],
            'scoreGiven' => round($score * 100, 2),
            'scoreMaximum' => 100,
            'activityProgress' => 'Completed',
            'gradingProgress' => 'FullyGraded',
            'timestamp' => gmdate('Y-m-d\TH:i:s\Z'),
        ]));
        if ($response['status'] < 200 || $response['status'] >= 300) {
            throw new \RuntimeException('LMS refused the score with HTTP ' . $response['status']);
        }
    }

    /** "/scores" goes on the path, before any query string the line item URL has. */
    private static function scoresUrl(string $lineItem): string
    {
        $parts = explode('?', $lineItem, 2);
        return rtrim($parts[0], '/') . '/scores' . (isset($parts[1]) ? '?' . $parts[1] : '');
    }

    private static function sendBasicOutcome(array $session, array $connection, float $score): void
    {
        $sourcedId = htmlspecialchars((string) $session['outcome_sourcedid'], ENT_XML1 | ENT_QUOTES, 'UTF-8');
        $messageId = bin2hex(random_bytes(8));
        $grade = number_format($score, 4, '.', '');
        $xml = <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<imsx_POXEnvelopeRequest xmlns="http://www.imsglobal.org/services/ltiv1p1/xsd/imsoms_v1p0">
  <imsx_POXHeader><imsx_POXRequestHeaderInfo>
    <imsx_version>V1.0</imsx_version>
    <imsx_messageIdentifier>{$messageId}</imsx_messageIdentifier>
  </imsx_POXRequestHeaderInfo></imsx_POXHeader>
  <imsx_POXBody><replaceResultRequest><resultRecord>
    <sourcedGUID><sourcedId>{$sourcedId}</sourcedId></sourcedGUID>
    <result><resultScore><language>en</language><textString>{$grade}</textString></resultScore></result>
  </resultRecord></replaceResultRequest></imsx_POXBody>
</imsx_POXEnvelopeRequest>
XML;
        $oauth = [
            'oauth_version' => '1.0',
            'oauth_nonce' => bin2hex(random_bytes(16)),
            'oauth_timestamp' => (string) time(),
            'oauth_consumer_key' => $connection['consumer_key'],
            'oauth_body_hash' => base64_encode(sha1($xml, true)),
            'oauth_signature_method' => 'HMAC-SHA1',
        ];
        $url = $session['outcome_url'];
        parse_str((string) parse_url($url, PHP_URL_QUERY), $query);
        $oauth['oauth_signature'] = OAuth1::signature('POST', $url, array_merge($query, $oauth), (string) $connection['shared_secret']);

        $header = 'OAuth realm=""';
        foreach ($oauth as $key => $value) {
            $header .= ', ' . $key . '="' . OAuth1::encode($value) . '"';
        }
        $response = Http::request('POST', $url, ['Authorization: ' . $header, 'Content-Type: application/xml'], $xml);
        if ($response['status'] !== 200 || stripos($response['body'], '<imsx_codeMajor>success</imsx_codeMajor>') === false) {
            throw new \RuntimeException('LMS refused the grade with HTTP ' . $response['status']);
        }
    }
}
