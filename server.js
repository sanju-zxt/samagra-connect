"use strict";

const express = require("express");
const path = require("path");

const app = express();

/* =========================================================
   SERVER CONFIG
   ========================================================= */

const PORT = process.env.PORT || 3000;

const HOST = "0.0.0.0";

const GAME_DURATION = 30 * 1000;

const MAX_POINTS = 10;


/* =========================================================
   LOAD QUESTIONS
   ========================================================= */

let questions;

try {

    questions = require("./questions.json");

} catch (error) {

    console.error(
        "ERROR: Could not load questions.json"
    );

    console.error(error);

    process.exit(1);
}


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
   VALIDATE QUESTIONS
   ========================================================= */

questions.forEach(
    (question, index) => {

        if (
            !question ||
            typeof question !== "object"
        ) {

            console.error(
                `Invalid question at index ${index}`
            );

            process.exit(1);
        }


        if (
            typeof question.answer !== "string"
        ) {

            console.error(
                `Question ${index + 1} has no valid answer.`
            );

            process.exit(1);
        }


        if (
            !Array.isArray(question.images)
        ) {

            question.images = [];

        }

    }
);


/* =========================================================
   APP CONFIG
   ========================================================= */

app.disable("x-powered-by");

app.use(
    express.json({
        limit: "100kb"
    })
);


app.use(
    express.urlencoded({
        extended: false,
        limit: "100kb"
    })
);


/* =========================================================
   STATIC FILES
   ========================================================= */

app.use(
    express.static(
        path.join(
            __dirname,
            "public"
        ),
        {
            extensions: [
                "html"
            ]
        }
    )
);


/* =========================================================
   GAME STATE
   ========================================================= */

