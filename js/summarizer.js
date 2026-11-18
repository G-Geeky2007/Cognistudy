/**
 * COGNISTUDY AI - NOTE SUMMARIZER CONTROLLER
 * Summarizes study notes into multiple formats (TL;DR, Bullets, Glossary, Checklist)
 * with instant bridges to Flashcards & Quiz.
 */

const SAMPLE_NOTES = {
  biology: `# Cellular Respiration & Energy Production
Cellular respiration is a series of chemical reactions that break down glucose to produce ATP, which may be used as energy to power many reactions throughout the human body. There are three main steps of cellular respiration: glycolysis, the citric acid cycle (Krebs cycle), and oxidative phosphorylation via the electron transport chain.

Glycolysis is an anaerobic process occurring in the cytoplasm. One molecule of glucose (6 carbons) is broken down into two molecules of pyruvate (3 carbons each), producing a net yield of 2 ATP and 2 NADH molecules through substrate-level phosphorylation.

Next, under aerobic conditions, pyruvate enters the mitochondrial matrix where it undergoes oxidative decarboxylation, converted into Acetyl-CoA. In the Citric Acid Cycle, Acetyl-CoA combines with oxaloacetate to form citrate. Through cyclical enzymatic oxidation, it yields 2 ATP/GTP, 6 NADH, 2 FADH2, and releases carbon dioxide as a waste byproduct.

Finally, oxidative phosphorylation occurs along the inner mitochondrial membrane (cristae). High-energy electrons from NADH and FADH2 are transferred along protein complexes I through IV. As electrons cascade down the chain, protons (H+) are pumped into the intermembrane space, creating a steep electrochemical proton gradient. Protons diffuse back into the matrix through the enzyme ATP Synthase (chemiosmosis), generating approximately 26 to 28 ATP molecules. Oxygen acts as the final electron acceptor, combining with free protons to form metabolic water.`,

  cs: `# Computational Complexity & Big-O Notation
In computer science, algorithmic efficiency is quantified using asymptotic notation. Big-O notation describes the upper bound of an algorithm's running time or space requirements as the input size (n) approaches infinity. It characterizes how execution time scales rather than measuring exact wall-clock seconds.

Common Complexity Classes (from most to least efficient):
1. O(1) - Constant Time: Execution time remains unchanged regardless of input size. Example: Accessing an array element by index, push/pop on a stack.
2. O(log n) - Logarithmic Time: The problem space is halved at each step. Example: Binary search on a sorted list of elements.
3. O(n) - Linear Time: Operations scale directly in proportion to input size. Example: Iterating through an unsorted array to find a maximum value.
4. O(n log n) - Linearithmic Time: Common in divide-and-conquer sorting algorithms like MergeSort, QuickSort (average case), and HeapSort.
5. O(n^2) - Quadratic Time: Typical of algorithms with nested iterations over the dataset. Example: BubbleSort, SelectionSort, and InsertionSort.
6. O(2^n) - Exponential Time: Growth doubles with every additional input element. Example: Naive recursive calculation of Fibonacci numbers.

Space complexity measures the additional auxiliary memory an algorithm allocates during execution. Modern software design frequently navigates time-space trade-offs, such as utilizing hash maps (O(n) auxiliary memory) to achieve instant O(1) lookup speeds.`,

  history: `# The Industrial Revolution (1760 - 1840)
The Industrial Revolution was the transition to new manufacturing processes in Great Britain, continental Europe, and the United States. It marked a historic shift from agrarian, craft-based economies reliant on manual labor and animal power to industrial economies dominated by machine manufacturing and factory production.

Key Drivers and Inventions:
1. Steam Power: James Watt's significant improvements to Thomas Newcomen's atmospheric engine in 1776 drastically increased fuel efficiency. Steam engines liberated factories from geographical dependence on swift-flowing rivers.
2. Textile Mechanization: Inventions such as James Hargreaves's Spinning Jenny (1764) and Richard Arkwright's Water Frame mechanized cotton spinning, multiplying yarn output tenfold and lowering commodity prices worldwide.
3. Iron and Coal: Abraham Darby's smelting of iron ore using coke rather than charcoal produced vastly stronger cast iron, which was used for bridges, railways, and machinery.

Socio-Economic Impacts:
The rapid shift spurred unprecedented urbanization as millions of rural families relocated to burgeoning industrial cities such as Manchester, Birmingham, and Leeds. Early factory working conditions were notoriously grueling, characterized by 14-to-16-hour workdays, dangerous machinery without safety shields, and widespread child labor. These harsh realities prompted the rise of organized labor unions, the Chartism movement, and landmark regulatory reforms such as the British Factory Acts.`,

  physics: `# Newton's Laws of Motion & Classical Mechanics
Sir Isaac Newton published his three fundamental laws of motion in the Philosophiæ Naturalis Principia Mathematica in 1687, providing the foundation for classical mechanics.

1. First Law (Law of Inertia): An object at rest remains at rest, and an object in motion continues in motion with constant velocity (constant speed in a straight line) unless acted upon by a net external force. Mass is the quantitative measure of an object's inertia.

2. Second Law (Fundamental Law of Dynamics): The acceleration of an object is directly proportional to the net force acting upon it and inversely proportional to its mass:
Vector formula: F_net = m * a
In calculus formulation, force is defined as the time rate of change of momentum (p = m*v):
F = dp / dt.

3. Third Law (Action and Reaction): Whenever one body exerts a force on a second body, the second body simultaneously exerts a force equal in magnitude and opposite in direction on the first body:
F_{A on B} = - F_{B on A}
Crucially, action-reaction pairs never act on the same object, meaning they cannot cancel each other out to prevent movement.

Conservation of Momentum:
A direct consequence of Newton's third law in an isolated system (where net external force is zero) is the Conservation of Linear Momentum: the total vector momentum before any interaction or collision equals the total vector momentum afterward.`
};

