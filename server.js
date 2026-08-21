const express = require("express");
const http = require("http");
const path = require("path");
const fs = require("fs");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const PUBLIC_DIR = path.join(__dirname, "public");
const QUESTIONS_FILE = path.join(__dirname, "questions.json");

const ROUND_DURATION = 30;
const MAX_POINTS = 10;

let questions = [];

try {
    questions = JSON.parse(
        fs.readFileSync(QUESTIONS_FILE, "utf8")
    );
} catch (error) {
    console.error("Could not load questions.json");
    console.error(error);
    process.exit(1);
}

/* =========================================================
   GAME STATE
========================================================= */

const game = {
    running: false,
    questionIndex: -1,
    roundStartedAt: null,
    roundEndsAt: null,
    locked: true,
    revealed: false,
    stopped: false
};

/* =========================================================
   PLAYERS
========================================================= */

const players = new Map();

/*
player structure:

{
    id,
    name,
    socketId,
    score,
    connected,
    answeredQuestion,
    lastAnswer,
    lastAnswerCorrect,
    lastPoints,
    answerTime
}
*/

/* =========================================================
   NORMALIZATION
========================================================= */

function normalize(value) {
    return String(value || "")
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]/g, "");
}

function getAcceptedAnswers(question) {
    return [
        question.answer,
        ...(Array.isArray(question.aliases)
            ? question.aliases
            : [])
    ];
}

function isCorrectAnswer(question, submittedAnswer) {
    const submitted = normalize(submittedAnswer);

    if (!submitted) {
        return false;
    }

    return getAcceptedAnswers(question).some(
        answer => normalize(answer) === submitted
    );
}

/* =========================================================
   SCORE
========================================================= */

function calculatePoints() {
    if (!game.roundStartedAt) {
        return 0;
    }

    const elapsed = (Date.now() - game.roundStartedAt) / 1000;

    if (elapsed >= ROUND_DURATION) {
        return 0;
    }

    /*
        0 seconds  = 10 points
        5 seconds  = 9 points
        10 seconds = 7 points
        15 seconds = 5 points
        20 seconds = 4 points
        25 seconds = 2 points
        30 seconds = 0 points

        Integer score based on remaining time.
    */

    const remaining = ROUND_DURATION - elapsed;

    return Math.max(
        0,
        Math.min(
            MAX_POINTS,
            Math.ceil((remaining / ROUND_DURATION) * MAX_POINTS)
        )
    );
}

/* =========================================================
   SAFE PUBLIC QUESTION
   NEVER SEND ANSWER TO STUDENTS
========================================================= */

function getPublicQuestion() {
    if (
        game.questionIndex < 0 ||
        game.questionIndex >= questions.length
    ) {
        return null;
    }

    const q = questions[game.questionIndex];

    return {
        id: q.id,
        number: game.questionIndex + 1,
        total: questions.length,
        image: q.image
    };
}

/* =========================================================
   PUBLIC STATE
========================================================= */

function getPublicState() {
    return {
        running: game.running,
        questionIndex: game.questionIndex,
        question: getPublicQuestion(),
        roundStartedAt: game.roundStartedAt,
        roundEndsAt: game.roundEndsAt,
        duration: ROUND_DURATION,
        locked: game.locked,
        revealed: game.revealed,
        stopped: game.stopped,
        players: Array.from(players.values())
            .map(player => ({
                id: player.id,
                name: player.name,
                score: player.score,
                connected: player.connected,
                answered:
                    player.answeredQuestion === game.questionIndex
            }))
            .sort((a, b) => b.score - a.score)
    };
}

/* =========================================================
   ADMIN STATE
========================================================= */

function getAdminState() {
    const publicState = getPublicState();

    return {
        ...publicState,
        answer:
            game.questionIndex >= 0
                ? questions[game.questionIndex].answer
                : null,
        acceptedAnswers:
            game.questionIndex >= 0
                ? getAcceptedAnswers(
                      questions[game.questionIndex]
                  )
                : []
    };
}

/* =========================================================
   BROADCAST
========================================================= */

function broadcastState() {
    io.emit("game-state", getPublicState());
    io.emit("leaderboard", getLeaderboard());
}

/* =========================================================
   LEADERBOARD
========================================================= */

function getLeaderboard() {
    return Array.from(players.values())
        .map(player => ({
            id: player.id,
            name: player.name,
            score: player.score,
            connected: player.connected
        }))
        .sort((a, b) => {
            if (b.score !== a.score) {
                return b.score - a.score;
            }

            return a.name.localeCompare(b.name);
        })
        .map((player, index) => ({
            rank: index + 1,
            ...player
        }));
}

/* =========================================================
   ROUND END
========================================================= */

function finishRound() {
    if (!game.running || game.locked) {
        return;
    }

    game.locked = true;

    io.emit("round-ended", {
        questionNumber: game.questionIndex + 1,
        answer: game.revealed
            ? questions[game.questionIndex].answer
            : null
    });

    broadcastState();
}

