/**
 * COGNISTUDY AI - AI ENGINE & SERVICE
 * Supports both Live Google Gemini API (3.8 Flash, 3.6 Flash, 3.5 Flash-Lite)
 * and a rich Built-in Offline Academic Knowledge Engine.
 */

class AIService {
  constructor() {
    this.geminiEndpoint = 'https://generativelanguage.googleapis.com/v1beta/models';
  }

  getApiKey() {
    const settings = window.storage ? window.storage.getSettings() : {};
    return settings.apiKey ? settings.apiKey.trim() : '';
  }

  getModel() {
    const settings = window.storage ? window.storage.getSettings() : {};
    return settings.model || 'gemini-3.8-flash';
  }

  isUsingLiveAPI() {
    return Boolean(this.getApiKey());
  }

  // Fast fetch wrapper with automatic AbortController timeout to prevent long hanging requests
  async _fetchWithTimeout(url, options, timeoutMs = 25000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s`));
    }, timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } catch (err) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        throw new Error(`Request timed out after ${Math.round(timeoutMs / 1000)}s. Please check your internet connection.`);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /* ========================================================================
     CONVERSATION HISTORY SANITIZER (Guarantees valid multi-turn turns)
     ======================================================================== */
  _buildGeminiContents(message, history = []) {
    const pastTurns = [];
    const rawHistory = Array.isArray(history) ? [...history] : [];

    // If the last item in rawHistory is the user message that was just submitted, remove it
    if (rawHistory.length > 0 &&
        rawHistory[rawHistory.length - 1].sender === 'user' &&
        rawHistory[rawHistory.length - 1].text?.trim() === message?.trim()) {
      rawHistory.pop();
    }

    for (const item of rawHistory) {
      if (!item || !item.text) continue;

      // Clean offline fallback notices and error tags from previous turns
      let cleanedText = item.text
        .replace(/\n*\*\s*\(Note: Live API encountered an issue:[\s\S]*?\)\s*\*/gi, '')
        .replace(/\n*⚡\s*\*\(Switching to[\s\S]*?\)\s*\*/gi, '')
        .trim();

      if (!cleanedText) continue;

      const role = item.sender === 'user' ? 'user' : 'model';

      // Gemini strictly requires alternating roles (user -> model -> user -> model)
      if (pastTurns.length > 0 && pastTurns[pastTurns.length - 1].role === role) {
        pastTurns[pastTurns.length - 1].parts[0].text += `\n\n${cleanedText}`;
      } else {
        pastTurns.push({
          role: role,
          parts: [{ text: cleanedText }]
        });
      }
    }

    // Gemini multi-turn conversation MUST start with a 'user' turn
    while (pastTurns.length > 0 && pastTurns[0].role !== 'user') {
      pastTurns.shift();
    }

    // Keep the most recent 6 turns (3 exchanges) for sub-second context processing
    const trimmedTurns = pastTurns.slice(-6);

    // If the trimmed array ends with a 'user' turn, merge current message into it;
    // otherwise append the new user turn.
    if (trimmedTurns.length > 0 && trimmedTurns[trimmedTurns.length - 1].role === 'user') {
      trimmedTurns[trimmedTurns.length - 1].parts[0].text += `\n\n${message}`;
      return trimmedTurns;
    } else {
      trimmedTurns.push({
        role: 'user',
        parts: [{ text: message }]
      });
      return trimmedTurns;
    }
  }

  /* ========================================================================
     1. AI STUDY TUTOR (STREAMING CHAT WITH SUB-SECOND TTFB)
     ======================================================================== */
  async chatWithTutor(message, persona = 'socratic', history = []) {
    return this.chatWithTutorStream(message, persona, history);
  }

  async chatWithTutorStream(message, persona = 'socratic', history = [], onChunk = null) {
    if (this.isUsingLiveAPI()) {
      const primaryModel = this.getModel();
      try {
        return await this._streamGeminiChat(message, persona, history, onChunk, primaryModel);
      } catch (err) {
        console.warn(`Primary model ${primaryModel} failed (${err.message}). Attempting fast fallback...`);

        // If the primary model was slow or timed out, automatically try gemini-3.5-flash-lite
        if (primaryModel !== 'gemini-3.5-flash-lite') {
          try {
            if (onChunk) {
              onChunk(`⚡ *(Switching to ultra-fast Gemini 3.5 Flash Lite...)*\n\n`);
            }
            return await this._streamGeminiChat(message, persona, history, onChunk, 'gemini-3.5-flash-lite');
          } catch (fallbackErr) {
            console.warn('Fallback to gemini-3.5-flash-lite also failed:', fallbackErr);
          }
        }

        console.warn('All live API calls failed, falling back to built-in knowledge engine:', err);
        const fallback = this._offlineTutorResponse(message, persona);
        const fullFallback = `${fallback}\n\n*(Note: Live API encountered an issue: ${err.message}. Showing response from built-in knowledge engine.)*`;
        if (onChunk) onChunk(fullFallback);
        return fullFallback;
      }
    } else {
      // Offline mode
      await new Promise(r => setTimeout(r, 450));
      const fallback = this._offlineTutorResponse(message, persona);
      if (onChunk) onChunk(fallback);
      return fallback;
    }
  }

  async _streamGeminiChat(message, persona, history, onChunk, targetModel = null) {
    const apiKey = this.getApiKey();
    const model = targetModel || this.getModel();

    const personaPrompts = {
      socratic: "You are a master Socratic AI Tutor. Rather than just giving the direct answer away immediately, guide the student with thoughtful inquiry, illuminating counter-examples, and step-by-step reasoning questions. Be encouraging, warm, and academically rigorous. Use markdown and LaTeX math where appropriate.",
      feynman: "You are an expert tutor employing the Feynman Technique. Explain concepts using vivid real-world analogies, simple intuitive language, and zero unnecessary jargon. If technical terms are essential, explain them as if speaking to an inquisitive 12-year-old first before diving deeper.",
      cram: "You are an intense, high-yield Exam Cram Coach. Provide concise, bulleted key facts, essential formulas, high-frequency exam questions, and memory mnemonics. Cut straight to what appears on tests.",
      stem: "You are a STEM & Coding problem solver. Provide structured step-by-step mathematical derivations with LaTeX ($...$, $$...$$), well-commented code snippets with edge-case explanations, and formal proofs where relevant."
    };

    const systemInstruction = personaPrompts[persona] || personaPrompts.socratic;
    const contents = this._buildGeminiContents(message, history);

    // Use SSE streaming endpoint for instant token-by-token arrival
    const streamUrl = `${this.geminiEndpoint}/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();

    // Time-To-First-Token (TTFT) timeout: 25 seconds
    // Prevents models from getting stuck in long thinking loops without sending tokens
    let receivedFirstByte = false;
    const timeoutId = setTimeout(() => {
      if (!receivedFirstByte) {
        controller.abort(new Error(`Model ${model} took longer than 25s to start responding.`));
      }
    }, 25000);

    let response;
    try {
      response = await fetch(streamUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: systemInstruction }]
          },
          contents: contents,
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 1200,
            thinkingConfig: {
              thinkingLevel: "MINIMAL"
            }
          }
        })
      });
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      throw fetchErr;
    }

    if (!response.ok) {
      clearTimeout(timeoutId);
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.error?.message || `HTTP ${response.status} ${response.statusText}`;

      // If error was caused by thinkingConfig or systemInstruction, retry with standard payload
      if (errorMsg.toLowerCase().includes('thinking') || errorMsg.toLowerCase().includes('systeminstruction')) {
        return this._streamGeminiChatSimple(contents, onChunk, model);
      }
      throw new Error(errorMsg);
    }

    if (!response.body) {
      clearTimeout(timeoutId);
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "No response received.";
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        if (!receivedFirstByte) {
          receivedFirstByte = true;
          clearTimeout(timeoutId); // Active stream verified, cancel first-byte timeout!
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep trailing incomplete chunk

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith('data: ')) {
            const jsonStr = trimmed.slice(6).trim();
            if (jsonStr && jsonStr !== '[DONE]') {
              try {
                const parsed = JSON.parse(jsonStr);
                const parts = parsed.candidates?.[0]?.content?.parts || [];
                for (const part of parts) {
                  // Ignore internal thoughts in stream output, output actual response
                  if (part.text && !part.thought) {
                    fullText += part.text;
                    if (onChunk) onChunk(fullText);
                  }
                }
              } catch (e) {
                // Ignore partial JSON chunks
              }
            }
          }
        }
      }

      // Process remainder of buffer
      if (buffer.trim().startsWith('data: ')) {
        const jsonStr = buffer.trim().slice(6).trim();
        if (jsonStr && jsonStr !== '[DONE]') {
          try {
            const parsed = JSON.parse(jsonStr);
            const parts = parsed.candidates?.[0]?.content?.parts || [];
            for (const part of parts) {
              if (part.text && !part.thought) {
                fullText += part.text;
                if (onChunk) onChunk(fullText);
              }
            }
          } catch (e) {}
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }

    return fullText || "I'm sorry, I couldn't generate a response. Please try again.";
  }

  async _streamGeminiChatSimple(contents, onChunk, model) {
    const apiKey = this.getApiKey();
    const streamUrl = `${this.geminiEndpoint}/${model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error('Simple stream timed out after 25s')), 25000);

    const response = await fetch(streamUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        contents: contents,
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1200
        }
      })
    });

    clearTimeout(timeoutId);
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error?.message || `HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ')) {
          const jsonStr = trimmed.slice(6).trim();
          if (jsonStr && jsonStr !== '[DONE]') {
            try {
              const parsed = JSON.parse(jsonStr);
              const chunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (chunk) {
                fullText += chunk;
                if (onChunk) onChunk(fullText);
              }
            } catch (e) {}
          }
        }
      }
    }
    return fullText;
  }

  async _callGeminiChat(message, persona, history) {
    return this._streamGeminiChat(message, persona, history, null);
  }

  /* ========================================================================
     2. NOTE SUMMARIZER
     ======================================================================== */
  async summarizeNotes(notes, format = 'bullets', length = 'medium') {
    if (this.isUsingLiveAPI()) {
      const primaryModel = this.getModel();
      const apiKey = this.getApiKey();

      const formatInstructions = {
        tldr: "Provide a sharp 3-to-4 sentence Executive TL;DR summary capturing the highest-level concept, mechanisms, and conclusion.",
        bullets: "Provide structured hierarchical bullet points with bold sub-headers, detailing Core Concepts, Supporting Evidence, and Key Takeaways.",
        glossary: "Extract all technical terms, formulas, and critical vocabulary into an organized Glossary with concise, accurate definitions.",
        checklist: "Convert these notes into an actionable Study Action Checklist: key questions to test oneself on and steps to achieve mastery."
      };

      const lengthConstraint = {
        short: "Keep the summary brief and dense (around 120-180 words).",
        medium: "Provide a balanced, thorough summary (around 250-400 words).",
        deep: "Provide an in-depth comprehensive breakdown with nuances (around 500-750 words)."
      };

      const prompt = `You are an elite academic note summarizer.
Format request: ${formatInstructions[format] || formatInstructions.bullets}
Length requirement: ${lengthConstraint[length] || lengthConstraint.medium}
Use clean markdown with headers, bold text, and lists.

Here are the notes:
"""
${notes}
"""`;

      const modelsToTry = primaryModel === 'gemini-3.5-flash-lite' ? [primaryModel] : [primaryModel, 'gemini-3.5-flash-lite'];

      for (const model of modelsToTry) {
        try {
          const res = await this._fetchWithTimeout(`${this.geminiEndpoint}/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.4,
                maxOutputTokens: 1500,
                thinkingConfig: {
                  thinkingLevel: "MINIMAL"
                }
              }
            })
          }, 25000);

          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
          }
        } catch (err) {
          console.warn(`Summarize with ${model} failed, trying fallback:`, err);
        }
      }

      console.warn('API summarize failed on all models, using offline fallback');
      return this._offlineSummarize(notes, format, length);
    } else {
      await new Promise(r => setTimeout(r, 600));
      return this._offlineSummarize(notes, format, length);
    }
  }

  /* ========================================================================
     3. FLASHCARDS GENERATOR
     ======================================================================== */
  async generateFlashcards(inputSource, count = 5) {
    if (this.isUsingLiveAPI()) {
      const primaryModel = this.getModel();
      const apiKey = this.getApiKey();

      const prompt = `Generate exactly ${count} high-yield study flashcards based on the following material or topic.
Return ONLY valid JSON with no markdown wrapping or backticks. Format must be an array of objects:
[
  { "front": "Question or Key Term", "back": "Clear concise answer or conceptual explanation" }
]

Material:
"""
${inputSource}
"""`;

      const modelsToTry = primaryModel === 'gemini-3.5-flash-lite' ? [primaryModel] : [primaryModel, 'gemini-3.5-flash-lite'];

      for (const model of modelsToTry) {
        try {
          const res = await this._fetchWithTimeout(`${this.geminiEndpoint}/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.3,
                responseMimeType: "application/json",
                thinkingConfig: {
                  thinkingLevel: "MINIMAL"
                }
              }
            })
          }, 25000);

          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            const parsed = JSON.parse(text);
            if (Array.isArray(parsed)) {
              return parsed.map((c, i) => ({
                id: 'c-gen-' + Date.now() + '-' + i,
                front: c.front || c.question,
                back: c.back || c.answer,
                mastered: false
              }));
            }
          }
        } catch (e) {
          console.warn(`Flashcard gen with ${model} failed:`, e);
        }
      }
    }

    await new Promise(r => setTimeout(r, 500));
    return this._offlineGenerateFlashcards(inputSource, count);
  }

  /* ========================================================================
     4. PRACTICE QUIZ CREATOR
     ======================================================================== */
  async generateQuiz(topicOrNotes, count = 5, difficulty = 'medium') {
    if (this.isUsingLiveAPI()) {
      const primaryModel = this.getModel();
      const apiKey = this.getApiKey();

      const prompt = `Create a ${count}-question multiple choice practice quiz on the topic/notes provided.
Difficulty: ${difficulty}.
Return ONLY valid JSON (no markdown fences). Format:
{
  "title": "Quiz Title",
  "questions": [
    {
      "question": "Question text here?",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctIndex": 0,
      "explanation": "Detailed explanation of why the correct option is right and the others are incorrect."
    }
  ]
}

Content/Topic:
"""
${topicOrNotes}
"""`;

      const modelsToTry = primaryModel === 'gemini-3.5-flash-lite' ? [primaryModel] : [primaryModel, 'gemini-3.5-flash-lite'];

      for (const model of modelsToTry) {
        try {
          const res = await this._fetchWithTimeout(`${this.geminiEndpoint}/${model}:generateContent?key=${apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.3,
                responseMimeType: "application/json",
                thinkingConfig: {
                  thinkingLevel: "MINIMAL"
                }
              }
            })
          }, 25000);

          if (res.ok) {
            const data = await res.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
            const parsed = JSON.parse(text);
            if (parsed && Array.isArray(parsed.questions)) {
              return parsed;
            }
          }
        } catch (e) {
          console.warn(`Quiz gen with ${model} failed:`, e);
        }
      }
    }

    await new Promise(r => setTimeout(r, 600));
    return this._offlineGenerateQuiz(topicOrNotes, count, difficulty);
  }

  /* ========================================================================
     OFFLINE KNOWLEDGE & HEURISTIC ENGINE (100% Client-Side Fallback)
     ======================================================================== */
  _offlineTutorResponse(message, persona) {
    const lower = message.toLowerCase();

    // Check specific academic domains
    if (lower.includes('photosynthesis') || lower.includes('chloroplast') || lower.includes('calvin cycle')) {
      if (persona === 'socratic') {
        return `Let's break down photosynthesis together! 🌱\n\nTo begin: Plants convert sunlight into stored chemical energy. Think about what goes into a leaf every day.\n\n1. What gas does the plant take in from the atmosphere?\n2. What does it absorb from the soil through its roots?\n\nOnce light energy hits the chlorophyll, water molecules are split. What vital gas is released as a byproduct that animals depend on?`;
      } else if (persona === 'feynman') {
        return `Imagine a leaf as a microscopic solar-powered bakery! ☀️🧑‍🍳\n\n- **Ingredients**: Sunlight (the electricity), Water ($H_2O$ from the ground), and Carbon Dioxide ($CO_2$ from the air).\n- **The Oven**: The Chloroplast filled with green pigment called Chlorophyll.\n- **The Recipe**: The plant absorbs light photons to split water, discards Oxygen as exhaust (lucky for us!), and glues Carbon and Hydrogen together into delicious sugar (Glucose, $C_6H_{12}O_6$).\n\nIn short: plants bake their own food out of thin air and sunlight!`;
      } else if (persona === 'cram') {
        return `### ⚡ High-Yield Photosynthesis Drill\n\n- **Chemical Equation**: $$6CO_2 + 6H_2O + \\text{light} \\rightarrow C_6H_{12}O_6 + 6O_2$$\n- **Phase 1 (Light Reactions)**: Thylakoid membrane. Uses $H_2O$ + photons; produces ATP, NADPH, and releases $O_2$ via photolysis.\n- **Phase 2 (Calvin Cycle / Dark Reactions)**: Stroma. Uses ATP + NADPH to fix $CO_2$ into G3P/Glucose via the enzyme **RuBisCO**.\n- **Key Exam Trap**: Light-independent reactions do NOT require darkness—they just don't directly absorb photons!`;
      } else {
        return `### Photosynthesis: Biochemical Derivation\n\nThe overall net reaction is governed by:\n$$6\\text{CO}_2 + 6\\text{H}_2\\text{O} \\xrightarrow{h\\nu} \\text{C}_6\\text{H}_{12}\\text{O}_6 + 6\\text{O}_2$$\n\n1. **Z-Scheme Electron Transport**: Photosystem II ($P_{680}$) absorbs photons $\\rightarrow$ electron excitation $\\rightarrow$ plastoquinone $\\rightarrow$ Cytochrome $b_6f$ complex (pumping protons across thylakoid lumen) $\\rightarrow$ Photosystem I ($P_{700}$) $\\rightarrow$ Ferredoxin-NADP+ reductase.\n2. **Chemiosmosis**: The proton gradient across the thylakoid drives ATP synthase (photophosphorylation).`;
      }
    }

    if (lower.includes('calculus') || lower.includes('derivative') || lower.includes('integral') || lower.includes('limit')) {
      if (persona === 'socratic') {
        return `Calculus is fundamentally the mathematics of change! 📐\n\nLet me ask you: if you drive 60 miles in one hour, your average speed is 60 mph. But were you going exactly 60 mph every split-second at the stoplight or on the highway?\n\nHow might we calculate your speed at an *infinitesimally small instant* of time? What happens to the interval $\\Delta t$ as it approaches zero?`;
      } else if (persona === 'feynman') {
        return `Think of a derivative like a speedometer, and an integral like an odometer! 🚗\n\n- **Derivative**: If you take a movie and pause it at frame 104, a derivative tells you how fast the actor is moving in that exact frame. It's the slope or steepness at a single point.\n- **Integral**: If you only knew your speedometer speed at every second of your road trip, an integral lets you add up all those tiny speed slices to calculate total distance traveled!`;
      } else {
        return `### Core Calculus Rules Reference\n\n- **Derivative Definition**: $$f'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}$$\n- **Power Rule**: $$\\frac{d}{dx}[x^n] = n x^{n-1}$$\n- **Product Rule**: $$\\frac{d}{dx}[u \\cdot v] = u'v + uv'$$\n- **Chain Rule**: $$\\frac{d}{dx}[f(g(x))] = f'(g(x)) \\cdot g'(x)$$\n- **Fundamental Theorem of Calculus**: $$\\int_a^b f(x) dx = F(b) - F(a)$$ where $F'(x) = f(x)$.`;
      }
    }

    if (lower.includes('recursion') || lower.includes('algorithm') || lower.includes('binary search') || lower.includes('big o')) {
      return `### 💡 Understanding Algorithms & Recursion\n\nRecursion is solving a problem by breaking it into smaller instances of the exact same problem until reaching a **base case**.\n\n\`\`\`javascript\n// Example: Factorial n! = n * (n-1)!\nfunction factorial(n) {\n  if (n <= 1) return 1; // Base case: prevents infinite call stack\n  return n * factorial(n - 1); // Recursive call\n}\n\`\`\`\n\n**Key questions to ask yourself:**\n1. What is the minimal base case where computation stops?\n2. Does every recursive call strictly converge toward the base case?\n3. What is the call stack space complexity ($O(n)$ in this case)?`;
    }

    // Default intelligent conversational response tailored to persona
    const topicSummary = message.length > 50 ? `"${message.substring(0, 45)}..."` : `"${message}"`;
    if (persona === 'socratic') {
      return `That's an excellent topic to explore regarding ${topicSummary}.\n\nTo help you build a deep intuitive foundation, let's investigate the primary mechanism behind it:\n\n1. What is your current understanding of the central principle at play here?\n2. Can you think of an everyday situation or analogy that mimics how this works?\n\nShare your thoughts, and we will dissect each piece together!`;
    } else if (persona === 'feynman') {
      return `Let's break down ${topicSummary} into the simplest possible terms!\n\nImagine you are explaining this to a curious friend who has never taken a class on this subject. At its core:\n\n- **The Big Picture**: It solves the problem of how systems balance forces and distribute information.\n- **The Analogy**: Think of it like a crowded subway platform or a water reservoir with a valve.\n- **The Takeaway**: Once you see how the underlying pieces connect, the jargon falls away!\n\nWhat specific part of this concept feels most confusing right now?`;
    } else if (persona === 'cram') {
      return `### ⚡ High-Yield Study Highlights: ${topicSummary}\n\n- **Core Definition**: The foundational principle governing state changes and equilibrium.\n- **Key Formula / Mechanism**: Input $\\rightarrow$ Transformation Process $\\rightarrow$ Conserved Output.\n- **Top Exam Focus Areas**:\n  1. The 3 prerequisite conditions needed for the phenomenon to occur.\n  2. Common pitfalls (e.g., confusing correlation with causation or sign errors in formulas).\n  3. Standard exceptions or edge cases tested by professors.\n\nWould you like a rapid 3-question drill on this topic right now?`;
    } else {
      return `### Formal STEM Breakdown: ${topicSummary}\n\nTo analyze this analytically:\n\n1. **System Assumptions & Boundary Conditions**: Let the system be represented by independent state variables $x_1, x_2, \\dots, x_n$.\n2. **Governing Equations**: The equilibrium condition states that net flux $\\sum \\Phi_i = 0$.\n3. **Practical Implementation**: When modeling this mathematically or algorithmically, maintain invariant properties throughout each transition.\n\nWhat specific equation or code implementation would you like to derive next?`;
    }
  }

  _offlineSummarize(notes, format, length) {
    const lines = notes.split('\n').map(l => l.trim()).filter(Boolean);
    const wordCount = notes.split(/\s+/).filter(Boolean).length;
    const titleMatch = notes.match(/^#+\s*(.+)$/m) || notes.match(/^([A-Z][a-zA-Z\s]{3,40})/);
    const title = titleMatch ? titleMatch[1].trim() : "Key Study Material";

    const sentences = notes.match(/[^.!?]+[.!?]+/g) || [notes];
    const topSentences = sentences.slice(0, 5).map(s => s.trim());

    if (format === 'tldr') {
      return `### 📌 Executive TL;DR: ${title}\n\nThis material centers on **${title}**, establishing the foundational rules, operational mechanisms, and critical implications within the domain.\n\n${topSentences[0] || 'The core concepts emphasize structured analysis and systematic understanding.'} ${topSentences[1] || 'Understanding the primary variables enables predictive insights and efficient problem solving.'} In summary, mastering these core principles provides the framework needed for advanced synthesis and exam excellence.`;
    }

    if (format === 'glossary') {
      const terms = [];
      const termRegex = /([A-Z][a-zA-Z0-9\s]{2,25}):\s*([^.\n]+)/g;
      let match;
      while ((match = termRegex.exec(notes)) !== null && terms.length < 6) {
        terms.push({ term: match[1].trim(), def: match[2].trim() });
      }

      if (terms.length < 2) {
        terms.push(
          { term: 'Primary Mechanism', def: 'The central operational process that drives system transformation.' },
          { term: 'Key Constraint', def: 'The limiting factor or boundary condition that restricts maximum efficiency.' },
          { term: 'Equilibrium State', def: 'The stable condition reached when opposing forces or rates become equal.' },
          { term: 'Catalytic Element', def: 'An agent or factor that accelerates progression without being consumed.' }
        );
      }

      return `### 🧠 Essential Vocabulary & Concept Glossary\n\n` +
        terms.map(t => `- **${t.term}**: ${t.def}`).join('\n\n') +
        `\n\n*Review these terms frequently using active recall to reinforce long-term memory consolidation.*`;
    }

    if (format === 'checklist') {
      return `### 🎯 Actionable Study Mastery Checklist\n\n- [ ] **Define the Core Thesis**: Explain "${title}" out loud in under 60 seconds without checking your notes.\n- [ ] **Mechanism Breakdown**: Diagram the input-to-output workflow and label all constituent parts.\n- [ ] **Formula & Definitions Drill**: Memorize the key terms and their quantitative relationships.\n- [ ] **Edge Cases & Counter-Examples**: Identify under what special conditions these rules no longer hold.\n- [ ] **Active Recall Testing**: Complete a practice quiz or teach this topic to a peer using the Feynman method.`;
    }

    return `### 📑 Key Takeaways & Core Concepts: ${title}\n\n#### 1. Foundational Overview\n- **Primary Focus**: ${topSentences[0] || 'Systematic understanding of the underlying principles.'}\n- **Context**: Connects theoretical frameworks to observable empirical outcomes.\n\n#### 2. Key Mechanisms & Details\n- ${topSentences[1] || 'Core components interact continuously to maintain optimal functioning.'}\n- ${topSentences[2] || 'Variations in inputs produce proportional downstream adjustments.'}\n- ${topSentences[3] || 'Critical factors include efficiency rates, reaction boundaries, and structural constraints.'}\n\n#### 3. High-Yield Exam Takeaway\n- When answering questions on this topic, always clarify the **initial assumptions**, state the **governing rule**, and verify whether any **boundary limitations** apply.`;
  }

  _offlineGenerateFlashcards(inputSource, count) {
    const cards = [];
    const lower = inputSource.toLowerCase();

    if (lower.includes('bio') || lower.includes('cell') || lower.includes('organelle') || lower.includes('photosynthesis')) {
      const bioBank = [
        { front: 'What is the function of the Golgi Apparatus?', back: 'Modifies, sorts, and packages proteins and lipids from the ER for secretion or internal delivery.' },
        { front: 'What molecule serves as the direct universal energy currency of cellular work?', back: 'Adenosine Triphosphate (ATP).' },
        { front: 'What is the difference between active transport and facilitated diffusion?', back: 'Active transport moves solutes against their concentration gradient using ATP; facilitated diffusion moves them down gradient via transport proteins without ATP.' },
        { front: 'Where does the Krebs Cycle (Citric Acid Cycle) take place in eukaryotes?', back: 'In the mitochondrial matrix.' },
        { front: 'What is the function of Chlorophyll in the thylakoid membranes?', back: 'It absorbs blue and red wavelengths of light while reflecting green light, driving photon excitation in Photosystems I & II.' },
        { front: 'What is Apoptosis?', back: 'Programmed cell death, a crucial regulated process for development and removing damaged or mutated cells.' }
      ];
      return bioBank.slice(0, count).map((b, i) => ({ id: `card-gen-${Date.now()}-${i}`, ...b, mastered: false }));
    }

    if (lower.includes('history') || lower.includes('war') || lower.includes('revolution') || lower.includes('treaty')) {
      const histBank = [
        { front: 'What triggered the start of World War I in 1914?', back: 'The assassination of Archduke Franz Ferdinand of Austria in Sarajevo by Gavrilo Princip.' },
        { front: 'What was the significance of the Magna Carta signed in 1215?', back: 'It established the principle that everyone, even the king, is subject to the law, protecting individual rights.' },
        { front: 'What was the primary economic catalyst of the Industrial Revolution?', back: 'The mechanization of textile production, steam engine commercialization (James Watt), and abundance of coal & iron.' },
        { front: 'What treaty officially ended the Thirty Years\' War in 1648?', back: 'The Peace of Westphalia, which established modern nation-state sovereignty and diplomatic norms.' }
      ];
      return histBank.slice(0, count).map((b, i) => ({ id: `card-gen-${Date.now()}-${i}`, ...b, mastered: false }));
    }

    const sentences = inputSource.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 20);
    for (let i = 0; i < Math.min(count, sentences.length); i++) {
      const sentence = sentences[i];
      const words = sentence.split(' ');
      const subject = words.slice(0, 3).join(' ');
      cards.push({
        id: `card-gen-${Date.now()}-${i}`,
        front: `What is the significance of: "${subject}..."?`,
        back: sentence,
        mastered: false
      });
    }

    while (cards.length < count) {
      const idx = cards.length + 1;
      cards.push({
        id: `card-gen-${Date.now()}-${idx}`,
        front: `Key Concept #${idx} from study material`,
        back: `Critical principle highlighting the core mechanics and exam-tested definitions of the topic.`,
        mastered: false
      });
    }

    return cards;
  }

  _offlineGenerateQuiz(topicOrNotes, count, difficulty) {
    const lower = topicOrNotes.toLowerCase();

    if (lower.includes('bio') || lower.includes('cell') || lower.includes('photosynthesis')) {
      const bioQuestions = [
        {
          question: "Which cellular organelle contains its own circular DNA and reproduces independently via binary fission?",
          options: ["Endoplasmic Reticulum", "Mitochondria", "Golgi Apparatus", "Lysosome"],
          correctIndex: 1,
          explanation: "According to the Endosymbiotic Theory, mitochondria evolved from ancestral aerobic prokaryotes engulfed by primitive eukaryotes, retaining their own circular DNA and ribosomes."
        },
        {
          question: "During which phase of Mitosis do sister chromatids separate toward opposite poles of the cell?",
          options: ["Prophase", "Metaphase", "Anaphase", "Telophase"],
          correctIndex: 2,
          explanation: "In Anaphase, cohesin proteins are cleaved by separase, allowing the spindle fibers to pull sister chromatids apart toward opposite centrosomes."
        },
        {
          question: "What is the primary electron carrier produced in the light reactions of photosynthesis used by the Calvin Cycle?",
          options: ["NADH", "NADPH", "FADH2", "Pyruvate"],
          correctIndex: 1,
          explanation: "NADPH is the phosphorylated electron carrier generated during non-cyclic photophosphorylation, delivering reducing power to fix CO2 in the stroma."
        },
        {
          question: "Which type of enzyme inhibitor binds directly to the active site, competing with the substrate?",
          options: ["Allosteric inhibitor", "Non-competitive inhibitor", "Competitive inhibitor", "Feedback repressor"],
          correctIndex: 2,
          explanation: "Competitive inhibitors structurally resemble the substrate and bind directly to the active site, increasing the apparent Km without altering Vmax."
        },
        {
          question: "What is the primary function of the sodium-potassium pump (Na+/K+ ATPase)?",
          options: [
            "Pumps 3 Na+ out and 2 K+ in per ATP consumed",
            "Pumps 2 Na+ out and 3 K+ in per ATP consumed",
            "Facilitates passive diffusion of water",
            "Generates glucose from ATP"
          ],
          correctIndex: 0,
          explanation: "The Na+/K+ ATPase maintains resting membrane potential by actively transporting 3 sodium ions out of the cytoplasm and 2 potassium ions into the cell per molecule of hydrolyzed ATP."
        }
      ];
      return {
        title: "Cellular Biology Mastery Quiz",
        questions: bioQuestions.slice(0, count)
      };
    }

    if (lower.includes('algorithm') || lower.includes('cs') || lower.includes('python') || lower.includes('code') || lower.includes('data')) {
      const csQuestions = [
        {
          question: "What is the average and worst-case time complexity of accessing an element in an array by index?",
          options: ["O(1)", "O(log n)", "O(n)", "O(n log n)"],
          correctIndex: 0,
          explanation: "Arrays are stored in contiguous memory addresses, so calculating the offset `base + (index * size)` is an instantaneous O(1) arithmetic operation."
        },
        {
          question: "Which data structure follows a First-In-First-Out (FIFO) access pattern?",
          options: ["Stack", "Queue", "Heap", "Binary Search Tree"],
          correctIndex: 1,
          explanation: "A Queue operates on FIFO: items are enqueued at the back and dequeued from the front."
        },
        {
          question: "What is the primary requirement for executing a Binary Search on an array?",
          options: ["Array must be dynamically sized", "Array must be pre-sorted", "Array cannot contain duplicate values", "Array must contain only integers"],
          correctIndex: 1,
          explanation: "Binary search relies on ordering to discard half the search space on each comparison. If unsorted, the invariant is violated."
        },
        {
          question: "In object-oriented programming, what concept restricts direct access to some of an object's components?",
          options: ["Polymorphism", "Encapsulation", "Inheritance", "Abstraction"],
          correctIndex: 1,
          explanation: "Encapsulation bundles data with the methods that operate on that data and restricts direct access to internal object representation using access modifiers (private/protected)."
        },
        {
          question: "Which of the following sorting algorithms is guaranteed to have an O(n log n) worst-case time complexity?",
          options: ["QuickSort", "MergeSort", "BubbleSort", "InsertionSort"],
          correctIndex: 1,
          explanation: "MergeSort always divides the array in half and merges them in linear time, guaranteeing O(n log n) performance in best, average, and worst cases."
        }
      ];
      return {
        title: "Computer Science Fundamentals Quiz",
        questions: csQuestions.slice(0, count)
      };
    }

    const generalQuestions = [
      {
        question: `Which fundamental principle is most critical to understanding "${topicOrNotes.substring(0, 30)}"?`,
        options: [
          "Equilibrium states and conservation laws",
          "Random unpredictable fluctuations",
          "Uniform linear growth without limits",
          "Instantaneous transmission without energy transfer"
        ],
        correctIndex: 0,
        explanation: "Virtually all natural and computational systems are governed by conservation laws (energy, mass, information) and seek stable equilibrium states."
      },
      {
        question: "When evaluating empirical evidence or proofs in this field, what is the gold standard?",
        options: [
          "Subjective intuition and tradition",
          "Reproducible experimental validation with controlled variables",
          "Unverifiable anecdotal accounts",
          "Single-trial unrepeated observation"
        ],
        correctIndex: 1,
        explanation: "Reproducibility under strictly controlled variable conditions forms the bedrock of the empirical scientific method."
      },
      {
        question: "How does increasing the input scale typically affect system bottlenecks?",
        options: [
          "It eliminates all bottlenecks permanently",
          "It exposes non-linear latency and resource contention",
          "Efficiency increases to infinity",
          "Scale has zero measurable impact on system dynamics"
        ],
        correctIndex: 1,
        explanation: "As systems scale, shared resources experience contention and communication overhead increases non-linearly."
      }
    ];

    return {
      title: `Practice Quiz: ${topicOrNotes.substring(0, 28) || 'Study Review'}`,
      questions: generalQuestions.slice(0, count)
    };
  }
}

// Export singleton instance
window.ai = new AIService();
