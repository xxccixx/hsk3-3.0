/* HSK 3 Study Site - shared logic
   Expects a global `LESSON_DATA` object on lesson pages:
   { id, title_cn, title_en, vocab: [{hanzi, pinyin, pos, meaning, example}] }
*/

(function () {
  "use strict";

  const SCORE_KEY_PREFIX = "hsk3_score_lesson_";

  function getScore(lessonId) {
    try {
      const raw = localStorage.getItem(SCORE_KEY_PREFIX + lessonId);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function saveScore(lessonId, correct, total) {
    const pct = Math.round((correct / total) * 100);
    const prev = getScore(lessonId) || { best: 0, attempts: 0 };
    const record = {
      last: pct,
      best: Math.max(prev.best || 0, pct),
      attempts: (prev.attempts || 0) + 1,
      lastDate: new Date().toISOString().slice(0, 10)
    };
    localStorage.setItem(SCORE_KEY_PREFIX + lessonId, JSON.stringify(record));
    return record;
  }

  window.HSK = { getScore, saveScore };

  // ---------- Homepage lesson list score badges ----------
  function renderHomepageBadges() {
    document.querySelectorAll("[data-lesson-badge]").forEach((el) => {
      const id = el.getAttribute("data-lesson-badge");
      const rec = getScore(id);
      if (rec) {
        el.textContent = "Skor terbaik: " + rec.best + "%";
        el.style.display = "inline-block";
      }
    });
  }

  // ---------- Vocab table ----------
  function renderVocabTable(vocab, mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    let html = '<div class="vocab-table-wrap"><table class="vocab-table"><thead><tr>' +
      "<th>#</th><th>汉字</th><th>拼音</th><th>词性</th><th>Arti</th><th>Contoh kalimat</th>" +
      "</tr></thead><tbody>";
    vocab.forEach((w, i) => {
      html += "<tr>" +
        "<td>" + (i + 1) + "</td>" +
        '<td class="hanzi-cell">' + w.hanzi + "</td>" +
        '<td class="pinyin-cell">' + w.pinyin + "</td>" +
        '<td class="pos-cell">' + w.pos + "</td>" +
        "<td>" + w.meaning + "</td>" +
        '<td class="example-cell">' + w.example + "</td>" +
        "</tr>";
    });
    html += "</tbody></table></div>";
    mount.innerHTML = html;
  }

  // ---------- Flashcards ----------
  function initFlashcards(vocab, mountId) {
    const mount = document.getElementById(mountId);
    if (!mount) return;

    let order = shuffledIndices(vocab.length);
    let pos = 0;
    let flipped = false;

    mount.innerHTML =
      '<div class="flashcard-controls">' +
      '<button id="fc-shuffle" type="button">🔀 Acak ulang</button>' +
      '<span class="flashcard-counter" id="fc-counter"></span>' +
      "</div>" +
      '<div class="flashcard" id="fc-card"></div>' +
      '<p class="flashcard-hint">Ketuk kartu untuk membalik (hanzi ↔ pinyin/arti/contoh)</p>' +
      '<div class="flashcard-nav">' +
      '<button id="fc-prev" type="button">← Sebelumnya</button>' +
      '<button id="fc-next" type="button">Berikutnya →</button>' +
      "</div>";

    const cardEl = mount.querySelector("#fc-card");
    const counterEl = mount.querySelector("#fc-counter");
    const prevBtn = mount.querySelector("#fc-prev");
    const nextBtn = mount.querySelector("#fc-next");
    const shuffleBtn = mount.querySelector("#fc-shuffle");

    function render() {
      const w = vocab[order[pos]];
      cardEl.className = "flashcard" + (flipped ? " flipped" : "");
      cardEl.innerHTML =
        '<div class="hanzi-big">' + w.hanzi + "</div>" +
        '<div class="back-content">' +
        '<div class="pinyin-big">' + w.pinyin + "</div>" +
        '<div class="pos-line">' + w.pos + "</div>" +
        '<div class="meaning-line">' + w.meaning + "</div>" +
        '<div class="example-line">' + w.example + "</div>" +
        "</div>";
      counterEl.textContent = (pos + 1) + " / " + vocab.length;
      prevBtn.disabled = pos === 0;
      nextBtn.disabled = pos === vocab.length - 1;
    }

    cardEl.addEventListener("click", () => {
      flipped = !flipped;
      render();
    });
    prevBtn.addEventListener("click", () => {
      if (pos > 0) { pos--; flipped = false; render(); }
    });
    nextBtn.addEventListener("click", () => {
      if (pos < vocab.length - 1) { pos++; flipped = false; render(); }
    });
    shuffleBtn.addEventListener("click", () => {
      order = shuffledIndices(vocab.length);
      pos = 0;
      flipped = false;
      render();
    });

    render();
  }

  function shuffledIndices(n) {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function sample(arr, n, excludeIndex) {
    const pool = arr.map((_, i) => i).filter((i) => i !== excludeIndex);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, n);
  }

  // ---------- Quiz ----------
  function initQuiz(vocab, mountId, lessonId, questionCount) {
    const mount = document.getElementById(mountId);
    if (!mount) return;
    const total = Math.min(questionCount || 12, vocab.length * 2);

    function showIntro() {
      const rec = getScore(lessonId);
      let historyHtml = "";
      if (rec) {
        historyHtml =
          '<p class="score-history">Skor terakhir: <strong>' + rec.last + "%</strong> &middot; " +
          "Skor terbaik: <strong>" + rec.best + "%</strong> &middot; " +
          "Percobaan: " + rec.attempts + "</p>";
      }
      mount.innerHTML =
        '<div class="quiz-intro">' +
        "<p>Kuis ini berisi " + total + " soal pilihan ganda acak: hanzi → arti, dan pinyin → hanzi, " +
        "diambil dari kosakata pelajaran ini.</p>" +
        historyHtml +
        '<button id="quiz-start" type="button">Mulai Kuis</button>' +
        "</div>";
      mount.querySelector("#quiz-start").addEventListener("click", startQuiz);
    }

    function buildQuestions() {
      const qs = [];
      const half = Math.ceil(total / 2);
      const idxPoolA = shuffledIndices(vocab.length);
      const idxPoolB = shuffledIndices(vocab.length);

      for (let i = 0; i < total; i++) {
        const type = i < half ? "hanzi2meaning" : "pinyin2hanzi";
        const pool = type === "hanzi2meaning" ? idxPoolA : idxPoolB;
        const wIndex = pool[i % pool.length];
        const w = vocab[wIndex];
        const distractorIdx = sample(vocab, 3, wIndex);
        let options, answer, prompt, sub, promptClass;

        if (type === "hanzi2meaning") {
          prompt = w.hanzi;
          promptClass = "";
          sub = w.pinyin;
          answer = w.meaning;
          options = distractorIdx.map((di) => vocab[di].meaning);
          options.push(answer);
        } else {
          prompt = w.pinyin;
          promptClass = "small";
          sub = w.meaning;
          answer = w.hanzi;
          options = distractorIdx.map((di) => vocab[di].hanzi);
          options.push(answer);
        }
        options = shuffleArray(options);
        qs.push({ type, prompt, promptClass, sub, answer, options });
      }
      return shuffleArray(qs);
    }

    function shuffleArray(arr) {
      const a = arr.slice();
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    }

    let questions, qIndex, correctCount;

    function startQuiz() {
      questions = buildQuestions();
      qIndex = 0;
      correctCount = 0;
      renderQuestion();
    }

    function renderQuestion() {
      const q = questions[qIndex];
      const label = q.type === "hanzi2meaning" ? "Hanzi → Arti" : "Pinyin → Hanzi";
      let html =
        '<div class="quiz-question">' +
        '<div class="q-progress">Soal ' + (qIndex + 1) + " / " + questions.length + " &middot; " + label + "</div>" +
        '<div class="q-prompt ' + q.promptClass + '">' + q.prompt + "</div>" +
        '<div class="q-subtext">' + q.sub + "</div>" +
        '<div class="quiz-options">';
      q.options.forEach((opt, i) => {
        html += '<button class="quiz-option" data-opt="' + i + '">' + opt + "</button>";
      });
      html += "</div></div>";
      mount.innerHTML = html;

      mount.querySelectorAll(".quiz-option").forEach((btn) => {
        btn.addEventListener("click", () => onAnswer(btn, q));
      });
    }

    function onAnswer(btn, q) {
      const chosen = btn.textContent;
      const allBtns = mount.querySelectorAll(".quiz-option");
      allBtns.forEach((b) => (b.disabled = true));
      if (chosen === q.answer) {
        btn.classList.add("correct");
        correctCount++;
      } else {
        btn.classList.add("wrong");
        allBtns.forEach((b) => {
          if (b.textContent === q.answer) b.classList.add("correct");
        });
      }
      setTimeout(() => {
        qIndex++;
        if (qIndex < questions.length) {
          renderQuestion();
        } else {
          finishQuiz();
        }
      }, 900);
    }

    function finishQuiz() {
      const record = saveScore(lessonId, correctCount, questions.length);
      mount.innerHTML =
        '<div class="quiz-result">' +
        "<p>Selesai!</p>" +
        '<div class="score-big">' + correctCount + " / " + questions.length + "</div>" +
        "<p>Skor: " + record.last + "% &middot; Skor terbaik: " + record.best + "%</p>" +
        '<div class="quiz-actions"><button id="quiz-retry" type="button">Coba Lagi</button></div>' +
        "</div>";
      mount.querySelector("#quiz-retry").addEventListener("click", showIntro);
    }

    showIntro();
  }

  // ---------- Tabs ----------
  function initTabs() {
    const buttons = document.querySelectorAll(".tab-btn");
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const target = btn.getAttribute("data-tab");
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        document.getElementById(target).classList.add("active");
      });
    });
  }

  window.HSK.renderVocabTable = renderVocabTable;
  window.HSK.initFlashcards = initFlashcards;
  window.HSK.initQuiz = initQuiz;
  window.HSK.initTabs = initTabs;
  window.HSK.renderHomepageBadges = renderHomepageBadges;
})();
