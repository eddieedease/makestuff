<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Db;
use App\Core\HttpError;
use App\Core\Lang;
use App\Core\Request;
use App\Core\Response;
use App\Core\Url;
use App\Lti\Launch;
use App\Types\Directives;
use App\Types\Registry;

final class ObjectController
{
    /** Authors reach their own items; admins reach everything. Others get a 404, not a hint. */
    private function find(Request $r, array $user): array
    {
        $row = Db::one(
            'SELECT o.*, u.name AS owner_name, u.username AS owner_username
             FROM learning_objects o JOIN users u ON u.id = o.owner_id WHERE o.id = ?',
            [(int) $r->params['id']]
        );
        if ($row === null || ($user['role'] !== 'admin' && (int) $row['owner_id'] !== $user['id'])) {
            throw new HttpError(404, 'Item not found');
        }
        return $row;
    }

    private function present(array $o, bool $full = false): array
    {
        $data = [
            'id' => (int) $o['id'],
            'public_id' => $o['public_id'],
            'type' => $o['type'],
            'title' => $o['title'],
            'description' => (string) $o['description'],
            'owner' => ['id' => (int) $o['owner_id'], 'name' => $o['owner_name'], 'username' => $o['owner_username']],
            'published_at' => $o['published_at'],
            'has_changes' => $o['published_content'] !== null && $o['published_content'] !== $o['content'],
            'created_at' => $o['created_at'],
            'updated_at' => $o['updated_at'],
        ];
        if ($full) {
            $data['content'] = json_decode($o['content'], true);
        }
        return $data;
    }

    /** The editor's live preview uses the same parser as the player. */
    public function renderMarkdown(Request $r): void
    {
        Auth::require($r);
        Response::json(['segments' => Directives::publicSegments((string) $r->input('markdown', ''))]);
    }

    public function index(Request $r): void
    {
        $user = Auth::require($r);
        $where = [];
        $params = [];
        if ($user['role'] !== 'admin') {
            $where[] = 'o.owner_id = ?';
            $params[] = $user['id'];
        } elseif (!empty($r->query['owner'])) {
            $where[] = 'o.owner_id = ?';
            $params[] = (int) $r->query['owner'];
        }
        if (!empty($r->query['type'])) {
            $where[] = 'o.type = ?';
            $params[] = (string) $r->query['type'];
        }
        if (!empty($r->query['q'])) {
            $where[] = 'o.title LIKE ?';
            $params[] = '%' . addcslashes((string) $r->query['q'], '%_\\') . '%';
        }
        $sql = 'SELECT o.id, o.public_id, o.type, o.title, o.description, o.owner_id, o.content, o.published_content,
                       o.published_at, o.created_at, o.updated_at, u.name AS owner_name, u.username AS owner_username
                FROM learning_objects o JOIN users u ON u.id = o.owner_id'
            . ($where ? ' WHERE ' . implode(' AND ', $where) : '') . ' ORDER BY o.updated_at DESC';
        Response::json(['objects' => array_map([$this, 'present'], Db::all($sql, $params))]);
    }

    public function create(Request $r): void
    {
        $user = Auth::require($r);
        $type = Registry::get($r->str('type'));
        $title = $r->str('title') ?: 'Untitled ' . strtolower($type->label());
        $id = self::insert($user['id'], $type->key(), $title, '', $type->defaultContent());
        $r->params['id'] = $id;
        Response::json(['object' => $this->present($this->find($r, $user), true)], 201);
    }

    public static function insert(int $ownerId, string $type, string $title, string $description, array $content, ?string $publicId = null): int
    {
        return Db::insert(
            'INSERT INTO learning_objects (public_id, owner_id, type, title, description, content, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [$publicId ?? bin2hex(random_bytes(8)), $ownerId, $type, mb_substr($title, 0, 255), $description, json_encode($content, JSON_UNESCAPED_UNICODE), Db::now(), Db::now()]
        );
    }

    public function show(Request $r): void
    {
        $user = Auth::require($r);
        Response::json(['object' => $this->present($this->find($r, $user), true)]);
    }

    public function update(Request $r): void
    {
        $user = Auth::require($r);
        $object = $this->find($r, $user);
        $content = $r->input('content');
        if (!is_array($content)) {
            throw new HttpError(422, 'Content is missing');
        }
        $title = $r->str('title');
        if ($title === '') {
            throw new HttpError(422, 'Give it a title');
        }
        Db::run('UPDATE learning_objects SET title = ?, description = ?, content = ?, updated_at = ? WHERE id = ?', [
            mb_substr($title, 0, 255), $r->str('description'), json_encode($content, JSON_UNESCAPED_UNICODE), Db::now(), $object['id'],
        ]);
        Response::json(['object' => $this->present($this->find($r, $user), true)]);
    }

