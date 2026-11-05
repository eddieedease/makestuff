<?php
declare(strict_types=1);

namespace App\Types;

use App\Core\Config;
use App\Core\Lang;

/**
 * Learners drag cards onto targets. Three modes share one engine:
 *   sort:  cards go into categories, several per category
 *   match: each card goes with one prompt
 *   order: cards go into numbered positions; the stored order is the answer
 *
 * { settings: {mode, passPercentage, maxAttempts, showAnswers}, intro,
 *   categories: [{id, name}],
 *   items: [{id, text, feedback, categoryId, prompt}] }
 *
 * Answers stay on the server. Card and prompt ids are keyed hashes and the
 * lists are shuffled, so nothing in the page links a card to its target.
 */
final class DragDropType extends LearningType
{
    public function key(): string
    {
        return 'drag_drop';
    }

    public function label(): string
    {
        return 'Drag and drop';
    }

    public function description(): string
    {
        return 'Sort cards into categories, match pairs or put steps in order.';
    }

    public function defaultContent(): array
    {
        return [
            'settings' => ['mode' => 'sort', 'passPercentage' => 70, 'maxAttempts' => 0, 'showAnswers' => true],
            'intro' => '',
            'categories' => [
                ['id' => 'c' . bin2hex(random_bytes(4)), 'name' => ''],
                ['id' => 'c' . bin2hex(random_bytes(4)), 'name' => ''],
            ],
            'items' => [],
        ];
    }

    public function validate(array $content): array
    {
        $mode = $this->mode($content);
        $items = $content['items'] ?? [];
        $problems = count($items) < 2 ? [Lang::t('Add at least two cards.')] : [];
        $categoryIds = array_column($content['categories'] ?? [], 'id');
        if ($mode === 'sort') {
            if (count($categoryIds) < 2) {
                $problems[] = Lang::t('Add at least two categories.');
            }
            foreach ($content['categories'] ?? [] as $index => $category) {
                if (trim((string) ($category['name'] ?? '')) === '') {
                    $problems[] = Lang::t('Category {n} has no name.', ['n' => $index + 1]);
                }
            }
        }
        $seen = [];
        foreach ($items as $index => $item) {
            $label = Lang::t('Card {n}', ['n' => $index + 1]);
            $text = trim((string) ($item['text'] ?? ''));
            if ($text === '') {
                $problems[] = Lang::t('{label} has no text.', ['label' => $label]);
            }
            // In these modes identical cards would be marked wrong for a right answer.
            if ($mode !== 'sort' && $text !== '' && isset($seen[$text])) {
                $problems[] = Lang::t('Two cards say "{text}".', ['text' => $text]);
            }
            $seen[$text] = true;
            if ($mode === 'sort' && !in_array($item['categoryId'] ?? '', $categoryIds, true)) {
                $problems[] = Lang::t('{label} has no category.', ['label' => $label]);
            }
            if ($mode === 'match' && trim((string) ($item['prompt'] ?? '')) === '') {
                $problems[] = Lang::t('{label} has nothing to match.', ['label' => $label]);
            }
        }
        return $problems;
    }

    public function publicContent(array $content): array
    {
        $mode = $this->mode($content);
        $items = $content['items'] ?? [];
        $cards = array_map(function (array $item): array {
            return ['id' => $this->hash('card', $item), 'text' => (string) ($item['text'] ?? '')];
        }, $items);
        shuffle($cards);

        if ($mode === 'sort') {
            $targets = array_map(static function (array $c): array {
                return ['id' => (string) $c['id'], 'label' => (string) ($c['name'] ?? '')];
            }, $content['categories'] ?? []);
        } elseif ($mode === 'match') {
            $targets = array_map(function (array $item): array {
                return ['id' => $this->hash('prompt', $item), 'label' => (string) ($item['prompt'] ?? '')];
            }, $items);
            shuffle($targets);
        } else {
            $targets = [];
            foreach (array_keys($items) as $position) {
                $targets[] = ['id' => 'p' . ($position + 1), 'label' => (string) ($position + 1)];
            }
        }

        return [
            'settings' => ['mode' => $mode, 'passPercentage' => (float) ($content['settings']['passPercentage'] ?? 70)],
            'intro' => (string) ($content['intro'] ?? ''),
            'targets' => $targets,
            'cards' => $cards,
        ];
    }

    public function score(array $content, array $answers): array
    {
        $mode = $this->mode($content);
        $placements = (array) ($answers['placements'] ?? []);
        $names = array_column($content['categories'] ?? [], 'name', 'id');
        $showAnswers = !empty($content['settings']['showAnswers']);
        $right = 0;
        $cards = [];
        $perCategory = [];

        foreach ($content['items'] ?? [] as $position => $item) {
            if ($mode === 'sort') {
                $target = (string) ($item['categoryId'] ?? '');
                $answer = (string) ($names[$target] ?? '');
            } elseif ($mode === 'match') {
                $target = $this->hash('prompt', $item);
                $answer = (string) ($item['prompt'] ?? '');
            } else {
                $target = 'p' . ($position + 1);
                $answer = (string) ($position + 1);
            }
            $given = $placements[$this->hash('card', $item)] ?? null;
            $correct = is_string($given) && hash_equals($target, $given);
            $right += $correct ? 1 : 0;
            $perCategory[$target]['total'] = ($perCategory[$target]['total'] ?? 0) + 1;
            $perCategory[$target]['right'] = ($perCategory[$target]['right'] ?? 0) + ($correct ? 1 : 0);
            $cards[] = [
                'text' => (string) ($item['text'] ?? ''),
                'correct' => $correct,
                'answer' => $showAnswers ? $answer : null,
                'feedback' => $showAnswers ? (string) ($item['feedback'] ?? '') : '',
            ];
        }

        $total = count($cards);
        $percentage = $total > 0 ? round($right / $total * 100, 1) : 0.0;
        $categories = [];
        if ($mode === 'sort') {
            foreach ($content['categories'] ?? [] as $category) {
                $totals = $perCategory[(string) $category['id']] ?? null;
                if ($totals !== null) {
                    $categories[] = [
                        'id' => (string) $category['id'],
                        'name' => (string) ($category['name'] ?? ''),
                        'percentage' => round($totals['right'] / $totals['total'] * 100, 1),
                    ];
                }
            }
        }
        return [
            'score' => $total > 0 ? $right / $total : 0.0,
            'passed' => $percentage >= (float) ($content['settings']['passPercentage'] ?? 70),
            'detail' => ['percentage' => $percentage, 'correct' => $right, 'total' => $total, 'cards' => $cards, 'categories' => $categories, 'mode' => $mode],
        ];
    }

    private function mode(array $content): string
    {
        $mode = $content['settings']['mode'] ?? 'sort';
        return in_array($mode, ['sort', 'match', 'order'], true) ? $mode : 'sort';
    }

    /** Stable for resuming an attempt, but not linkable without the site secret. */
    private function hash(string $kind, array $item): string
    {
        return substr(hash_hmac('sha256', $kind . '|' . $item['id'], (string) Config::get('secret', '')), 0, 16);
    }
}
