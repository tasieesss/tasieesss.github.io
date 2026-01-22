/* script.js */
/* global testData */

(() => {
  'use strict';

  // ---------- Test mode (for quick QA) ----------
  // true  -> only first TEST_LIMIT questions are used (you don't delete the rest)
  // false -> use all questions
  const TEST_MODE = false;
  const TEST_LIMIT = 10;

  function getQuestions() {
    return TEST_MODE ? testData.questions.slice(0, TEST_LIMIT) : testData.questions;
  }


  // ---------- State ----------
  let currentQuestionIndex = 0;
  const answers = []; // stores selected option value per question index
  const selectedOptionIndex = []; // stores chosen option index to pull recommendation text
  let organizationName = '';
  let userEmail = '';

  // ---------- Helpers ----------
  const $ = (id) => document.getElementById(id);

  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  const uniq = (arr) => [...new Set(arr)];

  const getMaxOptionValue = (q) => Math.max(...q.options.map(o => Number(o.value)));

  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  function getLevel(score, maxScore) {
    if (!maxScore) return 'low';
    const pct = (score / maxScore) * 100;
    if (pct >= 70) return 'high';
    if (pct >= 40) return 'medium';
    return 'low';
  }

  function getLevelText(level) {
    return level === 'high' ? 'Високий' : level === 'medium' ? 'Середній' : 'Низький';
  }

  function fmtPct(score, max) {
    if (!max) return '0%';
    return `${Math.round((score / max) * 100)}%`;
  }

  // ---------- UI ----------
  function renderQuestion(index) {
    const q = getQuestions()[index];
    const container = $('question-container');

    const answered = Number.isFinite(answers[index]);
    const selectedIdx = selectedOptionIndex[index];

    container.innerHTML = `
      <div class="question-container">
        <div class="question-meta">
          <span class="badge">${q.criterion}</span>
          <span>Питання ${index + 1} / ${getQuestions().length} • ID: ${q.id}</span>
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

    // Events
    container.querySelectorAll(`input[name="question_${index}"]`).forEach((el) => {
      el.addEventListener('change', () => {
        enableNextButtons(true);
      });
    });

    updateProgress();

    // Buttons state
    enableNextButtons(answered);

    const isLast = index === getQuestions().length - 1;
    $('next-btn').classList.toggle('hidden', isLast);
    $('finish-btn').classList.toggle('hidden', !isLast);

    // Back button
    $('back-btn').disabled = index === 0;
  }

  function updateProgress() {
    const total = getQuestions().length;
    const progress = ((currentQuestionIndex + 1) / total) * 100;
    $('progress').style.width = `${progress}%`;
    $('progress-text').textContent = `Прогрес: ${currentQuestionIndex + 1} із ${total}`;
  }

  function enableNextButtons(enabled) {
    const isLast = currentQuestionIndex === getQuestions().length - 1;
    if (isLast) {
      $('finish-btn').disabled = !enabled;
    } else {
      $('next-btn').disabled = !enabled;
    }
  }

  function saveCurrentAnswer() {
    const selected = document.querySelector(`input[name="question_${currentQuestionIndex}"]:checked`);
    if (!selected) return false;
    const value = Number(selected.value);
    const optIndex = Number(selected.dataset.optIndex);
    answers[currentQuestionIndex] = value;
    selectedOptionIndex[currentQuestionIndex] = optIndex;
    return true;
  }

  // ---------- Calculations ----------
  function calculate() {
    const qs = getQuestions();
    const byCriterion = {};
    const criteria = uniq(qs.map(q => q.criterion));

    for (const crit of criteria) {
      byCriterion[crit] = { score: 0, maxScore: 0, questions: [] };
    }

    let totalScore = 0;
    let totalMax = 0;

    qs.forEach((q, idx) => {
      const val = Number.isFinite(answers[idx]) ? answers[idx] : 0;
      const maxVal = getMaxOptionValue(q);

      totalScore += val;
      totalMax += maxVal;

      byCriterion[q.criterion].score += val;
      byCriterion[q.criterion].maxScore += maxVal;
      byCriterion[q.criterion].questions.push({ q, idx, val, maxVal, optIndex: selectedOptionIndex[idx] });
    });

    return { totalScore, totalMax, byCriterion };
  }

    let totalScore = 0;
    let totalMax = 0;

    testData.questions.forEach((q, idx) => {
      const val = Number.isFinite(answers[idx]) ? answers[idx] : 0;
      const maxVal = getMaxOptionValue(q);

      totalScore += val;
      totalMax += maxVal;

      byCriterion[q.criterion].score += val;
      byCriterion[q.criterion].maxScore += maxVal;
      byCriterion[q.criterion].questions.push({ q, idx, val, maxVal, optIndex: selectedOptionIndex[idx] });
    });

    return { totalScore, totalMax, byCriterion };
  }

  // ---------- Results Rendering ----------
  function renderResults() {
    const { totalScore, totalMax, byCriterion } = calculate();

    $('total-score').textContent = `${totalScore}`;
    $('total-max').textContent = `${totalMax}`;
    $('total-pct').textContent = fmtPct(totalScore, totalMax);

    const tbody = $('results-tbody');
    tbody.innerHTML = '';

    const critNames = Object.keys(byCriterion);

    for (const crit of critNames) {
      const score = byCriterion[crit].score;
      const maxScore = byCriterion[crit].maxScore;
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

      // Collect the most “painful” recommendations: those where chosen value is not max.
      const actionable = payload.questions
        .map(({ q, val, maxVal, optIndex }) => {
          const deficit = maxVal - val;
          const rec = (Number.isFinite(optIndex) && q.options[optIndex]) ? q.options[optIndex].recommendation : '';
          return { deficit, rec, qText: q.text, id: q.id, val, maxVal };
        })
        .filter(x => x.deficit > 0 && x.rec)
        .sort((a, b) => b.deficit - a.deficit);

      // Take up to 3 unique recommendations
      const uniqueRecs = [];
      for (const item of actionable) {
        if (!uniqueRecs.some(r => r.rec === item.rec)) uniqueRecs.push(item);
        if (uniqueRecs.length >= 3) break;
      }

      const generalHint =
        level === 'high'
          ? 'Сильний результат — зосередьтеся на точкових покращеннях та підтриманні системності.'
          : level === 'medium'
            ? 'Середній рівень — рекомендовано пріоритезувати покращення в процесах, де є найбільші прогалини.'
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
                  <div style="font-weight:700">${x.id} • ${x.qText}</div>
                  <div style="color:#374151">${x.rec}</div>
                </li>
              `).join('')}
            </ol>
          </div>
        ` : `<p style="margin-top:10px"><em>За вашими відповідями пріоритетних рекомендацій не знайдено (всі відповіді близькі до максимуму).</em></p>`}
      `;
      container.appendChild(block);
    }
  }

    canvas._chart = new Chart(canvas, {
      type: 'radar',
      data: {
        labels,
        datasets: [{
          label: '% за критерієм',
          data: values,
        }]
      },
      options: {
        responsive: true,
        scales: {
          r: { beginAtZero: true, min: 0, max: 100, ticks: { stepSize: 20 } }
        },
        plugins: { legend: { display: false } }
      }
    });
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
    userEmail = $('email').value.trim();

    if (!organizationName || !userEmail) {
      alert('Будь ласка, заповніть всі поля.');
      return;
    }
    if (!validateEmail(userEmail)) {
      alert('Будь ласка, введіть коректну електронну адресу.');
      return;
    }

    $('start-page').classList.add('hidden');
    $('test-page').classList.remove('hidden');

    currentQuestionIndex = 0;
    renderQuestion(currentQuestionIndex);
  }

  function next() {
    if (!saveCurrentAnswer()) return;
    currentQuestionIndex = clamp(currentQuestionIndex + 1, 0, getQuestions().length - 1);
    renderQuestion(currentQuestionIndex);
  }

  function back() {
    // allow going back without changing answer
    currentQuestionIndex = clamp(currentQuestionIndex - 1, 0, getQuestions().length - 1);
    renderQuestion(currentQuestionIndex);
  }

  function finish() {
    if (!saveCurrentAnswer()) return;

    $('test-page').classList.add('hidden');
    $('results-page').classList.remove('hidden');
    $('org-name').textContent = `${organizationName} • ${userEmail}`;

    createParticles();
    renderResults();
  }

  function restart() {
    // reset
    answers.length = 0;
    selectedOptionIndex.length = 0;
    $('results-page').classList.add('hidden');
    $('start-page').classList.remove('hidden');
    $('organization').focus();
  }

  function copyResultsJson() {
    const { totalScore, totalMax, byCriterion } = calculate();
    const payload = {
      organizationName,
      userEmail,
      totalScore,
      totalMax,
      totalPct: totalMax ? Math.round((totalScore / totalMax) * 100) : 0,
      byCriterion: Object.fromEntries(Object.entries(byCriterion).map(([k, v]) => ([
        k,
        { score: v.score, maxScore: v.maxScore, pct: v.maxScore ? Math.round((v.score / v.maxScore) * 100) : 0 }
      ]))),
      answers: getQuestions().map((q, idx) => ({
        id: q.id,
        criterion: q.criterion,
        question: q.text,
        value: Number.isFinite(answers[idx]) ? answers[idx] : 0
      }))
    };

    navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
      .then(() => alert('Результати (JSON) скопійовано в буфер обміну.'))
      .catch(() => alert('Не вдалося скопіювати. Спробуйте вручну (браузер може блокувати clipboard для file://).'));
  }

  // ---------- Wire up ----------
  document.addEventListener('DOMContentLoaded', () => {
    $('start-btn').addEventListener('click', start);
    $('next-btn').addEventListener('click', next);
    $('back-btn').addEventListener('click', back);
    $('finish-btn').addEventListener('click', finish);
    $('restart').addEventListener('click', restart);
    $('copy-json').addEventListener('click', copyResultsJson);

    // subtle particles on first load
    createParticles();
  });
})();
