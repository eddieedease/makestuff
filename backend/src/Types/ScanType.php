<?php
declare(strict_types=1);

namespace App\Types;

use App\Core\HttpError;
use App\Core\Lang;

/**
 * A self-assessment: no right answers, statements are rated on a scale and the
 * learner gets a profile with advice.
 * { settings: {maxAttempts}, intro, scale: [{value, label}],
 *   dimensions: [{id, name}], questions: [{id, text, dimensionId, reversed}],
 *   bands: [{id, dimensionId ('' = overall), min, max, title, advice}] }
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
            'dimensions' => [],
            'questions' => [],
            'bands' => [],
        ];
    }

    public function validate(array $content): array
    {
        $problems = [];
        $dimensionIds = array_column($content['dimensions'] ?? [], 'id');
        if ($dimensionIds === []) {
            $problems[] = Lang::t('Add at least one dimension.');
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
            if (!in_array($question['dimensionId'] ?? '', $dimensionIds, true)) {
                $problems[] = Lang::t('{label} is not linked to a dimension.', ['label' => $label]);
            }
        }
        foreach ($dimensionIds as $id) {
            if (!in_array($id, array_column($content['questions'] ?? [], 'dimensionId'), true)) {
                $problems[] = Lang::t('Every dimension needs at least one statement.');
                break;
            }
        }
        return $problems;
    }

    public function publicContent(array $content): array
    {
        return [
            'intro' => (string) ($content['intro'] ?? ''),
            'scale' => $content['scale'] ?? [],
            'dimensions' => $content['dimensions'] ?? [],
            'questions' => array_map(static function (array $q): array {
                return ['id' => (string) $q['id'], 'text' => (string) ($q['text'] ?? ''), 'dimensionId' => (string) ($q['dimensionId'] ?? '')];
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
            $dimension = (string) ($question['dimensionId'] ?? '');
            $totals[$dimension]['sum'] = ($totals[$dimension]['sum'] ?? 0) + ($value - $min);
            $totals[$dimension]['count'] = ($totals[$dimension]['count'] ?? 0) + 1;
        }
        if ($totals === []) {
            throw new HttpError(422, 'Answer at least one statement');
        }

        $dimensions = [];
        $sum = 0.0;
        $count = 0;
        foreach ($content['dimensions'] ?? [] as $dimension) {
            $id = (string) $dimension['id'];
            if (!isset($totals[$id])) {
                continue;
            }
            $sum += $totals[$id]['sum'];
            $count += $totals[$id]['count'];
            $percentage = round($totals[$id]['sum'] / ($totals[$id]['count'] * ($max - $min)) * 100, 1);
            $dimensions[] = [
                'id' => $id,
                'name' => (string) ($dimension['name'] ?? ''),
                'percentage' => $percentage,
                'band' => $this->band($content, $id, $percentage),
            ];
        }
        $overall = $count > 0 ? round($sum / ($count * ($max - $min)) * 100, 1) : 0.0;

        // A scan has no right answers, so the LMS records it as completed (100%).
        return [
            'score' => 1.0,
            'passed' => null,
            'detail' => ['overall' => $overall, 'overallBand' => $this->band($content, '', $overall), 'dimensions' => $dimensions],
        ];
    }

    private function band(array $content, string $dimensionId, float $percentage): ?array
    {
        foreach ($content['bands'] ?? [] as $band) {
            if ((string) ($band['dimensionId'] ?? '') === $dimensionId
                && $percentage >= (float) ($band['min'] ?? 0)
                && $percentage <= (float) ($band['max'] ?? 100)) {
                return ['title' => (string) ($band['title'] ?? ''), 'advice' => (string) ($band['advice'] ?? '')];
            }
        }
        return null;
    }
}
