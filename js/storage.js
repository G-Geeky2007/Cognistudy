/**
 * COGNISTUDY AI - STORAGE & BACKEND SERVICE
 * Handles persistent state in localStorage and communicates with the Python FastAPI
 * SQLite backend (cognistudy.db) with automatic graceful offline fallbacks.
 */

// Configurable Backend API URL (Replace with Cloudflare Tunnel / ngrok URL when deployed to Vercel)
const BACKEND_URL = "http://localhost:8000";

const STORAGE_KEYS = {
  SETTINGS: 'cogni_settings',
  STATS: 'cogni_stats',
  DECKS: 'cogni_decks',
  QUIZZES: 'cogni_quizzes',
  CHAT: 'cogni_chat',
  HISTORY: 'cogni_history',
};

// Default starter flashcard decks
const STARTER_DECKS = [
  {
    id: 'deck-bio-1',
    title: 'Cellular Biology Fundamentals',
    description: 'Core concepts of cell structure, organelles, ATP, and cellular respiration.',
    category: 'Biology',
    createdAt: Date.now() - 86400000 * 2,
    cards: [
      { id: 'c1', front: 'What is the primary function of the Mitochondria?', back: 'Known as the "powerhouse of the cell", it generates most of the chemical energy needed to power biochemical reactions via ATP synthesis.', mastered: true },
      { id: 'c2', front: 'What is the process of Passive Diffusion?', back: 'Movement of molecules across a cell membrane from high concentration to low concentration without requiring cellular energy.', mastered: false },
      { id: 'c3', front: 'What role do Ribosomes play in a eukaryotic cell?', back: 'Ribosomes translate mRNA sequences into polypeptide amino acid chains (protein synthesis).', mastered: true },
      { id: 'c4', front: 'Explain the difference between Endocytosis and Exocytosis.', back: 'Endocytosis engulfs external substances into the cell via vesicles; Exocytosis exports substances out of the cell.', mastered: false },
      { id: 'c5', front: 'What is Osmosis?', back: 'The spontaneous net movement of solvent molecules (water) through a selectively permeable membrane into a region of higher solute concentration.', mastered: false }
    ]
  },
  {
    id: 'deck-cs-1',
    title: 'Computer Science: Algorithms & Big-O',
    description: 'Time complexity, search algorithms, data structures, and graph theory basics.',
    category: 'Computer Science',
    createdAt: Date.now() - 86400000,
    cards: [
      { id: 'c6', front: 'What is the time complexity of searching in a Balanced Binary Search Tree (AVL / Red-Black)?', back: 'O(log n) for search, insert, and delete operations.', mastered: true },
      { id: 'c7', front: 'What is the primary difference between a Stack and a Queue?', back: 'A Stack follows LIFO (Last In, First Out), while a Queue operates on FIFO (First In, First Out).', mastered: true },
      { id: 'c8', front: 'What is the worst-case time complexity of QuickSort and how can it be avoided?', back: 'Worst case is O(n^2) when pivot is poorest choice. It is avoided using randomized pivot selection or Median-of-Three.', mastered: false },
      { id: 'c9', front: 'How does Dijkstra’s Algorithm determine the shortest path?', back: 'It uses a greedy approach and a min-priority queue to iteratively select the unvisited node with the smallest tentative distance.', mastered: false }
    ]
  },
  {
    id: 'deck-hist-1',
    title: 'World History: Scientific Revolution',
    description: 'Major thinkers, discoveries, and paradigm shifts from 1543 to the Enlightenment.',
    category: 'History',
    createdAt: Date.now(),
    cards: [
      { id: 'c10', front: 'What did Nicolaus Copernicus propose in "De revolutionibus orbium coelestium"?', back: 'The heliocentric model, placing the Sun at the center of the universe rather than the Earth.', mastered: true },
      { id: 'c11', front: 'What was Johannes Kepler’s First Law of Planetary Motion?', back: 'The orbit of a planet is an ellipse with the Sun at one of the two focal points.', mastered: false },
      { id: 'c12', front: 'How did Francis Bacon influence scientific philosophy?', back: 'He established the inductive empirical scientific method (the Baconian method), advocating observation and experimentation over a priori deduction.', mastered: false }
    ]
  }
];

/**
 * Asynchronously records a study session to the FastAPI SQLite backend.
 * Falls back to localStorage if backend or tunnel is unreachable.
 *
 * @param {string} topic - The title of the deck, quiz, or note topic
 * @param {string} activityType - Activity type: 'Quiz', 'Flashcard', or 'Summary'
 * @param {number|null} score - Percentage score (0-100) or null
 * @returns {Promise<{success: boolean, id?: number, offline?: boolean}>}
 */
