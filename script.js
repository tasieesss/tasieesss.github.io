/* script.js */
/* global testData */

(() => {
  'use strict';

  // ---------------- Test Mode ----------------
  // Enable quickly without deleting questions:
  // 1) Add ?test=1 to the URL (recommended), OR
  // 2) In DevTools console run: localStorage.setItem('TEST_MODE','1') then reload
  // Disable: remove ?test=1 and run localStorage.removeItem('TEST_MODE')
  const TEST_LIMIT = 10;
  const TEST_MODE =
    new URLSearchParams(window.location.search).has('test') ||
    window.localStorage.getItem('TEST_MODE') === '1';

  const getQuestions = () =>
    TEST_MODE ? testData.questions.slice(0, TEST_LIMIT) : testData.questions;

  // ---------------- State ----------------
  let current = 0;
  const answers = []; // numeric value per question
  const selectedOptIndex = []; // option index per question (for per-question recommendation)
  let organizationName = '';
  let userEmail = '';

  // ---------------- Helpers ----------------
  const $ = (id) => document.getElementById(id);

  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const maxOptionValue = (q) => Math.max(...q.options.map((o) => Number(o.value)));

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  const pct = (score, max) => (max ? Math.round((score / max) * 100) : 0);

  function getLevel(score, max) {
    const p = pct(score, max);
    if (p >= 70) return 'high';
    if (p >= 40) return 'medium';
    return 'low';
  }

  const getLevelText = (lvl) => (lvl === 'high' ? 'Високий' : lvl === 'medium' ? 'Середній' : 'Низький');

  // ---------------- UI: Questions ----------------
  function updateProgress() {
    const total = getQuestions().length;
    const progress = ((current + 1) / total) * 100;
    $('progress').style.width = `${progress}%`;
    $('progress-text').textContent = `Прогрес: ${current + 1} із ${total}${TEST_MODE ? ` • ТЕСТОВИЙ РЕЖИМ (${TEST_LIMIT})` : ''}`;
  }

  function setNavButtonsState() {
    const total = getQuestions().length;
    const answered = Number.isFinite(answers[current]);
    const isLast = current === total - 1;

    $('back-btn').disabled = current === 0;
    $('next-btn').classList.toggle('hidden', isLast);
    $('finish-btn').classList.toggle('hidden', !isLast);

    if (isLast) $('finish-btn').disabled = !answered;
    else $('next-btn').disabled = !answered;
  }

  function renderQuestion(index) {
    const q = getQuestions()[index];
    const container = $('question-container');

    const chosenIdx = selectedOptIndex[index];

    container.innerHTML = `
      <div class="question-container">
        <div class="question-meta">
          <span class="badge">${q.criterion}</span>
          <span>Питання ${index + 1} / ${getQuestions().length} • ID: ${q.id}</span>
        </div>
        <div class="question">${q.text}</div>
        <div class="options">
          ${q.options
            .map((opt, optIndex) => {
              const checked = Number.isFinite(chosenIdx) && chosenIdx === optIndex ? 'checked' : '';
              return `
                <label class="option">
                  <input type="radio"
                         name="question_${index}"
                         value="${opt.value}"
                         data-opt-index="${optIndex}"
                         ${checked} />
                  <span>${opt.text}</span>
                </label>
              `;
            })
            .join('')}
        </div>
      </div>
    `;

    container.querySelectorAll(`input[name="question_${index}"]`).forEach((el) => {
      el.addEventListener('change', () => {
        const val = Number(el.value);
        const oi = Number(el.dataset.optIndex);
        answers[index] = val;
        selectedOptIndex[index] = oi;
        setNavButtonsState();
      });
    });

    updateProgress();
    setNavButtonsState();
  }

  // ---------------- Calculations ----------------
  function calculate() {
    const qs = getQuestions();

    const byCriterion = {};
    let totalScore = 0;
    let totalMax = 0;

    qs.forEach((q, idx) => {
      const val = Number.isFinite(answers[idx]) ? answers[idx] : 0;
      const maxVal = maxOptionValue(q);

      totalScore += val;
      totalMax += maxVal;

      if (!byCriterion[q.criterion]) byCriterion[q.criterion] = { score: 0, maxScore: 0, questions: [] };

      byCriterion[q.criterion].score += val;
      byCriterion[q.criterion].maxScore += maxVal;
      byCriterion[q.criterion].questions.push({
        q,
        idx,
        val,
        maxVal,
        optIndex: Number.isFinite(selectedOptIndex[idx]) ? selectedOptIndex[idx] : null
      });
    });

    return { totalScore, totalMax, byCriterion };
  }

  // ---------------- Results Rendering ----------------
  function renderResults() {
    const { totalScore, totalMax, byCriterion } = calculate();

    $('total-score').textContent = `${totalScore}`;
    $('total-max').textContent = `${totalMax}`;
    $('total-pct').textContent = `${pct(totalScore, totalMax)}%`;

    const tbody = $('results-tbody');
    tbody.innerHTML = '';

    for (const [crit, payload] of Object.entries(byCriterion)) {
      const level = getLevel(payload.score, payload.maxScore);
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${crit}</td>
        <td>${payload.maxScore}</td>
        <td>${payload.score}</td>
        <td>${pct(payload.score, payload.maxScore)}%</td>
        <td><span class="level-pill level-${level}">${getLevelText(level)}</span></td>
      `;
      tbody.appendChild(tr);
    }

    renderRecommendations(byCriterion);
  }

  function renderRecommendations(byCriterion) {
    const container = $('recommendations-container');
    container.innerHTML = '';

    for (const [crit, payload] of Object.entries(byCriterion)) {
      const level = getLevel(payload.score, payload.maxScore);

      // Take up to 3 unique, most impactful per-question recommendations (where selected value != max)
      const items = payload.questions
        .map(({ q, val, maxVal, optIndex }) => {
          const deficit = maxVal - val;
          const rec = optIndex != null && q.options[optIndex] ? q.options[optIndex].recommendation : '';
          return { deficit, rec, qText: q.text, id: q.id };
        })
        .filter((x) => x.deficit > 0 && x.rec)
        .sort((a, b) => b.deficit - a.deficit);

      const unique = [];
      for (const it of items) {
        if (!unique.some((u) => u.rec === it.rec)) unique.push(it);
        if (unique.length >= 3) break;
      }

      const general =
        level === 'high'
          ? 'Сильний результат — підтримуйте системність та робіть точкові покращення.'
          : level === 'medium'
            ? 'Середній рівень — пріоритезуйте покращення в процесах із найбільшими прогалинами.'
            : 'Низький рівень — потрібні системні зміни та формалізація процесів. Почніть із базових практик.';

      const block = document.createElement('div');
      block.className = 'recommendation-item';
      block.innerHTML = `
        <div class="recommendation-title">Критерій: ${crit}</div>
        <p><strong>Рівень:</strong> ${getLevelText(level)} (${pct(payload.score, payload.maxScore)}%)</p>
        <p>${general}</p>
        ${
          unique.length
            ? `
          <div class="rec-steps">
            <strong>Пріоритетні кроки:</strong>
            <ol>
              ${unique
                .map(
                  (x) => `
                <li>
                  <div class="rec-q"><span class="rec-id">${x.id}</span>${x.qText}</div>
                  <div class="rec-t">${x.rec}</div>
                </li>
              `
                )
                .join('')}
            </ol>
          </div>
        `
            : `<p style="margin-top:10px"><em>Пріоритетних рекомендацій не знайдено (відповіді близькі до максимуму).</em></p>`
        }
      `;
      container.appendChild(block);
    }
  }

  // ---------------- Particles ----------------
  function createParticles() {
    const holder = $('particles');
    if (!holder) return;
    holder.innerHTML = '';
    const n = 20;
    for (let i = 0; i < n; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      p.style.left = `${Math.random() * 100}%`;
      p.style.top = `${Math.random() * 100}%`;
      p.style.animationDelay = `${Math.random() * 8}s`;
      p.style.animationDuration = `${(Math.random() * 3 + 5).toFixed(2)}s`;
      holder.appendChild(p);
    }
  }

  // ---------------- Flow ----------------
  function start() {
    organizationName = $('organization').value.trim();
    userEmail = $('email').value.trim();

    if (!organizationName || !userEmail) {
      alert('Будь ласка, заповніть всі поля.');
      return;
    }
    if (!validateEmail(userEmail)) {
      alert('Будь ласка, введіть коректну електронну адресу.');
      return;
    }

    // reset answers for a new run
    answers.length = 0;
    selectedOptIndex.length = 0;

    $('start-page').classList.add('hidden');
    $('results-page').classList.add('hidden');
    $('test-page').classList.remove('hidden');

    current = 0;
    renderQuestion(current);
  }

  function next() {
    const total = getQuestions().length;
    current = clamp(current + 1, 0, total - 1);
    renderQuestion(current);
  }

  function back() {
    const total = getQuestions().length;
    current = clamp(current - 1, 0, total - 1);
    renderQuestion(current);
  }

  function finish() {
    $('test-page').classList.add('hidden');
    $('results-page').classList.remove('hidden');
    $('org-name').textContent = `${organizationName} • ${userEmail}`;

    createParticles();
    renderResults();
  }

  function restart() {
    answers.length = 0;
    selectedOptIndex.length = 0;

    $('results-page').classList.add('hidden');
    $('test-page').classList.add('hidden');
    $('start-page').classList.remove('hidden');
    $('organization').focus();
  }

  function copyResultsJson() {
    const { totalScore, totalMax, byCriterion } = calculate();
    const payload = {
      organizationName,
      userEmail,
      testMode: TEST_MODE,
      totalScore,
      totalMax,
      totalPct: pct(totalScore, totalMax),
      byCriterion: Object.fromEntries(
        Object.entries(byCriterion).map(([k, v]) => [
          k,
          { score: v.score, maxScore: v.maxScore, pct: pct(v.score, v.maxScore) }
        ])
      ),
      answers: getQuestions().map((q, idx) => ({
        id: q.id,
        criterion: q.criterion,
        question: q.text,
        value: Number.isFinite(answers[idx]) ? answers[idx] : 0
      }))
    };

    navigator.clipboard
      .writeText(JSON.stringify(payload, null, 2))
      .then(() => alert('Результати (JSON) скопійовано в буфер обміну.'))
      .catch(() => alert('Не вдалося скопіювати. (Браузер може блокувати clipboard для file://)'));
  }

  // ---------------- Wire up ----------------
  document.addEventListener('DOMContentLoaded', () => {
    $('start-btn').addEventListener('click', start);
    $('next-btn').addEventListener('click', next);
    $('back-btn').addEventListener('click', back);
    $('finish-btn').addEventListener('click', finish);
    $('restart').addEventListener('click', restart);
    $('copy-json').addEventListener('click', copyResultsJson);

    createParticles();
  });
})();
