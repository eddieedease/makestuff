<?php
declare(strict_types=1);

namespace App\Types;

use App\Core\HttpError;

/**
 * One kind of learning. To add a new kind (decision tree, graph, ...):
 *   1. create a subclass here and list it in Registry;
 *   2. add an editor and a player in the Angular app (see learning-types.ts).
 * Nothing else changes: storage, publishing, LTI and results are shared.
 */
abstract class LearningType
{
    abstract public function key(): string;

    abstract public function label(): string;

    abstract public function description(): string;

    abstract public function defaultContent(): array;

    /** Problems that block publishing. Drafts may be incomplete. */
    abstract public function validate(array $content): array;

    /** What the browser receives. Must never contain answers. */
    abstract public function publicContent(array $content): array;

    /**
     * Score a finished attempt.
     * @return array{score: float, passed: ?bool, detail: array} score is 0..1
     */
    abstract public function score(array $content, array $answers): array;

    /** Immediate feedback on one item while playing. */
    public function check(array $content, string $itemId, $answer): array
    {
        throw new HttpError(422, 'This activity has no immediate feedback');
    }

    /** 0 means unlimited. */
    public function maxAttempts(array $content): int
    {
        return (int) ($content['settings']['maxAttempts'] ?? 0);
    }
}
