const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;

const GAME_DURATION = 30 * 1000;
const MAX_POINTS = 10;

// ============================================================
// LOAD QUESTIONS
// ============================================================

let questions;

try {
    questions = require("./questions.json");
} catch (error) {
    console.error("Failed to load questions.json");
    console.error(error);
    process.exit(1);
}

if (!Array.isArray(questions) || questions.length === 0) {
    console.error("questions.json is empty or invalid.");
    process.exit(1);
}

// ============================================================
// EXPRESS CONFIGURATION
// ============================================================

app.use(express.json());

app.use(
    express.urlencoded({
        extended: true
    })
);

// Serve everything inside /public
app.use(
    express.static(
        path.join(__dirname, "public")
    )
);

// ============================================================
// GAME STATE
// ============================================================

const game = {
    running: false,

    questionIndex: 0,

    roundStartedAt: 0,

    roundEndsAt: 0,

    submissionsOpen: false,

    revealed: false,

    stopped: false,

    players: {},

    submissions: {}
};

// ============================================================
// QUESTION HELPERS
// ============================================================

function getCurrentQuestion() {
    return (
        questions[game.questionIndex] ||
        null
    );
}

function getQuestionImage(question) {
    if (!question) {
        return null;
    }

    return (
        question.image ||
        null
    );
}

// ============================================================
// ANSWER NORMALIZATION
//
// Spaces don't matter.
// Capital/lowercase doesn't matter.
// Symbols don't matter.
//
// Examples:
//
// "ALLEN SOLLY"
// "allen solly"
// "ALLENSOLLY"
// "Allen-Solly"
//
// all become:
// "allensolly"
// ============================================================

function normalizeAnswer(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}

// ============================================================
// CHECK ANSWER
// ============================================================

function isCorrectAnswer(
    submittedAnswer,
    question
) {
    if (!question) {
        return false;
    }

    const submitted =
        normalizeAnswer(
            submittedAnswer
        );

    if (!submitted) {
        return false;
    }

    const accepted = [];

    if (question.answer) {
        accepted.push(
            question.answer
        );
    }

    if (
        Array.isArray(
            question.aliases
        )
    ) {
        accepted.push(
            ...question.aliases
        );
    }

    if (
        Array.isArray(
            question.answers
        )
    ) {
        accepted.push(
            ...question.answers
        );
    }

    return accepted.some(
        answer =>
            normalizeAnswer(
                answer
            ) === submitted
    );
}

// ============================================================
// POINT CALCULATION
//
// 0 sec  = 10 points
// 5 sec  = 8.33
// 10 sec = 6.67
// 15 sec = 5
// 20 sec = 3.33
// 25 sec = 1.67
// 30 sec = 0
// ============================================================

function calculatePoints() {
    if (
        !game.running ||
        !game.roundStartedAt
    ) {
        return 0;
    }

    const elapsed =
        Date.now() -
        game.roundStartedAt;

    if (
        elapsed <= 0
    ) {
        return MAX_POINTS;
    }

    if (
        elapsed >=
        GAME_DURATION
    ) {
        return 0;
    }

    const remaining =
        GAME_DURATION -
        elapsed;

    const points =
        (
            remaining /
            GAME_DURATION
        ) *
        MAX_POINTS;

    return Math.round(
        points * 100
    ) / 100;
}

// ============================================================
// TIMER
// ============================================================

function updateTimer() {
    if (
        !game.running ||
        !game.submissionsOpen
    ) {
        return;
    }

    if (
        Date.now() >=
        game.roundEndsAt
    ) {
        game.submissionsOpen = false;
    }
}

setInterval(
    updateTimer,
    100
);

// ============================================================
// LEADERBOARD
// ============================================================

