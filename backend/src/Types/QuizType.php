<?php
declare(strict_types=1);

namespace App\Types;

use App\Core\HttpError;

/** { settings: {passPercentage, shuffleQuestions, immediateFeedback, showAnswers, maxAttempts}, questions: [...] } */
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
            'questions' => [],
        ];
    }

    public function validate(array $content): array
    {
        $questions = $content['questions'] ?? [];
        $problems = $questions === [] ? ['Add at least one question.'] : [];
        foreach ($questions as $index => $question) {
            $problems = array_merge($problems, Questions::problems($question, 'Question ' . ($index + 1)));
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
        foreach ($content['questions'] ?? [] as $question) {
            $points = max(0.0, (float) ($question['points'] ?? 1));
            $answer = $answers[$question['id']] ?? null;
            $total += $points;
            if (Questions::isCorrect($question, $answer)) {
                $earned += $points;
            }
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
                'review' => $showAnswers ? $review : null,
            ],
        ];
    }
}
