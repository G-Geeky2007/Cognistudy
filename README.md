# 🧠 CogniStudy AI - Smart Multimodal AI Study Assistant

**CogniStudy AI** is an all-in-one, full-stack educational web application designed to accelerate student learning and retention. It combines a real-time conversational AI Tutor with specialized pedagogical personas, layout-aware PDF text extraction via **PyMuPDF**, interactive **3D active recall flashcards**, an adaptive **practice quiz engine**, and **study history analytics** backed by **FastAPI** and **SQLite**.

---

## 🌟 Key Features

### 1. 💬 AI Study Tutor (Chat Interface)
* **4 Learning Personas:**
  * 🎓 **Socratic Tutor**: Guides learning through targeted inquiry and step-by-step reasoning.
  * 💡 **Feynman Explainer**: Demystifies difficult concepts with vivid real-world analogies and simple language.
  * ⚡ **Exam Cram Coach**: Delivers fast, high-yield drill formulas, bullet points, and key exam traps.
  * 🔬 **STEM & Code Solver**: Provides formal mathematical derivations, LaTeX equations, and clean code snippets.
* **Sub-Second Streaming:** Server-Sent Events (SSE) streaming with throttled thinking levels for near-instant responses.
* **Voice Dictation (STT):** Hands-free voice input via the browser's native Web Speech Recognition API.
* **Read Aloud (TTS):** Auditory playback using native SpeechSynthesis.
* **KaTeX Math & Markdown:** Renders complex formulas ($E=mc^2$, calculus, matrix math) and formatted code blocks.
* **Export Transcripts:** Download study chats as formatted Markdown (`.md`) files.

### 2. 📝 Note Summarizer & PDF Parser
* **Multiple Formats:** Instant conversion to Executive TL;DR, Hierarchical Bullets, Terms Glossary, or Study Checklist.
* **Server-Side PyMuPDF Extraction:** Upload complex `.pdf` lecture notes. The backend extracts text in geometric reading order (`sort=True`) and normalizes hyphenated words (`thermo-\ndynamics` $\rightarrow$ `thermodynamics`).
* **In-Browser Fallback:** Automatically switches to client-side `PDF.js` extraction if the backend server is offline.
* **Direct Workflow Bridges:** 1-click export of summarized material straight into **Flashcards** or **Practice Quizzes**.

### 3. 🗂️ Interactive 3D Flashcards & Spaced Repetition
* **3D Perspective Flip:** Smooth CSS 3D card flips with keyboard accessibility (`Space` to flip, `←` / `→` to grade).
* **Active Recall Tracking:** Real-time deck mastery percentage calculation.
* **AI Deck Generator:** Generate 5, 10, or 15 customized flashcards from any topic or raw study notes.
* **Deck Management:** Pre-loaded with starter decks (Biology, Algorithms, History). Supports JSON deck export and import.

### 4. 🎯 Adaptive Practice Quiz Creator
* **Configurable Exams:** Customizable question counts (3–10) and difficulty levels (Beginner, Intermediate, Advanced).
* **Two Modes:**
  * **Practice Mode:** Instant answer validation with comprehensive conceptual reasoning.
  * **Exam Mode:** Realistic timed test conditions with scorecards and celebratory confetti on passing ($\ge 70\%$).

### 5. 📊 Study Session History & Dual-Layer Persistence
* **FastAPI + SQLite Backend:** Asynchronously records every completed quiz, flashcard review, and summary into `cognistudy.db`.
* **Zero-Downtime Local Storage Mirror:** Automatically mirrors sessions and stats to `window.localStorage` so the application continues to run seamlessly even without a running server.

---

## 🛠️ Tech Stack

