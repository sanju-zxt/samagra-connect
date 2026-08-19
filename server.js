const express = require("express");
const path = require("path");

const app = express();

const PORT = process.env.PORT || 3000;
const GAME_DURATION = 30 * 1000;
const MAX_POINTS = 10;


/* =========================================================
   LOAD QUESTIONS
   ========================================================= */

const questions = require(
    "./questions.json"
);


if (
    !Array.isArray(questions) ||
    questions.length === 0
) {

    console.error(
        "ERROR: questions.json is empty or invalid."
    );

    process.exit(1);

}


/* =========================================================
   APP CONFIG
   ========================================================= */

app.use(
    express.json()
);


app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        )
    )
);


/* =========================================================
   GAME STATE
   ========================================================= */

const game = {

    started:
        false,

    question:
        0,

    startedAt:
        0,

    submissionsOpen:
        false,

    revealed:
        false,

    teams:
        {},

    submissions:
        {}

};


/* =========================================================
   CURRENT QUESTION
   ========================================================= */

function getCurrentQuestion() {

    return (
        questions[
            game.question
        ] ||
        null
    );

}


/* =========================================================
   NORMALIZE ANSWER
   ========================================================= */

function normalizeAnswer(
    answer
) {

    return String(
        answer || ""
    )
        .trim()
        .toLowerCase()
        .replace(
            /[^a-z0-9]/g,
            ""
        );

}


/* =========================================================
   ANSWER CHECK
   ========================================================= */

function isCorrect(
    submitted,
    question
) {

    const submittedNormalized =
        normalizeAnswer(
            submitted
        );


    const accepted = [];


    if (
        question.answer
    ) {

        accepted.push(
            question.answer
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
            ) ===
            submittedNormalized
    );

}


/* =========================================================
   POINT CALCULATION
   =========================================================

   0 sec  -> 10.00
   5 sec  -> 8.33
   10 sec -> 6.67
   15 sec -> 5.00
   20 sec -> 3.33
   25 sec -> 1.67
   30 sec -> 0.00

   ========================================================= */

