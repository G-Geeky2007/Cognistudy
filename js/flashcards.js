/**
 * COGNISTUDY AI - FLASHCARDS CONTROLLER
 * 3D Interactive Flip Cards, AI Deck Generator, Deck Library & Spaced Repetition Mastery.
 */

class FlashcardsController {
  constructor() {
    this.currentDeck = null;
    this.currentCardIndex = 0;
    this.isFlipped = false;
    this.generatedCardsBuffer = [];

    this.init();
  }

  init() {
    // DOM Elements - Tabs
    this.fcTabs = document.querySelectorAll('.fc-tab-btn');
    this.tabStudy = document.getElementById('fcTabStudy');
    this.tabGenerator = document.getElementById('fcTabGenerator');
    this.tabLibrary = document.getElementById('fcTabLibrary');

    // DOM Elements - Study Area
    this.stageEl = document.getElementById('flashcardStage');
    this.cardFrontText = document.getElementById('cardFrontText');
    this.cardBackText = document.getElementById('cardBackText');
    this.cardCounterEl = document.getElementById('fcCardCounter');
    this.deckTitleDisplayEl = document.getElementById('fcDeckTitleDisplay');
    this.progressFillEl = document.getElementById('fcProgressFill');
    this.masteryRateEl = document.getElementById('fcMasteryRate');
    this.btnPrevCard = document.getElementById('btnPrevCard');
    this.btnNextCard = document.getElementById('btnNextCard');
    this.btnFlipCard = document.getElementById('btnFlipCard');
    this.btnMarkRetry = document.getElementById('btnMarkRetry');
    this.btnMarkMastered = document.getElementById('btnMarkMastered');
    this.btnShuffleDeck = document.getElementById('btnShuffleDeck');
    this.btnRestartDeck = document.getElementById('btnRestartDeck');

    // DOM Elements - Generator
    this.genTopicInput = document.getElementById('fcGenTopicInput');
    this.genCountSelect = document.getElementById('fcGenCountSelect');
    this.genDeckTitleInput = document.getElementById('fcGenDeckTitleInput');
    this.btnGenerateCards = document.getElementById('btnGenerateCards');
    this.genPreviewContainer = document.getElementById('fcGenPreviewContainer');
    this.btnSaveGenDeck = document.getElementById('btnSaveGenDeck');

    // DOM Elements - Library
    this.decksGridEl = document.getElementById('decksGrid');
    this.btnNewManualDeck = document.getElementById('btnNewManualDeck');
    this.importDeckFile = document.getElementById('importDeckFile');

    this.bindEvents();
    this.bindKeyboardShortcuts();
    this.loadInitialDeck();
    this.renderDecksLibrary();
  }

