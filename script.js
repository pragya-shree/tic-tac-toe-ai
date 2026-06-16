(() => {
  "use strict";

  // ============================================
  // Constants
  // ============================================
  const WIN_COMBOS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8], // rows
    [0, 3, 6], [1, 4, 7], [2, 5, 8], // columns
    [0, 4, 8], [2, 4, 6]              // diagonals
  ];

  const LINE_COORDS = {
    "0,1,2": { x1: 4,     y1: 16.67, x2: 96,    y2: 16.67 },
    "3,4,5": { x1: 4,     y1: 50,    x2: 96,    y2: 50    },
    "6,7,8": { x1: 4,     y1: 83.33, x2: 96,    y2: 83.33 },
    "0,3,6": { x1: 16.67, y1: 4,     x2: 16.67, y2: 96    },
    "1,4,7": { x1: 50,    y1: 4,     x2: 50,    y2: 96    },
    "2,5,8": { x1: 83.33, y1: 4,     x2: 83.33, y2: 96    },
    "0,4,8": { x1: 6,     y1: 6,     x2: 94,    y2: 94    },
    "2,4,6": { x1: 94,    y1: 6,     x2: 6,     y2: 94    }
  };

  const SCORES_STORAGE_KEY  = "ttt-scores";
  const MUTE_STORAGE_KEY    = "ttt-muted";
  const THEME_STORAGE_KEY   = "ttt-theme";
  const PLAYERS_STORAGE_KEY = "ttt-players"; // NEW — persists player profiles

  const SOUND_SOURCES = {
    click: "sounds/click.wav",
    win:   "sounds/win.wav",
    draw:  "sounds/draw.wav"
  };

  const HUMAN_MARK     = "x";
  const AI_MARK        = "o";
  const AI_MOVE_DELAY_MS = 450;

  // Avatar emoji pool — broad enough for personality without being
  // overwhelming to scroll through.
  const AVATARS = [
    "🦊","🐼","🦁","🐸","🐙","🤖",
    "🦄","👾","🎩","🌵","🍕","🚀",
    "🎲","⚡","🔥","🌊","🌙","🍀"
  ];

  const DEFAULT_AI_NAME   = "AI";
  const DEFAULT_AI_AVATAR = "🤖";

  // Icon strings (mute / theme toggles)
  const ICON_VOLUME_ON =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 9 8 9 13 4 13 20 8 15 3 15 3 9"></polygon><path d="M16 8a5 5 0 0 1 0 8"></path><path d="M19 5a9 9 0 0 1 0 14"></path></svg>';
  const ICON_VOLUME_OFF =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 9 8 9 13 4 13 20 8 15 3 15 3 9"></polygon><line x1="16" y1="9" x2="22" y2="15"></line><line x1="22" y1="9" x2="16" y2="15"></line></svg>';
  const ICON_DRAFT =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.5"></circle><path d="M12 2.5v2.4M12 19.1v2.4M4.4 4.4l1.7 1.7M17.9 17.9l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.4 19.6l1.7-1.7M17.9 6.1l1.7-1.7"></path></svg>';
  const ICON_BLUEPRINT =
    '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"></path></svg>';

  // ============================================
  // Player profiles (NEW)
  // Stored as { name, avatar } for marks "x" and "o".
  // In PvC mode, "o" always refers to the AI player.
  // ============================================
  let players = loadPlayers();

  function loadPlayers() {
    try {
      const raw = sessionStorage.getItem(PLAYERS_STORAGE_KEY);
      if (!raw) return defaultPlayers();
      const parsed = JSON.parse(raw);
      // Validate structure — fall back gracefully if stored value is malformed
      if (parsed && parsed.x && parsed.o) return parsed;
      return defaultPlayers();
    } catch {
      return defaultPlayers();
    }
  }

  function defaultPlayers() {
    return {
      x: { name: "Player X", avatar: "🦊" },
      o: { name: "Player O", avatar: "🐼" }
    };
  }

  function savePlayers() {
    try {
      sessionStorage.setItem(PLAYERS_STORAGE_KEY, JSON.stringify(players));
    } catch {
      // Ignore write failures
    }
  }

  // Returns the display name for a given mark, honouring PvC AI name.
  function nameFor(mark) {
    return players[mark].name;
  }

  function avatarFor(mark) {
    return players[mark].avatar;
  }

  // ============================================
  // Game State
  // ============================================
  let board         = Array(9).fill(null);
  let currentPlayer = "x";
  let gameOver      = false;
  let scores        = loadScores();
  let muted         = loadMuted();
  let theme         = loadTheme();
  let gameMode      = "pvp";   // "pvp" | "pvc"
  let difficulty    = "easy";  // "easy" | "medium" | "hard"
  let aiThinking    = false;

  // ============================================
  // DOM refs — game screen
  // ============================================
  const boardEl          = document.getElementById("board");
  const cells            = Array.from(document.querySelectorAll(".cell"));
  const statusEl         = document.getElementById("status");
  const restartBtn       = document.getElementById("restartBtn");
  const resetScoreBtn    = document.getElementById("resetScoreBtn");
  const editPlayersBtn   = document.getElementById("editPlayersBtn");
  const muteBtn          = document.getElementById("muteBtn");
  const themeBtn         = document.getElementById("themeBtn");
  const metaModeEl       = document.getElementById("metaMode");

  const modeSegmented       = document.getElementById("modeSegmented");
  const difficultySegmented = document.getElementById("difficultySegmented");
  const modeButtons         = Array.from(modeSegmented.querySelectorAll(".segmented__btn"));
  const difficultyButtons   = Array.from(difficultySegmented.querySelectorAll(".segmented__btn"));

  const scoreXLabelEl   = document.getElementById("scoreXLabel");
  const scoreOLabelEl   = document.getElementById("scoreOLabel");
  const scoreXAvatarEl  = document.getElementById("scoreXAvatar");
  const scoreOAvatarEl  = document.getElementById("scoreOAvatar");
  const winLineEl       = document.getElementById("winLine");
  const winLinePathEl   = document.getElementById("winLinePath");
  const scoreXEl        = document.getElementById("scoreX");
  const scoreOEl        = document.getElementById("scoreO");
  const scoreXValueEl   = document.getElementById("scoreXValue");
  const scoreOValueEl   = document.getElementById("scoreOValue");
  const scoreDrawValueEl= document.getElementById("scoreDrawValue");

  const gameApp         = document.getElementById("gameApp");

  // DOM refs — welcome screen
  const welcomeOverlay       = document.getElementById("welcomeOverlay");
  const welcomeCard          = document.getElementById("welcomeCard");  // eslint-disable-line no-unused-vars
  const startGameBtn         = document.getElementById("startGameBtn");
  const welcomeModeSegmented = document.getElementById("welcomeModeSegmented");
  const welcomeModeBtns      = Array.from(welcomeModeSegmented.querySelectorAll(".segmented__btn"));
  const welcomeDiffSection   = document.getElementById("welcomeDifficultySection");
  const welcomeDiffSegmented = document.getElementById("welcomeDifficultySegmented");
  const welcomeDiffBtns      = Array.from(welcomeDiffSegmented.querySelectorAll(".segmented__btn"));
  const p1NameInput          = document.getElementById("p1Name");
  const p2NameInput          = document.getElementById("p2Name");
  const aiNameInput          = document.getElementById("aiName");
  const aiNameRow            = document.getElementById("aiNameRow");
  const p2Section            = document.getElementById("p2Section");
  const p2LabelEl            = document.getElementById("p2Label");
  const p1AvatarsEl          = document.getElementById("p1Avatars");
  const p2AvatarsEl          = document.getElementById("p2Avatars");

  // ============================================
  // Welcome screen — local state
  // ============================================
  let welcomeMode       = "pvp";
  let welcomeDifficulty = "easy";
  let selectedAvatarX   = players.x.avatar;
  let selectedAvatarO   = players.o.avatar;

  // ============================================
  // Welcome screen — build avatar buttons
  // ============================================
  function buildAvatarRow(containerEl, selectedAvatar, onSelect) {
    containerEl.innerHTML = "";
    AVATARS.forEach((emoji) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "avatar-btn" + (emoji === selectedAvatar ? " is-selected" : "");
      btn.textContent = emoji;
      btn.setAttribute("aria-label", `Avatar ${emoji}`);
      btn.setAttribute("aria-pressed", String(emoji === selectedAvatar));
      btn.addEventListener("click", () => {
        // Deselect all then select clicked
        Array.from(containerEl.querySelectorAll(".avatar-btn")).forEach((b) => {
          b.classList.remove("is-selected");
          b.setAttribute("aria-pressed", "false");
        });
        btn.classList.add("is-selected");
        btn.setAttribute("aria-pressed", "true");
        onSelect(emoji);
      });
      containerEl.appendChild(btn);
    });
  }

  function initAvatarRows() {
    buildAvatarRow(p1AvatarsEl, selectedAvatarX, (emoji) => { selectedAvatarX = emoji; });
    buildAvatarRow(p2AvatarsEl, selectedAvatarO, (emoji) => { selectedAvatarO = emoji; });
  }

  // ============================================
  // Welcome screen — mode switching
  // ============================================
  function setWelcomeMode(mode) {
    welcomeMode = mode;
    welcomeModeBtns.forEach((btn) => {
      const active = btn.dataset.mode === mode;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });

    const isPvc = mode === "pvc";
    welcomeDiffSection.classList.toggle("is-hidden", !isPvc);
    aiNameRow.classList.toggle("is-hidden", !isPvc);
    p2NameInput.classList.toggle("is-hidden", isPvc);
    p2LabelEl.textContent = isPvc
      ? "AI — choose avatar & name"
      : "Player O — choose avatar & name";
  }

  function setWelcomeDifficulty(level) {
    welcomeDifficulty = level;
    welcomeDiffBtns.forEach((btn) => {
      const active = btn.dataset.difficulty === level;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-pressed", String(active));
    });
  }

  // ============================================
  // Welcome screen — pre-fill from session
  // ============================================
  function prefillWelcome() {
    p1NameInput.value = players.x.name !== "Player X" ? players.x.name : "";
    p2NameInput.value = players.o.name !== "Player O" ? players.o.name : "";
    selectedAvatarX   = players.x.avatar;
    selectedAvatarO   = players.o.avatar;
    initAvatarRows();

    // Mirror current game mode / difficulty back onto welcome controls
    setWelcomeMode(gameMode);
    setWelcomeDifficulty(difficulty);
  }

  // ============================================
  // Welcome screen — open / close
  // ============================================
  function openWelcome() {
    prefillWelcome();
    welcomeOverlay.style.display = "flex";
    welcomeOverlay.classList.remove("is-exiting");
    gameApp.classList.add("is-hidden");
    gameApp.setAttribute("aria-hidden", "true");
    welcomeOverlay.removeAttribute("aria-hidden");
    // Focus first input after a tick so the animation has started
    setTimeout(() => p1NameInput.focus(), 120);
  }

  function closeWelcome(callback) {
    welcomeOverlay.classList.add("is-exiting");
    // Wait for the reverse animation to finish (~300 ms) then hide
    setTimeout(() => {
      welcomeOverlay.style.display = "none";
      gameApp.classList.remove("is-hidden");
      gameApp.removeAttribute("aria-hidden");
      welcomeOverlay.setAttribute("aria-hidden", "true");
      if (callback) callback();
    }, 300);
  }

  // ============================================
  // Welcome screen — submit / start
  // ============================================
  function handleStartGame() {
    // Resolve names — fall back to defaults if blank
    const rawP1 = p1NameInput.value.trim();
    const p1Name = rawP1 || "Player X";
    const p1Avatar = selectedAvatarX;

    let p2Name, p2Avatar;
    if (welcomeMode === "pvc") {
      const rawAI = aiNameInput.value.trim();
      p2Name   = rawAI || DEFAULT_AI_NAME;
      p2Avatar = selectedAvatarO || DEFAULT_AI_AVATAR;
    } else {
      const rawP2 = p2NameInput.value.trim();
      p2Name   = rawP2 || "Player O";
      p2Avatar = selectedAvatarO;
    }

    // Commit player data
    players = {
      x: { name: p1Name,   avatar: p1Avatar },
      o: { name: p2Name,   avatar: p2Avatar }
    };
    savePlayers();

    // If mode has changed, reset everything; otherwise just restart the round
    const modeChanged = welcomeMode !== gameMode;
    gameMode  = welcomeMode;
    difficulty = welcomeDifficulty;

    closeWelcome(() => {
      // Sync in-game controls with chosen settings
      setActiveSegment(modeButtons, "mode", gameMode);
      setActiveSegment(difficultyButtons, "difficulty", difficulty);
      difficultySegmented.classList.toggle("is-hidden", gameMode !== "pvc");

      updateScoreboardHeaders();
      updateMetaMode();

      if (modeChanged) {
        resetScores();
      } else {
        restartRound();
      }
    });
  }

  // ============================================
  // Preference persistence
  // ============================================
  function loadScores() {
    try {
      const raw = sessionStorage.getItem(SCORES_STORAGE_KEY);
      if (!raw) return { x: 0, o: 0, draw: 0 };
      const parsed = JSON.parse(raw);
      return {
        x:    Number(parsed.x)    || 0,
        o:    Number(parsed.o)    || 0,
        draw: Number(parsed.draw) || 0
      };
    } catch {
      return { x: 0, o: 0, draw: 0 };
    }
  }

  function saveScores() {
    try { sessionStorage.setItem(SCORES_STORAGE_KEY, JSON.stringify(scores)); } catch { /* noop */ }
  }

  function loadMuted() {
    try { return sessionStorage.getItem(MUTE_STORAGE_KEY) === "true"; } catch { return false; }
  }

  function saveMuted() {
    try { sessionStorage.setItem(MUTE_STORAGE_KEY, String(muted)); } catch { /* noop */ }
  }

  function loadTheme() {
    try {
      const s = sessionStorage.getItem(THEME_STORAGE_KEY);
      return s === "blueprint" ? "blueprint" : "draft";
    } catch { return "draft"; }
  }

  function saveTheme() {
    try { sessionStorage.setItem(THEME_STORAGE_KEY, theme); } catch { /* noop */ }
  }

  // ============================================
  // Audio
  // ============================================
  const audioCache = {};
  Object.keys(SOUND_SOURCES).forEach((key) => {
    const audio = new Audio(SOUND_SOURCES[key]);
    audio.preload = "auto";
    audioCache[key] = audio;
  });

  function playSound(key) {
    if (muted) return;
    const base = audioCache[key];
    if (!base) return;
    try {
      const node = base.cloneNode(true);
      node.volume = 0.7;
      node.play().catch(() => {});
    } catch { /* noop */ }
  }

  function updateMuteButton() {
    muteBtn.innerHTML = muted ? ICON_VOLUME_OFF : ICON_VOLUME_ON;
    muteBtn.setAttribute("aria-pressed", String(muted));
    muteBtn.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  }

  function toggleMute() {
    muted = !muted;
    saveMuted();
    updateMuteButton();
  }

  // ============================================
  // Theme
  // ============================================
  function updateThemeButton() {
    const isBlueprint = theme === "blueprint";
    themeBtn.innerHTML = isBlueprint ? ICON_BLUEPRINT : ICON_DRAFT;
    themeBtn.setAttribute("aria-pressed", String(isBlueprint));
    themeBtn.setAttribute("aria-label", isBlueprint ? "Switch to draft mode" : "Switch to blueprint mode");
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", theme);
    updateThemeButton();
  }

  function toggleTheme() {
    theme = theme === "blueprint" ? "draft" : "blueprint";
    saveTheme();
    applyTheme();
  }

  // ============================================
  // AI engine
  // ============================================
  function getWinnerOnBoard(b) {
    for (const combo of WIN_COMBOS) {
      const [a, c, d] = combo;
      if (b[a] && b[a] === b[c] && b[a] === b[d]) {
        return { winner: b[a], combo };
      }
    }
    return null;
  }

  function isBoardFull(b) {
    return b.every((cell) => cell !== null);
  }

  function getAvailableMoves(b) {
    const moves = [];
    b.forEach((cell, i) => { if (!cell) moves.push(i); });
    return moves;
  }

  function findWinningMove(b, mark) {
    for (const move of getAvailableMoves(b)) {
      const trial = b.slice();
      trial[move] = mark;
      const result = getWinnerOnBoard(trial);
      if (result && result.winner === mark) return move;
    }
    return null;
  }

  function pickEasyMove(b) {
    const moves = getAvailableMoves(b);
    return moves[Math.floor(Math.random() * moves.length)];
  }

  function pickMediumMove(b) {
    const winningMove = findWinningMove(b, AI_MARK);
    if (winningMove !== null) return winningMove;
    const blockingMove = findWinningMove(b, HUMAN_MARK);
    if (blockingMove !== null) return blockingMove;
    return pickEasyMove(b);
  }

  function minimax(b, depth, isMaximizing) {
    const result = getWinnerOnBoard(b);
    if (result) return result.winner === AI_MARK ? 10 - depth : depth - 10;
    if (isBoardFull(b)) return 0;

    const moves = getAvailableMoves(b);
    if (isMaximizing) {
      let best = -Infinity;
      for (const move of moves) {
        const trial = b.slice();
        trial[move] = AI_MARK;
        best = Math.max(best, minimax(trial, depth + 1, false));
      }
      return best;
    }
    let best = Infinity;
    for (const move of moves) {
      const trial = b.slice();
      trial[move] = HUMAN_MARK;
      best = Math.min(best, minimax(trial, depth + 1, true));
    }
    return best;
  }

  function pickHardMove(b) {
    let bestScore = -Infinity;
    let bestMove  = null;
    for (const move of getAvailableMoves(b)) {
      const trial = b.slice();
      trial[move] = AI_MARK;
      const score = minimax(trial, 0, false);
      if (score > bestScore) { bestScore = score; bestMove = move; }
    }
    return bestMove;
  }

  function getAiMove(b, level) {
    if (level === "medium") return pickMediumMove(b);
    if (level === "hard")   return pickHardMove(b);
    return pickEasyMove(b);
  }

  // ============================================
  // Mark rendering
  // ============================================
  function xMarkSVG() {
    return (
      '<svg class="mark-svg" viewBox="0 0 100 100" aria-hidden="true">' +
      '<line x1="22" y1="22" x2="78" y2="78" stroke="currentColor" stroke-width="11" ' +
      'stroke-linecap="round" style="stroke-dasharray:80;stroke-dashoffset:80;' +
      'animation:draw-stroke .26s ease forwards;"></line>' +
      '<line x1="78" y1="22" x2="22" y2="78" stroke="currentColor" stroke-width="11" ' +
      'stroke-linecap="round" style="stroke-dasharray:80;stroke-dashoffset:80;' +
      'animation:draw-stroke .26s ease forwards .08s;"></line>' +
      "</svg>"
    );
  }

  function oMarkSVG() {
    return (
      '<svg class="mark-svg" viewBox="0 0 100 100" aria-hidden="true">' +
      '<circle cx="50" cy="50" r="30" stroke="currentColor" stroke-width="11" fill="none" ' +
      'stroke-linecap="round" transform="rotate(-90 50 50)" ' +
      'style="stroke-dasharray:189;stroke-dashoffset:189;animation:draw-stroke .4s ease forwards;">' +
      "</circle></svg>"
    );
  }

  // ============================================
  // Rendering helpers
  // ============================================
  function renderBoard() {
    cells.forEach((cell, i) => {
      const mark = board[i];
      if (mark) {
        cell.innerHTML = mark === "x" ? xMarkSVG() : oMarkSVG();
        cell.dataset.mark = mark;
        cell.disabled = true;
      } else {
        cell.innerHTML = "";
        delete cell.dataset.mark;
        cell.disabled = gameOver || aiThinking;
      }
      cell.classList.remove("win");
    });
  }

  // NEW — update the scoreboard name labels and avatar chips
  function updateScoreboardHeaders() {
    scoreXLabelEl.textContent  = nameFor("x");
    scoreOLabelEl.textContent  = nameFor("o");
    scoreXAvatarEl.textContent = avatarFor("x");
    scoreOAvatarEl.textContent = avatarFor("o");
  }

  function updateStatus(text, state) {
    statusEl.textContent = text;
    if (state) {
      statusEl.dataset.state = state;
    } else {
      delete statusEl.dataset.state;
    }
  }

  function updateActiveScoreCard() {
    scoreXEl.classList.toggle("score--active", !gameOver && currentPlayer === "x");
    scoreOEl.classList.toggle("score--active", !gameOver && currentPlayer === "o");
  }

  function bumpElement(el) {
    el.classList.remove("is-bumped");
    void el.offsetWidth; // eslint-disable-line no-unused-expressions
    el.classList.add("is-bumped");
  }

  function renderScores() {
    scoreXValueEl.textContent    = scores.x;
    scoreOValueEl.textContent    = scores.o;
    scoreDrawValueEl.textContent = scores.draw;
  }

  function updateMetaMode() {
    metaModeEl.textContent =
      gameMode === "pvc" ? `VS AI · ${difficulty.toUpperCase()}` : "TWO PLAYERS";
  }

  function showWinLine(combo, winner) {
    const key    = combo.join(",");
    const coords = LINE_COORDS[key];
    if (!coords) return;

    winLinePathEl.setAttribute("x1", coords.x1);
    winLinePathEl.setAttribute("y1", coords.y1);
    winLinePathEl.setAttribute("x2", coords.x2);
    winLinePathEl.setAttribute("y2", coords.y2);

    winLineEl.classList.remove("color-x", "color-o", "show");
    void winLineEl.offsetWidth;
    winLineEl.classList.add(winner === "x" ? "color-x" : "color-o", "show");
  }

  function hideWinLine() {
    winLineEl.classList.remove("show", "color-x", "color-o");
  }

  // ============================================
  // Game logic
  // ============================================
  function checkResult() {
    const result = getWinnerOnBoard(board);
    if (result) return result;
    if (isBoardFull(board)) return { winner: null, combo: null, draw: true };
    return null;
  }

  function handleCellClick(event) {
    if (aiThinking || gameOver) return;
    const index = Number(event.currentTarget.dataset.index);
    if (board[index]) return;
    if (gameMode === "pvc" && currentPlayer === AI_MARK) return;
    makeMove(index);
  }

  function makeMove(index) {
    board[index] = currentPlayer;
    renderBoard();
    playSound("click");

    const result = checkResult();

    if (result && result.winner) {
      gameOver = true;
      result.combo.forEach((i) => cells[i].classList.add("win"));
      showWinLine(result.combo, result.winner);
      playSound("win");
      scores[result.winner] += 1;
      renderScores();
      saveScores();
      bumpElement(result.winner === "x" ? scoreXValueEl : scoreOValueEl);
      // Use player name in win message
      updateStatus(`${nameFor(result.winner)} wins! ${avatarFor(result.winner)}`, result.winner);
      cells.forEach((cell) => (cell.disabled = true));
      updateActiveScoreCard();
      return;
    }

    if (result && result.draw) {
      gameOver = true;
      playSound("draw");
      scores.draw += 1;
      renderScores();
      saveScores();
      bumpElement(scoreDrawValueEl);
      // Named draw message
      updateStatus(`${nameFor("x")} vs ${nameFor("o")} — draw!`, "draw");
      updateActiveScoreCard();
      return;
    }

    currentPlayer = currentPlayer === "x" ? "o" : "x";
    // AI thinking message uses AI's name
    updateStatus(`${nameFor(currentPlayer)}'s turn`);
    updateActiveScoreCard();
    maybeTriggerAiMove();
  }

  function maybeTriggerAiMove() {
    if (gameMode !== "pvc" || gameOver || currentPlayer !== AI_MARK) return;

    aiThinking = true;
    renderBoard();
    // Show AI's custom name while it "thinks"
    updateStatus(`${nameFor(AI_MARK)} is thinking…`);

    setTimeout(() => {
      aiThinking = false;
      if (gameOver) { renderBoard(); return; }
      const move = getAiMove(board.slice(), difficulty);
      if (move === null || move === undefined) { renderBoard(); return; }
      makeMove(move);
    }, AI_MOVE_DELAY_MS);
  }

  function restartRound() {
    board         = Array(9).fill(null);
    currentPlayer = "x";
    gameOver      = false;
    aiThinking    = false;
    hideWinLine();
    renderBoard();
    updateStatus(`${nameFor("x")}'s turn`);
    updateActiveScoreCard();

    boardEl.classList.remove("board--enter");
    void boardEl.offsetWidth;
    boardEl.classList.add("board--enter");
  }

  function resetScores() {
    scores = { x: 0, o: 0, draw: 0 };
    renderScores();
    saveScores();
    restartRound();
  }

  // ============================================
  // In-game mode / difficulty switching
  // ============================================
  function setActiveSegment(buttons, datasetKey, value) {
    buttons.forEach((btn) => {
      const isActive = btn.dataset[datasetKey] === value;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
  }

  function setMode(mode) {
    if (mode === gameMode) return;
    gameMode = mode;
    setActiveSegment(modeButtons, "mode", mode);
    difficultySegmented.classList.toggle("is-hidden", mode !== "pvc");
    updateScoreboardHeaders();
    updateMetaMode();
    // Reset scores and open welcome screen so players can set names for new mode
    scores = { x: 0, o: 0, draw: 0 };
    renderScores();
    saveScores();
    openWelcome();
  }

  function setDifficulty(level) {
    if (level === difficulty) return;
    difficulty = level;
    setActiveSegment(difficultyButtons, "difficulty", level);
    updateMetaMode();
    restartRound();
  }

  // ============================================
  // Wire up events
  // ============================================
  cells.forEach((cell) => cell.addEventListener("click", handleCellClick));
  restartBtn.addEventListener("click", restartRound);
  resetScoreBtn.addEventListener("click", resetScores);
  editPlayersBtn.addEventListener("click", openWelcome);
  muteBtn.addEventListener("click", toggleMute);
  themeBtn.addEventListener("click", toggleTheme);

  modeButtons.forEach((btn) =>
    btn.addEventListener("click", () => setMode(btn.dataset.mode))
  );
  difficultyButtons.forEach((btn) =>
    btn.addEventListener("click", () => setDifficulty(btn.dataset.difficulty))
  );

  // Welcome screen events
  welcomeModeBtns.forEach((btn) =>
    btn.addEventListener("click", () => setWelcomeMode(btn.dataset.mode))
  );
  welcomeDiffBtns.forEach((btn) =>
    btn.addEventListener("click", () => setWelcomeDifficulty(btn.dataset.difficulty))
  );
  startGameBtn.addEventListener("click", handleStartGame);

  // Allow Enter key to start the game from any input
  [p1NameInput, p2NameInput, aiNameInput].forEach((input) =>
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") handleStartGame(); })
  );

  // ============================================
  // Initial paint
  // ============================================
  applyTheme();
  renderBoard();
  renderScores();
  updateScoreboardHeaders();
  updateStatus(`${nameFor("x")}'s turn`);
  updateActiveScoreCard();
  updateMuteButton();
  updateMetaMode();

  // Show welcome screen on first load
  openWelcome();
})();
