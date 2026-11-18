/**
 * COGNISTUDY AI - PRACTICE QUIZ CREATOR & RUNNER
 * Interactive multiple-choice engine with instant feedback / exam simulation,
 * timer, in-depth explanations, scorecard, and confetti!
 */

class QuizController {
  constructor() {
    this.quizData = null;
    this.currentQuestionIdx = 0;
    this.userAnswers = [];
    this.quizMode = 'practice'; // 'practice' (instant feedback) or 'exam' (graded at end)
    this.timerInterval = null;
    this.secondsElapsed = 0;

    this.init();
  }

  init() {
    // Creator Elements
    this.creatorCard = document.getElementById('quizCreatorCard');
    this.activeCard = document.getElementById('quizActiveCard');
    this.resultsCard = document.getElementById('quizResultsCard');

    this.topicInput = document.getElementById('quizTopicInput');
    this.countSelect = document.getElementById('quizCountSelect');
    this.difficultySelect = document.getElementById('quizDifficultySelect');
    this.modeSelect = document.getElementById('quizModeSelect');
    this.btnGenerateQuiz = document.getElementById('btnGenerateQuiz');

    // Runner Elements
    this.questionNumberEl = document.getElementById('quizQuestionNumber');
    this.questionTitleEl = document.getElementById('quizQuestionTitle');
    this.optionsListEl = document.getElementById('quizOptionsList');
    this.explanationBoxEl = document.getElementById('quizExplanationBox');
    this.explanationTextEl = document.getElementById('quizExplanationText');
    this.timerDisplayEl = document.getElementById('quizTimerDisplay');
    this.progressBarEl = document.getElementById('quizProgressBar');
    this.btnNextQuestion = document.getElementById('btnNextQuestion');
    this.btnPrevQuestion = document.getElementById('btnPrevQuestion');
    this.btnSubmitExam = document.getElementById('btnSubmitExam');

    // Results Elements
    this.scoreValEl = document.getElementById('quizScoreVal');
    this.scoreGradeEl = document.getElementById('quizScoreGrade');
    this.statCorrectEl = document.getElementById('quizStatCorrect');
    this.statIncorrectEl = document.getElementById('quizStatIncorrect');
    this.statTimeEl = document.getElementById('quizStatTime');
    this.reviewQuestionsList = document.getElementById('quizReviewList');
    this.btnRetakeQuiz = document.getElementById('btnRetakeQuiz');
    this.btnNewQuiz = document.getElementById('btnNewQuiz');

    this.bindEvents();
  }

  bindEvents() {
    this.btnGenerateQuiz?.addEventListener('click', () => this.handleGenerateQuiz());

    this.btnNextQuestion?.addEventListener('click', () => {
      if (this.currentQuestionIdx < this.quizData.questions.length - 1) {
        this.currentQuestionIdx++;
        this.renderQuestion();
      } else {
        this.finishQuiz();
      }
    });

    this.btnPrevQuestion?.addEventListener('click', () => {
      if (this.currentQuestionIdx > 0) {
        this.currentQuestionIdx--;
        this.renderQuestion();
      }
    });

    this.btnSubmitExam?.addEventListener('click', () => {
      if (confirm('Are you ready to submit your exam answers for scoring?')) {
        this.finishQuiz();
      }
    });

    this.btnRetakeQuiz?.addEventListener('click', () => this.retakeQuiz());
    this.btnNewQuiz?.addEventListener('click', () => this.showCreator());
  }

  prefillGenerator(text) {
    if (this.topicInput) {
      this.topicInput.value = text;
    }
    this.showCreator();
  }

  showCreator() {
    this.stopTimer();
    if (this.creatorCard) this.creatorCard.style.display = 'block';
    if (this.activeCard) this.activeCard.style.display = 'none';
    if (this.resultsCard) this.resultsCard.style.display = 'none';
  }

  async handleGenerateQuiz() {
    const topic = this.topicInput.value.trim();
    if (!topic) {
      window.app.showToast('Please enter a topic or paste study notes', 'warning');
      return;
    }

    const count = parseInt(this.countSelect.value || '5', 10);
    const difficulty = this.difficultySelect.value || 'medium';
    this.quizMode = this.modeSelect.value || 'practice';

    this.btnGenerateQuiz.disabled = true;
    this.btnGenerateQuiz.innerHTML = `<span class="spinner" style="width:16px; height:16px;"></span> Generating Quiz...`;

    try {
      const quiz = await window.ai.generateQuiz(topic, count, difficulty);
      this.quizData = quiz;
      this.startQuiz();
      window.app.playSound('chime');
      window.app.showToast(`Quiz ready: ${quiz.questions.length} questions!`, 'success');
    } catch (err) {
      window.app.showToast(`Quiz generation failed: ${err.message}`, 'error');
    } finally {
      this.btnGenerateQuiz.disabled = false;
      this.btnGenerateQuiz.innerHTML = `🚀 Create Practice Quiz`;
    }
  }