  bindEvents() {
    // Tab switching
    this.fcTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        this.fcTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const targetTab = tab.dataset.targetTab;

        if (this.tabStudy) this.tabStudy.style.display = targetTab === 'study' ? 'block' : 'none';
        if (this.tabGenerator) this.tabGenerator.style.display = targetTab === 'generate' ? 'block' : 'none';
        if (this.tabLibrary) {
          this.tabLibrary.style.display = targetTab === 'library' ? 'block' : 'none';
          if (targetTab === 'library') this.renderDecksLibrary();
        }
      });
    });

    // 3D Card Flip on stage click
    this.stageEl?.addEventListener('click', (e) => {
      // Don't flip if clicking an internal button
      if (e.target.closest('button')) return;
      this.flipCard();
    });

    this.btnFlipCard?.addEventListener('click', () => this.flipCard());

    // Navigation buttons
    this.btnPrevCard?.addEventListener('click', () => this.prevCard());
    this.btnNextCard?.addEventListener('click', () => this.nextCard());

    // Mastery ratings
    this.btnMarkRetry?.addEventListener('click', () => this.recordCardLearning(false));
    this.btnMarkMastered?.addEventListener('click', () => this.recordCardLearning(true));

    // Shuffle & Restart
    this.btnShuffleDeck?.addEventListener('click', () => this.shuffleCurrentDeck());
    this.btnRestartDeck?.addEventListener('click', () => {
      this.currentCardIndex = 0;
      this.isFlipped = false;
      this.updateCardDisplay();
      window.app.showToast('Deck reset to beginning', 'info');
    });

    // Generator events
    this.btnGenerateCards?.addEventListener('click', () => this.handleGenerateCards());
    this.btnSaveGenDeck?.addEventListener('click', () => this.saveGeneratedDeck());

    // Library import
    this.importDeckFile?.addEventListener('change', (e) => this.handleImportDeck(e));
  }

  bindKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Only trigger if in study tab and not typing in an input
      if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
      const isStudyActive = this.tabStudy && this.tabStudy.style.display !== 'none';
      if (!isStudyActive) return;

      if (e.code === 'Space') {
        e.preventDefault();
        this.flipCard();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        if (this.isFlipped) {
          this.recordCardLearning(true);
        } else {
          this.nextCard();
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        if (this.isFlipped) {
          this.recordCardLearning(false);
        } else {
          this.prevCard();
        }
      }
    });
  }

  loadInitialDeck() {
    const decks = window.storage.getDecks();
    if (decks && decks.length > 0) {
      this.loadDeck(decks[0]);
    }
  }

  loadDeck(deck) {
    this.currentDeck = deck;
    this.currentCardIndex = 0;
    this.isFlipped = false;
    this.updateCardDisplay();

    // Switch to study tab
    const studyTabBtn = document.querySelector('[data-target-tab="study"]');
    if (studyTabBtn) studyTabBtn.click();
  }

  updateCardDisplay() {
    if (!this.currentDeck || !this.currentDeck.cards || this.currentDeck.cards.length === 0) {
      if (this.cardFrontText) this.cardFrontText.innerText = "No cards available in this deck.";
      if (this.cardBackText) this.cardBackText.innerText = "Add cards or generate a new deck.";
      return;
    }

    const card = this.currentDeck.cards[this.currentCardIndex];
    if (!card) return;

    // Unflip before changing content
    this.isFlipped = false;
    this.stageEl?.classList.remove('flipped');

    // Update text
    if (this.cardFrontText) this.cardFrontText.innerText = card.front;
    if (this.cardBackText) this.cardBackText.innerText = card.back;
    if (this.deckTitleDisplayEl) this.deckTitleDisplayEl.innerText = this.currentDeck.title;

    // Progress counter
    const total = this.currentDeck.cards.length;
    if (this.cardCounterEl) {
      this.cardCounterEl.innerText = `Card ${this.currentCardIndex + 1} of ${total}`;
    }

    // Progress bar
    const progressPercent = Math.round(((this.currentCardIndex + 1) / total) * 100);
    if (this.progressFillEl) {
      this.progressFillEl.style.width = `${progressPercent}%`;
    }

    // Mastery rate
    const masteredCount = this.currentDeck.cards.filter(c => c.mastered).length;
    const masteryPercent = Math.round((masteredCount / total) * 100);
    if (this.masteryRateEl) {
      this.masteryRateEl.innerText = `${masteryPercent}% Mastered`;
    }

    // Update status border on back of card
    const cardBackEl = document.querySelector('.card-back');
    if (cardBackEl) {
      cardBackEl.style.borderColor = card.mastered ? 'var(--success)' : 'var(--border)';
    }
  }

  flipCard() {
    this.isFlipped = !this.isFlipped;
    if (this.stageEl) {
      this.stageEl.classList.toggle('flipped', this.isFlipped);
    }
    window.app.playSound('swoosh');
  }

  nextCard() {
    if (!this.currentDeck || !this.currentDeck.cards) return;
    if (this.currentCardIndex < this.currentDeck.cards.length - 1) {
      this.currentCardIndex++;
      this.updateCardDisplay();
      window.app.playSound('pop');
    } else {
      window.app.showToast('You reached the end of the deck! 🎉', 'success');
      if (window.confetti) {
        window.confetti({ particleCount: 50, spread: 60, origin: { y: 0.7 } });
      }

      // Record study session to FastAPI SQLite backend (with graceful offline fallback)
      const currentTopic = this.currentDeck?.title || 'Flashcards';
      if (typeof recordStudySession === 'function') {
        recordStudySession(currentTopic, 'Flashcard', null);
      } else if (window.storage?.recordStudySession) {
        window.storage.recordStudySession(currentTopic, 'Flashcard', null);
      }
    }
  }

  prevCard() {
    if (this.currentCardIndex > 0) {
      this.currentCardIndex--;
      this.updateCardDisplay();
      window.app.playSound('pop');
    }
  }

  recordCardLearning(mastered) {
    if (!this.currentDeck || !this.currentDeck.cards) return;
    const card = this.currentDeck.cards[this.currentCardIndex];
    if (!card) return;

    card.mastered = mastered;
    window.storage.saveDeck(this.currentDeck);

    if (mastered) {
      window.storage.incrementStat('cardsMasteredCount', 1);
      window.app.playSound('chime');
      window.app.showToast('Card marked as Mastered! 🌟', 'success');
    } else {
      window.app.playSound('pop');
      window.app.showToast('Added to review queue 🔄', 'info');
    }

    this.nextCard();
  }

  shuffleCurrentDeck() {
    if (!this.currentDeck || !this.currentDeck.cards) return;
    for (let i = this.currentDeck.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.currentDeck.cards[i], this.currentDeck.cards[j]] = [this.currentDeck.cards[j], this.currentDeck.cards[i]];
    }
    this.currentCardIndex = 0;
    this.updateCardDisplay();
    window.app.playSound('swoosh');
    window.app.showToast('Deck shuffled!', 'info');
  }

  // --- GENERATOR LOGIC ---
  prefillGenerator(text) {
    // Switch to generator tab
    const genTabBtn = document.querySelector('[data-target-tab="generate"]');
    if (genTabBtn) genTabBtn.click();

    if (this.genTopicInput) {
      this.genTopicInput.value = text;
    }
    if (this.genDeckTitleInput && !this.genDeckTitleInput.value) {
      const firstLine = text.split('\n')[0].replace(/^#+\s*/, '').trim();
      this.genDeckTitleInput.value = firstLine.substring(0, 30) || "Study Deck";
    }
  }

  async handleGenerateCards() {
    const input = this.genTopicInput.value.trim();
    if (!input) {
      window.app.showToast('Please provide a topic or paste notes', 'warning');
      return;
    }

    const count = parseInt(this.genCountSelect?.value || '5', 10);
    this.btnGenerateCards.disabled = true;
    this.btnGenerateCards.innerHTML = `<span class="spinner" style="width:16px; height:16px;"></span> Generating Cards...`;

    try {
      const cards = await window.ai.generateFlashcards(input, count);
      this.generatedCardsBuffer = cards;
      this.renderGeneratedCardsPreview();
      if (this.btnSaveGenDeck) this.btnSaveGenDeck.style.display = 'inline-flex';
      window.app.playSound('chime');
      window.app.showToast(`Generated ${cards.length} flashcards!`, 'success');
    } catch (err) {
      window.app.showToast(`Generation failed: ${err.message}`, 'error');
    } finally {
      this.btnGenerateCards.disabled = false;
      this.btnGenerateCards.innerHTML = `✨ Generate Flashcards`;
    }
  }

  renderGeneratedCardsPreview() {
    if (!this.genPreviewContainer) return;
    this.genPreviewContainer.innerHTML = '';

    if (this.generatedCardsBuffer.length === 0) {
      this.genPreviewContainer.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem;">No cards generated yet.</p>`;
      return;
    }

    this.generatedCardsBuffer.forEach((card, index) => {
      const cardEl = document.createElement('div');
      cardEl.className = 'panel-card';
      cardEl.style.minHeight = 'auto';
      cardEl.style.padding = '16px';
      cardEl.style.marginBottom = '12px';
      cardEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <strong style="color:var(--primary); font-size:0.85rem;">Card #${index + 1}</strong>
          <button class="message-action-btn btn-del-card" data-idx="${index}" style="color:var(--danger);" title="Remove card">✕</button>
        </div>
        <div style="margin-bottom:8px;">
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Front / Prompt:</div>
          <div style="font-weight:600; font-size:0.95rem;">${card.front}</div>
        </div>
        <div>
          <div style="font-size:0.75rem; color:var(--text-muted); font-weight:600; text-transform:uppercase;">Back / Answer:</div>
          <div style="font-size:0.9rem; color:var(--text-muted);">${card.back}</div>
        </div>
      `;

      cardEl.querySelector('.btn-del-card').addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.dataset.idx, 10);
        this.generatedCardsBuffer.splice(idx, 1);
        this.renderGeneratedCardsPreview();
      });

      this.genPreviewContainer.appendChild(cardEl);
    });
  }

  saveGeneratedDeck() {
    if (this.generatedCardsBuffer.length === 0) {
      window.app.showToast('No cards to save', 'warning');
      return;
    }

    const title = this.genDeckTitleInput.value.trim() || `Study Deck: ${new Date().toLocaleDateString()}`;
    const newDeck = {
      id: 'deck-' + Date.now(),
      title: title,
      description: `Generated deck with ${this.generatedCardsBuffer.length} flashcards`,
      createdAt: Date.now(),
      cards: this.generatedCardsBuffer
    };

    window.storage.saveDeck(newDeck);
    window.storage.recordActivity({
      type: 'flashcards',
      title: title,
      score: `${newDeck.cards.length} cards`
    });

    window.app.showToast('Deck saved to Library! Loading study mode...', 'success');
    this.generatedCardsBuffer = [];
    this.renderGeneratedCardsPreview();
    if (this.btnSaveGenDeck) this.btnSaveGenDeck.style.display = 'none';

    this.loadDeck(newDeck);
  }

  // --- LIBRARY LOGIC ---
  renderDecksLibrary() {
    if (!this.decksGridEl) return;
    const decks = window.storage.getDecks();
    this.decksGridEl.innerHTML = '';

    if (decks.length === 0) {
      this.decksGridEl.innerHTML = `<p style="color:var(--text-muted); grid-column:1/-1;">No flashcard decks found. Create one with AI!</p>`;
      return;
    }

    decks.forEach(deck => {
      const cardCount = deck.cards ? deck.cards.length : 0;
      const mastered = deck.cards ? deck.cards.filter(c => c.mastered).length : 0;
      const masteryPct = cardCount > 0 ? Math.round((mastered / cardCount) * 100) : 0;

      const deckEl = document.createElement('div');
      deckEl.className = 'deck-card';
      deckEl.innerHTML = `
        <div>
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <span class="card-badge" style="background:var(--primary-light); color:var(--primary); font-size:0.7rem;">${cardCount} Cards</span>
            <span style="font-size:0.75rem; color:var(--success); font-weight:700;">${masteryPct}% Mastered</span>
          </div>
          <h5>${deck.title}</h5>
          <p>${deck.description || 'Personal study flashcards deck.'}</p>
        </div>
        <div class="deck-card-footer">
          <button class="btn btn-primary btn-sm btn-study-deck" data-id="${deck.id}">Study Deck</button>
          <div style="display:flex; gap:6px;">
            <button class="icon-btn btn-export-deck" data-id="${deck.id}" style="width:32px; height:32px; font-size:0.8rem;" title="Export Deck JSON">📥</button>
            <button class="icon-btn btn-delete-deck" data-id="${deck.id}" style="width:32px; height:32px; font-size:0.8rem; color:var(--danger);" title="Delete Deck">🗑️</button>
          </div>
        </div>
      `;

      deckEl.querySelector('.btn-study-deck').addEventListener('click', () => {
        this.loadDeck(deck);
      });

      deckEl.querySelector('.btn-export-deck').addEventListener('click', () => {
        const json = JSON.stringify(deck, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${deck.title.replace(/\s+/g, '_')}_Deck.json`;
        a.click();
        URL.revokeObjectURL(url);
        window.app.showToast('Exported deck JSON!', 'info');
      });

      deckEl.querySelector('.btn-delete-deck').addEventListener('click', () => {
        if (confirm(`Delete deck "${deck.title}"?`)) {
          window.storage.deleteDeck(deck.id);
          this.renderDecksLibrary();
          window.app.showToast('Deck deleted', 'info');
        }
      });

      this.decksGridEl.appendChild(deckEl);
    });
  }

  handleImportDeck(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        if (parsed && Array.isArray(parsed.cards)) {
          parsed.id = 'deck-' + Date.now();
          window.storage.saveDeck(parsed);
          this.renderDecksLibrary();
          window.app.showToast(`Imported "${parsed.title}" successfully!`, 'success');
        } else {
          window.app.showToast('Invalid deck JSON format', 'error');
        }
      } catch (err) {
        window.app.showToast('Error parsing deck file: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  }
}

window.FlashcardsController = FlashcardsController;