/**
 * Client-side PDF fallback parser using PDF.js.
 * Automatically runs if the FastAPI backend is offline.
 */
async function extractTextClientSide(file) {
  if (!window.pdfjsLib) {
    throw new Error("FastAPI server is not reachable at http://localhost:8000. Please start your Python backend: uvicorn main:app --port 8000");
  }

  // Configure worker
  if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  let fullText = '';

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageStrings = textContent.items.map(item => item.str);
    fullText += pageStrings.join(' ') + '\n\n';
  }

  // Regex cleaning: rejoin hyphenated words and collapse excessive spaces
  fullText = fullText
    .replace(/(\b\w+)-\s*\n\s*(\w+\b)/g, '$1$2')
    .replace(/[ \t]+/g, ' ')
    .trim();

  if (!fullText) {
    throw new Error("No selectable text found. This appears to be a scanned or image-only PDF.");
  }

  return { text: fullText, pages: numPages, clientFallback: true };
}

/**
 * Asynchronously sends an uploaded PDF to the FastAPI backend
 * running PyMuPDF for layout-aware text extraction and cleaning.
 * Automatically falls back to in-browser PDF.js if the backend is offline.
 *
 * @param {File} file - Browser File object (e.g., from an <input type="file">)
 * @returns {Promise<{text: string, pages: number, clientFallback: boolean}>}
 */
async function extractTextFromPDF(file) {
  if (!file) throw new Error("No file selected.");

  const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  if (!isPdf) {
    throw new Error("Invalid file format. Please upload a valid .pdf file.");
  }

  const backendBase = (window.storage && window.storage.getBackendUrl()) || window.BACKEND_URL || "http://localhost:8000";
  const formData = new FormData();
  formData.append("file", file);

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000); // 6s timeout for backend

    const response = await fetch(`${backendBase}/api/extract-pdf`, {
      method: "POST",
      body: formData,
      signal: controller.signal
      // Note: Do NOT set Content-Type header manually; browser will set multipart/form-data boundary
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      const errorMsg = errorData.detail || errorData.error || `HTTP ${response.status}: ${response.statusText}`;
      throw new Error(errorMsg);
    }

    const data = await response.json();

    if (!data.success) {
      // Handles scanned / image-only PDF response from backend
      throw new Error(data.error || "No readable text found in PDF.");
    }

    return { text: data.text, pages: data.pages, clientFallback: false };
  } catch (err) {
    const isNetworkError = err.name === 'AbortError' || err.message?.includes('Failed to fetch') || err.message?.includes('NetworkError');

    if (isNetworkError) {
      console.warn(`[FastAPI Offline] Could not reach backend at ${backendBase}. Switching to in-browser PDF parser...`);
      return await extractTextClientSide(file);
    }

    console.error("PDF Extraction Error:", err);
    throw err;
  }
}
window.extractTextFromPDF = extractTextFromPDF;

class SummarizerController {
  constructor() {
    this.currentSummaryText = '';
    this.init();
  }

