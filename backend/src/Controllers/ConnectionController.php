<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Response;

/** Which LMSs may launch content. Holds secrets, so administrators only. */
final class ConnectionController
{
    public function index(Request $r): void
    {
        Auth::requireAdmin($r);
        $rows = Db::all('SELECT * FROM lti_connections ORDER BY name');
        Response::json(['connections' => array_map([self::class, 'present'], $rows)]);
    }

    public function create(Request $r): void
    {
        Auth::requireAdmin($r);
        $version = $r->str('version');
        if ($version !== '1.1' && $version !== '1.3') {
            throw new HttpError(422, 'Choose LTI 1.1 or 1.3');
        }
        $fields = self::fields($r, $version);
        if ($version === '1.1') {
            $fields['consumer_key'] = $fields['consumer_key'] ?: bin2hex(random_bytes(10));
            $fields['shared_secret'] = bin2hex(random_bytes(24));
        }
        $fields += ['version' => $version, 'created_at' => Db::now()];
        $columns = implode(', ', array_keys($fields));
        $marks = implode(', ', array_fill(0, count($fields), '?'));
        $id = Db::insert("INSERT INTO lti_connections ($columns) VALUES ($marks)", array_values($fields));
        Response::json(['connection' => self::present(Db::one('SELECT * FROM lti_connections WHERE id = ?', [$id]))], 201);
    }

    public function update(Request $r): void
    {
        Auth::requireAdmin($r);
        $id = (int) $r->params['id'];
        $row = Db::one('SELECT * FROM lti_connections WHERE id = ?', [$id]);
        if ($row === null) {
            throw new HttpError(404, 'Connection not found');
        }
        $fields = self::fields($r, $row['version']);
        if ($row['version'] === '1.1') {
            $fields['consumer_key'] = $fields['consumer_key'] ?: $row['consumer_key'];
            if ($r->input('regenerate_secret')) {
                $fields['shared_secret'] = bin2hex(random_bytes(24));
            }
        }
        $set = implode(', ', array_map(static fn ($c) => "$c = ?", array_keys($fields)));
        Db::run("UPDATE lti_connections SET $set WHERE id = ?", array_merge(array_values($fields), [$id]));
        Response::json(['connection' => self::present(Db::one('SELECT * FROM lti_connections WHERE id = ?', [$id]))]);
    }

    public function delete(Request $r): void
    {
        Auth::requireAdmin($r);
        Db::run('DELETE FROM lti_connections WHERE id = ?', [(int) $r->params['id']]);
        Response::json(['ok' => true]);
    }

    private static function fields(Request $r, string $version): array
    {
        $name = $r->str('name');
        if ($name === '') {
            throw new HttpError(422, 'Give the connection a name');
        }
        $fields = ['name' => $name, 'is_active' => $r->input('is_active', true) ? 1 : 0];
        if ($version === '1.1') {
            $fields['consumer_key'] = $r->str('consumer_key');
            if ($fields['consumer_key'] !== '') {
                $clash = Db::value('SELECT id FROM lti_connections WHERE consumer_key = ? AND id <> ?', [$fields['consumer_key'], (int) ($r->params['id'] ?? 0)]);
                if ($clash !== null) {
                    throw new HttpError(409, 'That consumer key is already in use');
                }
            }
            return $fields;
        }
        foreach (['issuer', 'client_id', 'auth_login_url', 'auth_token_url', 'keyset_url'] as $key) {
            $fields[$key] = $r->str($key);
            if ($fields[$key] === '') {
                throw new HttpError(422, 'All LMS details are required for LTI 1.3');
            }
        }
        foreach (['issuer', 'auth_login_url', 'auth_token_url', 'keyset_url'] as $key) {
            if (!preg_match('#^https?://#i', $fields[$key])) {
                throw new HttpError(422, 'The issuer and LMS endpoints must be http(s) URLs');
            }
        }
        $fields['deployment_ids'] = $r->str('deployment_ids');
        return $fields;
    }

    private static function present(array $c): array
    {
        return [
            'id' => (int) $c['id'],
            'name' => $c['name'],
            'version' => $c['version'],
            'is_active' => (bool) $c['is_active'],
            'consumer_key' => $c['consumer_key'],
            'shared_secret' => $c['shared_secret'],
            'issuer' => $c['issuer'],
            'client_id' => $c['client_id'],
            'deployment_ids' => $c['deployment_ids'],
            'auth_login_url' => $c['auth_login_url'],
            'auth_token_url' => $c['auth_token_url'],
            'keyset_url' => $c['keyset_url'],
        ];
    }
}
