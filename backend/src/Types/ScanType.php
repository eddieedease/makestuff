<?php
declare(strict_types=1);

namespace App\Types;

use App\Core\HttpError;
use App\Core\Lang;

/**
 * A self-assessment: no right answers, statements are rated on a scale and the
 * learner gets a profile with advice.
 * { settings: {maxAttempts}, intro, scale: [{value, label}],
 *   dimensions: [{id, name}], questions: [{id, text, categoryId, reversed}],
 *   bands: [{id, categoryId ('' = overall), min, max, title, advice}] }
 */
final class ScanType extends LearningType
{
    public function key(): string
    {
        return 'scan';
    }

    public function label(): string
    {
        return 'Scan';
    }

    public function description(): string
    {
        return 'A self-assessment that gives a personal profile and advice instead of a grade.';
    }

    public function defaultContent(): array
    {
        return [
            'settings' => ['maxAttempts' => 0],
            'intro' => '',
            'scale' => [
                ['value' => 1, 'label' => Lang::t('Strongly disagree')],
                ['value' => 2, 'label' => Lang::t('Disagree')],
                ['value' => 3, 'label' => Lang::t('Neutral')],
                ['value' => 4, 'label' => Lang::t('Agree')],
                ['value' => 5, 'label' => Lang::t('Strongly agree')],
            ],
            'categories' => [],
            'questions' => [],
            'bands' => [],
        ];
    }

    public function validate(array $content): array
    {
        $problems = [];
        $categoryIds = array_column($content['categories'] ?? [], 'id');
        if ($categoryIds === []) {
            $problems[] = Lang::t('Add at least one category.');
        }
        if (empty($content['questions'])) {
            $problems[] = Lang::t('Add at least one statement.');
        }
        if (count($content['scale'] ?? []) < 2) {
            $problems[] = Lang::t('The rating scale needs at least two steps.');
        }
        foreach ($content['questions'] ?? [] as $index => $question) {
            $label = Lang::t('Statement {n}', ['n' => $index + 1]);
            if (trim((string) ($question['text'] ?? '')) === '') {
                $problems[] = Lang::t('{label} has no text.', ['label' => $label]);
            }
            if (!in_array($question['categoryId'] ?? '', $categoryIds, true)) {
                $problems[] = Lang::t('{label} has no category.', ['label' => $label]);
            }
        }
        foreach ($categoryIds as $id) {
            if (!in_array($id, array_column($content['questions'] ?? [], 'categoryId'), true)) {
                $problems[] = Lang::t('Every category needs at least one statement.');
                break;
            }
        }
        return array_merge($problems, $this->rangeProblems($content));
    }

    /** Ranges may touch (0-50, 50-100) but not overlap, so a score has one piece of feedback. */
    private function rangeProblems(array $content): array
    {
        $problems = [];
        $names = array_column($content['categories'] ?? [], 'name', 'id');
        $groups = [];
        foreach ($content['bands'] ?? [] as $band) {
            $groups[(string) ($band['categoryId'] ?? '')][] = $band;
        }
        foreach ($groups as $id => $bands) {
            $label = $id === '' ? Lang::t('Overall score') : (string) ($names[$id] ?? $id);
            usort($bands, static fn (array $a, array $b) => (float) $a['min'] <=> (float) $b['min']);
            $previousMax = null;
            foreach ($bands as $band) {
                $min = (float) ($band['min'] ?? 0);
                $max = (float) ($band['max'] ?? 100);
                if ($min < 0 || $max > 100 || $min >= $max) {
                    $problems[] = Lang::t('{label}: the range {min} to {max}% is not valid.', ['label' => $label, 'min' => $min, 'max' => $max]);
                } elseif ($previousMax !== null && $min < $previousMax) {
                    $problems[] = Lang::t('{label}: two score ranges overlap.', ['label' => $label]);
                }
                if (trim((string) ($band['title'] ?? '')) === '' && trim((string) ($band['advice'] ?? '')) === '') {
                    $problems[] = Lang::t('{label}: the range {min} to {max}% has no feedback.', ['label' => $label, 'min' => $min, 'max' => $max]);
                }
                $previousMax = $max;
            }
        }
        return $problems;
    }

    public function publicContent(array $content): array
    {
        return [
            'intro' => (string) ($content['intro'] ?? ''),
            'scale' => $content['scale'] ?? [],
            'categories' => $content['categories'] ?? [],
            'questions' => array_map(static function (array $q): array {
                return ['id' => (string) $q['id'], 'text' => (string) ($q['text'] ?? ''), 'categoryId' => (string) ($q['categoryId'] ?? '')];
            }, $content['questions'] ?? []),
        ];
    }

    public function score(array $content, array $answers): array
    {
        $values = array_map('floatval', array_column($content['scale'] ?? [], 'value'));
        if (count($values) < 2) {
            throw new HttpError(422, 'This scan has no rating scale');
        }
        $min = min($values);
        $max = max($values);
        $totals = [];
        foreach ($content['questions'] ?? [] as $question) {
            $answer = $answers[$question['id']] ?? null;
            if (!is_numeric($answer) || !in_array((float) $answer, $values, true)) {
                continue;
            }
            $value = (float) $answer;
            if (!empty($question['reversed'])) {
                $value = $max + $min - $value;
            }
            $category = (string) ($question['categoryId'] ?? '');
            $totals[$category]['sum'] = ($totals[$category]['sum'] ?? 0) + ($value - $min);
            $totals[$category]['count'] = ($totals[$category]['count'] ?? 0) + 1;
        }
        if ($totals === []) {
            throw new HttpError(422, 'Answer at least one statement');
        }

        $categories = [];
        $sum = 0.0;
        $count = 0;
        foreach ($content['categories'] ?? [] as $category) {
            $id = (string) $category['id'];
            if (!isset($totals[$id])) {
                continue;
            }
            $sum += $totals[$id]['sum'];
            $count += $totals[$id]['count'];
            $percentage = round($totals[$id]['sum'] / ($totals[$id]['count'] * ($max - $min)) * 100, 1);
            $categories[] = [
                'id' => $id,
                'name' => (string) ($category['name'] ?? ''),
                'percentage' => $percentage,
                'band' => $this->band($content, $id, $percentage),
            ];
        }
        $overall = $count > 0 ? round($sum / ($count * ($max - $min)) * 100, 1) : 0.0;

        // A scan has no right answers, so the LMS records it as completed (100%).
        return [
            'score' => 1.0,
            'passed' => null,
            'detail' => ['overall' => $overall, 'overallBand' => $this->band($content, '', $overall), 'categories' => $categories],
        ];
    }

    private function band(array $content, string $categoryId, float $percentage): ?array
    {
        $bands = $content['bands'] ?? [];
        // Highest range first: a score on a shared boundary counts as the higher range.
        usort($bands, static fn (array $a, array $b) => (float) $b['min'] <=> (float) $a['min']);
        foreach ($bands as $band) {
            if ((string) ($band['categoryId'] ?? '') === $categoryId
                && $percentage >= (float) ($band['min'] ?? 0)
                && $percentage <= (float) ($band['max'] ?? 100)) {
                return ['title' => (string) ($band['title'] ?? ''), 'advice' => (string) ($band['advice'] ?? '')];
            }
        }
        return null;
    }
}
