<?php
declare(strict_types=1);

namespace App\Core;

final class Migrator
{
    public static function run(): void
    {
        Db::pdo()->exec('CREATE TABLE IF NOT EXISTS migrations (
            name VARCHAR(190) PRIMARY KEY, applied_at DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4');

        $files = glob(APP_ROOT . '/migrations/*.sql') ?: [];
        sort($files);
        foreach ($files as $file) {
            $name = basename($file);
            if (Db::value('SELECT name FROM migrations WHERE name = ?', [$name]) !== null) {
                continue;
            }
            foreach (preg_split('/;\s*\n/', (string) file_get_contents($file)) as $statement) {
                if (trim($statement) !== '') {
                    Db::pdo()->exec($statement);
                }
            }
            Db::run('INSERT INTO migrations (name, applied_at) VALUES (?, ?)', [$name, Db::now()]);
        }
    }
}