function getLeaderboard() {
    const players =
        Object.values(
            game.players
        );

    players.sort(
        (a, b) => {
            if (
                b.score !==
                a.score
            ) {
                return (
                    b.score -
                    a.score
                );
            }

            return (
                a.lastCorrectAt -
                b.lastCorrectAt
            );
        }
    );

    return players.map(
        (player, index) => {
            const key =
                `${player.id}:${game.questionIndex}`;

            const submission =
                game.submissions[key];

            return {
                id: player.id,

                name: player.name,

                score: Number(
                    player.score
                ),

                rank:
                    index + 1,

                answered:
                    Boolean(
                        submission
                    ),

                correct:
                    submission
                        ? Boolean(
                            submission.correct
                        )
                        : false,

                status:
                    submission
                        ? (
                            submission.correct
                                ? "CORRECT"
                                : "ANSWERED"
                        )
                        : (
                            game.submissionsOpen
                                ? "PLAYING"
                                : "WAITING"
                        )
            };
        }
    );
}

// ============================================================
// PUBLIC GAME STATE
// ============================================================

function getPublicState() {
    updateTimer();

    const question =
        getCurrentQuestion();

    let remaining = 0;

    if (
        game.running &&
        game.roundEndsAt
    ) {
        remaining =
            Math.max(
                0,
                game.roundEndsAt -
                Date.now()
            );
    }

    return {
        running:
            game.running,

        started:
            game.running,

        questionIndex:
            game.running
                ? game.questionIndex
                : 0,

        question:
            game.running
                ? {
                    id:
                        question?.id ||
                        null,

                    number:
                        game.questionIndex +
                        1,

                    total:
                        questions.length,

                    image:
                        getQuestionImage(
                            question
                        )
                }
                : null,

        total:
            questions.length,

        roundStartedAt:
            game.roundStartedAt,

        roundEndsAt:
            game.roundEndsAt,

        remaining,

        duration:
            GAME_DURATION,

        durationSeconds:
            GAME_DURATION / 1000,

        locked:
            !game.submissionsOpen,

        submissionsOpen:
            game.submissionsOpen,

        revealed:
            game.revealed,

        stopped:
            game.stopped,

        players:
            getLeaderboard(),

        playerCount:
            Object.keys(
                game.players
            ).length,

        leaderboard:
            getLeaderboard(),

        answer:
            game.revealed &&
            question
                ? question.answer
                : null
    };
}

// ============================================================
// HOME
// ============================================================

app.get(
    "/",
    (req, res) => {
        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );
    }
);

// ============================================================
// HEALTH
// ============================================================

app.get(
    "/api/health",
    (req, res) => {
        res.json({
            success: true,

            status: "ok",

            game:
                game.running,

            questions:
                questions.length,

            duration:
                GAME_DURATION / 1000
        });
    }
);

// ============================================================
// CURRENT STATE
// ============================================================

app.get(
    "/api/state",
    (req, res) => {
        res.json(
            getPublicState()
        );
    }
);

// ============================================================
// ADMIN — START GAME
// ============================================================

app.post(
    "/api/admin/start",
    (req, res) => {

        game.running = true;

        game.questionIndex = 0;

        game.roundStartedAt =
            Date.now();

        game.roundEndsAt =
            Date.now() +
            GAME_DURATION;

        game.submissionsOpen =
            true;

        game.revealed =
            false;

        game.stopped =
            false;

        game.submissions = {};

        res.json({
            success: true,

            message:
                "Game started.",

            state:
                getPublicState()
        });
    }
);

// ============================================================
// ADMIN — NEXT QUESTION
// ============================================================

app.post(
    "/api/admin/next",
    (req, res) => {

        if (!game.running) {
            return res
                .status(400)
                .json({
                    error:
                        "Game is not running."
                });
        }

        if (
            game.questionIndex >=
            questions.length - 1
        ) {
            game.running =
                false;

            game.submissionsOpen =
                false;

            game.revealed =
                true;

            return res.json({
                success: true,

                finished: true,

                message:
                    "All questions completed.",

                state:
                    getPublicState()
            });
        }

        game.questionIndex++;

        game.roundStartedAt =
            Date.now();

        game.roundEndsAt =
            Date.now() +
            GAME_DURATION;

        game.submissionsOpen =
            true;

        game.revealed =
            false;

        game.submissions = {};

        res.json({
            success: true,

            message:
                `Question ${
                    game.questionIndex + 1
                } started.`,

            state:
                getPublicState()
        });
    }
);