  init() {
    this.noteInputEl = document.getElementById('noteInput');
    this.sampleNotesSelectEl = document.getElementById('sampleNotesSelect');
    this.summaryFormatEl = document.getElementById('summaryFormat');
    this.summaryLengthEl = document.getElementById('summaryLength');
    this.btnSummarizeEl = document.getElementById('btnSummarize');
    this.btnClearNotesEl = document.getElementById('btnClearNotes');
    this.summaryOutputEl = document.getElementById('summaryOutput');
    this.wordCountEl = document.getElementById('noteWordCount');
    this.fileUploadEl = document.getElementById('noteFileUpload');

    // Bridge buttons
    this.btnCopySummaryEl = document.getElementById('btnCopySummary');
    this.btnDownloadSummaryEl = document.getElementById('btnDownloadSummary');
    this.btnBridgeToFlashcardsEl = document.getElementById('btnBridgeToFlashcards');
    this.btnBridgeToQuizEl = document.getElementById('btnBridgeToQuiz');

    this.bindEvents();
  }

  bindEvents() {
    // Word count calculation
    this.noteInputEl?.addEventListener('input', () => this.updateWordCount());

    // Sample notes dropdown
    this.sampleNotesSelectEl?.addEventListener('change', (e) => {
      const key = e.target.value;
      if (key && SAMPLE_NOTES[key]) {
        this.noteInputEl.value = SAMPLE_NOTES[key];
        this.updateWordCount();
        window.app.playSound('pop');
        window.app.showToast(`Loaded sample: ${key.toUpperCase()}`, 'info');
      }
    });

    // Clear input
    this.btnClearNotesEl?.addEventListener('click', () => {
      this.noteInputEl.value = '';
      if (this.sampleNotesSelectEl) this.sampleNotesSelectEl.value = '';
      this.updateWordCount();
    });

    // File upload (supports .txt, .md, and server-side PyMuPDF .pdf parsing)
    this.fileUploadEl?.addEventListener('change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

      if (isPdf) {
        const originalBtnText = this.btnSummarizeEl ? this.btnSummarizeEl.innerHTML : '';
        if (this.btnSummarizeEl) {
          this.btnSummarizeEl.disabled = true;
          this.btnSummarizeEl.innerHTML = `<span class="spinner" style="width:14px; height:14px; margin-right:6px;"></span> Parsing PDF...`;
        }
        this.noteInputEl.value = `[Extracting text from "${file.name}" via PyMuPDF backend... Please wait]`;
        this.updateWordCount();
        window.app?.showToast(`Extracting text from "${file.name}"...`, 'info');

        try {
          const result = await extractTextFromPDF(file);
          const cleanedText = typeof result === 'object' ? result.text : result;
          this.noteInputEl.value = cleanedText;
          this.updateWordCount();
          if (result && result.clientFallback) {
            window.app?.showToast(`Extracted via in-browser PDF parser (${result.pages}p). (Start FastAPI for PyMuPDF)`, 'info');
          } else {
            window.app?.showToast(`Extracted text from "${file.name}" via PyMuPDF! 📄`, 'success');
          }
          window.app?.playSound('chime');
        } catch (err) {
          this.noteInputEl.value = '';
          this.updateWordCount();
          let msg = err.message;
          if (msg.includes('Failed to fetch')) {
            msg = 'FastAPI server not reachable at http://localhost:8000. Start it in terminal: uvicorn main:app --port 8000';
          }
          window.app?.showToast(`PDF Error: ${msg}`, 'error');
        } finally {
          if (this.btnSummarizeEl) {
            this.btnSummarizeEl.disabled = !this.noteInputEl.value.trim();
            this.btnSummarizeEl.innerHTML = originalBtnText || `✨ Generate Summary`;
          }
          e.target.value = ''; // Reset input so same file can be re-selected if needed
        }
      } else {
        const reader = new FileReader();
        reader.onload = (event) => {
          this.noteInputEl.value = event.target.result;
          this.updateWordCount();
          window.app?.showToast(`Uploaded file: ${file.name}`, 'success');
          e.target.value = '';
        };
        reader.readAsText(file);
      }
    });

    // Run Summarize
    this.btnSummarizeEl?.addEventListener('click', () => this.handleSummarize());

    // Bridge actions
    this.btnCopySummaryEl?.addEventListener('click', () => {
      if (!this.currentSummaryText) return;
      navigator.clipboard.writeText(this.currentSummaryText);
      window.app.showToast('Summary copied to clipboard!', 'success');
    });

