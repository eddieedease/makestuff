<?php
declare(strict_types=1);

namespace App\Core;

final class HttpError extends \RuntimeException
{
    public int $status;
    public array $details;

    public function __construct(int $status, string $message, array $details = [])
    {
        parent::__construct($message);
        $this->status = $status;
        $this->details = $details;
    }
}
