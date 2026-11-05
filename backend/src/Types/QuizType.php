<?php
declare(strict_types=1);

namespace App\Types;

use App\Core\HttpError;
use App\Core\Lang;

/**
 * { settings: {passPercentage, shuffleQuestions, immediateFeedback, showAnswers, maxAttempts},
 *   categories: [{id, name}], questions: [{..., categoryId}] }
 * With categories, the result also breaks the score down per category.
 */
final class QuizType extends LearningType
{
    public function key(): string
    {
        return 'quiz';
    }

    public function label(): string
    {
        return 'Quiz';
    }

    public function description(): string
    {
        return 'Scored questions with a pass mark. The grade goes back to the LMS.';
    }

    public function defaultContent(): array
    {
        return [
            'settings' => [
                'passPercentage' => 70,
                'shuffleQuestions' => false,
                'immediateFeedback' => false,
                'showAnswers' => true,
                'maxAttempts' => 0,
            ],
            'categories' => [],
            'questions' => [],
        ];
    }

    public function validate(array $content): array
    {
        $questions = $content['questions'] ?? [];
        $problems = $questions === [] ? [Lang::t('Add at least one question.')] : [];
        $categoryIds = array_column($content['categories'] ?? [], 'id');
        foreach ($content['categories'] ?? [] as $index => $category) {
            if (trim((string) ($category['name'] ?? '')) === '') {
                $problems[] = Lang::t('Category {n} has no name.', ['n' => $index + 1]);
            }
            if (!in_array($category['id'], array_column($questions, 'categoryId'), true)) {
                $problems[] = Lang::t('Category "{name}" has no questions.', ['name' => $category['name'] ?? '']);
            }
        }
        foreach ($questions as $index => $question) {
            $label = Lang::t('Question {n}', ['n' => $index + 1]);
            $problems = array_merge($problems, Questions::problems($question, $label));
            if ($categoryIds !== [] && !in_array($question['categoryId'] ?? '', $categoryIds, true)) {
                $problems[] = Lang::t('{label} has no category.', ['label' => $label]);
            }
        }
        return $problems;
    }

    public function publicContent(array $content): array
    {
        $settings = $content['settings'] ?? [];
        return [
            'settings' => [
                'passPercentage' => (float) ($settings['passPercentage'] ?? 70),
                'shuffleQuestions' => !empty($settings['shuffleQuestions']),
                'immediateFeedback' => !empty($settings['immediateFeedback']),
            ],
            'questions' => array_map([Questions::class, 'publicView'], $content['questions'] ?? []),
        ];
    }

    /** Refused unless the author enabled it, or learners could probe the answers before submitting. */
    public function check(array $content, string $itemId, $answer): array
    {
        if (empty($content['settings']['immediateFeedback'])) {
            throw new HttpError(403, 'Feedback appears after you submit');
        }
        foreach ($content['questions'] ?? [] as $question) {
            if ((string) $question['id'] === $itemId) {
                return Questions::review($question, $answer);
            }
        }
        throw new HttpError(404, 'Question not found');
    }

    public function score(array $content, array $answers): array
    {
        $earned = 0.0;
        $total = 0.0;
        $review = [];
        $perCategory = [];
        foreach ($content['questions'] ?? [] as $question) {
            $points = max(0.0, (float) ($question['points'] ?? 1));
            $answer = $answers[$question['id']] ?? null;
            $correct = Questions::isCorrect($question, $answer);
            $total += $points;
            $earned += $correct ? $points : 0;
            $category = (string) ($question['categoryId'] ?? '');
            $perCategory[$category]['total'] = ($perCategory[$category]['total'] ?? 0) + $points;
            $perCategory[$category]['earned'] = ($perCategory[$category]['earned'] ?? 0) + ($correct ? $points : 0);
            $review[] = Questions::review($question, $answer);
        }
        $score = $total > 0 ? $earned / $total : 0.0;
        $percentage = round($score * 100, 1);
        $showAnswers = !empty($content['settings']['showAnswers']) || !empty($content['settings']['immediateFeedback']);
        return [
            'score' => $score,
            'passed' => $percentage >= (float) ($content['settings']['passPercentage'] ?? 70),
            'detail' => [
                'percentage' => $percentage,
                'earned' => $earned,
                'total' => $total,
                'categories' => $this->rollUp($content, $perCategory),
                'review' => $showAnswers ? $review : null,
            ],
        ];
    }

    private function rollUp(array $content, array $perCategory): array
    {
        $rows = [];
        foreach ($content['categories'] ?? [] as $category) {
            $totals = $perCategory[(string) $category['id']] ?? null;
            if ($totals !== null && $totals['total'] > 0) {
                $rows[] = [
                    'id' => (string) $category['id'],
                    'name' => (string) ($category['name'] ?? ''),
                    'earned' => $totals['earned'],
                    'total' => $totals['total'],
                    'percentage' => round($totals['earned'] / $totals['total'] * 100, 1),
                ];
            }
        }
        return $rows;
    }
}
