/**
 * COGNISTUDY AI - MAIN APPLICATION COORDINATOR
 * Manages routing, sound synthesis, theme toggling, settings modal, and dashboard stats.
 */

class AppCoordinator {
  constructor() {
    window.app = this; // Ensure singleton reference is immediately available
    this.currentView = 'dashboard';
    this.audioCtx = null;
    this.isMuted = false;

    this.init();
  }

  init() {
    // Topbar & Navigation
    this.navLinks = document.querySelectorAll('.nav-link');
    this.viewSections = document.querySelectorAll('.view-section');
    this.viewTitleEl = document.getElementById('viewTitle');
    this.viewSubtitleEl = document.getElementById('viewSubtitle');
    this.menuToggleEl = document.getElementById('menuToggle');
    this.sidebarEl = document.getElementById('sidebar');

    // Theme & Audio toggles
    this.btnThemeToggle = document.getElementById('btnThemeToggle');
    this.btnAudioToggle = document.getElementById('btnAudioToggle');
    this.btnSettingsTrigger = document.getElementById('btnSettingsTrigger');
    this.modePillEl = document.getElementById('modeIndicatorPill');

    // Settings Modal
    this.settingsModal = document.getElementById('settingsModal');
    this.btnCloseModal = document.getElementById('btnCloseModal');
    this.apiKeyInput = document.getElementById('settingApiKey');
    this.modelSelect = document.getElementById('settingModel');
    this.backendUrlInput = document.getElementById('settingBackendUrl');
    this.soundCheckbox = document.getElementById('settingSound');
    this.btnSaveSettings = document.getElementById('btnSaveSettings');
    this.btnTestApiKey = document.getElementById('btnTestApiKey');
    this.btnClearAllData = document.getElementById('btnClearAllData');

    // Toast container
    this.toastContainer = document.getElementById('toastContainer');

    // Initialize sub-controllers
    if (window.TutorController) window.tutorController = new window.TutorController();
    if (window.SummarizerController) window.summarizerController = new window.SummarizerController();
    if (window.FlashcardsController) window.flashcardsController = new window.FlashcardsController();
    if (window.QuizController) window.quizController = new window.QuizController();

    this.bindEvents();
    this.loadSettings();
    this.updateDashboardStats();
    this.updateApiStatusBadge();
  }