  startQuiz() {
    this.currentQuestionIdx = 0;
    this.userAnswers = new Array(this.quizData.questions.length).fill(null);
    this.secondsElapsed = 0;

    // View toggles
    this.creatorCard.style.display = 'none';
    this.activeCard.style.display = 'block';
    this.resultsCard.style.display = 'none';

    this.startTimer();
    this.renderQuestion();
  }

  startTimer() {
    this.stopTimer();
    this.timerInterval = setInterval(() => {
      this.secondsElapsed++;
      const mins = Math.floor(this.secondsElapsed / 60);
      const secs = this.secondsElapsed % 60;
      if (this.timerDisplayEl) {
        this.timerDisplayEl.innerText = `⏱️ ${mins}:${secs < 10 ? '0' : ''}${secs}`;
      }
    }, 1000);
  }

  stopTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  renderQuestion() {
    const q = this.quizData.questions[this.currentQuestionIdx];
    const total = this.quizData.questions.length;
    const answered = this.userAnswers[this.currentQuestionIdx] !== null;

    // Header & counters
    if (this.questionNumberEl) {
      this.questionNumberEl.innerText = `Question ${this.currentQuestionIdx + 1} of ${total}`;
    }
    if (this.questionTitleEl) {
      this.questionTitleEl.innerText = q.question;
    }
    if (this.progressBarEl) {
      this.progressBarEl.style.width = `${((this.currentQuestionIdx + 1) / total) * 100}%`;
    }

    // Prev / Next button states
    if (this.btnPrevQuestion) {
      this.btnPrevQuestion.style.display = this.currentQuestionIdx > 0 ? 'inline-flex' : 'none';
    }

    if (this.quizMode === 'exam') {
      if (this.btnNextQuestion) {
        this.btnNextQuestion.style.display = this.currentQuestionIdx < total - 1 ? 'inline-flex' : 'none';
      }
      if (this.btnSubmitExam) {
        this.btnSubmitExam.style.display = this.currentQuestionIdx === total - 1 ? 'inline-flex' : 'none';
      }
      if (this.explanationBoxEl) this.explanationBoxEl.style.display = 'none';
    } else {
      // Practice mode
      if (this.btnSubmitExam) this.btnSubmitExam.style.display = 'none';
      if (this.btnNextQuestion) {
        this.btnNextQuestion.style.display = 'inline-flex';
        this.btnNextQuestion.innerText = this.currentQuestionIdx === total - 1 ? 'Finish Quiz' : 'Next Question →';
        this.btnNextQuestion.disabled = !answered;
      }
    }

    // Render options
    this.optionsListEl.innerHTML = '';
    const letters = ['A', 'B', 'C', 'D'];

    q.options.forEach((optText, optIdx) => {
      const optEl = document.createElement('div');
      optEl.className = 'quiz-option-item';

      const userChoice = this.userAnswers[this.currentQuestionIdx];

      if (this.quizMode === 'practice' && answered) {
        optEl.classList.add('locked');
        if (optIdx === q.correctIndex) {
          optEl.classList.add('correct');
        } else if (optIdx === userChoice) {
          optEl.classList.add('incorrect');
        }
      } else if (this.quizMode === 'exam' && userChoice === optIdx) {
        optEl.classList.add('selected');
      }

      optEl.innerHTML = `
        <span class="option-letter">${letters[optIdx]}</span>
        <span>${optText}</span>
      `;

      optEl.addEventListener('click', () => {
        if (this.quizMode === 'practice' && answered) return; // locked
        this.handleSelectOption(optIdx);
      });

      this.optionsListEl.appendChild(optEl);
    });

    // Explanation in practice mode
    if (this.quizMode === 'practice' && answered) {
      this.explanationBoxEl.style.display = 'block';
      this.explanationTextEl.innerText = q.explanation || "Correct answer identified.";
    } else {
      this.explanationBoxEl.style.display = 'none';
    }
  }

  handleSelectOption(optionIndex) {
    this.userAnswers[this.currentQuestionIdx] = optionIndex;
    const q = this.quizData.questions[this.currentQuestionIdx];

    if (this.quizMode === 'practice') {
      const isCorrect = optionIndex === q.correctIndex;
      if (isCorrect) {
        window.app.playSound('correct');
        window.app.showToast('Correct! Great job! 🎯', 'success');
      } else {
        window.app.playSound('incorrect');
        window.app.showToast('Not quite! Check the explanation below.', 'info');
      }
    } else {
      window.app.playSound('pop');
    }

    this.renderQuestion();
  }