// ============================================================
// ADMIN — RESTART CURRENT ROUND
// ============================================================

app.post(
    "/api/admin/restart",
    (req, res) => {

        if (!game.running) {
            return res
                .status(400)
                .json({
                    error:
                        "Game is not running."
                });
        }

        game.roundStartedAt =
            Date.now();

        game.roundEndsAt =
            Date.now() +
            GAME_DURATION;

        game.submissionsOpen =
            true;

        game.revealed =
            false;

        game.submissions = {};

        res.json({
            success: true,

            message:
                "Round restarted.",

            state:
                getPublicState()
        });
    }
);

// ============================================================
// ADMIN — REVEAL ANSWER
// ============================================================

app.post(
    "/api/admin/reveal",
    (req, res) => {

        if (!game.running) {
            return res
                .status(400)
                .json({
                    error:
                        "Game is not running."
                });
        }

        const question =
            getCurrentQuestion();

        if (!question) {
            return res
                .status(404)
                .json({
                    error:
                        "Question not found."
                });
        }

        game.submissionsOpen =
            false;

        game.revealed =
            true;

        res.json({
            success: true,

            revealed: true,

            answer:
                question.answer,

            state:
                getPublicState()
        });
    }
);

// ============================================================
// ADMIN — STOP GAME
// ============================================================

app.post(
    "/api/admin/stop",
    (req, res) => {

        game.running =
            false;

        game.submissionsOpen =
            false;

        game.stopped =
            true;

        res.json({
            success: true,

            message:
                "Game stopped.",

            state:
                getPublicState()
        });
    }
);

// ============================================================
// ADMIN — RESET GAME
// ============================================================

app.post(
    "/api/admin/reset",
    (req, res) => {

        game.running =
            false;

        game.questionIndex =
            0;

        game.roundStartedAt =
            0;

        game.roundEndsAt =
            0;

        game.submissionsOpen =
            false;

        game.revealed =
            false;

        game.stopped =
            false;

        game.submissions =
            {};

        // Keep player names,
        // but reset scores.
        Object.values(
            game.players
        ).forEach(
            player => {
                player.score = 0;
                player.lastCorrectAt =
                    Date.now();
            }
        );

        res.json({
            success: true,

            message:
                "Game reset.",

            state:
                getPublicState()
        });
    }
);

// ============================================================
// STUDENT — JOIN
// ============================================================

app.post(
    "/api/team/join",
    (req, res) => {

        const name =
            String(
                req.body.name ||
                ""
            )
                .trim()
                .replace(
                    /\s+/g,
                    " "
                )
                .slice(
                    0,
                    40
                );

        if (!name) {
            return res
                .status(400)
                .json({
                    error:
                        "Enter your name."
                });
        }

        const duplicate =
            Object.values(
                game.players
            ).some(
                player =>
                    player.name
                        .toLowerCase() ===
                    name.toLowerCase()
            );

        if (duplicate) {
            return res
                .status(409)
                .json({
                    error:
                        "That name is already playing."
                });
        }

        const id =
            "player_" +
            Math.random()
                .toString(36)
                .slice(
                    2,
                    10
                );

        game.players[id] = {
            id,

            name,

            score: 0,

            lastCorrectAt:
                Date.now()
        };

        res.json({
            success: true,

            id,

            name
        });
    }
);

// ============================================================
// STUDENT — SUBMIT ANSWER
// ============================================================

