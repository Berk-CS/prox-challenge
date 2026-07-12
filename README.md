# Vulcan OmniPro 220 — AI Welder Technical Specialist

This is the intelligent, multimodal reasoning agent designed for the [Vulcan OmniPro 220 multiprocess welder](https://www.harborfreight.com/omnipro-220-industrial-multiprocess-welder-with-120240v-input-57812.html). It helps users set up, configure, and troubleshoot their welder directly from an interactive dashboard.

### 🛠️ Tech Stack
* **Core Framework:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
* **AI & Agents:** Anthropic Claude Agent SDK, OpenAI SDK
* **UI & Visualizations:** Mermaid.js (Wiring diagrams), Recharts (Weld settings charts), Sandpack (Interactive widgets)
* **Data Pipeline:** Python, PyMuPDF (`fitz`), GPT-4o Vision (multimodal PDF indexing & structural parsing)

<img src="product.webp" alt="Vulcan OmniPro 220" width="400" /> <img src="product-inside.webp" alt="Vulcan OmniPro 220 — inside panel" width="400" />


## Getting Started ~ 1 min setup

Follow these steps to run the application locally.

### 1. Prerequisites
Ensure you have **Node.js (v20+)** installed on your system. *(Note: The manuals have already been pre-extracted, so Python is not required to run the app).*

### 2. Install Dependencies
Clone the repository and install npm packages:
```bash
npm install --legacy-peer-deps
```

### 3. Configure Environmental Variables
Copy the `.env.example` file to `.env` and plug in your Anthropic and OpenAI API Keys:
```bash
cp .env.example .env
```
Open `.env` and edit (NOTE: you only need one of the two keys, depending on which agent you want to use):
```
ANTHROPIC_API_KEY=your-api-key-here
OPENAI_API_KEY=your-api-key-here
```

### 4. Launch the Server
Start the Next.js development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to start using the console.

### Optional: Re-Extracting the Manuals
If you want to update the manuals or run the extraction pipeline yourself, you'll need **Python (v3.10+)** installed.

1. Install Python PDF extraction dependencies:
```bash
python -m pip install pypdf pymupdf
```

2. Run the pre-processing extraction script. This parses the manual PDFs from `files/` page-by-page, extracts text files, pulls out the schematic diagrams, and indexes keywords:
```bash
python scripts/extract_manuals.py
```

---

## Architecture & Design Decisions

My solution focused on optimizing for five things: accuracy, dynamism, efficiency, fail protection, and simplicity. 

### 🎯 1. Accuracy
I first analyzed different approaches I can take for manual retrieval. For instance, I thought about using a vector search (RAG) with local embeddings, but it had a significant problem: **semantic drift**. Vector searches often hallucinate or retrieve the wrong pages when searching for exact technical specifications (e.g., confusing a "200A duty cycle" on one page with a "200A fuse" on another). I also thought about loading the entire 48-page manual into the system prompt, but obviously that eats up a lot of input tokens and can degrade accuracy. 

So I decided to inject a compact, structured JSON index (`manual_index_compact.json`) directly into the prompt. This solution is the best approach because it gives the agent a deterministic, bird's-eye map of the manual. The agent understands the purpose of every section and can use this index to call a `read_pages` tool or execute `grep` for exact string matches as an alternative, guaranteeing 100% accurate specification retrieval without vector hallucinations. 

### ⚡ 2. Dynamism
To provide deeply customized visual answers for any user query, I built a **Two-Phase Generative Visual Engine**. The architecture actively decouples the reasoning loop from code generation. Step 1 figures out the complex technical answer. Step 2 acts as a dedicated design agent that dynamically writes custom React components, SVG illustrations, or Mermaid flowcharts at runtime. This allows the system to generate an infinite variety of perfectly tailored widgets, charts, and interactive calculators on the fly, adapting instantly to questions that static, pre-built components simply cannot handle.

### 🚀 3. Efficiency
The architecture is designed to be exceptionally fast and lightweight. By utilizing an in-memory `grep` mechanism and a pre-compiled JSON index, the entire agent runs seamlessly within a serverless Next.js API route. This completely eliminates the need for bulky vector databases or heavy local embedding models. The result is zero cold-start latency, zero database overhead, and instant responsiveness, keeping the memory footprint minimal while delivering blazing-fast answers.

### 🛡️ 4. Fail Protection
Runtime code generation is inherently fragile. I thought about implementing a strict server-side "compile gate" that rejects the LLM's code if it fails to build and forces the model into a retry loop. However, this wastes tokens, increases latency, and degrades the UX. 

Instead, I built client-side AST auto-fixing. My `prepareCodeForSandpack` utility automatically parses the LLM's code, injecting missing React imports or default exports (silently fixing the vast majority of model syntax mistakes for free). If the code still fails, a localized React Error Boundary catches the crash inside the sandboxed iframe, ensuring the main chat application never breaks.

### 🛠️ 5. Simplicity
The entire application is consolidated into a single-repo Next.js architecture, making it incredibly easy to deploy and maintain. There are no complex multi-tier setups, no third-party embedding keys and local database dependencies; developers can boot the entire multimodal agent with a simple `npm run dev`.

## Unique features & other highlights

* **Voice-Assistant** - support for both typing by voice and listening to AI text output
* **Developer-Mode** - A built-in dev mode exposes the agent's internal thought process and tool execution loops. Users can click on tool logs to instantly see how the LLM routed queries, retrieved pages, and formatted parameters under the hood.
* **Side-by-Side-Workspace** - Simple and intutitive access to the chatbot, manual and artifact. 

* **Memory** - persistant chat history to prevent accidentally reloading and losing conversation history. 

* **Industrial-Theming** - Designed with a premium, high-contrast dark mode tailored for shop environments. The typography, amber accents, and visual states feel native to an industrial welding interface.

