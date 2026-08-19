# SAMAGRA CONNECT — YOUR PPT → LIVE GAME

This package already contains the images extracted from the uploaded `cconnec1.pptx`.

## Important: fill the answers

Open `questions.json`.

It contains 23 question objects, mapped:
- Question 1 = original PPT slide 2
- Question 2 = original PPT slide 3
- ...
- Question 23 = original PPT slide 24

For every question, replace:
`REPLACE_ANSWER_1`
etc. with the real answer.

You can add accepted spellings in the `answers` array.

## Run

Node.js 18+:

```bash
npm install
npm start
```

Then open:
- Admin: http://localhost:3000/admin.html
- Projector: http://localhost:3000/projector.html
- Teams: http://YOUR-LAPTOP-IP:3000/team.html

For the final online event, deploy this same folder to a server/VPS or adapt the API to your preferred cloud host. The local version is provided first so you can test the game safely.

## Game rules

- 23 questions
- 30 seconds per question
- Images automatically reveal across the 30 seconds
- Maximum 10 points
- Score decreases linearly with elapsed time
- Correct answer only earns points
- Wrong answer earns 0
- One submission per team per question
- Live leaderboard supports many teams

## Scoring

score = 10 - (elapsedSeconds / 30) * 10

Examples:
0 sec = 10
5 sec = 8.33
10 sec = 6.67
15 sec = 5
20 sec = 3.33
25 sec = 1.67
30 sec = 0

The server, not the phone, calculates the score.