  finishQuiz() {
    this.stopTimer();

    // Calculate score
    let correctCount = 0;
    this.quizData.questions.forEach((q, idx) => {
      if (this.userAnswers[idx] === q.correctIndex) {
        correctCount++;
      }
    });

    const total = this.quizData.questions.length;
    const scorePct = Math.round((correctCount / total) * 100);

    const currentTopic = this.quizData.title || this.topicInput.value.trim() || 'Practice Quiz';

    // Save to storage
    window.storage.saveQuizResult({
      topic: currentTopic,
      score: scorePct,
      correctCount,
      totalQuestions: total,
      timeSeconds: this.secondsElapsed
    });

    // Record study session to FastAPI SQLite backend (with graceful offline fallback)
    if (typeof recordStudySession === 'function') {
      recordStudySession(currentTopic, 'Quiz', scorePct);
    } else if (window.storage?.recordStudySession) {
      window.storage.recordStudySession(currentTopic, 'Quiz', scorePct);
    }

    // Display Results View
    this.activeCard.style.display = 'none';
    this.resultsCard.style.display = 'block';

    if (this.scoreValEl) this.scoreValEl.innerText = `${scorePct}%`;
    if (this.scoreGradeEl) this.scoreGradeEl.innerText = this.getLetterGrade(scorePct);
    if (this.statCorrectEl) this.statCorrectEl.innerText = correctCount;
    if (this.statIncorrectEl) this.statIncorrectEl.innerText = total - correctCount;

    const mins = Math.floor(this.secondsElapsed / 60);
    const secs = this.secondsElapsed % 60;
    if (this.statTimeEl) this.statTimeEl.innerText = `${mins}m ${secs}s`;

    // Confetti celebration if high score
    if (scorePct >= 70 && window.confetti) {
      window.app.playSound('triumph');
      window.confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
    } else {
      window.app.playSound('chime');
    }

    // Render detailed review list
    this.renderReviewList();
  }

  getLetterGrade(score) {
    if (score >= 95) return 'Grade A+ (Flawless)';
    if (score >= 85) return 'Grade A (Excellent)';
    if (score >= 75) return 'Grade B (Proficient)';
    if (score >= 65) return 'Grade C (Passing)';
    return 'Grade D (Needs Review)';
  }

  renderReviewList() {
    if (!this.reviewQuestionsList) return;
    this.reviewQuestionsList.innerHTML = '';

    const letters = ['A', 'B', 'C', 'D'];

    this.quizData.questions.forEach((q, i) => {
      const userChoice = this.userAnswers[i];
      const isCorrect = userChoice === q.correctIndex;

      const item = document.createElement('div');
      item.className = 'panel-card';
      item.style.minHeight = 'auto';
      item.style.marginBottom = '16px';
      item.style.borderLeft = isCorrect ? '4px solid var(--success)' : '4px solid var(--danger)';

      const userChoiceText = userChoice !== null ? `${letters[userChoice]}. ${q.options[userChoice]}` : 'No answer given';
      const correctChoiceText = `${letters[q.correctIndex]}. ${q.options[q.correctIndex]}`;

      item.innerHTML = `
        <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
          <strong style="color:var(--text-main); font-size:0.95rem;">Q${i + 1}: ${q.question}</strong>
          <span style="font-size:0.8rem; font-weight:700; color:${isCorrect ? 'var(--success)' : 'var(--danger)'};">
            ${isCorrect ? '✅ Correct' : '❌ Missed'}
          </span>
        </div>
        <div style="font-size:0.85rem; margin-bottom:6px;">
          <span style="color:var(--text-muted);">Your Answer: </span>
          <span style="color:${isCorrect ? 'var(--success)' : 'var(--danger)'}; font-weight:600;">${userChoiceText}</span>
        </div>
        ${!isCorrect ? `
          <div style="font-size:0.85rem; margin-bottom:6px;">
            <span style="color:var(--text-muted);">Correct Answer: </span>
            <span style="color:var(--success); font-weight:600;">${correctChoiceText}</span>
          </div>
        ` : ''}
        <div style="background:var(--bg-subtle); padding:10px; border-radius:var(--radius-sm); font-size:0.83rem; margin-top:8px;">
          <strong>Explanation:</strong> ${q.explanation}
        </div>
      `;

      this.reviewQuestionsList.appendChild(item);
    });
  }

  retakeQuiz() {
    this.startQuiz();
  }
}

window.QuizController = QuizController;
