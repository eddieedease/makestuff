<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\HttpError;
use App\Core\Lang;
use App\Core\Request;
use App\Core\Response;
use App\Core\Url;
use App\Lti\Keys;
use App\Lti\Launch;
use App\Lti\Lti11;
use App\Lti\Lti13;

final class LtiController
{
    public function launch11(Request $r): void
    {
        $params = array_merge($r->query, $r->post);
        $locale = Lang::normalize($params['launch_presentation_locale'] ?? null);
        Lang::set($locale);
        // The signature covers the URL the LMS used, so it is built from the configured base URL.
        $connection = Lti11::verify(Url::base() . $r->path, $params);

        $publicId = (string) ($r->params['publicId'] ?? $params['custom_object'] ?? '');
        $object = Launch::publishedObject($publicId);
        $roles = array_map('trim', explode(',', (string) ($params['roles'] ?? '')));
        $name = trim((string) ($params['lis_person_name_full'] ?? ''))
            ?: trim(($params['lis_person_name_given'] ?? '') . ' ' . ($params['lis_person_name_family'] ?? ''));

        Launch::redirectToPlayer(Launch::create([
            'object_id' => $object['id'],
            'connection_id' => $connection['id'],
            'lti_version' => '1.1',
            'learner_ref' => (string) ($params['user_id'] ?? '') ?: 'anon:' . bin2hex(random_bytes(8)),
            'learner_name' => $name ?: null,
            'learner_email' => $params['lis_person_contact_email_primary'] ?? null,
            'role' => Launch::isInstructor($roles) ? 'instructor' : 'learner',
            'context_title' => $params['context_title'] ?? null,
            'resource_link_id' => (string) $params['resource_link_id'],
            'outcome_url' => $params['lis_outcome_service_url'] ?? null,
            'outcome_sourcedid' => $params['lis_result_sourcedid'] ?? null,
            'locale' => $locale,
        ]));
    }

    public function login13(Request $r): void
    {
        $input = array_merge($r->query, $r->post);
        foreach (['iss', 'login_hint', 'target_link_uri'] as $required) {
            if (empty($input[$required])) {
                throw new HttpError(400, Lang::t('The LMS did not send {field}.', ['field' => $required]));
            }
        }
        $connection = Lti13::connection((string) $input['iss'], (string) ($input['client_id'] ?? ''));
        Response::redirect(Lti13::authRedirectUrl($connection, $input));
    }

    public function launch13(Request $r): void
    {
        $state = (string) ($r->post['state'] ?? '');
        $idToken = (string) ($r->post['id_token'] ?? '');
        if ($state === '' || $idToken === '') {
            throw new HttpError(400, 'The launch is missing its token.');
        }
        [$connection, $claims] = Lti13::validate($state, $idToken);
        $presentation = $claims[Lti13::CLAIM . 'launch_presentation'] ?? [];
        $locale = Lang::normalize($presentation['locale'] ?? $claims['locale'] ?? null);
        Lang::set($locale);

        $base = [
            'connection_id' => $connection['id'],
            'lti_version' => '1.3',
            'learner_ref' => (string) ($claims['sub'] ?? '') ?: 'anon:' . bin2hex(random_bytes(8)),
            'learner_name' => $claims['name'] ?? null,
            'learner_email' => $claims['email'] ?? null,
            'role' => Launch::isInstructor((array) ($claims[Lti13::CLAIM . 'roles'] ?? [])) ? 'instructor' : 'learner',
            'context_title' => $claims[Lti13::CLAIM . 'context']['title'] ?? null,
            'locale' => $locale,
        ];

        $messageType = $claims[Lti13::CLAIM . 'message_type'] ?? '';
        if ($messageType === 'LtiDeepLinkingRequest') {
            $settings = $claims[Lti13::DL_CLAIM . 'deep_linking_settings'] ?? null;
            if (!is_array($settings) || empty($settings['deep_link_return_url'])) {
                throw new HttpError(400, 'The deep linking request has no return URL.');
            }
            Launch::redirectToPicker(Launch::create($base + [
                'kind' => 'deeplink',
                'deep_link' => json_encode([
                    'settings' => $settings,
                    'deployment_id' => $claims[Lti13::CLAIM . 'deployment_id'],
                ]),
            ]));
            return;
        }
        if ($messageType !== 'LtiResourceLinkRequest') {
            throw new HttpError(400, 'Unsupported LTI message type.');
        }

        $resourceId = (string) ($claims[Lti13::CLAIM . 'resource_link']['id'] ?? '');
        if ($resourceId === '') {
            throw new HttpError(400, 'The launch has no resource link.');
        }
        $ags = $claims[Lti13::AGS_CLAIM] ?? [];
        $canScore = in_array(Lti13::SCORE_SCOPE, (array) ($ags['scope'] ?? []), true);
        $object = Launch::publishedObject(self::objectId($claims));

        Launch::redirectToPlayer(Launch::create($base + [
            'object_id' => $object['id'],
            'resource_link_id' => $resourceId,
            'ags_lineitem' => $canScore ? ($ags['lineitem'] ?? null) : null,
            'ags_can_score' => $canScore ? 1 : 0,
        ]));
    }

    /** From the custom claim, else from ?object= on the target link. */
    private static function objectId(array $claims): string
    {
        $custom = $claims[Lti13::CLAIM . 'custom']['object'] ?? '';
        if (is_string($custom) && $custom !== '' && strpos($custom, '$') !== 0) {
            return $custom;
        }
        parse_str((string) parse_url((string) ($claims[Lti13::CLAIM . 'target_link_uri'] ?? ''), PHP_URL_QUERY), $query);
        return (string) ($query['object'] ?? '');
    }

    public function jwks(Request $r): void
    {
        header('Cache-Control: public, max-age=3600');
        http_response_code(200);
        header('Content-Type: application/json');
        echo json_encode(['keys' => [Keys::publicJwk()]], JSON_UNESCAPED_SLASHES);
    }
}
