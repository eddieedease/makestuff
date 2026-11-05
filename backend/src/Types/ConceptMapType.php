<?php
declare(strict_types=1);

namespace App\Types;

use App\Core\HttpError;
use App\Core\Lang;

/**
 * A graph of ideas that learners explore by opening them one by one.
 * { settings: {reveal: all|progressive, requireAll, maxAttempts}, intro, startId,
 *   categories: [{id, name}],
 *   nodes: [{id, title, text, categoryId, x, y}],
 *   edges: [{id, from, to, label}] }
 *
 * With progressive reveal, a node appears once a neighbour has been opened.
 * There are no right answers, so the whole map may go to the browser.
 */
final class ConceptMapType extends LearningType
{
    public function key(): string
    {
        return 'concept_map';
    }

    public function label(): string
    {
        return 'Concept map';
    }

    public function description(): string
    {
        return 'A graph of connected ideas that learners explore.';
    }

    public function defaultContent(): array
    {
        $first = 'n' . bin2hex(random_bytes(4));
        $second = 'n' . bin2hex(random_bytes(4));
        return [
            'settings' => ['reveal' => 'all', 'requireAll' => true, 'maxAttempts' => 0],
            'intro' => '',
            'startId' => $first,
            'categories' => [],
            'nodes' => [
                ['id' => $first, 'title' => Lang::t('First idea'), 'text' => Lang::t('Explain this idea.'), 'categoryId' => '', 'x' => 60, 'y' => 120],
                ['id' => $second, 'title' => Lang::t('Second idea'), 'text' => Lang::t('Explain this idea.'), 'categoryId' => '', 'x' => 360, 'y' => 120],
            ],
            'edges' => [['id' => 'e' . bin2hex(random_bytes(4)), 'from' => $first, 'to' => $second, 'label' => '']],
        ];
    }

    public function validate(array $content): array
    {
        $nodes = [];
        foreach ($content['nodes'] ?? [] as $node) {
            $nodes[(string) $node['id']] = $node;
        }
        $problems = count($nodes) < 2 ? [Lang::t('Add at least two ideas.')] : [];
        $names = [];
        foreach ($nodes as $node) {
            $name = trim((string) ($node['title'] ?? ''));
            if ($name === '') {
                $problems[] = Lang::t('An idea has no title.');
                continue;
            }
            if (isset($names[$name])) {
                $problems[] = Lang::t('Two ideas are called "{name}".', ['name' => $name]);
            }
            $names[$name] = true;
            if (trim((string) ($node['text'] ?? '')) === '') {
                $problems[] = Lang::t('"{name}" has no text.', ['name' => $name]);
            }
        }

        $neighbours = [];
        foreach ($content['edges'] ?? [] as $edge) {
            $from = (string) ($edge['from'] ?? '');
            $to = (string) ($edge['to'] ?? '');
            if (!isset($nodes[$from], $nodes[$to]) || $from === $to) {
                $problems[] = Lang::t('A connection does not join two ideas.');
                continue;
            }
            $neighbours[$from][] = $to;
            $neighbours[$to][] = $from;
        }

        if (($content['settings']['reveal'] ?? 'all') === 'progressive') {
            $start = (string) ($content['startId'] ?? '');
            if (!isset($nodes[$start])) {
                return array_merge($problems, [Lang::t('Choose where learners start.')]);
            }
            $seen = [];
            $queue = [$start];
            while ($queue !== []) {
                $id = array_pop($queue);
                if (!isset($seen[$id])) {
                    $seen[$id] = true;
                    $queue = array_merge($queue, $neighbours[$id] ?? []);
                }
            }
            foreach ($nodes as $id => $node) {
                if (!isset($seen[$id])) {
                    $problems[] = Lang::t('"{name}" is not connected, so learners never see it.', ['name' => trim((string) ($node['title'] ?? '')) ?: Lang::t('Untitled')]);
                }
            }
        }
        return array_values(array_unique($problems));
    }

    public function publicContent(array $content): array
    {
        return [
            'settings' => [
                'reveal' => ($content['settings']['reveal'] ?? 'all') === 'progressive' ? 'progressive' : 'all',
                'requireAll' => !empty($content['settings']['requireAll']),
            ],
            'intro' => (string) ($content['intro'] ?? ''),
            'startId' => (string) ($content['startId'] ?? ''),
            'categories' => $content['categories'] ?? [],
            'nodes' => $content['nodes'] ?? [],
            'edges' => $content['edges'] ?? [],
        ];
    }

    /** A map has no right answers: finishing counts as 100%. */
    public function score(array $content, array $answers): array
    {
        $ids = array_map('strval', array_column($content['nodes'] ?? [], 'id'));
        $visited = array_values(array_intersect($ids, array_map('strval', array_filter((array) ($answers['visited'] ?? []), 'is_scalar'))));
        if ($visited === [] || (!empty($content['settings']['requireAll']) && count($visited) < count($ids))) {
            throw new HttpError(422, 'Open every idea first');
        }
        return ['score' => 1.0, 'passed' => null, 'detail' => ['visited' => count($visited), 'total' => count($ids)]];
    }
}