    public function delete(Request $r): void
    {
        $user = Auth::require($r);
        $object = $this->find($r, $user);
        Db::run('DELETE FROM learning_objects WHERE id = ?', [$object['id']]);
        Response::json(['ok' => true]);
    }

    public function publish(Request $r): void
    {
        $user = Auth::require($r);
        $object = $this->find($r, $user);
        $problems = Registry::get($object['type'])->validate(json_decode($object['content'], true));
        if ($problems !== []) {
            throw new HttpError(422, 'Fix these first', ['problems' => $problems]);
        }
        Db::run('UPDATE learning_objects SET published_content = content, published_at = ? WHERE id = ?', [Db::now(), $object['id']]);
        Response::json(['object' => $this->present($this->find($r, $user), true)]);
    }

    public function unpublish(Request $r): void
    {
        $user = Auth::require($r);
        $object = $this->find($r, $user);
        Db::run('UPDATE learning_objects SET published_content = NULL, published_at = NULL WHERE id = ?', [$object['id']]);
        Response::json(['object' => $this->present($this->find($r, $user), true)]);
    }

    public function duplicate(Request $r): void
    {
        $user = Auth::require($r);
        $object = $this->find($r, $user);
        $id = self::insert($user['id'], $object['type'], Lang::t('Copy of {title}', ['title' => $object['title']]), (string) $object['description'], json_decode($object['content'], true));
        $r->params['id'] = $id;
        Response::json(['object' => $this->present($this->find($r, $user), true)], 201);
    }

    /** Opens the real player on the draft. Previews never reach reports or an LMS. */
    public function preview(Request $r): void
    {
        $user = Auth::require($r);
        $object = $this->find($r, $user);
        Db::run("DELETE FROM attempts WHERE object_id = ? AND learner_ref = ?", [$object['id'], 'preview:' . $user['id']]);
        $token = Launch::create([
            'kind' => 'preview',
            'object_id' => $object['id'],
            'learner_ref' => 'preview:' . $user['id'],
            'learner_name' => $user['name'],
            'role' => 'instructor',
            'resource_link_id' => 'preview',
            'locale' => $user['locale'] ?? Lang::get(),
        ]);
        Response::json(['token' => $token]);
    }

    /** Hand an item to another author. */
    public function assign(Request $r): void
    {
        $user = Auth::requireAdmin($r);
        $object = $this->find($r, $user);
        $ownerId = (int) $r->input('owner_id', 0);
        if (Db::value('SELECT id FROM users WHERE id = ?', [$ownerId]) === null) {
            throw new HttpError(422, 'That user does not exist');
        }
        Db::run('UPDATE learning_objects SET owner_id = ? WHERE id = ?', [$ownerId, $object['id']]);
        Response::json(['object' => $this->present($this->find($r, $user), true)]);
    }

    public function results(Request $r): void
    {
        $user = Auth::require($r);
        $object = $this->find($r, $user);
        $rows = Db::all(
            "SELECT a.*, c.name AS connection_name FROM attempts a
             LEFT JOIN lti_connections c ON c.id = a.connection_id
             WHERE a.object_id = ? AND a.learner_ref NOT LIKE 'preview:%'
             ORDER BY a.started_at DESC LIMIT 1000",
            [$object['id']]
        );
        Response::json(['attempts' => array_map(static function (array $a): array {
            return [
                'id' => (int) $a['id'],
                'learner' => $a['learner_name'] ?: $a['learner_ref'],
                'lms' => $a['connection_name'],
                'course' => $a['context_title'],
                'status' => $a['status'],
                'progress' => (float) $a['progress'],
                'score' => $a['score'] === null ? null : (float) $a['score'],
                'passback_status' => $a['passback_status'],
                'passback_error' => $a['passback_error'],
                'started_at' => $a['started_at'],
                'completed_at' => $a['completed_at'],
            ];
        }, $rows)]);
    }

    /** Everything an LMS administrator needs to embed this item. */
    public function embed(Request $r): void
    {
        $user = Auth::require($r);
        $object = $this->find($r, $user);
        $base = Url::base();
        Response::json([
            'lti11' => ['launch_url' => $base . '/lti/1.1/launch/' . $object['public_id']],
            'lti13' => [
                'target_link_uri' => $base . '/lti/1.3/launch?object=' . $object['public_id'],
                'custom_parameters' => 'object=' . $object['public_id'],
            ],
            'tool' => [
                'login_url' => $base . '/lti/1.3/login',
                'redirect_url' => $base . '/lti/1.3/launch',
                'jwks_url' => $base . '/lti/1.3/jwks',
                'deep_linking_url' => $base . '/lti/1.3/launch',
            ],
            'connections' => array_map(static function (array $c): array {
                return ['name' => $c['name'], 'version' => $c['version']];
            }, Db::all('SELECT name, version FROM lti_connections WHERE is_active = 1 ORDER BY name')),
        ]);
    }
}