    this.btnDownloadSummaryEl?.addEventListener('click', () => {
      if (!this.currentSummaryText) return;
      const blob = new Blob([this.currentSummaryText], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `CogniStudy_Summary_${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
      window.app.showToast('Downloaded markdown summary!', 'success');
    });

    // Bridge to Flashcards
    this.btnBridgeToFlashcardsEl?.addEventListener('click', () => {
      const textToUse = this.currentSummaryText || this.noteInputEl.value.trim();
      if (!textToUse) {
        window.app.showToast('Please generate a summary or enter notes first', 'warning');
        return;
      }
      window.app.switchView('flashcards');
      if (window.flashcardsController) {
        window.flashcardsController.prefillGenerator(textToUse);
      }
      window.app.showToast('Transferred material to Flashcard Generator!', 'success');
    });

    // Bridge to Quiz
    this.btnBridgeToQuizEl?.addEventListener('click', () => {
      const textToUse = this.currentSummaryText || this.noteInputEl.value.trim();
      if (!textToUse) {
        window.app.showToast('Please generate a summary or enter notes first', 'warning');
        return;
      }
      window.app.switchView('quiz');
      if (window.quizController) {
        window.quizController.prefillGenerator(textToUse);
      }
      window.app.showToast('Transferred material to Practice Quiz Creator!', 'success');
    });
  }

  updateWordCount() {
    const text = this.noteInputEl.value.trim();
    const words = text ? text.split(/\s+/).length : 0;
    const chars = text.length;
    if (this.wordCountEl) {
      this.wordCountEl.innerText = `${words} words | ${chars} chars`;
    }
    if (this.btnSummarizeEl) {
      this.btnSummarizeEl.disabled = words === 0;
    }
  }

  async handleSummarize() {
    const notes = this.noteInputEl.value.trim();
    if (!notes) {
      window.app.showToast('Please paste or type study notes first', 'warning');
      return;
    }

    const format = this.summaryFormatEl.value;
    const length = this.summaryLengthEl.value;

    this.btnSummarizeEl.disabled = true;
    this.btnSummarizeEl.innerHTML = `<span class="spinner" style="width:16px; height:16px;"></span> Generating...`;
    this.summaryOutputEl.innerHTML = `
      <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color:var(--text-muted); gap:12px;">
        <span class="spinner spinner-primary" style="width:32px; height:32px;"></span>
        <p>Synthesizing key insights and formatting ${format.toUpperCase()} summary...</p>
      </div>
    `;

    try {
      const result = await window.ai.summarizeNotes(notes, format, length);
      this.currentSummaryText = result;
      this.renderSummary(result);

      // Record activity and stat
      window.storage.incrementStat('notesSummarizedCount', 1);
      const firstLine = notes.split('\n')[0].replace(/^#+\s*/, '').trim();
      const summaryTopic = (firstLine.length > 3 ? firstLine.substring(0, 45) : notes.substring(0, 30)) + '...';

      window.storage.recordActivity({
        type: 'summary',
        title: summaryTopic,
        format: format
      });

      // Record study session to FastAPI SQLite backend (with graceful offline fallback)
      if (typeof recordStudySession === 'function') {
        recordStudySession(summaryTopic, 'Summary', null);
      } else if (window.storage?.recordStudySession) {
        window.storage.recordStudySession(summaryTopic, 'Summary', null);
      }

      window.app.playSound('flip');
      window.app.showToast('Summary created successfully!', 'success');
    } catch (err) {
      this.summaryOutputEl.innerHTML = `<div style="color:var(--danger); padding:16px;">⚠️ Error generating summary: ${err.message}</div>`;
      window.app.showToast('Failed to generate summary', 'error');
    } finally {
      this.btnSummarizeEl.disabled = false;
      this.btnSummarizeEl.innerHTML = `✨ Generate Summary`;
    }
  }

  renderSummary(markdownText) {
    if (window.marked) {
      try {
        this.summaryOutputEl.innerHTML = window.marked.parse(markdownText);
        return;
      } catch (e) {
        console.warn('Marked parse error', e);
      }
    }
    // Fallback simple HTML
    this.summaryOutputEl.innerHTML = markdownText
      .replace(/\n\n/g, '<br><br>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/^- (.*)$/gm, '<li>$1</li>');
  }
}

window.SummarizerController = SummarizerController;