async function recordStudySession(topic, activityType, score = null) {
  const backendBase = (window.storage && window.storage.getBackendUrl()) || BACKEND_URL;
  const payload = {
    topic: topic || 'General Study',
    activityType: activityType || 'General',
    score: typeof score === 'number' ? Math.round(score) : null
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

    const response = await fetch(`${backendBase}/api/history`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log('✅ [FastAPI Backend] Study session recorded to SQLite:', data);

    // Also mirror to local stats for UI consistency
    if (window.storage) {
      window.storage.recordActivity({
        type: activityType.toLowerCase() === 'flashcard' ? 'flashcards' : activityType.toLowerCase(),
        title: topic,
        score: score !== null ? `${score}%` : null
      });
    }

    return data;
  } catch (err) {
    console.warn(`⚠️ [FastAPI Backend Offline] Unable to reach ${backendBase}/api/history (${err.message}). Saving to localStorage.`);
    // Fallback: persist into local storage
    if (window.storage) {
      return window.storage.recordLocalStudySession(payload.topic, payload.activityType, payload.score);
    }
    return { success: true, offline: true };
  }
}

/**
 * Asynchronously fetches study history from the FastAPI SQLite backend.
 * Falls back to localStorage if backend or tunnel is unreachable.
 *
 * @returns {Promise<Array<{id: number, topic: string, activity_type: string, score: number|null, studied_at: string}>>}
 */
async function getStudyHistory() {
  const backendBase = (window.storage && window.storage.getBackendUrl()) || BACKEND_URL;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(`${backendBase}/api/history`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`✅ [FastAPI Backend] Retrieved ${data.length} records from SQLite.`);
    return data;
  } catch (err) {
    console.warn(`⚠️ [FastAPI Backend Offline] Unable to fetch from ${backendBase}/api/history (${err.message}). Returning localStorage records.`);
    if (window.storage) {
      return window.storage.getLocalStudyHistory();
    }
    return [];
  }
}

class StorageService {
  constructor() {
    this.init();
  }

  init() {
    // Initialize settings if empty or migrate
    const existingSettings = this.getSettings();
    const validModels = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
    if (!localStorage.getItem(STORAGE_KEYS.SETTINGS)) {
      this.saveSettings({
        apiKey: '',
        model: 'gemini-3.8-flash',
        soundEnabled: true,
        theme: 'dark',
        autoSpeech: false,
        backendUrl: BACKEND_URL,
      });
    } else if (!validModels.includes(existingSettings.model)) {
      this.saveSettings({ model: 'gemini-3.8-flash' });
    }

    // Initialize stats if empty
    if (!localStorage.getItem(STORAGE_KEYS.STATS)) {
      this.saveStats({
        streakDays: 3,
        lastStudyDate: new Date().toDateString(),
        cardsMasteredCount: 5,
        quizzesTakenCount: 4,
        averageQuizScore: 88,
        notesSummarizedCount: 2,
        recentActivity: [
          { type: 'quiz', title: 'Calculus: Derivatives & Limits', score: '90%', timestamp: Date.now() - 3600000 * 4 },
          { type: 'flashcards', title: 'Cellular Biology Fundamentals', score: '3 cards reviewed', timestamp: Date.now() - 3600000 * 20 },
          { type: 'summary', title: 'Photosynthesis Light Reactions', timestamp: Date.now() - 3600000 * 30 }
        ]
      });
    }

    // Initialize starter decks if empty
    if (!localStorage.getItem(STORAGE_KEYS.DECKS)) {
      this.saveDecks(STARTER_DECKS);
    }

    this.checkAndUpdateStreak();
  }

  // --- BACKEND URL RESOLUTION ---
  getBackendUrl() {
    const settings = this.getSettings();
    if (settings.backendUrl && settings.backendUrl.trim()) {
      return settings.backendUrl.trim().replace(/\/$/, '');
    }
    if (window.location && window.location.hostname === '127.0.0.1') {
      return 'http://127.0.0.1:8000';
    }
    return BACKEND_URL;
  }