/* =========================================================
   AUTOMATIC TIMER
========================================================= */

setInterval(() => {
    if (!game.running) {
        return;
    }

    if (!game.roundStartedAt) {
        return;
    }

    if (Date.now() >= game.roundEndsAt) {
        finishRound();
    }

    io.emit("timer", {
        remaining: Math.max(
            0,
            (game.roundEndsAt - Date.now()) / 1000
        )
    });
}, 100);

/* =========================================================
   EXPRESS
========================================================= */

app.use(express.json());

app.use(
    express.static(PUBLIC_DIR)
);

/* =========================================================
   MAIN PAGE
========================================================= */

app.get("/", (req, res) => {
    res.sendFile(
        path.join(PUBLIC_DIR, "index.html")
    );
});

/* =========================================================
   API - HEALTH
========================================================= */

app.get("/api/health", (req, res) => {
    res.json({
        ok: true,
        game: "SAMAGRA CONNECT",
        mode: "INDIVIDUAL LOGO QUIZ",
        questions: questions.length,
        duration: ROUND_DURATION,
        maxPoints: MAX_POINTS,
        players: players.size,
        time: new Date().toISOString()
    });
});

/* =========================================================
   API - PUBLIC STATE
========================================================= */

app.get("/api/state", (req, res) => {
    res.json(getPublicState());
});

/* =========================================================
   API - LEADERBOARD
========================================================= */

app.get("/api/leaderboard", (req, res) => {
    res.json(getLeaderboard());
});

/* =========================================================
   API - ADMIN STATE
========================================================= */

app.get("/api/admin/state", (req, res) => {
    res.json(getAdminState());
});

/* =========================================================
   JOIN PLAYER
========================================================= */

app.post("/api/join", (req, res) => {
    const name = String(req.body?.name || "")
        .trim()
        .replace(/\s+/g, " ");

    if (!name) {
        return res.status(400).json({
            ok: false,
            error: "Please enter your name."
        });
    }

    if (name.length > 30) {
        return res.status(400).json({
            ok: false,
            error: "Name must be 30 characters or less."
        });
    }

    /*
        Case-insensitive duplicate prevention.
    */

    const duplicate = Array.from(players.values()).find(
        player =>
            player.name.toLowerCase() ===
            name.toLowerCase()
    );

    if (duplicate) {
        return res.status(409).json({
            ok: false,
            error: "That name is already in use."
        });
    }

    const id =
        "p_" +
        Date.now().toString(36) +
        "_" +
        Math.random()
            .toString(36)
            .substring(2, 8);

    players.set(id, {
        id,
        name,
        socketId: null,
        score: 0,
        connected: true,
        answeredQuestion: -1,
        lastAnswer: "",
        lastAnswerCorrect: false,
        lastPoints: 0,
        answerTime: null
    });

    broadcastState();

    res.json({
        ok: true,
        player: {
            id,
            name,
            score: 0
        }
    });
});

/* =========================================================
   SUBMIT ANSWER
========================================================= */

app.post("/api/answer", (req, res) => {
    const playerId = String(req.body?.playerId || "");
    const answer = String(req.body?.answer || "");

    const player = players.get(playerId);

    if (!player) {
        return res.status(404).json({
            ok: false,
            error: "Player not found."
        });
    }

    if (!game.running) {
        return res.status(400).json({
            ok: false,
            error: "The game has not started."
        });
    }

    if (game.locked) {
        return res.status(400).json({
            ok: false,
            error: "This question is locked."
        });
    }

    if (game.questionIndex < 0) {
        return res.status(400).json({
            ok: false,
            error: "No question is active."
        });
    }

    /*
        Prevent multiple submissions for the same question.
    */

    if (player.answeredQuestion === game.questionIndex) {
        return res.status(400).json({
            ok: false,
            error: "You have already submitted."
        });
    }

    /*
        Prevent answers after timer.
    */

    if (Date.now() >= game.roundEndsAt) {
        finishRound();

        return res.status(400).json({
            ok: false,
            error: "Time is up."
        });
    }

    const question = questions[game.questionIndex];

    const correct = isCorrectAnswer(
        question,
        answer
    );

    const points = correct
        ? calculatePoints()
        : 0;

    player.answeredQuestion = game.questionIndex;
    player.lastAnswer = answer;
    player.lastAnswerCorrect = correct;
    player.lastPoints = points;
    player.answerTime = Date.now();

    if (correct) {
        player.score += points;
    }

    io.emit("answer-update", {
        playerId: player.id,
        answered: true
    });

    broadcastState();

    res.json({
        ok: true,
        correct,
        points,
        totalScore: player.score,
        message: correct
            ? `Correct! +${points} points`
            : "Incorrect answer."
    });
});

/* =========================================================
   ADMIN START
========================================================= */

