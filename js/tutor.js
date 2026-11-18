/**
 * COGNISTUDY AI - STUDY TUTOR CHAT CONTROLLER
 * Persona-driven AI tutor with markdown, voice dictation, read aloud, and export.
 */

class TutorController {
  constructor() {
    this.messages = [];
    this.currentPersona = 'socratic';
    this.isGenerating = false;
    this.recognition = null;
    this.isRecording = false;

    this.init();
  }

  init() {
    this.chatMessagesEl = document.getElementById('chatMessages');
    this.chatInputEl = document.getElementById('chatInput');
    this.btnSendEl = document.getElementById('btnSend');
    this.btnMicEl = document.getElementById('btnMic');
    this.btnClearChatEl = document.getElementById('btnClearChat');
    this.btnExportChatEl = document.getElementById('btnExportChat');
    this.personaButtons = document.querySelectorAll('.persona-btn');
    this.promptChips = document.querySelectorAll('.prompt-chip');

    this.bindEvents();
    this.initSpeechRecognition();
    this.loadHistory();
  }

  bindEvents() {
    // Send message on Enter (Shift+Enter for new line)
    this.chatInputEl?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    // Auto resize input
    this.chatInputEl?.addEventListener('input', () => {
      this.chatInputEl.style.height = 'auto';
      this.chatInputEl.style.height = Math.min(this.chatInputEl.scrollHeight, 120) + 'px';
      this.btnSendEl.disabled = !this.chatInputEl.value.trim() || this.isGenerating;
    });

    this.btnSendEl?.addEventListener('click', () => this.handleSend());

    // Clear chat
    this.btnClearChatEl?.addEventListener('click', () => {
      if (confirm('Clear entire conversation history?')) {
        this.messages = [];
        window.storage.clearChatHistory();
        this.renderWelcomeMessage();
        window.app.showToast('Chat history cleared', 'info');
      }
    });

    // Export chat
    this.btnExportChatEl?.addEventListener('click', () => this.exportChat());

    // Persona buttons
    this.personaButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        this.personaButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.currentPersona = btn.dataset.persona;
        window.app.playSound('click');
        window.app.showToast(`Tutor mode set to ${btn.innerText.trim()}`, 'info');
      });
    });

    // Prompt chips
    this.promptChips.forEach(chip => {
      chip.addEventListener('click', () => {
        this.chatInputEl.value = chip.innerText.trim();
        this.chatInputEl.focus();
        this.chatInputEl.dispatchEvent(new Event('input'));
      });
    });

    // Voice dictation
    this.btnMicEl?.addEventListener('click', () => this.toggleVoiceDictation());
  }

  initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.recognition = new SpeechRecognition();
      this.recognition.continuous = false;
      this.recognition.interimResults = false;
      this.recognition.lang = 'en-US';

      this.recognition.onstart = () => {
        this.isRecording = true;
        this.btnMicEl?.classList.add('recording');
        window.app.showToast('Listening... Speak into your microphone', 'info');
      };

      this.recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          this.chatInputEl.value = (this.chatInputEl.value ? this.chatInputEl.value + ' ' : '') + transcript;
          this.chatInputEl.dispatchEvent(new Event('input'));
        }
      };

      this.recognition.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        this.stopRecording();
        window.app.showToast('Microphone error: ' + event.error, 'error');
      };

      this.recognition.onend = () => {
        this.stopRecording();
      };
    } else {
      if (this.btnMicEl) this.btnMicEl.style.display = 'none';
    }
  }

  toggleVoiceDictation() {
    if (!this.recognition) return;
    if (this.isRecording) {
      this.recognition.stop();
      this.stopRecording();
    } else {
      try {
        this.recognition.start();
      } catch (e) {
        console.error(e);
      }
    }
  }

  stopRecording() {
    this.isRecording = false;
    this.btnMicEl?.classList.remove('recording');
  }

  loadHistory() {
    const saved = window.storage.getChatHistory();
    if (saved && saved.length > 0) {
      this.messages = saved;
      this.renderAllMessages();
    } else {
      this.renderWelcomeMessage();
    }
  }

  renderWelcomeMessage() {
    this.chatMessagesEl.innerHTML = '';
    const welcomeText = `👋 Hello! I am your **AI Study Tutor**.

Choose your preferred tutoring persona above:
- **🎓 Socratic**: I'll guide you step-by-step with targeted questions.
- **💡 Feynman**: I'll explain complex topics using vivid metaphors and zero jargon.
- **⚡ Exam Cram**: Quick facts, high-yield drill formulas, and bullet summaries.
- **🔬 STEM / Code**: Detailed derivations, LaTeX math, and code explanations.

What topic, problem, or study question would you like to tackle today?`;

    this.appendMessageElement({
      sender: 'assistant',
      text: welcomeText,
      timestamp: Date.now()
    }, false);
  }

  async handleSend() {
    const text = this.chatInputEl.value.trim();
    if (!text || this.isGenerating) return;

    // Reset input
    this.chatInputEl.value = '';
    this.chatInputEl.style.height = 'auto';
    this.btnSendEl.disabled = true;

    // Append user message
    const userMsg = {
      sender: 'user',
      text: text,
      timestamp: Date.now()
    };
    this.messages.push(userMsg);
    this.appendMessageElement(userMsg);
    window.app.playSound('pop');

    // Create live streaming placeholder bubble
    const assistantItem = document.createElement('div');
    assistantItem.className = 'message-item assistant';
    assistantItem.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-content" style="flex:1;">
        <div class="message-bubble">
          <span class="spinner spinner-primary" style="width:14px; height:14px; margin-right:8px; vertical-align:middle;"></span>
          <span style="font-size:0.88rem; color:var(--text-muted);">Tutor is thinking...</span>
        </div>
      </div>
    `;
    this.chatMessagesEl.appendChild(assistantItem);
    this.scrollToBottom();
    this.isGenerating = true;

    const bubbleEl = assistantItem.querySelector('.message-bubble');
    let accumulatedText = '';
    let hasStartedStreaming = false;

    try {
      const finalText = await window.ai.chatWithTutorStream(
        text,
        this.currentPersona,
        this.messages,
        (currentStreamText) => {
          accumulatedText = currentStreamText;
          if (!hasStartedStreaming) {
            hasStartedStreaming = true;
          }
          if (bubbleEl) {
            bubbleEl.innerHTML = this.formatMarkdownAndMath(accumulatedText) + '<span class="streaming-cursor">▌</span>';
            this.scrollToBottom();
          }
        }
      );

      const resolvedText = finalText || accumulatedText || "I'm sorry, I couldn't generate a response.";
      if (bubbleEl) {
        bubbleEl.innerHTML = this.formatMarkdownAndMath(resolvedText);
      }

      // Add message meta toolbar
      const formattedTime = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const contentEl = assistantItem.querySelector('.message-content');
      if (contentEl) {
        const metaEl = document.createElement('div');
        metaEl.className = 'message-meta';
        metaEl.innerHTML = `
          <span>${formattedTime}</span>
          <button class="message-action-btn btn-copy" title="Copy response">📋</button>
          <button class="message-action-btn btn-speak" title="Read aloud">🔊</button>
        `;
        metaEl.querySelector('.btn-copy')?.addEventListener('click', () => {
          navigator.clipboard.writeText(resolvedText);
          window.app.showToast('Copied to clipboard!', 'info');
        });
        metaEl.querySelector('.btn-speak')?.addEventListener('click', () => {
          this.speakText(resolvedText);
        });
        contentEl.appendChild(metaEl);
      }

      const assistantMsg = {
        sender: 'assistant',
        text: resolvedText,
        persona: this.currentPersona,
        timestamp: Date.now()
      };
      this.messages.push(assistantMsg);
      window.storage.saveChatHistory(this.messages);
      window.app.playSound('flip');

      const settings = window.storage.getSettings();
      if (settings.autoSpeech) {
        this.speakText(resolvedText);
      }
    } catch (err) {
      if (bubbleEl) {
        bubbleEl.innerHTML = `⚠️ **Error**: ${err.message}`;
      }
    } finally {
      this.isGenerating = false;
      this.btnSendEl.disabled = !this.chatInputEl.value.trim();
      this.scrollToBottom();
    }
  }

  showTypingIndicator(id) {
    const el = document.createElement('div');
    el.id = id;
    el.className = 'message-item assistant';
    el.innerHTML = `
      <div class="message-avatar">🤖</div>
      <div class="message-bubble" style="display:flex; align-items:center; gap:8px;">
        <span class="spinner spinner-primary" style="width:16px; height:16px;"></span>
        <span style="font-size:0.85rem; color:var(--text-muted);">Tutor is thinking...</span>
      </div>
    `;
    this.chatMessagesEl.appendChild(el);
    this.scrollToBottom();
  }

  removeTypingIndicator(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }

  renderAllMessages() {
    this.chatMessagesEl.innerHTML = '';
    this.messages.forEach(msg => this.appendMessageElement(msg, false));
    this.scrollToBottom();
  }

  appendMessageElement(msg, scroll = true) {
    const item = document.createElement('div');
    item.className = `message-item ${msg.sender}`;

    const formattedTime = new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const parsedContent = this.formatMarkdownAndMath(msg.text);

    item.innerHTML = `
      <div class="message-avatar">${msg.sender === 'user' ? '👤' : '🤖'}</div>
      <div class="message-content" style="flex:1;">
        <div class="message-bubble">${parsedContent}</div>
        <div class="message-meta">
          <span>${formattedTime}</span>
          ${msg.sender === 'assistant' ? `
            <button class="message-action-btn btn-copy" title="Copy response">📋</button>
            <button class="message-action-btn btn-speak" title="Read aloud">🔊</button>
          ` : ''}
        </div>
      </div>
    `;

    // Add action listeners
    const copyBtn = item.querySelector('.btn-copy');
    if (copyBtn) {
      copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(msg.text);
        window.app.showToast('Copied to clipboard!', 'info');
      });
    }

    const speakBtn = item.querySelector('.btn-speak');
    if (speakBtn) {
      speakBtn.addEventListener('click', () => this.speakText(msg.text));
    }

    this.chatMessagesEl.appendChild(item);
    if (scroll) this.scrollToBottom();
  }

  formatMarkdownAndMath(rawText) {
    if (!rawText) return '';
    let parsed = rawText;

    // Use marked if available
    if (window.marked) {
      try {
        parsed = window.marked.parse(parsed);
      } catch (e) {
        console.warn('Marked parse error', e);
      }
    } else {
      // Basic markdown replacement fallback
      parsed = parsed
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\n/g, '<br>');
    }

    // Render LaTeX Math if KaTeX is loaded
    if (window.katex) {
      // Replace block math $$...$$
      parsed = parsed.replace(/\$\$([\s\S]*?)\$\$/g, (match, formula) => {
        try {
          return window.katex.renderToString(formula.trim(), { displayMode: true, throwOnError: false });
        } catch {
          return match;
        }
      });

      // Replace inline math $...$
      parsed = parsed.replace(/\$([^\$\n]+?)\$/g, (match, formula) => {
        try {
          return window.katex.renderToString(formula.trim(), { displayMode: false, throwOnError: false });
        } catch {
          return match;
        }
      });
    }

    return parsed;
  }

  speakText(text) {
    if (!('speechSynthesis' in window)) {
      window.app.showToast('Speech synthesis not supported on this browser', 'error');
      return;
    }
    window.speechSynthesis.cancel(); // Stop any existing speech

    // Strip markdown formatting for cleaner audio
    const plainText = text
      .replace(/[*_#`$]/g, '')
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')
      .replace(/<[^>]+>/g, '');

    const utterance = new SpeechSynthesisUtterance(plainText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    window.speechSynthesis.speak(utterance);
    window.app.showToast('Reading response aloud...', 'info');
  }

  exportChat() {
    if (this.messages.length === 0) {
      window.app.showToast('No messages to export', 'warning');
      return;
    }

    let markdown = `# CogniStudy AI Tutor - Chat Transcript\n*Exported on: ${new Date().toLocaleString()}*\n\n---\n\n`;
    this.messages.forEach(m => {
      const sender = m.sender === 'user' ? 'Student' : `AI Tutor (${m.persona || 'General'})`;
      markdown += `### ${sender} [${new Date(m.timestamp).toLocaleTimeString()}]:\n\n${m.text}\n\n---\n\n`;
    });

    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `CogniStudy_Chat_${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    window.app.showToast('Chat exported as Markdown!', 'success');
  }

  scrollToBottom() {
    this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
  }
}

// Controller instance will be bound in app.js
window.TutorController = TutorController;
