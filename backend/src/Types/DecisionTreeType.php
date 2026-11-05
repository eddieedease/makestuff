<?php
declare(strict_types=1);

namespace App\Types;

use App\Core\HttpError;
use App\Core\Lang;

/**
 * A branching scenario: steps offer choices that lead to other steps, until
 * the learner reaches an ending.
 * { settings: {grading: completion|ending, passPercentage, maxAttempts, allowBack},
 *   startId,
 *   nodes: [{id, kind: step|end, title, text,
 *            choices: [{id, text, feedback, targetId}],   // steps
 *            score}] }                                    // endings, 0-100
 *
 * The browser only ever receives the current step. Learners cannot read the
 * endings or their scores from the page, and because the server replays the
 * whole path, a claimed ending has to be one that was really reached.
 */
final class DecisionTreeType extends LearningType
{
    private const MAX_PATH = 500;

    public function key(): string
    {
        return 'decision_tree';
    }

    public function label(): string
    {
        return 'Decision tree';
    }

    public function description(): string
    {
        return 'A branching scenario where choices lead to different endings.';
    }

    public function defaultContent(): array
    {
        $start = 'n' . bin2hex(random_bytes(4));
        $end = 'n' . bin2hex(random_bytes(4));
        return [
            'settings' => ['grading' => 'completion', 'passPercentage' => 70, 'maxAttempts' => 0, 'allowBack' => true],
            'startId' => $start,
            'nodes' => [
                [
                    'id' => $start,
                    'kind' => 'step',
                    'title' => Lang::t('Start'),
                    'text' => Lang::t('Describe the situation.'),
                    'choices' => [['id' => 'c' . bin2hex(random_bytes(4)), 'text' => Lang::t('First choice'), 'feedback' => '', 'targetId' => $end]],
                ],
                ['id' => $end, 'kind' => 'end', 'title' => Lang::t('Ending'), 'text' => Lang::t('Describe how it ends.'), 'choices' => [], 'score' => 100],
            ],
        ];
    }

    public function validate(array $content): array
    {
        $nodes = $this->index($content);
        $start = (string) ($content['startId'] ?? '');
        if (!isset($nodes[$start])) {
            return [Lang::t('Choose a starting step.')];
        }
        $problems = [];
        foreach ($nodes as $node) {
            $name = $this->name($node);
            if (trim((string) ($node['text'] ?? '')) === '') {
                $problems[] = Lang::t('"{name}" has no text.', ['name' => $name]);
            }
            if (($node['kind'] ?? 'step') === 'end') {
                $score = $node['score'] ?? null;
                if (!is_numeric($score) || $score < 0 || $score > 100) {
                    $problems[] = Lang::t('"{name}" needs a score from 0 to 100.', ['name' => $name]);
                }
                continue;
            }
            if (empty($node['choices'])) {
                $problems[] = Lang::t('"{name}" has no choices.', ['name' => $name]);
            }
            foreach ($node['choices'] ?? [] as $choice) {
                if (trim((string) ($choice['text'] ?? '')) === '') {
                    $problems[] = Lang::t('"{name}" has a choice without text.', ['name' => $name]);
                }
                if (!isset($nodes[$choice['targetId'] ?? ''])) {
                    $problems[] = Lang::t('"{name}" has a choice that leads nowhere.', ['name' => $name]);
                }
            }
        }

        $reachable = $this->reachableFrom($nodes, [$start], false);
        $endings = array_keys(array_filter($nodes, static fn (array $n) => ($n['kind'] ?? 'step') === 'end'));
        if (array_intersect($endings, $reachable) === []) {
            $problems[] = Lang::t('The scenario needs an ending that learners can reach.');
        }
        $canFinish = $this->reachableFrom($nodes, $endings, true);
        foreach ($nodes as $id => $node) {
            if (!in_array($id, $reachable, true)) {
                $problems[] = Lang::t('"{name}" cannot be reached from the start.', ['name' => $this->name($node)]);
            } elseif (!in_array($id, $canFinish, true) && $endings !== []) {
                $problems[] = Lang::t('"{name}" never leads to an ending, so learners get stuck.', ['name' => $this->name($node)]);
            }
        }
        return array_values(array_unique($problems));
    }