  bindEvents() {
    // Navigation links
    this.navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const targetView = link.dataset.view;
        this.switchView(targetView);
        if (window.innerWidth <= 768) {
          this.sidebarEl?.classList.remove('open');
        }
      });
    });

    // Mobile menu toggle
    this.menuToggleEl?.addEventListener('click', () => {
      this.sidebarEl?.classList.toggle('open');
    });

    // Dashboard tool card clicks
    document.querySelectorAll('[data-launch-view]').forEach(card => {
      card.addEventListener('click', () => {
        const view = card.dataset.launchView;
        this.switchView(view);
      });
    });

    // Theme Toggle
    this.btnThemeToggle?.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
      this.setTheme(nextTheme);
      window.storage.saveSettings({ theme: nextTheme });
      this.playSound('pop');
    });

    // Audio Toggle
    this.btnAudioToggle?.addEventListener('click', () => {
      this.isMuted = !this.isMuted;
      this.updateAudioButtonState();
      window.storage.saveSettings({ soundEnabled: !this.isMuted });
      this.showToast(this.isMuted ? 'Sound muted 🔇' : 'Sound enabled 🔊', 'info');
    });

    // Settings Modal Triggers
    this.btnSettingsTrigger?.addEventListener('click', () => this.openSettingsModal());
    this.modePillEl?.addEventListener('click', () => this.openSettingsModal());
    this.btnCloseModal?.addEventListener('click', () => this.closeSettingsModal());
    this.settingsModal?.addEventListener('click', (e) => {
      if (e.target === this.settingsModal) this.closeSettingsModal();
    });

    // Save Settings
    this.btnSaveSettings?.addEventListener('click', () => {
      const apiKey = this.apiKeyInput.value.trim();
      const model = this.modelSelect.value;
      const soundEnabled = this.soundCheckbox.checked;
      const backendUrl = this.backendUrlInput ? this.backendUrlInput.value.trim() : undefined;

      window.storage.saveSettings({ apiKey, model, soundEnabled, backendUrl });
      this.isMuted = !soundEnabled;
      this.updateAudioButtonState();
      this.updateApiStatusBadge();
      this.closeSettingsModal();
      this.playSound('chime');
      this.showToast('Settings saved successfully!', 'success');
      this.updateDashboardStats();
    });

    // Test API Key
    this.btnTestApiKey?.addEventListener('click', async () => {
      const key = this.apiKeyInput.value.trim();
      if (!key) {
        this.showToast('Please enter an API key to test', 'warning');
        return;
      }
      this.btnTestApiKey.disabled = true;
      this.btnTestApiKey.innerHTML = `<span class="spinner" style="width:14px; height:14px;"></span> Testing...`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort(new Error('Connection timed out'));
        }, 20000);

        // Validate key using Google's lightweight models endpoint (instant response, no generation lag)
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          this.showToast('API Key verified successfully! 🟢', 'success');
          this.playSound('correct');
        } else {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error?.message || `HTTP ${res.status}`);
        }
      } catch (err) {
        let errorMsg = err.message || 'Validation failed';
        if (err.name === 'AbortError' || errorMsg.includes('aborted') || errorMsg.includes('timed out')) {
          errorMsg = 'Connection timed out (20s). Please check your internet connection or proxy.';
        }
        this.showToast(`Key validation failed: ${errorMsg}`, 'error');
        this.playSound('incorrect');
      } finally {
        this.btnTestApiKey.disabled = false;
        this.btnTestApiKey.innerHTML = `Test Key Connection`;
      }
    });

    // Clear all storage
    this.btnClearAllData?.addEventListener('click', () => {
      if (confirm('Are you sure you want to clear all data, decks, quizzes, and chat history?')) {
        localStorage.clear();
        location.reload();
      }
    });
  }

  switchView(viewName) {
    this.currentView = viewName;

    // Update nav links
    this.navLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.view === viewName);
    });

    // Show active section
    this.viewSections.forEach(section => {
      const matches = section.id === `view-${viewName}`;
      section.classList.toggle('active', matches);
    });

    // Header title mapping
    const titles = {
      dashboard: { title: "Study Dashboard", sub: "Track your learning velocity, streak, and quick launch study tools." },
      tutor: { title: "AI Study Tutor", sub: "Interactive multimodal conversational tutor with specialized learning personas." },
      summarizer: { title: "Note Summarizer", sub: "Distill lecture notes into high-yield TL;DRs, glossaries, and flashcards." },
      flashcards: { title: "Flash Cards & Spaced Repetition", sub: "Interactive 3D flip card decks and AI automated card generation." },
      quiz: { title: "Practice Quiz Creator", sub: "Customizable multiple-choice tests with instant reasoning explanations." },
      settings: { title: "Application Settings", sub: "Configure Gemini API keys, theme styling, sound, and data backup." }
    };

    const currentMeta = titles[viewName] || titles.dashboard;
    if (this.viewTitleEl) this.viewTitleEl.innerText = currentMeta.title;
    if (this.viewSubtitleEl) this.viewSubtitleEl.innerText = currentMeta.sub;

    if (viewName === 'dashboard') {
      this.updateDashboardStats();
    }

    this.playSound('pop');
  }

  loadSettings() {
    const settings = window.storage.getSettings();
    if (settings.theme) {
      this.setTheme(settings.theme);
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      this.setTheme(prefersDark ? 'dark' : 'light');
    }

    this.isMuted = settings.soundEnabled === false;
    this.updateAudioButtonState();
  }

  setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    if (this.btnThemeToggle) {
      this.btnThemeToggle.innerHTML = theme === 'dark' ? '☀️' : '🌙';
      this.btnThemeToggle.title = `Switch to ${theme === 'dark' ? 'Light' : 'Dark'} mode`;
    }
  }

  updateAudioButtonState() {
    if (this.btnAudioToggle) {
      this.btnAudioToggle.innerHTML = this.isMuted ? '🔇' : '🔊';
      this.btnAudioToggle.title = this.isMuted ? 'Unmute Sound Effects' : 'Mute Sound Effects';
    }
  }

  updateApiStatusBadge() {
    const isLive = window.ai.isUsingLiveAPI();
    const dot = document.querySelector('.status-dot');
    const label = document.getElementById('modeStatusLabel');

    if (dot && label) {
      if (isLive) {
        dot.className = 'status-dot active-api';
        label.innerText = 'Gemini Live API';
      } else {
        dot.className = 'status-dot offline';
        label.innerText = 'Smart Offline AI';
      }
    }
  }

  openSettingsModal() {
    const settings = window.storage.getSettings();
    if (this.apiKeyInput) this.apiKeyInput.value = settings.apiKey || '';
    if (this.modelSelect) this.modelSelect.value = settings.model || 'gemini-3.8-flash';
    if (this.backendUrlInput) this.backendUrlInput.value = settings.backendUrl || window.BACKEND_URL || 'http://localhost:8000';
    if (this.soundCheckbox) this.soundCheckbox.checked = settings.soundEnabled !== false;

    this.settingsModal?.classList.add('active');
  }

  closeSettingsModal() {
    this.settingsModal?.classList.remove('active');
  }

  async updateDashboardStats() {
    const stats = window.storage.getStats();
    const decks = window.storage.getDecks();

    // Streak
    const streakVal = document.getElementById('statStreakVal');
    const streakSidebar = document.getElementById('sidebarStreakVal');
    if (streakVal) streakVal.innerText = stats.streakDays || 1;
    if (streakSidebar) streakSidebar.innerText = `${stats.streakDays || 1} Day Streak`;

    // Cards Mastered
    let totalMastered = 0;
    decks.forEach(d => {
      if (d.cards) totalMastered += d.cards.filter(c => c.mastered).length;
    });
    const cardsMasteredEl = document.getElementById('statCardsMasteredVal');
    if (cardsMasteredEl) cardsMasteredEl.innerText = totalMastered;

    // Quizzes completed
    const quizzesVal = document.getElementById('statQuizzesVal');
    if (quizzesVal) quizzesVal.innerText = stats.quizzesTakenCount || 0;

    // Average Score
    const avgScoreVal = document.getElementById('statAvgScoreVal');
    if (avgScoreVal) avgScoreVal.innerText = `${stats.averageQuizScore || 85}%`;

    // Badges in sidebar
    const deckCountBadge = document.getElementById('sidebarDecksBadge');
    if (deckCountBadge) deckCountBadge.innerText = decks.length;

    // Recent Activity List (Fetches from FastAPI SQLite backend, falls back to localStorage)
    const activityList = document.getElementById('recentActivityList');
    if (activityList) {
      let historyItems = [];
      try {
        if (typeof getStudyHistory === 'function') {
          historyItems = await getStudyHistory();
        }
      } catch (e) {
        historyItems = [];
      }

      activityList.innerHTML = '';
      if (!historyItems || historyItems.length === 0) {
        if (stats.recentActivity && stats.recentActivity.length > 0) {
          historyItems = stats.recentActivity.map(a => ({
            topic: a.title,
            activity_type: a.type === 'quiz' ? 'Quiz' : (a.type === 'summary' ? 'Summary' : 'Flashcard'),
            score: a.score ? parseInt(a.score, 10) || null : null,
            studied_at: a.timestamp ? new Date(a.timestamp).toISOString() : new Date().toISOString()
          }));
        }
      }

      if (!historyItems || historyItems.length === 0) {
        activityList.innerHTML = `<li style="color:var(--text-muted); font-size:0.85rem; padding:8px;">No study activity recorded yet today.</li>`;
        return;
      }

      historyItems.slice(0, 5).forEach(act => {
        const item = document.createElement('li');
        item.className = 'activity-item';

        const typeLower = (act.activity_type || '').toLowerCase();
        let icon = '📖';
        let badgeColor = 'var(--primary-light)';
        if (typeLower === 'quiz') { icon = '🎯'; badgeColor = 'var(--success-light)'; }
        else if (typeLower === 'flashcard' || typeLower === 'flashcards') { icon = '🗂️'; badgeColor = 'var(--accent-light)'; }
        else if (typeLower === 'summary') { icon = '📝'; badgeColor = 'var(--info-light)'; }

        const dateObj = act.studied_at ? new Date(act.studied_at) : new Date();
        const timeStr = !isNaN(dateObj) ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently';

        item.innerHTML = `
          <div class="activity-badge" style="background:${badgeColor};">${icon}</div>
          <div class="activity-details">
            <h5>${act.topic}</h5>
            <span>${timeStr} ${act.score !== null && act.score !== undefined ? '• Score: ' + act.score + '%' : ''}</span>
          </div>
        `;
        activityList.appendChild(item);
      });
    }
  }

  // --- NATIVE WEB AUDIO SYNTHESIZER ---
  playSound(type) {
    if (this.isMuted) return;

    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      if (!this.audioCtx) this.audioCtx = new AudioCtx();
      if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

      const now = this.audioCtx.currentTime;

      if (type === 'pop') {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.05);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.05);
      } else if (type === 'swoosh') {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(320, now);
        osc.frequency.exponentialRampToValueAtTime(640, now + 0.12);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === 'correct') {
        // High major chord chime
        [523.25, 659.25, 783.99].forEach((freq, i) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + i * 0.07);
          gain.gain.setValueAtTime(0.15, now + i * 0.07);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.07 + 0.3);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now + i * 0.07);
          osc.stop(now + i * 0.07 + 0.3);
        });
      } else if (type === 'incorrect') {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(260, now);
        osc.frequency.exponentialRampToValueAtTime(190, now + 0.2);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === 'chime') {
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(659.25, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now);
        osc.stop(now + 0.35);
      } else if (type === 'triumph') {
        // Fanfare chord
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
          const osc = this.audioCtx.createOscillator();
          const gain = this.audioCtx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + i * 0.09);
          gain.gain.setValueAtTime(0.2, now + i * 0.09);
          gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.09 + 0.5);
          osc.connect(gain);
          gain.connect(this.audioCtx.destination);
          osc.start(now + i * 0.09);
          osc.stop(now + i * 0.09 + 0.5);
        });
      }
    } catch {
      // Audio autoplay policy fallback
    }
  }

  showToast(message, type = 'info') {
    if (!this.toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '⚠️';
    if (type === 'warning') icon = '🔔';

    toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
    this.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }
}

// Instantiate on DOM load
document.addEventListener('DOMContentLoaded', () => {
  window.app = new AppCoordinator();
});
