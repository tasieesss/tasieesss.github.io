/* script.js */
/* global testData */

(() => {
  'use strict';

  // ---------- State ----------
  let currentQuestionIndex = 0;
  let organizationName = '';

  let userEmail = '';

  // How many recommendations to show per criterion
  const RECS_PER_CRITERION = 10;

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

  function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(String(email || '').trim());
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
        if (uniqueRecs.length >= RECS_PER_CRITERION) break;
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
    userEmail = ($('email')?.value || '').trim();

    if (!organizationName || !userEmail) {
      alert('Будь ласка, заповніть назву організації та email.');
      return;
    }

    if (!validateEmail(userEmail)) {
      alert('Будь ласка, введіть коректну електронну адресу.');
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

    $('org-name').textContent = `${organizationName} • ${userEmail}`;

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
    // Client-side PDF export via jsPDF + autoTable.
    // No browser print => no "кривих" переносів і без URL у футері.
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
      alert('PDF-бібліотека не завантажилась. Перевірте інтернет/блокувальники.');
      return;
    }

    const { totalScore, totalMax, byCriterion } = calculate();

    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    // --- Embed Unicode font to avoid "шифровка" (gibberish) for Cyrillic/UA text ---
    const fonts = window.PDF_FONTS || {};
    try {
      if (fonts.dejavuSans) {
        doc.addFileToVFS('DejaVuSans.ttf', fonts.dejavuSans);
        doc.addFont('DejaVuSans.ttf', 'DejaVuSans', 'normal');
      }
      if (fonts.dejavuSansBold) {
        doc.addFileToVFS('DejaVuSans-Bold.ttf', fonts.dejavuSansBold);
        doc.addFont('DejaVuSans-Bold.ttf', 'DejaVuSans', 'bold');
      }
    } catch (e) {
      // If fonts fail to load, PDF will fall back to default font.
    }

    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 40;
    const contentW = pageW - margin * 2;

    const now = new Date();
    const dateStr = now.toLocaleDateString('uk-UA');
    const timeStr = now.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });

    // Header
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(16);
    const title = 'Результати тестування';
    doc.text(title, pageW / 2, 55, { align: 'center' });

    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(11);
    const meta = `${organizationName} • ${userEmail}`;
    doc.text(doc.splitTextToSize(meta, contentW), margin, 80);
    doc.setFontSize(9);
    doc.text(`Згенеровано: ${dateStr} ${timeStr}`, margin, 98);

    // Summary
    let y = 120;
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(12);
    doc.text('Загальний підсумок', margin, y);
    y += 12;

    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(11);
    const pct = totalMax ? Math.round((totalScore / totalMax) * 100) : 0;
    doc.text(`Набрано балів: ${totalScore}`, margin, y + 18);
    doc.text(`Максимум: ${totalMax}`, margin + 180, y + 18);
    doc.text(`Відсоток: ${pct}%`, margin + 320, y + 18);
    y += 40;

    // Table
    const tableBody = Object.entries(byCriterion).map(([crit, payload]) => {
      const score = payload.score;
      const maxScore = payload.maxScore;
      const level = getLevel(score, maxScore);
      return [
        crit,
        String(maxScore),
        String(score),
        fmtPct(score, maxScore),
        getLevelText(level)
      ];
    });

    doc.autoTable({
      startY: y,
      head: [[ 'Критерій', 'Макс.', 'Бали', '%', 'Рівень' ]],
      body: tableBody,
      margin: { left: margin, right: margin },
      styles: {
        font: 'DejaVuSans',
        fontSize: 9,
        cellPadding: 6,
        overflow: 'linebreak',
        valign: 'middle',
      },
      headStyles: {
        fillColor: [245, 245, 255],
        textColor: 20,
        fontStyle: 'bold'
      },
      columnStyles: {
        0: { cellWidth: contentW * 0.62 },
        1: { cellWidth: contentW * 0.10, halign: 'center' },
        2: { cellWidth: contentW * 0.08, halign: 'center' },
        3: { cellWidth: contentW * 0.07, halign: 'center' },
        4: { cellWidth: contentW * 0.13, halign: 'center' },
      },
      didDrawPage: (data) => {
        // Clean footer (no URL)
        const pageNumber = doc.internal.getNumberOfPages();
        doc.setFont('DejaVuSans', 'normal');
        doc.setFontSize(9);
        doc.text(`Сторінка ${pageNumber}`, pageW - margin, pageH - 20, { align: 'right' });
      }
    });

    y = doc.lastAutoTable.finalY + 20;

    // Recommendations
    if (y > pageH - 120) {
      doc.addPage();
      y = 55;
    }
    doc.setFont('DejaVuSans', 'bold');
    doc.setFontSize(12);
    doc.text('Рекомендації щодо удосконалення', margin, y);
    y += 14;
    doc.setFont('DejaVuSans', 'normal');
    doc.setFontSize(10);
    const hint = 'Сформовано на основі ваших відповідей (обраних варіантів) та рівня по критерію.';
    doc.text(doc.splitTextToSize(hint, contentW), margin, y);
    y += 18;

    const critEntries = Object.entries(byCriterion);
    for (const [crit, payload] of critEntries) {
      const score = payload.score;
      const maxScore = payload.maxScore;
      const level = getLevel(score, maxScore);

      const actionable = payload.questions
        .map(({ q, val, maxVal, optIndex }) => {
          const deficit = maxVal - val;
          const rec = (Number.isFinite(optIndex) && q.options[optIndex]) ? q.options[optIndex].recommendation : '';
          return { deficit, rec, qText: q.text, id: q.id };
        })
        .filter(x => x.deficit > 0 && x.rec)
        .sort((a, b) => b.deficit - a.deficit);

      const uniqueRecs = [];
      for (const item of actionable) {
        if (!uniqueRecs.some(r => r.rec === item.rec)) uniqueRecs.push(item);
        if (uniqueRecs.length >= RECS_PER_CRITERION) break;
      }

      const generalHint =
        level === 'high'
          ? 'Сильний результат — підтримуйте системність і робіть точкові покращення.'
          : level === 'medium'
            ? 'Середній рівень — пріоритезуйте покращення в процесах із найбільшими прогалинами.'
            : 'Низький рівень — потрібні системні зміни та формалізація процесів. Почніть із базових практик.';

      // Estimate space
      const titleLines = doc.splitTextToSize(`Критерій: ${crit}`, contentW);
      const hintLines = doc.splitTextToSize(`Рівень: ${getLevelText(level)} (${fmtPct(score, maxScore)})`, contentW);
      const generalLines = doc.splitTextToSize(generalHint, contentW);
      const stepsLines = uniqueRecs.flatMap((x, i) => {
        const stepTitle = `${i + 1}) ${x.id ? `${x.id} • ` : ''}${x.qText}`;
        const stepRec = `— ${x.rec}`;
        return [
          ...doc.splitTextToSize(stepTitle, contentW),
          ...doc.splitTextToSize(stepRec, contentW)
        ];
      });

      const blockHeight =
        (titleLines.length + hintLines.length + generalLines.length + Math.max(stepsLines.length, 1) + 2) * 12 + 16;

      if (y + blockHeight > pageH - 40) {
        doc.addPage();
        y = 55;
      }

      doc.setFont('DejaVuSans', 'bold');
      doc.setFontSize(11);
      doc.text(titleLines, margin, y);
      y += titleLines.length * 12;

      doc.setFont('DejaVuSans', 'normal');
      doc.setFontSize(10);
      doc.text(hintLines, margin, y);
      y += hintLines.length * 12;

      doc.text(generalLines, margin, y);
      y += generalLines.length * 12 + 6;

      if (uniqueRecs.length) {
        doc.setFont('DejaVuSans', 'bold');
        doc.text('Пріоритетні кроки:', margin, y);
        y += 12;
        doc.setFont('DejaVuSans', 'normal');
        for (let i = 0; i < uniqueRecs.length; i++) {
          const x = uniqueRecs[i];
          const stepTitle = `${i + 1}) ${x.id ? `${x.id} • ` : ''}${x.qText}`;
          const stepRec = `— ${x.rec}`;
          const st1 = doc.splitTextToSize(stepTitle, contentW);
          const st2 = doc.splitTextToSize(stepRec, contentW);
          const needed = (st1.length + st2.length) * 12 + 6;
          if (y + needed > pageH - 40) {
            doc.addPage();
            y = 55;
          }
          doc.text(st1, margin, y);
          y += st1.length * 12;
          doc.text(st2, margin + 12, y);
          y += st2.length * 12 + 6;
        }
      } else {
        const none = doc.splitTextToSize('За вашими відповідями пріоритетних рекомендацій не знайдено.', contentW);
        doc.text(none, margin, y);
        y += none.length * 12;
      }

      y += 10;
      doc.setDrawColor(230);
      doc.line(margin, y, pageW - margin, y);
      y += 14;
    }

    // TODO: fix error
    const safeName = (organizationName || 'results')
  .replace(/[\\/:*?"<>|]+/g, '_');

    const safeEmail = (userEmail || 'email')
      .replace(/[^a-zA-Z0-9@._-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');

    doc.save(`Results_${safeName}_${safeEmail}.pdf`);
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
