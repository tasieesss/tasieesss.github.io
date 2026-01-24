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

  
function renderRecommendations(payload) {
  const container = $("#recommendations-container");
  container.innerHTML = "";

  payload.criteria.forEach((criterionName) => {
    const block = document.createElement("div");
    block.className = "recommendation-group";

    const h = document.createElement("h4");
    h.textContent = criterionName;
    block.appendChild(h);

    const list = document.createElement("ol");
    list.className = "recommendation-list";

    const qList = payload.byCriterion[criterionName]?.questions || [];
    qList.forEach((q, idx) => {
      const li = document.createElement("li");
      const rec = q.recommendation || "Рекомендація не знайдена.";
      li.textContent = rec;
      list.appendChild(li);
    });

    block.appendChild(list);
    container.appendChild(block);
  });
}


function ensurePdfFont(doc) {
  if (pdfFontReady) return;
  // Add fonts to virtual FS and register
  doc.addFileToVFS("DejaVuSans.ttf", PDF_FONT_REG_BASE64);
  doc.addFont("DejaVuSans.ttf", "DejaVuSans", "normal");

  doc.addFileToVFS("DejaVuSans-Bold.ttf", PDF_FONT_BOLD_BASE64);
  doc.addFont("DejaVuSans-Bold.ttf", "DejaVuSans", "bold");

  pdfFontReady = true;
}


async function downloadPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("Не вдалося завантажити бібліотеку PDF. Перевірте інтернет-зʼєднання або підключення скриптів jsPDF.");
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  initPdfFont(doc);

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 48;
  const maxW = pageW - margin * 2;

  const title = "Результати тестування";
  const subtitle = `${state.orgName || ""}${state.email ? " • " + state.email : ""}`.trim();

  let y = margin;

  doc.setFont("DejaVu", "bold");
  doc.setFontSize(18);
  doc.text(title, margin, y);
  y += 22;

  doc.setFont("DejaVu", "normal");
  doc.setFontSize(11);
  if (subtitle) {
    doc.text(subtitle, margin, y);
    y += 18;
  }

  doc.setDrawColor(200);
  doc.line(margin, y, pageW - margin, y);
  y += 18;

  doc.setFont("DejaVu", "bold");
  doc.setFontSize(13);
  doc.text("Загальний підсумок", margin, y);
  y += 14;

  doc.setFont("DejaVu", "normal");
  doc.setFontSize(11);

  const total = state.lastResults?.totalScore ?? 0;
  const max = state.lastResults?.maxTotalScore ?? 0;
  const pct = state.lastResults ? Math.round((total / (max || 1)) * 100) : 0;

  ["Набрано балів: " + total, "Максимум: " + max, "Відсоток: " + pct + "%"].forEach((t) => {
    doc.text(t, margin, y);
    y += 14;
  });

  y += 10;

  if (doc.autoTable && state.lastResults) {
    const rows = state.lastResults.criteria.map((c) => ([
      c.name,
      String(c.maxScore),
      String(c.score),
      `${Math.round(c.percent)}%`,
      c.levelText
    ]));

    doc.autoTable({
      startY: y,
      head: [["Критерій", "Макс. бал", "Бали", "%", "Рівень"]],
      body: rows,
      styles: { font: "DejaVu", fontSize: 9, cellPadding: 6 },
      headStyles: { fillColor: [99, 102, 241], textColor: 255, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 240 } },
      margin: { left: margin, right: margin },
    });

    y = doc.lastAutoTable.finalY + 18;
  }

  doc.setFont("DejaVu", "bold");
  doc.setFontSize(13);
  doc.text("Рекомендації (100 — по кожному питанню)", margin, y);
  y += 16;

  doc.setFont("DejaVu", "normal");
  doc.setFontSize(10);

  const addWrapped = (text, x, y, maxWidth, lineH) => {
    const lines = doc.splitTextToSize(text, maxWidth);
    for (const ln of lines) {
      if (y > pageH - margin) {
        doc.addPage();
        initPdfFont(doc);
        y = margin;
      }
      doc.text(ln, x, y);
      y += lineH;
    }
    return y;
  };

  const res = state.lastResults;
  if (res) {
    res.criteria.forEach((crit) => {
      if (y > pageH - margin - 40) {
        doc.addPage();
        initPdfFont(doc);
        y = margin;
      }

      doc.setFont("DejaVu", "bold");
      doc.setFontSize(11);
      y = addWrapped(crit.name, margin, y, maxW, 14);
      y += 4;

      doc.setFont("DejaVu", "normal");
      doc.setFontSize(10);

      const qList = res.byCriterion[crit.name]?.questions || [];
      qList.forEach((q, idx) => {
        const rec = q.recommendation || "Рекомендація не знайдена.";
        y = addWrapped(`${idx + 1}. ${rec}`, margin + 10, y, maxW - 10, 13);
      });

      y += 10;
    });
  }

  const safeName = (state.orgName || "results").replace(/[\\\/:*?"<>|]+/g, "_");
  doc.save(`Результати_${safeName}.pdf`);
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
