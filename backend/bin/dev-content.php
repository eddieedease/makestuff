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
        'description' => 'Questions on everyday security, scored per category.',
        'content' => [
            'settings' => ['passPercentage' => 60, 'shuffleQuestions' => false, 'immediateFeedback' => false, 'showAnswers' => true, 'maxAttempts' => 3],
            'categories' => [['id' => 'pw', 'name' => 'Passwords'], ['id' => 'mail', 'name' => 'Email'], ['id' => 'web', 'name' => 'Browsing']],
            'questions' => [
                ['id' => 'q1', 'categoryId' => 'pw', 'type' => 'single', 'text' => 'What makes a password strongest?', 'points' => 1, 'feedback' => 'Length beats complexity.',
                    'options' => [$opt('a', 'Length', true), $opt('b', 'A capital letter'), $opt('c', 'A birth year')], 'accepted' => []],
                ['id' => 'q2', 'categoryId' => 'mail', 'type' => 'multiple', 'text' => 'Which are signs of a phishing email?', 'points' => 2, 'feedback' => '',
                    'options' => [$opt('a', 'Urgent threats', true), $opt('b', 'A mismatched sender address', true), $opt('c', 'Your manager\'s usual sign-off')], 'accepted' => []],
                ['id' => 'q3', 'categoryId' => 'pw', 'type' => 'truefalse', 'text' => 'Two-factor authentication protects you even if your password leaks.', 'points' => 1, 'feedback' => '',
                    'options' => [$opt('t', 'True', true), $opt('f', 'False')], 'accepted' => []],
                ['id' => 'q4', 'categoryId' => 'web', 'type' => 'text', 'text' => 'What does the S in HTTPS stand for?', 'points' => 1, 'feedback' => '', 'options' => [], 'accepted' => ['secure']],
            ],
        ],
    ],
    [
        'owner' => 'user',
        'public_id' => 'demo-tree',
        'type' => 'decision_tree',
        'title' => 'The unhappy customer',
        'description' => 'Practise a difficult conversation. Your choices decide how it ends.',
        'content' => [
            'settings' => ['grading' => 'ending', 'passPercentage' => 60, 'maxAttempts' => 0, 'allowBack' => true],
            'startId' => 'start',
            'nodes' => [
                ['id' => 'start', 'kind' => 'step', 'title' => 'The phone rings', 'text' => "A customer calls, audibly upset:\n\n> \"This is the third time my order is late!\"\n\nWhat do you do first?", 'choices' => [
                    ['id' => 'c1', 'text' => 'Apologise and ask what happened', 'feedback' => 'Good start: they feel heard before you solve anything.', 'targetId' => 'listen'],
                    ['id' => 'c2', 'text' => 'Explain that the courier caused it', 'feedback' => 'Even if it is true, this sounds like an excuse.', 'targetId' => 'defend'],
                ]],
                ['id' => 'listen', 'kind' => 'step', 'title' => 'They calm down', 'text' => 'The customer explains. The order was a birthday present, and the birthday is tomorrow.', 'choices' => [
                    ['id' => 'c3', 'text' => 'Offer express delivery for free', 'feedback' => 'You solved the real problem.', 'targetId' => 'great'],
                    ['id' => 'c4', 'text' => 'Promise to look into it and call back', 'feedback' => 'Reasonable, but the deadline is tomorrow.', 'targetId' => 'okay'],
                ]],
                ['id' => 'defend', 'kind' => 'step', 'title' => 'It gets worse', 'text' => '"I don\'t care whose fault it is," they say. They ask for your manager.', 'choices' => [
                    ['id' => 'c5', 'text' => 'Apologise and start over', 'feedback' => 'Changing course in time can still save the conversation.', 'targetId' => 'listen'],
                    ['id' => 'c6', 'text' => 'Transfer them to your manager', 'feedback' => 'The customer now has to explain everything again.', 'targetId' => 'bad'],
                ]],
                ['id' => 'great', 'kind' => 'end', 'title' => 'A loyal customer', 'text' => 'The present arrives on time, and the customer leaves a glowing review.', 'choices' => [], 'score' => 100],
                ['id' => 'okay', 'kind' => 'end', 'title' => 'Solved, just', 'text' => 'You call back an hour later with a solution. The customer is relieved but not delighted.', 'choices' => [], 'score' => 60],
                ['id' => 'bad', 'kind' => 'end', 'title' => 'A lost customer', 'text' => 'The customer cancels the order and does not come back.', 'choices' => [], 'score' => 0],
            ],
        ],
    ],
    [
        'owner' => 'user',
        'public_id' => 'demo-map',
        'type' => 'concept_map',
        'title' => 'The water cycle',
        'description' => 'Explore how water moves around the planet.',
        'content' => [
            'settings' => ['reveal' => 'progressive', 'requireAll' => true, 'maxAttempts' => 0],
            'intro' => 'Start at the ocean and follow the water. Opening an idea reveals what it connects to.',
            'startId' => 'ocean',
            'categories' => [['id' => 'air', 'name' => 'In the air'], ['id' => 'land', 'name' => 'On land'], ['id' => 'sea', 'name' => 'At sea']],
            'nodes' => [
                ['id' => 'ocean', 'title' => 'Ocean', 'text' => 'Most of the water on Earth is here. **The sun heats the surface**, and the cycle begins.', 'categoryId' => 'sea', 'x' => 40, 'y' => 240],
                ['id' => 'evap', 'title' => 'Evaporation', 'text' => 'Heat turns liquid water into vapour, which rises with warm air.', 'categoryId' => 'air', 'x' => 40, 'y' => 40],
                ['id' => 'cond', 'title' => 'Condensation', 'text' => 'Higher up the air cools, and vapour turns into tiny droplets: clouds.', 'categoryId' => 'air', 'x' => 290, 'y' => 40],
                ['id' => 'rain', 'title' => 'Precipitation', 'text' => 'When droplets grow heavy enough, they fall as rain, hail or snow.', 'categoryId' => 'air', 'x' => 540, 'y' => 40],
                ['id' => 'river', 'title' => 'Rivers', 'text' => 'Water that lands on the surface flows downhill.', 'categoryId' => 'land', 'x' => 290, 'y' => 240],
                ['id' => 'ground', 'title' => 'Groundwater', 'text' => 'Some water soaks into the soil and moves slowly underground.', 'categoryId' => 'land', 'x' => 540, 'y' => 240],
            ],
            'edges' => [
                ['id' => 'e1', 'from' => 'ocean', 'to' => 'evap', 'label' => 'heated by the sun'],
                ['id' => 'e2', 'from' => 'evap', 'to' => 'cond', 'label' => 'rises and cools'],
                ['id' => 'e3', 'from' => 'cond', 'to' => 'rain', 'label' => 'droplets grow'],
                ['id' => 'e4', 'from' => 'rain', 'to' => 'river', 'label' => 'runs off'],
                ['id' => 'e5', 'from' => 'rain', 'to' => 'ground', 'label' => 'soaks in'],
                ['id' => 'e6', 'from' => 'ground', 'to' => 'river', 'label' => 'feeds'],
                ['id' => 'e7', 'from' => 'river', 'to' => 'ocean', 'label' => 'flows back'],
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
            'categories' => [['id' => 'tools', 'name' => 'Everyday tools'], ['id' => 'safety', 'name' => 'Online safety'], ['id' => 'learn', 'name' => 'Learning new things']],
            'questions' => [
                ['id' => 's1', 'text' => 'I can find what I need in our office software without help.', 'categoryId' => 'tools', 'reversed' => false],
                ['id' => 's2', 'text' => 'I often ask colleagues to fix small computer problems for me.', 'categoryId' => 'tools', 'reversed' => true],
                ['id' => 's3', 'text' => 'I recognise suspicious emails.', 'categoryId' => 'safety', 'reversed' => false],
                ['id' => 's4', 'text' => 'I use a different password for every account.', 'categoryId' => 'safety', 'reversed' => false],
                ['id' => 's5', 'text' => 'I enjoy trying out new apps.', 'categoryId' => 'learn', 'reversed' => false],
                ['id' => 's6', 'text' => 'I look things up myself before asking for help.', 'categoryId' => 'learn', 'reversed' => false],
            ],
            'bands' => [
                ['id' => 'b1', 'categoryId' => '', 'min' => 0, 'max' => 50, 'title' => 'Getting started', 'advice' => 'A short basics course will pay off quickly.'],
                ['id' => 'b2', 'categoryId' => '', 'min' => 50, 'max' => 75, 'title' => 'On your way', 'advice' => 'You have solid habits. Pick the lowest area below to work on next.'],
                ['id' => 'b3', 'categoryId' => '', 'min' => 75, 'max' => 100, 'title' => 'Digitally confident', 'advice' => 'You could help colleagues who are just starting out.'],
                ['id' => 'b4', 'categoryId' => 'safety', 'min' => 0, 'max' => 60, 'title' => 'Needs attention', 'advice' => 'Start with a password manager: it fixes the biggest risk in one step.'],
                ['id' => 'b5', 'categoryId' => 'safety', 'min' => 60, 'max' => 100, 'title' => 'Well protected', 'advice' => 'Good habits. Keep your software up to date as well.'],
            ],
        ],
    ],
];