| Layer | Technologies Used |
| :--- | :--- |
| **Frontend** | HTML5 , CSS3 , Vanilla ES6+ JavaScript |
| **Libraries (CDN)** | [KaTeX](https://katex.org/) (Math), [Marked.js](https://marked.js.org/) (Markdown), [Canvas-Confetti](https://github.com/catdad/canvas-confetti), [PDF.js](https://mozilla.github.io/pdf.js/) |
| **Native APIs** | Web Audio API (Synthesized procedural sound effects), Web Speech API (STT & TTS), Streams API |
| **Backend** | Python 3.10+, [FastAPI](https://fastapi.tiangolo.com/), [Uvicorn](https://www.uvicorn.org/), [Pydantic v2](https://docs.pydantic.dev/) |
| **Document Processing**| [PyMuPDF (`fitz`)](https://pymupdf.readthedocs.io/) + Custom Regex Text Normalization |
| **Database** | SQLite3 (`cognistudy.db`) + Browser `window.localStorage` |
| **AI Integration** | Google Gemini API (`gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite`) + Offline Engine |

---

## 🏗️ System Architecture

```text
                           +------------------------------------------+
                           |           BROWSER (FRONTEND)             |
                           |   HTML5 + CSS3 + Vanilla JavaScript      |
                           +-----+-------------------+----------------+
                                 |                   |
                1. Direct BYOK   |                   | 2. PDF Uploads &
                   AI Queries    |                   |    Study Logs
                                 v                   v
                    +--------------------+   +-------------------------------+
                    | Google Gemini REST |   |    PYTHON FASTAPI BACKEND     |
                    |   API (v1beta)     |   |   (main.py on Port 8000)      |
                    | Streaming (SSE)    |   +---------------+---------------+
                    +--------------------+                   |
                                                             | 3. SQL Insert /
                                                             |    Select Queries
                                                             v
                                             +-------------------------------+
                                             |       SQLITE DATABASE         |
                                             |        (cognistudy.db)        |
                                             +-------------------------------+
```

---

## 🚀 Getting Started

### Prerequisites
* **Python 3.10+** installed
* A modern web browser (Chrome, Edge, Firefox, Brave, Safari)
* *(Optional)* A free Google Gemini API key from [Google AI Studio](https://aistudio.google.com/app/apikey)

---

### Installation & Run

#### 1. Clone the repository
```bash
git clone https://github.com/your-username/cognistudy-ai.git
cd cognistudy-ai
```

#### 2. Start the FastAPI Backend
In your terminal, install Python dependencies and run the server:
```bash
# Install dependencies
pip install -r requirements.txt

# Start FastAPI server on port 8000
python main.py
```
* The API will be live at: `http://127.0.0.1:8000`
* Interactive API Documentation (Swagger): `http://127.0.0.1:8000/docs`

#### 3. Launch the Frontend
Open another terminal in the same directory and start a local HTTP server:
```bash
# Using Python
python -m http.server 5500
```
*(Or right-click `index.html` $\rightarrow$ **Open with Live Server** in VS Code).*

Navigate to **`http://127.0.0.1:5500`** in your browser.

---

## 🔌 API Endpoints Reference

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/` | Health check and parser diagnostics |
| `POST` | `/api/extract-pdf` | Uploads multipart `.pdf`, extracts text with PyMuPDF, and cleans formatting |
| `POST` | `/api/history` | Saves a completed study session (`topic`, `activityType`, `score`) into SQLite |
| `GET` | `/api/history` | Returns all recorded study sessions ordered by newest first |

---

## ⚙️ Configuration (BYOK Model)

CogniStudy AI uses a **Bring-Your-Own-Key (BYOK)** security model:
1. Open the web app and click **⚙️ Settings** in the top navigation.
2. Paste your Google AI Studio API key.
3. Select your preferred model (`Gemini 3.5 Flash Lite`, `Gemini 3.8 Flash`, or `Gemini 3.6 Flash`).
4. Click **Save Settings**. Your key is stored strictly on your local device (`localStorage`) and is never sent to the backend server.

> **Note:** If no key is provided, the application runs on its **Built-in Smart Offline Knowledge Engine** with pre-seeded question banks and heuristic NLP summaries!

---

## 🌐 Deployment

* **Frontend:** Ready for zero-configuration static deployment on **Vercel** (`vercel.json`) or **Netlify** (`_redirects`).
* **Backend:** Can be deployed to Render, Railway, AWS EC2, or tunneled to your local machine using **Cloudflare Tunnels** (`cloudflared tunnel --url http://localhost:8000`) or **ngrok**.

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

* **CogniStudy AI Team** - Built as a full-stack educational workspace project.
* Special thanks to **Google DeepMind** (Gemini API) and the open-source maintainers of **FastAPI**, **PyMuPDF**, and **KaTeX**.
