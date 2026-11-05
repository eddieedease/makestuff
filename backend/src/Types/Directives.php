<?php
declare(strict_types=1);

namespace App\Types;

/**
 * Turns e-learning Markdown into a list of segments the player renders.
 * Plain Markdown stays Markdown; a ":::name" block becomes an interactive
 * element. To add one, extend parseBlock() and add a segment to the player.
 *
 *   :::question
 *   Which planet is the largest?
 *   - [ ] Earth :: Feedback for this option
 *   - [x] Jupiter
 *   > Feedback shown after answering
 *   :::
 *
 *   :::reveal Show the answer       :::callout tip         :::flipcards
 *   Hidden *markdown*               Worth remembering      Front | Back
 *   :::                             :::                    :::
 */
final class Directives
{
    public const KNOWN = ['question', 'reveal', 'callout', 'flipcards'];

    public static function parse(string $markdown): array
    {
        $segments = [];
        $text = [];
        $lines = preg_split('/\R/', $markdown) ?: [];
        $count = count($lines);
        $inFence = false;

        for ($i = 0; $i < $count; $i++) {
            $line = $lines[$i];
            if (preg_match('/^\s*(```|~~~)/', $line)) {
                $inFence = !$inFence;
            }
            if ($inFence || !preg_match('/^:::\s*([a-z]+)\s*(.*)$/i', $line, $m)) {
                $text[] = $line;
                continue;
            }
            $body = [];
            $closed = false;
            for ($i++; $i < $count; $i++) {
                if (preg_match('/^:::\s*$/', $lines[$i])) {
                    $closed = true;
                    break;
                }
                $body[] = $lines[$i];
            }
            self::flush($segments, $text);
            $name = strtolower($m[1]);
            $segments[] = $closed
                ? self::parseBlock($name, trim($m[2]), $body)
                : ['kind' => 'error', 'message' => ":::$name is missing its closing :::"];
        }
        self::flush($segments, $text);
        return self::giveQuestionsIds($segments);
    }

    /** All questions in a piece of Markdown, in their full form including answers. */
    public static function questions(string $markdown): array
    {
        $questions = [];
        foreach (self::parse($markdown) as $segment) {
            if ($segment['kind'] === 'question') {
                $questions[] = $segment['question'];
            }
        }
        return $questions;
    }

    /** Segments as the browser may see them: questions lose their answers. */
    public static function publicSegments(string $markdown): array
    {
        return array_map(static function (array $segment): array {
            if ($segment['kind'] === 'question') {
                $segment['question'] = Questions::publicView($segment['question']);
            }
            return $segment;
        }, self::parse($markdown));
    }

    private static function flush(array &$segments, array &$text): void
    {
        $joined = trim(implode("\n", $text), "\n");
        if (trim($joined) !== '') {
            $segments[] = ['kind' => 'markdown', 'text' => $joined];
        }
        $text = [];
    }

    private static function parseBlock(string $name, string $argument, array $body): array
    {
        $text = trim(implode("\n", $body));
        switch ($name) {
            case 'question':
                return ['kind' => 'question', 'question' => self::parseQuestion($argument, $body)];
            case 'reveal':
                return ['kind' => 'reveal', 'title' => $argument !== '' ? $argument : 'Show more', 'text' => $text];
            case 'callout':
                $variant = in_array($argument, ['info', 'tip', 'warning'], true) ? $argument : 'info';
                return ['kind' => 'callout', 'variant' => $variant, 'text' => $text];
            case 'flipcards':
                $cards = [];
                foreach ($body as $line) {
                    $parts = array_map('trim', explode('|', $line, 2));
                    if (count($parts) === 2 && $parts[0] !== '') {
                        $cards[] = ['front' => $parts[0], 'back' => $parts[1]];
                    }
                }
                return ['kind' => 'flipcards', 'cards' => $cards];
        }
        return ['kind' => 'error', 'message' => "Unknown element :::$name. Available: " . implode(', ', self::KNOWN)];
    }

    private static function parseQuestion(string $argument, array $body): array
    {
        $prompt = [];
        $options = [];
        $accepted = [];
        $feedback = [];
        foreach ($body as $line) {
            if (preg_match('/^\s*[-*]\s*\[([ xX]?)\]\s*(.*)$/', $line, $m)) {
                $parts = array_map('trim', explode('::', $m[2], 2));
                $options[] = [
                    'id' => 'o' . (count($options) + 1),
                    'text' => $parts[0],
                    'correct' => strtolower($m[1]) === 'x',
                    'feedback' => $parts[1] ?? '',
                ];
            } elseif (preg_match('/^\s*=\s*(.+)$/', $line, $m)) {
                $accepted[] = trim($m[1]);
            } elseif (preg_match('/^\s*>\s?(.*)$/', $line, $m)) {
                $feedback[] = $m[1];
            } elseif ($options === [] && $accepted === []) {
                $prompt[] = $line;
            }
        }
        $correctCount = count(array_filter($options, static fn ($o) => $o['correct']));
        $type = $accepted !== [] ? 'text' : ($argument === 'multiple' || $correctCount > 1 ? 'multiple' : 'single');
        return [
            'type' => $type,
            'text' => trim(implode("\n", $prompt)),
            'options' => $options,
            'accepted' => $accepted,
            'feedback' => trim(implode("\n", $feedback)),
            'points' => 1,
        ];
    }

    /** Ids derive from the text, so they stay put when questions are moved around. */
    private static function giveQuestionsIds(array $segments): array
    {
        $seen = [];
        foreach ($segments as &$segment) {
            if ($segment['kind'] === 'question') {
                $id = 'q' . substr(sha1($segment['question']['text']), 0, 10);
                $seen[$id] = ($seen[$id] ?? 0) + 1;
                $segment['question']['id'] = $seen[$id] > 1 ? $id . '-' . $seen[$id] : $id;
            }
        }
        return $segments;
    }
}