const game = {

    started: false,

    finished: false,

    question: 0,

    startedAt: 0,

    submissionsOpen: false,

    revealed: false,

    teams: {},

    submissions: {}

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

    if (!question) {
        return false;
    }


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
   CHECK TIMER
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


/* =========================================================
   TIMER LOOP
   ========================================================= */

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


            /*
             * If scores are equal,
             * the team that reached
             * that score first ranks higher.
             */

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
                        : false,

                currentPoints:
                    submission
                        ? Number(
                            submission.points || 0
                        )
                        : 0

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

        finished:
            game.finished,

        question:
            game.started
                ? game.question + 1
                : game.finished
                    ? questions.length
                    : 0,

        totalQuestions:
            questions.length,

        startedAt:
            game.startedAt,

        remaining:
            remaining,

        duration:
            GAME_DURATION,

        maxPoints:
            MAX_POINTS,

        submissionsOpen:
            game.submissionsOpen,

        revealed:
            game.revealed,

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
   HEALTH CHECK
   ========================================================= */

app.get(
    "/api/health",
    (
        req,
        res
    ) => {

        res.json({

            success:
                true,

            status:
                "online",

            game:
                "SAMAGRA CONNECT",

            questions:
                questions.length,

            duration:
                GAME_DURATION / 1000,

            maxPoints:
                MAX_POINTS,

            uptime:
                process.uptime(),

            timestamp:
                Date.now()

        });

    }
);


/* =========================================================
   PUBLIC STATE
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

app.post(
    "/api/admin/start",
    (
        req,
        res
    ) => {

        game.started =
            true;

        game.finished =
            false;

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
);


/* =========================================================
   NEXT QUESTION
   ========================================================= */

app.post(
    "/api/admin/next",
    (
        req,
        res
    ) => {

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


        /*
         * If this was the final question,
         * finish the game.
         */

        if (
            game.question >=
            questions.length - 1
        ) {

            game.started =
                false;

            game.finished =
                true;

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
);


/* =========================================================
   RESTART CURRENT ROUND
   ========================================================= */

app.post(
    "/api/admin/restart",
    (
        req,
        res
    ) => {

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
);


/* =========================================================
   REVEAL ANSWER
   ========================================================= */

app.post(
    "/api/admin/reveal",
    (
        req,
        res
    ) => {

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
);


/* =========================================================
   STOP GAME
   ========================================================= */

app.post(
    "/api/admin/stop",
    (
        req,
        res
    ) => {

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
);


/* =========================================================
   RESET GAME
   ========================================================= */

app.post(
    "/api/admin/reset",
    (
        req,
        res
    ) => {

        game.started =
            false;

        game.finished =
            false;

        game.question =
            0;

        game.startedAt =
            0;

        game.submissionsOpen =
            false;

        game.revealed =
            false;

        game.submissions =
            {};


        /*
         * Reset all team scores.
         * Keep team names so teams don't
         * need to join again during testing.
         */

        Object.values(
            game.teams
        ).forEach(
            team => {

                team.score =
                    0;

                team.lastCorrectAt =
                    Date.now();

            }
        );


        res.json({

            success:
                true,

            message:
                "Game reset.",

            state:
                getPublicState()

        });

    }
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


        /*
         * Team names are unique.
         */

        const duplicate =
            Object.values(
                game.teams
            ).some(
                team =>
                    team.name
                        .toLowerCase() ===
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
                .trim()
                .slice(
                    0,
                    100
                );


        /*
         * Validate team.
         */

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


        /*
         * Game must be running.
         */

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


        /*
         * Check timer before accepting answer.
         */

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


        /*
         * One submission per team per question.
         */

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


        if (!question) {

            return res
                .status(404)
                .json({

                    error:
                        "Question not found."

                });

        }


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


        /*
         * Add points only for correct answers.
         */

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


        /*
         * Admin manually revealed.
         */

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


        /*
         * Automatically reveal after
         * 30 seconds.
         */

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
   TEAM STATUS
   ========================================================= */

app.get(
    "/api/team/:id",
    (
        req,
        res
    ) => {

        const id =
            req.params.id;


        const team =
            game.teams[id];


        if (!team) {

            return res
                .status(404)
                .json({

                    error:
                        "Invalid team."

                });

        }


        const key =
            `${id}:${game.question}`;


        const submission =
            game.submissions[key];


        res.json({

            success:
                true,

            team: {

                id:
                    team.id,

                name:
                    team.name,

                score:
                    team.score

            },

            question:
                game.started
                    ? game.question + 1
                    : 0,

            submitted:
                Boolean(
                    submission
                ),

            correct:
                submission
                    ? Boolean(
                        submission.correct
                    )
                    : null,

            points:
                submission
                    ? submission.points
                    : 0,

            game:
                getPublicState()

        });

    }
);


/* =========================================================
   API 404
   =========================================================

   VERY IMPORTANT:
   Every /api error returns JSON.

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

                        <meta
                            charset="UTF-8"
                        >

                        <meta
                            name="viewport"
                            content="width=device-width,initial-scale=1"
                        >

                        <title>
                            SAMAGRA CONNECT
                        </title>

                        <style>

                            * {
                                box-sizing:
                                    border-box;
                            }

                            body {

                                margin: 0;

                                min-height:
                                    100vh;

                                display:
                                    grid;

                                place-items:
                                    center;

                                background:
                                    #050608;

                                color:
                                    #ffffff;

                                font-family:
                                    Arial,
                                    sans-serif;

                            }

                            .box {

                                text-align:
                                    center;

                            }

                            h1 {

                                font-size:
                                    42px;

                                margin:
                                    0 0 10px;

                            }

                            p {

                                color:
                                    #707783;

                            }

                        </style>

                    </head>

                    <body>

                        <div class="box">

                            <h1>
                                404
                            </h1>

                            <p>
                                SAMAGRA CONNECT
                                • Page Not Found
                            </p>

                        </div>

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


/* =========================================================
   START SERVER
   ========================================================= */

app.listen(
    PORT,
    HOST,
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
            `Port: ${PORT}`
        );

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
            "Admin:     /admin.html"
        );

        console.log(
            "Projector: /projector.html"
        );

        console.log(
            "Teams:     /team.html"
        );

        console.log(
            "Leaderboard: /leaderboard.html"
        );

        console.log("");

        console.log(
            "Health:    /api/health"
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