<?php
declare(strict_types=1);

namespace App\Types;

use App\Core\HttpError;
use App\Core\Lang;

final class Registry
{
    /** @return LearningType[] */
    public static function all(): array
    {
        return [new ElearningType(), new QuizType(), new ScanType(), new DecisionTreeType()];
    }

    public static function get(string $key): LearningType
    {
        foreach (self::all() as $type) {
            if ($type->key() === $key) {
                return $type;
            }
        }
        throw new HttpError(422, Lang::t('Unknown learning type: {type}', ['type' => $key]));
    }
}
