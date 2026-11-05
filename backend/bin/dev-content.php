<?php
declare(strict_types=1);

// Sample content for the development stack.
$opt = static fn (string $id, string $text, bool $correct = false, string $feedback = '') => compact('id', 'text', 'correct', 'feedback');

return [
    [
        'owner' => 'user',
        'public_id' => 'demo-elearning',
        'type' => 'elearning',
        'title' => 'Giving feedback that lands',
        'description' => 'A short course on feedback conversations.',
        'content' => [
            'settings' => ['grading' => 'questions', 'passPercentage' => 50],
            'pages' => [
                ['id' => 'p1', 'title' => 'Why it matters', 'markdown' => <<<'MD'
# Why feedback matters

Most people want to do good work, and **feedback is how they find out** whether they are.
Done badly it causes defensiveness. Done well it builds trust.

:::callout tip
Good feedback describes what you saw, not who someone is.
:::

## Three ingredients

1. **Specific**: name the moment.
2. **Timely**: close to when it happened.
3. **Kind**: aimed at helping, not winning.

:::reveal Why not wait for the annual review?
By then the moment is gone, and the person has spent months repeating something you could have helped with in five minutes.
:::
MD],
                ['id' => 'p2', 'title' => 'A simple model', 'markdown' => <<<'MD'
# Situation, behaviour, impact

Flip the cards to see each step of the model.

:::flipcards
Situation | Where and when did it happen?
Behaviour | What did the person actually do or say?
Impact | What effect did that have on you or the team?
:::

:::question
Which sentence describes *behaviour*?
- [ ] You were unprofessional yesterday. :: That is a judgement, not something you could film.
- [x] You interrupted Sam twice during the demo. :: Yes: it is observable and specific.
- [ ] You never listen. :: "Never" is a generalisation, and it invites an argument.
> Behaviour is what a camera would record.
:::
MD],
                ['id' => 'p3', 'title' => 'Wrap-up', 'markdown' => <<<'MD'
# Before you go

:::question
Which of these make feedback more effective?
- [x] Giving it soon after the event
- [x] Describing specific behaviour
- [ ] Saving it for the annual review
- [ ] Commenting on someone's personality
:::

:::callout warning
Never give corrective feedback in front of the group.
:::

That is everything. Choose **Finish** to record your result.
MD],
            ],
        ],
    ],
    [
        'owner' => 'user',
        'public_id' => 'demo-quiz',
        'type' => 'quiz',
        'title' => 'Web safety basics',
        'description' => 'Five questions on everyday security.',
        'content' => [
            'settings' => ['passPercentage' => 60, 'shuffleQuestions' => false, 'immediateFeedback' => false, 'showAnswers' => true, 'maxAttempts' => 3],
            'questions' => [
                ['id' => 'q1', 'type' => 'single', 'text' => 'What makes a password strongest?', 'points' => 1, 'feedback' => 'Length beats complexity.',
                    'options' => [$opt('a', 'Length', true), $opt('b', 'A capital letter'), $opt('c', 'A birth year')], 'accepted' => []],
                ['id' => 'q2', 'type' => 'multiple', 'text' => 'Which are signs of a phishing email?', 'points' => 2, 'feedback' => '',
                    'options' => [$opt('a', 'Urgent threats', true), $opt('b', 'A mismatched sender address', true), $opt('c', 'Your manager\'s usual sign-off')], 'accepted' => []],
                ['id' => 'q3', 'type' => 'truefalse', 'text' => 'Two-factor authentication protects you even if your password leaks.', 'points' => 1, 'feedback' => '',
                    'options' => [$opt('t', 'True', true), $opt('f', 'False')], 'accepted' => []],
                ['id' => 'q4', 'type' => 'text', 'text' => 'What does the S in HTTPS stand for?', 'points' => 1, 'feedback' => '', 'options' => [], 'accepted' => ['secure']],
            ],
        ],
    ],
    [
        'owner' => 'admin',
        'public_id' => 'demo-scan',
        'type' => 'scan',
        'title' => 'Digital skills scan',
        'description' => 'Find out where your digital skills stand.',
        'content' => [
            'settings' => ['maxAttempts' => 0],
            'intro' => 'Rate each statement. There are no right or wrong answers, and it takes about two minutes.',
            'scale' => [
                ['value' => 1, 'label' => 'Strongly disagree'],
                ['value' => 2, 'label' => 'Disagree'],
                ['value' => 3, 'label' => 'Neutral'],
                ['value' => 4, 'label' => 'Agree'],
                ['value' => 5, 'label' => 'Strongly agree'],
            ],
            'dimensions' => [['id' => 'tools', 'name' => 'Everyday tools'], ['id' => 'safety', 'name' => 'Online safety'], ['id' => 'learn', 'name' => 'Learning new things']],
            'questions' => [
                ['id' => 's1', 'text' => 'I can find what I need in our office software without help.', 'dimensionId' => 'tools', 'reversed' => false],
                ['id' => 's2', 'text' => 'I often ask colleagues to fix small computer problems for me.', 'dimensionId' => 'tools', 'reversed' => true],
                ['id' => 's3', 'text' => 'I recognise suspicious emails.', 'dimensionId' => 'safety', 'reversed' => false],
                ['id' => 's4', 'text' => 'I use a different password for every account.', 'dimensionId' => 'safety', 'reversed' => false],
                ['id' => 's5', 'text' => 'I enjoy trying out new apps.', 'dimensionId' => 'learn', 'reversed' => false],
                ['id' => 's6', 'text' => 'I look things up myself before asking for help.', 'dimensionId' => 'learn', 'reversed' => false],
            ],
            'bands' => [
                ['id' => 'b1', 'dimensionId' => '', 'min' => 0, 'max' => 49.9, 'title' => 'Getting started', 'advice' => 'A short basics course will pay off quickly.'],
                ['id' => 'b2', 'dimensionId' => '', 'min' => 50, 'max' => 74.9, 'title' => 'On your way', 'advice' => 'You have solid habits. Pick the lowest area below to work on next.'],
                ['id' => 'b3', 'dimensionId' => '', 'min' => 75, 'max' => 100, 'title' => 'Digitally confident', 'advice' => 'You could help colleagues who are just starting out.'],
                ['id' => 'b4', 'dimensionId' => 'safety', 'min' => 0, 'max' => 59.9, 'title' => 'Needs attention', 'advice' => 'Start with a password manager: it fixes the biggest risk in one step.'],
            ],
        ],
    ],
];
