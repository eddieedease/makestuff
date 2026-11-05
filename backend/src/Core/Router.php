<?php
declare(strict_types=1);

namespace App\Core;

final class Router
{
    /** @var array<int, array{string, string, array}> */
    private array $routes = [];

    public function add(string $method, string $pattern, array $handler): void
    {
        $regex = '#^' . preg_replace('#\{(\w+)\}#', '(?P<$1>[^/]+)', $pattern) . '$#';
        $this->routes[] = [$method, $regex, $handler];
    }

    public function dispatch(Request $request): void
    {
        $pathMatched = false;
        foreach ($this->routes as [$method, $regex, $handler]) {
            if (!preg_match($regex, $request->path, $m)) {
                continue;
            }
            $pathMatched = true;
            if ($method !== $request->method && $method !== 'ANY') {
                continue;
            }
            $request->params = array_filter($m, 'is_string', ARRAY_FILTER_USE_KEY);
            [$class, $action] = $handler;
            (new $class())->$action($request);
            return;
        }
        throw new HttpError($pathMatched ? 405 : 404, $pathMatched ? 'Method not allowed' : 'Not found');
    }
}
