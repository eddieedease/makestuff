<?php
declare(strict_types=1);

namespace App;

use App\Controllers\AuthController;
use App\Controllers\ConnectionController;
use App\Controllers\InstallController;
use App\Controllers\LtiController;
use App\Controllers\MediaController;
use App\Controllers\ObjectController;
use App\Controllers\PickController;
use App\Controllers\PlayController;
use App\Controllers\UserController;
use App\Core\Config;
use App\Core\HttpError;
use App\Core\Request;
use App\Core\Response;
use App\Core\Router;
use App\Core\Url;

final class App
{
    public static function run(): void
    {
        ini_set('display_errors', '0');
        $request = Request::fromGlobals();
        Url::$request = $request;
        self::securityHeaders($request);

        $isApi = strpos($request->path, '/api/') === 0;
        try {
            if ($request->path === '/install' || strpos($request->path, '/install/') === 0) {
                (new InstallController())->handle($request);
                return;
            }
            if (!Config::installed()) {
                if ($isApi) {
                    throw new HttpError(503, 'Not installed yet');
                }
                Response::redirect($request->basePath . '/install');
                return;
            }
            if ($isApi || strpos($request->path, '/lti/') === 0 || strpos($request->path, '/media/') === 0) {
                self::router()->dispatch($request);
                return;
            }
            self::serveApp($request);
        } catch (HttpError $e) {
            if ($isApi || $request->path === '/lti/1.3/jwks') {
                Response::json(['error' => $e->getMessage(), 'details' => $e->details], $e->status);
            } else {
                Response::errorPage('Something went wrong', $e->getMessage(), $e->status);
            }
        } catch (\Throwable $e) {
            error_log('[makestuff] ' . $e);
            $message = Config::isDev() ? $e->getMessage() : 'Unexpected server error';
            if ($isApi) {
                Response::json(['error' => $message], 500);
            } else {
                Response::errorPage('Something went wrong', $message, 500);
            }
        }
    }

    private static function securityHeaders(Request $request): void
    {
        header('X-Content-Type-Options: nosniff');
        header('Referrer-Policy: no-referrer');
        // The player has to live inside an LMS iframe; nothing else should.
        $embeddable = preg_match('#^/(play|pick|lti)(/|$)#', $request->path) === 1;
        header("Content-Security-Policy: frame-ancestors " . ($embeddable ? '*' : "'none'"));
    }

    private static function serveApp(Request $request): void
    {
        $file = APP_ROOT . '/app.html';
        if (!is_file($file)) {
            if (Config::isDev()) {
                Response::redirect(Url::frontend() . $request->path);
                return;
            }
            throw new HttpError(500, 'The frontend build is missing from this install.');
        }
        // Rewriting <base> is what lets the same build run from any sub folder.
        $html = (string) file_get_contents($file);
        Response::html((string) preg_replace('#<base href="[^"]*"\s*/?>#', '<base href="' . Response::e($request->basePath . '/') . '">', $html, 1));
    }

    private static function router(): Router
    {
        $r = new Router();

        $r->add('POST', '/api/auth/login', [AuthController::class, 'login']);
        $r->add('POST', '/api/auth/logout', [AuthController::class, 'logout']);
        $r->add('GET', '/api/auth/me', [AuthController::class, 'me']);
        $r->add('PUT', '/api/auth/me', [AuthController::class, 'updateMe']);
        $r->add('POST', '/api/auth/forgot', [AuthController::class, 'forgot']);
        $r->add('POST', '/api/auth/reset', [AuthController::class, 'reset']);

        $r->add('GET', '/api/users', [UserController::class, 'index']);
        $r->add('POST', '/api/users', [UserController::class, 'create']);
        $r->add('PUT', '/api/users/{id}', [UserController::class, 'update']);
        $r->add('DELETE', '/api/users/{id}', [UserController::class, 'delete']);

        $r->add('GET', '/api/types', [ObjectController::class, 'types']);
        $r->add('POST', '/api/render/markdown', [ObjectController::class, 'renderMarkdown']);
        $r->add('GET', '/api/objects', [ObjectController::class, 'index']);
        $r->add('POST', '/api/objects', [ObjectController::class, 'create']);
        $r->add('GET', '/api/objects/{id}', [ObjectController::class, 'show']);
        $r->add('PUT', '/api/objects/{id}', [ObjectController::class, 'update']);
        $r->add('DELETE', '/api/objects/{id}', [ObjectController::class, 'delete']);
        $r->add('POST', '/api/objects/{id}/publish', [ObjectController::class, 'publish']);
        $r->add('POST', '/api/objects/{id}/unpublish', [ObjectController::class, 'unpublish']);
        $r->add('POST', '/api/objects/{id}/duplicate', [ObjectController::class, 'duplicate']);
        $r->add('POST', '/api/objects/{id}/preview', [ObjectController::class, 'preview']);
        $r->add('POST', '/api/objects/{id}/owner', [ObjectController::class, 'assign']);
        $r->add('GET', '/api/objects/{id}/results', [ObjectController::class, 'results']);
        $r->add('GET', '/api/objects/{id}/embed', [ObjectController::class, 'embed']);

        $r->add('POST', '/api/media', [MediaController::class, 'upload']);
        $r->add('GET', '/media/{name}', [MediaController::class, 'serve']);

        $r->add('GET', '/api/connections', [ConnectionController::class, 'index']);
        $r->add('POST', '/api/connections', [ConnectionController::class, 'create']);
        $r->add('PUT', '/api/connections/{id}', [ConnectionController::class, 'update']);
        $r->add('DELETE', '/api/connections/{id}', [ConnectionController::class, 'delete']);

        $r->add('GET', '/api/play/session', [PlayController::class, 'session']);
        $r->add('POST', '/api/play/check', [PlayController::class, 'check']);
        $r->add('POST', '/api/play/progress', [PlayController::class, 'progress']);
        $r->add('POST', '/api/play/submit', [PlayController::class, 'submit']);
        $r->add('POST', '/api/play/restart', [PlayController::class, 'restart']);

        $r->add('GET', '/api/pick', [PickController::class, 'index']);
        $r->add('POST', '/api/pick', [PickController::class, 'select']);

        $r->add('POST', '/lti/1.1/launch', [LtiController::class, 'launch11']);
        $r->add('POST', '/lti/1.1/launch/{publicId}', [LtiController::class, 'launch11']);
        $r->add('ANY', '/lti/1.3/login', [LtiController::class, 'login13']);
        $r->add('POST', '/lti/1.3/launch', [LtiController::class, 'launch13']);
        $r->add('GET', '/lti/1.3/jwks', [LtiController::class, 'jwks']);

        return $r;
    }
}
