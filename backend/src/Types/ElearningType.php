<?php
declare(strict_types=1);

namespace App\Types;

use App\Core\HttpError;

/** { settings: {grading: completion|questions, passPercentage}, pages: [{id, title, markdown}] } */
final class ElearningType extends LearningType
{
    public function key(): string
    {
        return 'elearning';
    }

    public function label(): string
    {
        return 'E-learning';
    }

    public function description(): string
    {
        return 'A paged course written in Markdown, with images and interactive elements.';
    }

    public function defaultContent(): array
    {
        return [
            'settings' => ['grading' => 'completion', 'passPercentage' => 70],
            'pages' => [[
                'id' => 'p' . bin2hex(random_bytes(4)),
                'title' => 'Introduction',
                'markdown' => "# Welcome\n\nStart writing here.\n",
            ]],
        ];
    }

    public function validate(array $content): array
    {
        $problems = [];
        $pages = $content['pages'] ?? [];
        if ($pages === []) {
            $problems[] = 'Add at least one page.';
        }
        foreach ($pages as $index => $page) {
            $label = 'Page ' . ($index + 1);
            if (trim((string) ($page['markdown'] ?? '')) === '') {
                $problems[] = "$label is empty.";
            }
            foreach (Directives::parse((string) ($page['markdown'] ?? '')) as $segment) {
                if ($segment['kind'] === 'error') {
                    $problems[] = "$label: {$segment['message']}";
                }
                if ($segment['kind'] === 'question') {
                    $problems = array_merge($problems, Questions::problems($segment['question'], "A question on $label"));
                }
            }
        }
        return $problems;
    }

    public function publicContent(array $content): array
    {
        return [
            'settings' => ['grading' => $content['settings']['grading'] ?? 'completion'],
            'pages' => array_map(static function (array $page): array {
                return [
                    'id' => (string) $page['id'],
                    'title' => (string) ($page['title'] ?? ''),
                    'segments' => Directives::publicSegments((string) ($page['markdown'] ?? '')),
                ];
            }, $content['pages'] ?? []),
        ];
    }

    public function check(array $content, string $itemId, $answer): array
    {
        foreach ($this->questions($content) as $question) {
            if ($question['id'] === $itemId) {
                return Questions::review($question, $answer);
            }
        }
        throw new HttpError(404, 'Question not found');
    }

    public function score(array $content, array $answers): array
    {
        $questions = $this->questions($content);
        $right = 0;
        foreach ($questions as $question) {
            if (Questions::isCorrect($question, $answers[$question['id']] ?? null)) {
                $right++;
            }
        }
        $total = count($questions);
        $percentage = $total > 0 ? round($right / $total * 100, 1) : 100.0;
        $byQuestions = ($content['settings']['grading'] ?? 'completion') === 'questions' && $total > 0;
        return [
            'score' => $byQuestions ? $percentage / 100 : 1.0,
            'passed' => $byQuestions ? $percentage >= (float) ($content['settings']['passPercentage'] ?? 70) : null,
            'detail' => ['percentage' => $percentage, 'correct' => $right, 'total' => $total, 'graded' => $byQuestions],
        ];
    }

    private function questions(array $content): array
    {
        $questions = [];
        foreach ($content['pages'] ?? [] as $page) {
            $questions = array_merge($questions, Directives::questions((string) ($page['markdown'] ?? '')));
        }
        return $questions;
    }
}