app.post("/api/admin/start", (req, res) => {
    game.running = true;
    game.stopped = false;
    game.questionIndex = 0;
    game.revealed = false;
    game.locked = false;

    game.roundStartedAt = Date.now();
    game.roundEndsAt =
        game.roundStartedAt +
        ROUND_DURATION * 1000;

    for (const player of players.values()) {
        player.answeredQuestion = -1;
        player.lastAnswer = "";
        player.lastAnswerCorrect = false;
        player.lastPoints = 0;
        player.answerTime = null;
    }

    io.emit("game-started");

    broadcastState();

    res.json({
        ok: true,
        state: getAdminState()
    });
});

/* =========================================================
   ADMIN NEXT
========================================================= */

app.post("/api/admin/next", (req, res) => {
    if (!game.running) {
        return res.status(400).json({
            ok: false,
            error: "Game is not running."
        });
    }

    const nextIndex = game.questionIndex + 1;

    if (nextIndex >= questions.length) {
        game.locked = true;
        game.revealed = true;

        io.emit("game-finished");

        broadcastState();

        return res.json({
            ok: true,
            finished: true
        });
    }

    game.questionIndex = nextIndex;
    game.revealed = false;
    game.locked = false;

    game.roundStartedAt = Date.now();
    game.roundEndsAt =
        game.roundStartedAt +
        ROUND_DURATION * 1000;

    for (const player of players.values()) {
        player.answeredQuestion = -1;
        player.lastAnswer = "";
        player.lastAnswerCorrect = false;
        player.lastPoints = 0;
        player.answerTime = null;
    }

    io.emit("new-question", {
        question: getPublicQuestion()
    });

    broadcastState();

    res.json({
        ok: true,
        state: getAdminState()
    });
});

/* =========================================================
   ADMIN REVEAL
========================================================= */

app.post("/api/admin/reveal", (req, res) => {
    if (
        game.questionIndex < 0 ||
        game.questionIndex >= questions.length
    ) {
        return res.status(400).json({
            ok: false,
            error: "No active question."
        });
    }

    game.locked = true;
    game.revealed = true;

    const answer =
        questions[game.questionIndex].answer;

    io.emit("answer-revealed", {
        answer
    });

    broadcastState();

    res.json({
        ok: true,
        answer
    });
});

/* =========================================================
   ADMIN STOP
========================================================= */

app.post("/api/admin/stop", (req, res) => {
    game.running = false;
    game.locked = true;
    game.stopped = true;

    io.emit("game-stopped");

    broadcastState();

    res.json({
        ok: true,
        state: getAdminState()
    });
});

/* =========================================================
   ADMIN RESET
========================================================= */

app.post("/api/admin/reset", (req, res) => {
    game.running = false;
    game.questionIndex = -1;
    game.roundStartedAt = null;
    game.roundEndsAt = null;
    game.locked = true;
    game.revealed = false;
    game.stopped = false;

    for (const player of players.values()) {
        player.score = 0;
        player.answeredQuestion = -1;
        player.lastAnswer = "";
        player.lastAnswerCorrect = false;
        player.lastPoints = 0;
        player.answerTime = null;
    }

    io.emit("game-reset");

    broadcastState();

    res.json({
        ok: true,
        state: getAdminState()
    });
});

/* =========================================================
   SOCKET.IO
========================================================= */

io.on("connection", socket => {
    console.log(
        "Socket connected:",
        socket.id
    );

    socket.emit(
        "game-state",
        getPublicState()
    );

    socket.emit(
        "leaderboard",
        getLeaderboard()
    );

    socket.on("identify-player", playerId => {
        const player = players.get(
            String(playerId || "")
        );

        if (!player) {
            return;
        }

        player.socketId = socket.id;
        player.connected = true;

        broadcastState();
    });

    socket.on("disconnect", () => {
        const player = Array.from(
            players.values()
        ).find(
            item =>
                item.socketId === socket.id
        );

        if (player) {
            player.connected = false;
            player.socketId = null;

            broadcastState();
        }

        console.log(
            "Socket disconnected:",
            socket.id
        );
    });
});

/* =========================================================
   FALLBACK
========================================================= */

app.use((req, res) => {
    res.status(404).json({
        error: "Not found"
    });
});

/* =========================================================
   SERVER
========================================================= */

server.listen(PORT, () => {
    console.log("");
    console.log("================================");
    console.log(" SAMAGRA CONNECT LIVE");
    console.log("================================");
    console.log("");
    console.log(`Port: ${PORT}`);
    console.log(`Questions: ${questions.length}`);
    console.log(`Duration: ${ROUND_DURATION} seconds`);
    console.log(`Maximum points: ${MAX_POINTS}`);
    console.log("");
    console.log("Admin:        /admin.html");
    console.log("Projector:    /projector.html");
    console.log("Students:     /team.html");
    console.log("Leaderboard:  /leaderboard.html");
    console.log("");
    console.log("Health:       /api/health");
    console.log("");
    console.log("Game server is running!");
    console.log("================================");
    console.log("");
});
