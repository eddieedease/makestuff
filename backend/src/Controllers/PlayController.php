<?php
declare(strict_types=1);

namespace App\Controllers;

use App\Core\Db;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Response;
use App\Lti\Launch;
use App\Lti\Outcomes;
use App\Types\LearningType;
use App\Types\Registry;

/** The learner's side. Identity comes from the launch token, never from the request body. */
final class PlayController
{
    /** @return array{0: array, 1: array, 2: LearningType, 3: array} session, object, type, content */
    private function context(Request $r): array
    {
        $session = Launch::fromRequest($r, ['play', 'preview']);
        $object = Db::one('SELECT * FROM learning_objects WHERE id = ?', [$session['object_id']]);
        if ($object === null) {
            throw new HttpError(410, 'This activity has been removed');
        }
        $json = $session['kind'] === 'preview' ? $object['content'] : $object['published_content'];
        if ($json === null) {
            throw new HttpError(410, 'This activity is no longer published');
        }
        return [$session, $object, Registry::get($object['type']), json_decode($json, true)];
    }

    private function scope(array $session): array
    {
        return [$session['object_id'], $session['learner_ref'], $session['resource_link_id'], $session['connection_id']];
    }

    private function current(array $session): array
    {
        $attempt = Db::one(
            'SELECT * FROM attempts WHERE object_id = ? AND learner_ref = ? AND resource_link_id <=> ? AND connection_id <=> ?
             ORDER BY id DESC LIMIT 1',
            $this->scope($session)
        );
        return $attempt ?? $this->start($session);
    }

    private function start(array $session): array
    {
        $id = Db::insert(
            'INSERT INTO attempts (object_id, connection_id, learner_ref, learner_name, context_title, resource_link_id, started_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)',
            [$session['object_id'], $session['connection_id'], $session['learner_ref'], $session['learner_name'], $session['context_title'], $session['resource_link_id'], Db::now()]
        );
        return Db::one('SELECT * FROM attempts WHERE id = ?', [$id]);
    }

    private function used(array $session): int
    {
        return (int) Db::value(
            'SELECT COUNT(*) FROM attempts WHERE object_id = ? AND learner_ref = ? AND resource_link_id <=> ? AND connection_id <=> ?',
            $this->scope($session)
        );
    }

    private function canRetake(array $session, LearningType $type, array $content): bool
    {
        $max = $type->maxAttempts($content);
        return $session['role'] === 'instructor' || $max === 0 || $this->used($session) < $max;
    }

    private function presentAttempt(array $a): array
    {
        return [
            'status' => $a['status'],
            'progress' => (float) $a['progress'],
            'state' => $a['state'] === null ? null : json_decode($a['state'], true),
            'result' => $a['result'] === null ? null : json_decode($a['result'], true),
            'passback_status' => $a['passback_status'],
        ];
    }

    public function session(Request $r): void
    {
        [$session, $object, $type, $content] = $this->context($r);
        $attempt = $this->current($session);
        Response::json([
            'preview' => $session['kind'] === 'preview',
            'locale' => $session['locale'],
            'learner' => ['name' => $session['learner_name'], 'role' => $session['role']],
            'object' => [
                'type' => $object['type'],
                'title' => $object['title'],
                'description' => (string) $object['description'],
                'content' => $type->publicContent($content),
            ],
            'attempt' => $this->presentAttempt($attempt),
            'can_retake' => $this->canRetake($session, $type, $content),
        ]);
    }

    public function check(Request $r): void
    {
        [, , $type, $content] = $this->context($r);
        Response::json($type->check($content, $r->str('id'), $r->input('answer')));
    }

    public function progress(Request $r): void
    {
        [$session] = $this->context($r);
        $attempt = $this->current($session);
        $progress = max(0.0, min(1.0, (float) $r->input('progress', 0)));
        $state = json_encode($r->input('state'), JSON_UNESCAPED_UNICODE);
        if (strlen((string) $state) > 1000000) {
            throw new HttpError(413, 'Progress data is too large');
        }
        Db::run("UPDATE attempts SET progress = ?, state = ? WHERE id = ? AND status = 'in_progress'", [$progress, $state, $attempt['id']]);
        Response::json(['ok' => true]);
    }

    public function submit(Request $r): void
    {
        [$session, , $type, $content] = $this->context($r);
        $attempt = $this->current($session);
        $answers = $r->input('answers', []);
        $result = $type->score($content, is_array($answers) ? $answers : []);

        // The status guard makes a double click count once.
        $stored = Db::run(
            "UPDATE attempts SET status = 'completed', progress = 1, score = ?, result = ?, state = ?, completed_at = ?
             WHERE id = ? AND status = 'in_progress'",
            [round($result['score'], 4), json_encode($result, JSON_UNESCAPED_UNICODE), json_encode(['answers' => $answers], JSON_UNESCAPED_UNICODE), Db::now(), $attempt['id']]
        );
        if ($stored->rowCount() === 0) {
            throw new HttpError(409, 'This attempt was already submitted');
        }
        Outcomes::send($session, (int) $attempt['id']);

        Response::json([
            'attempt' => $this->presentAttempt(Db::one('SELECT * FROM attempts WHERE id = ?', [$attempt['id']])),
            'can_retake' => $this->canRetake($session, $type, $content),
        ]);
    }

    public function restart(Request $r): void
    {
        [$session, , $type, $content] = $this->context($r);
        $attempt = $this->current($session);
        if ($attempt['status'] === 'completed') {
            if (!$this->canRetake($session, $type, $content)) {
                throw new HttpError(403, 'You have used all your attempts');
            }
            $attempt = $this->start($session);
        }
        Response::json([
            'attempt' => $this->presentAttempt($attempt),
            'can_retake' => $this->canRetake($session, $type, $content),
        ]);
    }
}