  // --- SETTINGS ---
  getSettings() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.SETTINGS)) || {};
    } catch {
      return {};
    }
  }

  saveSettings(settings) {
    const current = this.getSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
    return updated;
  }

  // --- STATS & STREAK ---
  getStats() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.STATS)) || {};
    } catch {
      return {};
    }
  }

  saveStats(stats) {
    localStorage.setItem(STORAGE_KEYS.STATS, JSON.stringify(stats));
  }

  checkAndUpdateStreak() {
    const stats = this.getStats();
    const today = new Date().toDateString();
    if (!stats.lastStudyDate) {
      stats.lastStudyDate = today;
      stats.streakDays = 1;
      this.saveStats(stats);
      return;
    }

    const last = new Date(stats.lastStudyDate);
    const now = new Date(today);
    const diffTime = Math.abs(now - last);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays === 1) {
      stats.streakDays = (stats.streakDays || 1) + 1;
      stats.lastStudyDate = today;
      this.saveStats(stats);
    } else if (diffDays > 1) {
      stats.streakDays = 1;
      stats.lastStudyDate = today;
      this.saveStats(stats);
    }
  }

  recordActivity(activity) {
    const stats = this.getStats();
    if (!stats.recentActivity) stats.recentActivity = [];
    stats.recentActivity.unshift({
      ...activity,
      timestamp: Date.now()
    });
    // Keep max 20 recent items
    if (stats.recentActivity.length > 20) {
      stats.recentActivity = stats.recentActivity.slice(0, 20);
    }
    this.saveStats(stats);
  }

  incrementStat(statKey, incrementBy = 1) {
    const stats = this.getStats();
    stats[statKey] = (stats[statKey] || 0) + incrementBy;
    this.saveStats(stats);
    return stats[statKey];
  }

  // --- OFFLINE STUDY HISTORY FALLBACK ---
  recordLocalStudySession(topic, activityType, score = null) {
    const history = this.getLocalStudyHistory();
    const newRecord = {
      id: Date.now(),
      topic: topic,
      activity_type: activityType,
      score: score,
      studied_at: new Date().toISOString()
    };
    history.unshift(newRecord);
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history.slice(0, 50)));

    this.recordActivity({
      type: activityType.toLowerCase() === 'flashcard' ? 'flashcards' : activityType.toLowerCase(),
      title: topic,
      score: score !== null ? `${score}%` : null
    });

    return { success: true, id: newRecord.id, offline: true };
  }

  getLocalStudyHistory() {
    try {
      const records = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY));
      if (Array.isArray(records) && records.length > 0) return records;

      // Seed with initial activity if empty
      const stats = this.getStats();
      if (stats.recentActivity && stats.recentActivity.length > 0) {
        return stats.recentActivity.map((a, i) => ({
          id: i + 1,
          topic: a.title,
          activity_type: a.type === 'quiz' ? 'Quiz' : (a.type === 'summary' ? 'Summary' : 'Flashcard'),
          score: a.score ? parseInt(a.score, 10) || null : null,
          studied_at: new Date(a.timestamp || Date.now()).toISOString()
        }));
      }
      return [];
    } catch {
      return [];
    }
  }

  recordStudySession(topic, activityType, score = null) {
    return recordStudySession(topic, activityType, score);
  }

  getStudyHistory() {
    return getStudyHistory();
  }

  // --- FLASHCARD DECKS ---
  getDecks() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.DECKS)) || [];
    } catch {
      return [];
    }
  }

  saveDecks(decks) {
    localStorage.setItem(STORAGE_KEYS.DECKS, JSON.stringify(decks));
  }

  getDeckById(id) {
    const decks = this.getDecks();
    return decks.find(d => d.id === id);
  }

  saveDeck(deck) {
    const decks = this.getDecks();
    const index = decks.findIndex(d => d.id === deck.id);
    if (index >= 0) {
      decks[index] = deck;
    } else {
      decks.unshift(deck);
    }
    this.saveDecks(decks);
    return deck;
  }

  deleteDeck(id) {
    const decks = this.getDecks().filter(d => d.id !== id);
    this.saveDecks(decks);
  }

  toggleCardMastery(deckId, cardId, isMastered) {
    const deck = this.getDeckById(deckId);
    if (!deck) return;
    const card = deck.cards.find(c => c.id === cardId);
    if (card) {
      card.mastered = isMastered !== undefined ? isMastered : !card.mastered;
      this.saveDeck(deck);
      if (card.mastered) {
        this.incrementStat('cardsMasteredCount', 1);
      }
    }
  }

  // --- QUIZZES ---
  getQuizHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.QUIZZES)) || [];
    } catch {
      return [];
    }
  }

  saveQuizResult(result) {
    const history = this.getQuizHistory();
    history.unshift({
      ...result,
      id: 'quiz-' + Date.now(),
      date: new Date().toISOString()
    });
    localStorage.setItem(STORAGE_KEYS.QUIZZES, JSON.stringify(history.slice(0, 30)));
    
    // update stats
    this.incrementStat('quizzesTakenCount', 1);

    const stats = this.getStats();
    const allScores = history.map(h => h.score || 0);
    stats.averageQuizScore = Math.round(allScores.reduce((a, b) => a + b, 0) / allScores.length);
    this.saveStats(stats);
  }

  // --- CHAT HISTORY ---
  getChatHistory() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.CHAT)) || [];
    } catch {
      return [];
    }
  }

  saveChatHistory(messages) {
    localStorage.setItem(STORAGE_KEYS.CHAT, JSON.stringify(messages.slice(-50)));
  }

  clearChatHistory() {
    localStorage.removeItem(STORAGE_KEYS.CHAT);
  }
}

// Export singleton instance and standalone methods to window
window.BACKEND_URL = BACKEND_URL;
window.recordStudySession = recordStudySession;
window.getStudyHistory = getStudyHistory;
window.storage = new StorageService();