app.post(
    "/api/team/answer",
    (req, res) => {

        const id =
            req.body.id;

        const answer =
            String(
                req.body.answer ||
                ""
            ).trim();

        if (
            !id ||
            !game.players[id]
        ) {
            return res
                .status(403)
                .json({
                    error:
                        "Invalid player."
                });
        }

        if (!game.running) {
            return res
                .status(400)
                .json({
                    error:
                        "Game has not started."
                });
        }

        updateTimer();

        if (
            !game.submissionsOpen
        ) {
            return res
                .status(400)
                .json({
                    error:
                        "Question is locked."
                });
        }

        if (!answer) {
            return res
                .status(400)
                .json({
                    error:
                        "Answer cannot be empty."
                });
        }

        const key =
            `${id}:${game.questionIndex}`;

        if (
            game.submissions[key]
        ) {
            return res
                .status(409)
                .json({
                    error:
                        "You have already submitted this question."
                });
        }

        const question =
            getCurrentQuestion();

        const correct =
            isCorrectAnswer(
                answer,
                question
            );

        const points =
            correct
                ? calculatePoints()
                : 0;

        game.submissions[key] = {
            answer,

            correct,

            points,

            submittedAt:
                Date.now()
        };

        if (correct) {

            game.players[id].score =
                Math.round(
                    (
                        game.players[id]
                            .score +
                        points
                    ) * 100
                ) / 100;

            game.players[id]
                .lastCorrectAt =
                Date.now();
        }

        res.json({
            success: true,

            correct,

            points,

            score:
                game.players[id]
                    .score
        });
    }
);

// ============================================================
// PROJECTOR — ANSWER
// ============================================================

app.get(
    "/api/projector-answer",
    (req, res) => {

        updateTimer();

        const question =
            getCurrentQuestion();

        if (!question) {
            return res.json({
                revealed: false
            });
        }

        if (
            game.revealed
        ) {
            return res.json({
                revealed: true,

                answer:
                    question.answer
            });
        }

        if (
            game.running &&
            Date.now() >=
            game.roundEndsAt
        ) {
            game.submissionsOpen =
                false;

            game.revealed =
                true;

            return res.json({
                revealed: true,

                answer:
                    question.answer
            });
        }

        res.json({
            revealed: false
        });
    }
);

// ============================================================
// API 404
// Always return JSON for /api
// Prevents:
//
// Unexpected token '<'
// ============================================================

app.use(
    "/api",
    (req, res) => {

        res
            .status(404)
            .json({
                error:
                    "API endpoint not found.",

                method:
                    req.method,

                path:
                    req.originalUrl
            });
    }
);

// ============================================================
// GENERAL 404
// ============================================================

app.use(
    (req, res) => {

        if (
            req.accepts("html")
        ) {
            return res
                .status(404)
                .send(`
                    <!DOCTYPE html>

                    <html>
                    <head>
                        <meta charset="UTF-8">
                        <title>
                            Samagra Connect
                        </title>

                        <style>
                            body {
                                margin: 0;
                                min-height: 100vh;
                                display: grid;
                                place-items: center;
                                background: #050608;
                                color: white;
                                font-family: Arial, sans-serif;
                            }

                            h1 {
                                font-size: 32px;
                            }
                        </style>
                    </head>

                    <body>
                        <h1>
                            404 • Page Not Found
                        </h1>
                    </body>
                    </html>
                `);
        }

        res
            .status(404)
            .json({
                error:
                    "Not found."
            });
    }
);

// ============================================================
// ERROR HANDLER
// ============================================================

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
            "SERVER ERROR:",
            error
        );

        if (
            req.path.startsWith(
                "/api"
            )
        ) {
            return res
                .status(500)
                .json({
                    error:
                        "Internal server error."
                });
        }

        res
            .status(500)
            .send(
                "Internal server error."
            );
    }
);

// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");
        console.log(
            "================================"
        );
        console.log(
            " SAMAGRA CONNECT LIVE"
        );
        console.log(
            "================================"
        );
        console.log("");

        console.log(
            `Local: http://localhost:${PORT}`
        );

        console.log("");

        console.log(
            `Questions: ${questions.length}`
        );

        console.log(
            "Duration: 30 seconds"
        );

        console.log(
            "Maximum points: 10"
        );

        console.log("");

        console.log(
            "Admin:       /admin.html"
        );

        console.log(
            "Projector:   /projector.html"
        );

        console.log(
            "Students:    /team.html"
        );

        console.log(
            "Leaderboard: /leaderboard.html"
        );

        console.log("");

        console.log(
            "Health:      /api/health"
        );

        console.log("");

        console.log(
            "Game server is running!"
        );

        console.log(
            "================================"
        );

        console.log("");
    }
);
