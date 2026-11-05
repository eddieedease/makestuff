UPDATE learning_objects SET content = REPLACE(REPLACE(content, '"dimensions"', '"categories"'), '"dimensionId"', '"categoryId"') WHERE type = 'scan';
UPDATE learning_objects SET published_content = REPLACE(REPLACE(published_content, '"dimensions"', '"categories"'), '"dimensionId"', '"categoryId"') WHERE type = 'scan' AND published_content IS NOT NULL;
UPDATE attempts a JOIN learning_objects o ON o.id = a.object_id SET a.result = REPLACE(a.result, '"dimensions"', '"categories"') WHERE o.type = 'scan' AND a.result IS NOT NULL;
