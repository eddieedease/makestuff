<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Db;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Response;
use App\Core\Url;
use App\Lti\Jwt;
use App\Lti\Keys;
use App\Lti\Launch;
use App\Lti\Lti13;

/** LTI 1.3 Deep Linking: a teacher in the LMS picks which item to embed. */
final class PickController
{
    public function index(Request $r): void
    {
        $session = Launch::fromRequest($r, ['deeplink']);
        $link = json_decode($session['deep_link'], true);
        Response::json([
            'context' => $session['context_title'],
            'multiple' => !empty($link['settings']['accept_multiple']),
            'objects' => array_map(static function (array $o): array {
                return ['public_id' => $o['public_id'], 'type' => $o['type'], 'title' => $o['title'], 'description' => (string) $o['description']];
            }, Db::all('SELECT public_id, type, title, description FROM learning_objects WHERE published_content IS NOT NULL ORDER BY title')),
        ]);
    }

    /** Returns a signed JWT; the browser posts it to the LMS. */
    public function select(Request $r): void
    {
        $session = Launch::fromRequest($r, ['deeplink']);
        $link = json_decode($session['deep_link'], true);
        $connection = Db::one('SELECT * FROM lti_connections WHERE id = ?', [$session['connection_id']]);
        $ids = array_map('strval', (array) $r->input('public_ids', []));
        if ($ids === [] || $connection === null) {
            throw new HttpError(422, 'Choose an item');
        }
        if (empty($link['settings']['accept_multiple'])) {
            $ids = array_slice($ids, 0, 1);
        }
        $items = [];
        foreach ($ids as $id) {
            $object = Db::one('SELECT public_id, title, description FROM learning_objects WHERE public_id = ? AND published_content IS NOT NULL', [$id]);
            if ($object === null) {
                throw new HttpError(404, 'That item is not published');
            }
            $items[] = [
                'type' => 'ltiResourceLink',
                'title' => $object['title'],
                'text' => (string) $object['description'],
                'url' => Url::base() . '/lti/1.3/launch?object=' . $object['public_id'],
                'custom' => ['object' => $object['public_id']],
                'lineItem' => ['scoreMaximum' => 100, 'label' => $object['title']],
            ];
        }
        $now = time();
        $claims = [
            'iss' => $connection['client_id'],
            'aud' => $connection['issuer'],
            'iat' => $now,
            'exp' => $now + 300,
            'nonce' => bin2hex(random_bytes(16)),
            Lti13::CLAIM . 'deployment_id' => $link['deployment_id'],
            Lti13::CLAIM . 'message_type' => 'LtiDeepLinkingResponse',
            Lti13::CLAIM . 'version' => '1.3.0',
            Lti13::DL_CLAIM . 'content_items' => $items,
        ];
        if (isset($link['settings']['data'])) {
            $claims[Lti13::DL_CLAIM . 'data'] = $link['settings']['data'];
        }
        Response::json([
            'return_url' => $link['settings']['deep_link_return_url'],
            'jwt' => Jwt::sign($claims, Keys::privatePem(), Keys::kid()),
        ]);
    }
}