    public function publicContent(array $content): array
    {
        $start = $this->index($content)[$content['startId'] ?? ''] ?? null;
        return [
            'settings' => ['allowBack' => !empty($content['settings']['allowBack'])],
            'start' => $start === null ? null : $this->publicNode($start),
        ];
    }

    /** Replays the choices made so far and returns where they lead. */
    public function check(array $content, string $itemId, $answer): array
    {
        if ($itemId !== 'walk') {
            throw new HttpError(404, 'Not found');
        }
        [$node, $trail] = $this->walk($content, is_array($answer) ? $answer : []);
        $last = $trail === [] ? null : $trail[count($trail) - 1];
        return ['node' => $this->publicNode($node), 'feedback' => $last['feedback'] ?? ''];
    }

    public function score(array $content, array $answers): array
    {
        $path = $answers['path'] ?? [];
        [$node, $trail] = $this->walk($content, is_array($path) ? $path : []);
        if (($node['kind'] ?? 'step') !== 'end') {
            throw new HttpError(422, 'Reach an ending first');
        }
        $percentage = (float) ($node['score'] ?? 0);
        $graded = ($content['settings']['grading'] ?? 'completion') === 'ending';
        return [
            'score' => $graded ? $percentage / 100 : 1.0,
            'passed' => $graded ? $percentage >= (float) ($content['settings']['passPercentage'] ?? 70) : null,
            'detail' => [
                'ending' => ['title' => (string) ($node['title'] ?? ''), 'text' => (string) ($node['text'] ?? '')],
                'percentage' => $percentage,
                'graded' => $graded,
                'trail' => $trail,
            ],
        ];
    }

    /** @return array{0: array, 1: array} the node reached, and the path that led there */
    private function walk(array $content, array $path): array
    {
        $nodes = $this->index($content);
        $node = $nodes[$content['startId'] ?? ''] ?? null;
        if ($node === null || count($path) > self::MAX_PATH) {
            throw new HttpError(422, 'This path does not exist');
        }
        $trail = [];
        foreach ($path as $choiceId) {
            $choice = null;
            foreach ($node['choices'] ?? [] as $candidate) {
                if ((string) $candidate['id'] === (string) (is_scalar($choiceId) ? $choiceId : '')) {
                    $choice = $candidate;
                }
            }
            $next = $choice === null ? null : ($nodes[$choice['targetId'] ?? ''] ?? null);
            if ($next === null) {
                throw new HttpError(422, 'This path does not exist');
            }
            $trail[] = ['step' => (string) ($node['title'] ?? ''), 'choice' => (string) ($choice['text'] ?? ''), 'feedback' => (string) ($choice['feedback'] ?? '')];
            $node = $next;
        }
        return [$node, $trail];
    }

    private function publicNode(array $node): array
    {
        $isEnd = ($node['kind'] ?? 'step') === 'end';
        return [
            'id' => (string) $node['id'],
            'kind' => $isEnd ? 'end' : 'step',
            'title' => (string) ($node['title'] ?? ''),
            'text' => (string) ($node['text'] ?? ''),
            'choices' => $isEnd ? [] : array_map(static function (array $c): array {
                return ['id' => (string) $c['id'], 'text' => (string) ($c['text'] ?? '')];
            }, $node['choices'] ?? []),
        ];
    }

    private function index(array $content): array
    {
        $nodes = [];
        foreach ($content['nodes'] ?? [] as $node) {
            $nodes[(string) $node['id']] = $node;
        }
        return $nodes;
    }

    private function name(array $node): string
    {
        return trim((string) ($node['title'] ?? '')) ?: Lang::t('Untitled');
    }

    /** Ids reachable from the seeds, following choices forwards or backwards. */
    private function reachableFrom(array $nodes, array $seeds, bool $backwards): array
    {
        $edges = [];
        foreach ($nodes as $id => $node) {
            foreach ($node['choices'] ?? [] as $choice) {
                $target = (string) ($choice['targetId'] ?? '');
                if (isset($nodes[$target])) {
                    $edges[$backwards ? $target : $id][] = $backwards ? $id : $target;
                }
            }
        }
        $seen = [];
        $queue = array_map('strval', $seeds);
        while ($queue !== []) {
            $id = array_pop($queue);
            if (!isset($seen[$id])) {
                $seen[$id] = true;
                $queue = array_merge($queue, $edges[$id] ?? []);
            }
        }
        return array_map('strval', array_keys($seen));
    }
}
