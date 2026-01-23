/* script.js */
/* global testData */

(() => {
  'use strict';

  // ---------- State ----------
  let currentQuestionIndex = 0;
  let organizationName = '';

  // Answer storage
  const answers = [];            // numeric values per question index
  const selectedOptionIndex = []; // option index per question index (for per-answer recommendations)

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));
  const getMaxOptionValue = (q) => Math.max(...q.options.map(o => Number(o.value)));

  function getLevel(score, maxScore) {
    if (!maxScore) return 'low';
    const pct = (score / maxScore) * 100;
    if (pct >= 70) return 'high';
    if (pct >= 40) return 'medium';
    return 'low';
  }

  function getLevelText(level) {
    if (level === 'high') return 'Високий';
    if (level === 'medium') return 'Середній';
    return 'Низький';
  }

  function fmtPct(score, max) {
    if (!max) return '0%';
    return `${Math.round((score / max) * 100)}%`;
  }

  // ---------- UI: Questions ----------
  function updateProgress() {
    const total = testData.questions.length;
    const progress = ((currentQuestionIndex + 1) / total) * 100;
    $('progress').style.width = `${progress}%`;
    $('progress-text').textContent = `Прогрес: ${currentQuestionIndex + 1} із ${total}`;
  }

  function enableNextButtons(enabled) {
    const isLast = currentQuestionIndex === testData.questions.length - 1;
    $('next-btn').disabled = isLast ? true : !enabled;
    $('finish-btn').disabled = isLast ? !enabled : true;
  }

  function renderQuestion(index) {
    const q = testData.questions[index];
    const container = $('question-container');

    const answered = Number.isFinite(answers[index]);
    const selectedIdx = selectedOptionIndex[index];

    container.innerHTML = `
      <div class="question-container">
        <div class="question-meta">
          <span class="badge">${q.criterion}</span>
          <span>Питання ${index + 1} / ${testData.questions.length}</span>
        </div>
        <div class="question">${q.text}</div>
        <div class="options">
          ${q.options.map((opt, optIndex) => {
            const checked = answered && selectedIdx === optIndex ? 'checked' : '';
            return `
              <label class="option">
                <input type="radio" name="question_${index}" value="${opt.value}" data-opt-index="${optIndex}" ${checked} />
                <span>${opt.text}</span>
              </label>
            `;
          }).join('')}
        </div>
      </div>
    `;

    container.querySelectorAll(`input[name="question_${index}"]`).forEach((el) => {
      el.addEventListener('change', () => enableNextButtons(true));
    });

    // nav buttons
    $('back-btn').disabled = index === 0;

    const isLast = index === testData.questions.length - 1;
    $('next-btn').classList.toggle('hidden', isLast);
    $('finish-btn').classList.toggle('hidden', !isLast);

    updateProgress();
    enableNextButtons(answered);
  }

  function saveCurrentAnswer() {
    const selected = document.querySelector(`input[name="question_${currentQuestionIndex}"]:checked`);
    if (!selected) return false;
    answers[currentQuestionIndex] = Number(selected.value);
    selectedOptionIndex[currentQuestionIndex] = Number(selected.dataset.optIndex);
    return true;
  }

  // ---------- Calculations ----------
  function calculate() {
    const byCriterion = {};
    let totalScore = 0;
    let totalMax = 0;

    testData.questions.forEach((q, idx) => {
      const val = Number.isFinite(answers[idx]) ? answers[idx] : 0;
      const maxVal = getMaxOptionValue(q);

      totalScore += val;
      totalMax += maxVal;

      if (!byCriterion[q.criterion]) {
        byCriterion[q.criterion] = { score: 0, maxScore: 0, questions: [] };
      }
      byCriterion[q.criterion].score += val;
      byCriterion[q.criterion].maxScore += maxVal;
      byCriterion[q.criterion].questions.push({ q, idx, val, maxVal, optIndex: selectedOptionIndex[idx] });
    });

    return { totalScore, totalMax, byCriterion };
  }

  // ---------- UI: Results ----------
  function renderResults() {
    const { totalScore, totalMax, byCriterion } = calculate();

    $('total-score').textContent = `${totalScore}`;
    $('total-max').textContent = `${totalMax}`;
    $('total-pct').textContent = fmtPct(totalScore, totalMax);

    const tbody = $('results-tbody');
    tbody.innerHTML = '';

    for (const [crit, payload] of Object.entries(byCriterion)) {
      const score = payload.score;
      const maxScore = payload.maxScore;
      const level = getLevel(score, maxScore);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${crit}</td>
        <td>${maxScore}</td>
        <td>${score}</td>
        <td>${fmtPct(score, maxScore)}</td>
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
      const { score, maxScore } = payload;
      const level = getLevel(score, maxScore);

      const actionable = payload.questions
        .map(({ q, val, maxVal, optIndex }) => {
          const deficit = maxVal - val;
          const rec = (Number.isFinite(optIndex) && q.options[optIndex]) ? q.options[optIndex].recommendation : '';
          return { deficit, rec, qText: q.text, id: q.id, val, maxVal };
        })
        .filter(x => x.deficit > 0 && x.rec)
        .sort((a, b) => b.deficit - a.deficit);

      const uniqueRecs = [];
      for (const item of actionable) {
        if (!uniqueRecs.some(r => r.rec === item.rec)) uniqueRecs.push(item);
        if (uniqueRecs.length >= 3) break;
      }

      const generalHint =
        level === 'high'
          ? 'Сильний результат — підтримуйте системність і робіть точкові покращення.'
          : level === 'medium'
            ? 'Середній рівень — пріоритезуйте покращення в процесах із найбільшими прогалинами.'
            : 'Низький рівень — потрібні системні зміни та формалізація процесів. Почніть із базових практик.';

      const block = document.createElement('div');
      block.className = 'recommendation-item';
      block.innerHTML = `
        <div class="recommendation-title">Критерій: ${crit}</div>
        <p><strong>Рівень:</strong> ${getLevelText(level)} (${fmtPct(score, maxScore)})</p>
        <p>${generalHint}</p>
        ${uniqueRecs.length ? `
          <div style="margin-top:10px">
            <strong>Пріоритетні кроки:</strong>
            <ol style="margin:8px 0 0 18px">
              ${uniqueRecs.map(x => `
                <li style="margin:6px 0">
                  <div style="font-weight:700">${x.id ? `${x.id} • ` : ''}${x.qText}</div>
                  <div style="color:#374151">${x.rec}</div>
                </li>
              `).join('')}
            </ol>
          </div>
        ` : `<p style="margin-top:10px"><em>За вашими відповідями пріоритетних рекомендацій не знайдено.</em></p>`}
      `;
      container.appendChild(block);
    }
  }

  // ---------- Particles ----------
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

  // ---------- Flow ----------
  function start() {
    organizationName = $('organization').value.trim();

    if (!organizationName) {
      alert('Будь ласка, введіть назву організації.');
      return;
    }

    // reset
    answers.length = 0;
    selectedOptionIndex.length = 0;
    currentQuestionIndex = 0;

    $('start-page').classList.add('hidden');
    $('results-page').classList.add('hidden');
    $('test-page').classList.remove('hidden');

    renderQuestion(currentQuestionIndex);
  }

  function next() {
    if (!saveCurrentAnswer()) return;
    currentQuestionIndex = clamp(currentQuestionIndex + 1, 0, testData.questions.length - 1);
    renderQuestion(currentQuestionIndex);
  }

  function back() {
    currentQuestionIndex = clamp(currentQuestionIndex - 1, 0, testData.questions.length - 1);
    renderQuestion(currentQuestionIndex);
  }

  function finish() {
    if (!saveCurrentAnswer()) return;
    $('test-page').classList.add('hidden');
    $('results-page').classList.remove('hidden');

    $('org-name').textContent = organizationName;

    createParticles();
    renderResults();
  }

  function restart() {
    $('results-page').classList.add('hidden');
    $('test-page').classList.add('hidden');
    $('start-page').classList.remove('hidden');
    $('organization').focus();
  }

  function downloadPdf() {
    // Uses the browser print dialog. User can choose "Save as PDF".
    window.print();
  }

  // ---------- Wire up ----------
  document.addEventListener('DOMContentLoaded', () => {
    $('start-btn').addEventListener('click', start);
    $('next-btn').addEventListener('click', next);
    $('back-btn').addEventListener('click', back);
    $('finish-btn').addEventListener('click', finish);
    $('restart').addEventListener('click', restart);
    $('download-pdf').addEventListener('click', downloadPdf);

    // subtle particles on first load
    createParticles();
  });
})();