function calculatePoints(
    elapsed
) {

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


/* =========================================================
   CLOSE ROUND AUTOMATICALLY
   ========================================================= */

function checkTimer() {

    if (
        !game.started ||
        !game.submissionsOpen
    ) {

        return;

    }


    const elapsed =
        Date.now() -
        game.startedAt;


    if (
        elapsed >=
        GAME_DURATION
    ) {

        game.submissionsOpen =
            false;

    }

}


setInterval(
    checkTimer,
    100
);


/* =========================================================
   LEADERBOARD
   ========================================================= */

function getLeaderboard() {

    const teams =
        Object.values(
            game.teams
        );


    teams.sort(
        (
            a,
            b
        ) => {

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


    return teams.map(
        (
            team,
            index
        ) => {

            const key =
                `${team.id}:${game.question}`;


            const submission =
                game.submissions[
                    key
                ];


            return {

                id:
                    team.id,

                name:
                    team.name,

                score:
                    Number(
                        team.score
                    ),

                rank:
                    index + 1,

                answered:
                    Boolean(
                        submission
                    ),

                submitted:
                    Boolean(
                        submission
                    ),

                correct:
                    submission
                        ? Boolean(
                            submission.correct
                        )
                        : false

            };

        }
    );

}


/* =========================================================
   PUBLIC STATE
   ========================================================= */

function getPublicState() {

    checkTimer();


    const question =
        getCurrentQuestion();


    let remaining =
        GAME_DURATION;


    if (
        game.started &&
        game.startedAt
    ) {

        remaining =
            Math.max(
                0,
                GAME_DURATION -
                (
                    Date.now() -
                    game.startedAt
                )
            );

    }


    return {

        started:
            game.started,

        question:
            game.started
                ? game.question + 1
                : 0,

        totalQuestions:
            questions.length,

        startedAt:
            game.startedAt,

        submissionsOpen:
            game.submissionsOpen,

        revealed:
            game.revealed,

        remaining:
            remaining,

        clueCount:
            question &&
            Array.isArray(
                question.images
            )
                ? question.images.length
                : 0,

        images:
            question
                ? question.images
                : [],

        answer:
            game.revealed &&
            question
                ? question.answer
                : null,

        leaderboard:
            getLeaderboard()

    };

}


/* =========================================================
   HOME
   ========================================================= */

app.get(
    "/",
    (
        req,
        res
    ) => {

        res.sendFile(
            path.join(
                __dirname,
                "public",
                "index.html"
            )
        );

    }
);


/* =========================================================
   STATE
   ========================================================= */

app.get(
    "/api/state",
    (
        req,
        res
    ) => {

        res.json(
            getPublicState()
        );

    }
);


/* =========================================================
   START GAME
   ========================================================= */

function startGame(
    req,
    res
) {

    game.started =
        true;

    game.question =
        0;

    game.startedAt =
        Date.now();

    game.submissionsOpen =
        true;

    game.revealed =
        false;

    game.submissions =
        {};


    res.json({
        success:
            true,

        message:
            "Game started.",

        state:
            getPublicState()

    });

}


app.post(
    "/api/admin/start",
    startGame
);


/* =========================================================
   NEXT QUESTION
   ========================================================= */

function nextQuestion(
    req,
    res
) {

    if (
        !game.started
    ) {

        return res
            .status(400)
            .json({
                error:
                    "Game is not running."
            });

    }


    if (
        game.question >=
        questions.length - 1
    ) {

        game.started =
            false;

        game.submissionsOpen =
            false;

        game.revealed =
            true;


        return res.json({
            success:
                true,

            finished:
                true,

            message:
                "All questions completed.",

            state:
                getPublicState()

        });

    }


    game.question++;

    game.startedAt =
        Date.now();

    game.submissionsOpen =
        true;

    game.revealed =
        false;

    game.submissions =
        {};


    res.json({
        success:
            true,

        message:
            `Question ${
                game.question + 1
            } started.`,

        state:
            getPublicState()

    });

}


app.post(
    "/api/admin/next",
    nextQuestion
);


/* =========================================================
   RESTART CURRENT QUESTION
   ========================================================= */

function restartRound(
    req,
    res
) {

    if (
        !game.started
    ) {

        return res
            .status(400)
            .json({
                error:
                    "Game is not running."
            });

    }


    game.startedAt =
        Date.now();

    game.submissionsOpen =
        true;

    game.revealed =
        false;

    game.submissions =
        {};


    res.json({
        success:
            true,

        message:
            "Round restarted.",

        state:
            getPublicState()

    });

}


app.post(
    "/api/admin/restart",
    restartRound
);


/* =========================================================
   REVEAL ANSWER
   ========================================================= */

function revealAnswer(
    req,
    res
) {

    if (
        !game.started
    ) {

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


    /*
     * THIS IS THE IMPORTANT FIX.
     *
     * We DO NOT restart startedAt.
     * We simply close answers and reveal.
     */

    game.submissionsOpen =
        false;

    game.revealed =
        true;


    res.json({

        success:
            true,

        revealed:
            true,

        answer:
            question.answer,

        state:
            getPublicState()

    });

}


app.post(
    "/api/admin/reveal",
    revealAnswer
);


/* =========================================================
   STOP GAME
   ========================================================= */

function stopGame(
    req,
    res
) {

    game.started =
        false;

    game.submissionsOpen =
        false;


    res.json({

        success:
            true,

        message:
            "Game stopped.",

        state:
            getPublicState()

    });

}


app.post(
    "/api/admin/stop",
    stopGame
);


/* =========================================================
   TEAM JOIN
   ========================================================= */

app.post(
    "/api/team/join",
    (
        req,
        res
    ) => {

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
                    30
                );


        if (!name) {

            return res
                .status(400)
                .json({
                    error:
                        "Enter a team name."
                });

        }


        const duplicate =
            Object.values(
                game.teams
            ).some(
                team =>
                    team.name.toLowerCase() ===
                    name.toLowerCase()
            );


        if (
            duplicate
        ) {

            return res
                .status(409)
                .json({
                    error:
                        "That team name is already taken."
                });

        }


        const id =
            "team_" +
            Math.random()
                .toString(36)
                .slice(
                    2,
                    10
                );


        game.teams[id] = {

            id:
                id,

            name:
                name,

            score:
                0,

            lastCorrectAt:
                Date.now()

        };


        res.json({

            success:
                true,

            id:
                id,

            name:
                name

        });

    }
);


/* =========================================================
   TEAM ANSWER
   ========================================================= */

app.post(
    "/api/team/answer",
    (
        req,
        res
    ) => {

        const id =
            req.body.id;


        const answer =
            String(
                req.body.answer ||
                ""
            )
                .trim();


        if (
            !id ||
            !game.teams[id]
        ) {

            return res
                .status(403)
                .json({
                    error:
                        "Invalid team."
                });

        }


        if (
            !game.started
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Game has not started."
                });

        }


        checkTimer();


        if (
            !game.submissionsOpen
        ) {

            return res
                .status(400)
                .json({
                    error:
                        "Time is up. Answers are closed."
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
            `${id}:${game.question}`;


        if (
            game.submissions[key]
        ) {

            return res
                .status(409)
                .json({
                    error:
                        "Your team has already submitted."
                });

        }


        const question =
            getCurrentQuestion();


        const correct =
            isCorrect(
                answer,
                question
            );


        const elapsed =
            Date.now() -
            game.startedAt;


        const points =
            correct
                ? calculatePoints(
                    elapsed
                )
                : 0;


        game.submissions[key] = {

            answer:
                answer,

            correct:
                correct,

            points:
                points,

            submittedAt:
                Date.now()

        };


        if (
            correct
        ) {

            game.teams[id].score =
                Math.round(
                    (
                        game.teams[id].score +
                        points
                    ) * 100
                ) / 100;


            game.teams[id].lastCorrectAt =
                Date.now();

        }


        res.json({

            success:
                true,

            correct:
                correct,

            points:
                points,

            score:
                game.teams[id].score

        });

    }
);


/* =========================================================
   PROJECTOR ANSWER
   ========================================================= */

app.get(
    "/api/projector-answer",
    (
        req,
        res
    ) => {

        checkTimer();


        const question =
            getCurrentQuestion();


        if (!question) {

            return res.json({
                revealed:
                    false
            });

        }


        if (
            game.revealed
        ) {

            return res.json({

                revealed:
                    true,

                answer:
                    question.answer

            });

        }


        const elapsed =
            Date.now() -
            game.startedAt;


        if (
            game.started &&
            elapsed >=
            GAME_DURATION
        ) {

            game.submissionsOpen =
                false;

            game.revealed =
                true;


            return res.json({

                revealed:
                    true,

                answer:
                    question.answer

            });

        }


        res.json({
            revealed:
                false
        });

    }
);


/* =========================================================
   API 404
   =========================================================

   VERY IMPORTANT:
   API errors return JSON, NOT HTML.

   This prevents:
   Unexpected token '<'

   ========================================================= */

app.use(
    "/api",
    (
        req,
        res
    ) => {

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


/* =========================================================
   GENERAL 404
   ========================================================= */

app.use(
    (
        req,
        res
    ) => {

        if (
            req.accepts("html")
        ) {

            return res
                .status(404)
                .send(`
                    <!DOCTYPE html>

                    <html>

                    <head>

                        <title>
                            SAMAGRA CONNECT
                        </title>

                        <style>

                            body {
                                background:#050608;
                                color:white;
                                font-family:Arial;
                                display:grid;
                                place-items:center;
                                min-height:100vh;
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


/* =========================================================
   ERROR HANDLER
   ========================================================= */

app.use(
    (
        error,
        req,
        res,
        next
    ) => {

        console.error(
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


/* =========================================================
   SERVER
   ========================================================= */

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
        console.log(
            `Local: http://localhost:${PORT}`
        );
        console.log("");
        console.log(
            `Questions: ${questions.length}`
        );
        console.log(
            `Duration: 30 seconds`
        );
        console.log(
            `Maximum points: 10`
        );
        console.log("");
        console.log(
            "Admin:     /admin.html"
        );
        console.log(
            "Projector: /projector.html"
        );
        console.log(
            "Teams:     /team.html"
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