# Makestuff

Create learning objects and serve them to any LMS over LTI 1.1 and 1.3.

| Kind | What it is | Sent to the LMS |
| --- | --- | --- |
| **E-learning** | Paged course in Markdown, with images, questions, reveals, callouts and flip cards | Completion, or score from the questions |
| **Quiz** | Scored questions in categories, with a score per category. Pass mark, attempts, shuffle, optional feedback per question | Best score |
| **Scan** | Statements rated from 1 to 5 in categories. You set percentage ranges per category, and each range has its own feedback | Completion |
| **Decision tree** | Branching scenario on a visual map. Choices lead to different endings, each with its own score | Completion, or score from the ending reached |
| **Drag and drop** | Sort cards into categories, match pairs, or put steps in order. Works by mouse, touch and keyboard | Score |
| **Concept map** | Graph of ideas joined by labelled connections. Learners explore by opening ideas, optionally revealing the map step by step | Completion |

Built with PHP 8 and MySQL/MariaDB, without Composer, so it runs on shared hosting. The frontend is Angular with Tailwind. The interface is available in English and Dutch.

## Development

Needs Docker and Node 20+.

```bash
npm install
```

```bash
docker compose up -d
```

```bash
npm start
```

| What | Where |
| --- | --- |
| App | http://localhost:4200 |
| API and LTI endpoints | http://localhost:8090 |
| phpMyAdmin | http://localhost:8091 |
| Mailpit (catches all email) | http://localhost:8025 |
| Mock LMS | http://localhost:8093 |

Dev accounts: `admin` / `admin123` and `user` / `user123`. Users work on their own items. Admins see everything, can delete anything, reassign items, and manage users and LMS connections. These accounts only exist in the Docker stack: the seed script refuses to run anywhere else and is not part of the build.

The **mock LMS** plays the platform side of LTI, so you can try launches, deep linking, languages and grade passback without installing Moodle.

### Checks

Run these with the Docker stack up:

```bash
node scripts/e2e.mjs
```

```bash
node scripts/lang-check.mjs
```

`e2e.mjs` runs permissions, LTI launches, forged and replayed launches, grade passback and deep linking against the mock LMS. It expects the seeded demo items, and it can run repeatedly. `lang-check.mjs` fails when a visible text has no Dutch translation.

To try the installer on an empty install, start `docker compose --profile installer up -d web-install` and open http://localhost:8092.

## Build and deploy

```bash
ng build
```

This is the only build step. `dist/makestuff` then holds the complete site: the Angular bundle and the PHP backend, without development files.

1. Create an empty MySQL or MariaDB database.
2. Upload the contents of `dist/makestuff` to your host. The web root or any sub folder works. Include the dotfiles (`.htaccess`).
3. Open the address in a browser. The installer checks the server, asks for database and email details, creates the first admin and locks itself.

Requires PHP 8.0+ with pdo_mysql, openssl, curl, mbstring and fileinfo, plus Apache with mod_rewrite. `config/` and `storage/uploads/` must be writable. Use https in production: browsers block mixed content inside an LMS.

The installer asks for the site address and LTI signatures depend on it. If the address changes, update `app_url` in `config/config.php`.

Upgrading a live install is not automated yet. New files in `migrations/` have to be applied by hand.

## Connecting an LMS

Admins add connections under **LMS connections**. Each item's **Embed in LMS** tab shows the URLs to enter.

- **LTI 1.3**: enter the login, redirect and JWKS URLs in the LMS. Copy the issuer, client ID, deployment ID and the LMS endpoints back into a new connection. Teachers can then pick items from inside the LMS through deep linking.
- **LTI 1.1**: create a connection to get a consumer key and secret, then use the item's launch URL.

Only published items can be launched. Edits stay in a draft until you publish them again. The player uses the language the LMS sends, and otherwise the browser's language. Item content stays in the language it was written in.

## Writing e-learning

Pages are Markdown, plus these blocks:

```text
:::question
Which planet is the largest?
- [ ] Earth :: Feedback for this option
- [x] Jupiter
> Feedback shown after answering
:::

:::reveal Show the answer
Hidden *markdown*.
:::

:::callout tip
Worth remembering. Variants: info, tip, warning.
:::

:::flipcards
Front | Back
:::
```

More than one `[x]` makes it a multiple-answer question. Use `= answer` lines instead of options for a typed answer. Answers stay on the server until a learner has answered.

## Extending

**A new kind of learning**, such as a decision tree:

1. Add a `LearningType` subclass in `backend/src/Types` and list it in `Registry.php`.
2. Add an editor and a player component, and list them in `frontend/src/app/core/learning-types.ts`.

Storage, publishing, LTI, attempts and results are shared, so nothing else changes.

**A new interactive block**: extend `Directives.php` and `frontend/src/app/shared/segments.ts`.

**A new language**: add `backend/src/Lang/<code>.php` and a dictionary in `frontend/src/app/i18n/`, then register it in `Lang.php` and `i18n.ts`. Keys are the English text, and anything missing falls back to English.

## Known limits

- Tested against the included mock LMS, not yet against a real Moodle, Canvas or Brightspace, and not IMS certified.
- LTI 1.3 launches use a single-use state stored on the server, not a browser cookie, because third-party cookies are unreliable inside LMS iframes.
- LTI 1.1 has no Content-Item picker. Deep linking is LTI 1.3 only.
- Every connected LMS can launch every published item, and the deep link picker lists them all. Published items are not yet limited per connection.
- A failed grade passback is recorded and shown in the results, but is not retried automatically.
