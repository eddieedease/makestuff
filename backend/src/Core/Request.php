<?php
declare(strict_types=1);

namespace App\Core;

final class Request
{
    public string $method;
    /** Path below the install folder, always starting with "/". */
    public string $path;
    /** Install folder, e.g. "" or "/makestuff". */
    public string $basePath;
    public array $query;
    public array $post;
    public array $files;
    public array $params = [];
    private ?array $json = null;

    public static function fromGlobals(): self
    {
        $r = new self();
        $r->method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        $r->basePath = rtrim(str_replace('\\', '/', dirname($_SERVER['SCRIPT_NAME'] ?? '/index.php')), '/');
        $path = rawurldecode((string) parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH));
        if ($r->basePath !== '' && strpos($path, $r->basePath) === 0) {
            $path = substr($path, strlen($r->basePath));
        }
        $r->path = '/' . trim($path, '/');
        $r->query = $_GET;
        $r->post = $_POST;
        $r->files = $_FILES;
        return $r;
    }

    public function json(): array
    {
        if ($this->json === null) {
            $decoded = json_decode((string) file_get_contents('php://input'), true);
            $this->json = is_array($decoded) ? $decoded : [];
        }
        return $this->json;
    }

    public function input(string $key, $default = null)
    {
        return $this->json()[$key] ?? $default;
    }

    public function str(string $key, string $default = ''): string
    {
        $value = $this->input($key, $default);
        return is_scalar($value) ? trim((string) $value) : $default;
    }

    public function header(string $name): string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        return (string) ($_SERVER[$key] ?? $_SERVER['REDIRECT_' . $key] ?? '');
    }

    public function bearerToken(): ?string
    {
        if (preg_match('/^Bearer\s+(\S+)$/i', $this->header('Authorization'), $m)) {
            return $m[1];
        }
        return null;
    }

    public function ip(): string
    {
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '');
    }
}
