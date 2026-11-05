<?php
declare(strict_types=1);

namespace App\Types;

/**
 * The question model shared by quizzes and e-learning.
 * { id, type: single|multiple|truefalse|text, text, points, feedback,
 *   options: [{id, text, correct, feedback}], accepted: [string] }
 */
final class Questions
{
    public static function publicView(array $q): array
    {
        $type = (string) ($q['type'] ?? 'single');
        return [
            'id' => (string) $q['id'],
            'type' => $type,
            'text' => (string) ($q['text'] ?? ''),
            'options' => array_map(static function (array $o): array {
                return ['id' => (string) $o['id'], 'text' => (string) ($o['text'] ?? '')];
            }, $type === 'text' ? [] : ($q['options'] ?? [])),
        ];
    }

    public static function isCorrect(array $q, $answer): bool
    {
        if (($q['type'] ?? 'single') === 'text') {
            $given = is_string($answer) ? self::normalize($answer) : '';
            foreach ($q['accepted'] ?? [] as $accepted) {
                if ($given !== '' && $given === self::normalize((string) $accepted)) {
                    return true;
                }
            }
            return false;
        }
        $given = is_array($answer) ? array_map('strval', $answer) : ($answer === null ? [] : [(string) $answer]);
        sort($given);
        $right = self::correctIds($q);
        sort($right);
        return $right !== [] && $given === $right;
    }

    /** Everything the learner may see once a question has been answered. */
    public static function review(array $q, $answer): array
    {
        $optionFeedback = [];
        foreach ($q['options'] ?? [] as $option) {
            if (($option['feedback'] ?? '') !== '') {
                $optionFeedback[(string) $option['id']] = $option['feedback'];
            }
        }
        return [
            'id' => (string) $q['id'],
            'correct' => self::isCorrect($q, $answer),
            'feedback' => (string) ($q['feedback'] ?? ''),
            'correctOptions' => self::correctIds($q),
            'optionFeedback' => (object) $optionFeedback,
            'accepted' => array_values($q['accepted'] ?? []),
        ];
    }

    /** @return string[] problems with this question, for publishing */
    public static function problems(array $q, string $label): array
    {
        $problems = [];
        if (trim((string) ($q['text'] ?? '')) === '') {
            $problems[] = "$label has no question text.";
        }
        $type = $q['type'] ?? 'single';
        if ($type === 'text') {
            if (array_filter($q['accepted'] ?? [], static fn ($a) => trim((string) $a) !== '') === []) {
                $problems[] = "$label needs at least one accepted answer.";
            }
            return $problems;
        }
        $right = self::correctIds($q);
        if (count($q['options'] ?? []) < 2) {
            $problems[] = "$label needs at least two options.";
        }
        if ($right === []) {
            $problems[] = "$label has no correct option marked.";
        } elseif ($type !== 'multiple' && count($right) > 1) {
            $problems[] = "$label allows one answer but has several marked correct.";
        }
        return $problems;
    }

    /** @return string[] */
    private static function correctIds(array $q): array
    {
        $ids = [];
        foreach ($q['options'] ?? [] as $option) {
            if (!empty($option['correct'])) {
                $ids[] = (string) $option['id'];
            }
        }
        return $ids;
    }

    private static function normalize(string $text): string
    {
        return mb_strtolower((string) preg_replace('/\s+/u', ' ', trim($text)));
    }
}
