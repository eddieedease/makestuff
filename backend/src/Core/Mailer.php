<?php
declare(strict_types=1);

namespace App\Core;

/** Small SMTP client (plain, STARTTLS or SSL). Falls back to PHP mail() when no host is set. */
final class Mailer
{
    public static function send(array $mail, string $to, string $subject, string $text): void
    {
        $from = (string) ($mail['from_email'] ?? '');
        $fromName = (string) ($mail['from_name'] ?? '');
        foreach ([$to, $from] as $address) {
            if (!filter_var($address, FILTER_VALIDATE_EMAIL)) {
                throw new \RuntimeException('Invalid email address: ' . $address);
            }
        }
        $encodedSubject = mb_encode_mimeheader($subject, 'UTF-8', 'B', "\r\n");
        $headers = [
            'From: ' . ($fromName !== '' ? mb_encode_mimeheader($fromName, 'UTF-8', 'B', "\r\n") . " <$from>" : $from),
            'MIME-Version: 1.0',
            'Content-Type: text/plain; charset=utf-8',
            'Content-Transfer-Encoding: base64',
        ];
        $body = chunk_split(base64_encode($text));

        if (($mail['host'] ?? '') === '') {
            if (!mail($to, $encodedSubject, $body, implode("\r\n", $headers), '-f' . $from)) {
                throw new \RuntimeException('PHP mail() failed');
            }
            return;
        }
        self::smtp($mail, $from, $to, array_merge($headers, ['To: ' . $to, 'Subject: ' . $encodedSubject, 'Date: ' . date('r')]), $body);
    }

    private static function smtp(array $mail, string $from, string $to, array $headers, string $body): void
    {
        $encryption = (string) ($mail['encryption'] ?? '');
        $target = ($encryption === 'ssl' ? 'ssl://' : 'tcp://') . $mail['host'] . ':' . (int) $mail['port'];
        $socket = @stream_socket_client($target, $errno, $error, 10);
        if (!$socket) {
            throw new \RuntimeException("Cannot reach mail server: $error");
        }
        stream_set_timeout($socket, 10);
        try {
            self::expect($socket, 220);
            self::command($socket, 'EHLO makestuff', 250);
            if ($encryption === 'tls') {
                self::command($socket, 'STARTTLS', 220);
                if (!stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                    throw new \RuntimeException('STARTTLS failed');
                }
                self::command($socket, 'EHLO makestuff', 250);
            }
            if (($mail['user'] ?? '') !== '') {
                self::command($socket, 'AUTH LOGIN', 334);
                self::command($socket, base64_encode($mail['user']), 334);
                self::command($socket, base64_encode((string) $mail['pass']), 235);
            }
            self::command($socket, "MAIL FROM:<$from>", 250);
            self::command($socket, "RCPT TO:<$to>", 250);
            self::command($socket, 'DATA', 354);
            self::command($socket, implode("\r\n", $headers) . "\r\n\r\n" . $body . "\r\n.", 250);
            fwrite($socket, "QUIT\r\n");
        } finally {
            fclose($socket);
        }
    }

    private static function command($socket, string $line, int $expected): void
    {
        fwrite($socket, $line . "\r\n");
        self::expect($socket, $expected);
    }

    private static function expect($socket, int $expected): void
    {
        $response = '';
        while (($line = fgets($socket, 1024)) !== false) {
            $response .= $line;
            if (strlen($line) < 4 || $line[3] === ' ') {
                break;
            }
        }
        if ((int) substr($response, 0, 3) !== $expected) {
            throw new \RuntimeException('Mail server said: ' . trim($response));
        }
    }
}
