# Vulcan OmniPro 220 — AI Welder Console

An intelligent, multimodal reasoning agent workspace designed for the [Vulcan OmniPro 220 multiprocess welder](https://www.harborfreight.com/omnipro-220-industrial-multiprocess-welder-with-120240v-input-57812.html). Powered by the **Anthropic Claude Agent SDK** and built on Next.js, this application helps users set up, configure, and troubleshoot their welder directly from an interactive dashboard.

<img src="product.webp" alt="Vulcan OmniPro 220" width="400" /> <img src="product-inside.webp" alt="Vulcan OmniPro 220 — inside panel" width="400" />

---

## Key Features

1.  **Deep Technical Accuracy**: The agent queries page-level markdown manuals dynamically using the Claude Agent SDK's `Read` and `Grep` search tools, verifying exact amperage settings, polarity configurations, and duty cycles.
2.  **Live Action Telemetry Logs**: Real-time logging of the agent's reasoning process and tool runs is displayed in the workspace, letting you see exactly what page the agent is checking.
3.  **Industrial Garage Theme**: High-contrast, custom-designed dark theme (deep carbon backgrounds, yellow warning stripes, plasma orange highlights, and green glowing LCD telemetry tags).
4.  **Claude Artifact Sandboxes**: Rich sandboxed visualizers that parse custom `<antArtifact>` streams from the agent and render:
    *   **Interactive React Components** (`application/vnd.ant.react`) using `react-runner` to mount fully functional calculators, joint layout selectors, and weld thickness configurators.
    *   **Mermaid Flowcharts** (`application/vnd.ant.mermaid`) for guided step-by-step diagnostic paths.
    *   **Vector SVGs** (`image/svg+xml`) of socket pins and cables setup.
    *   **HTML Frames** (`text/html`) for styled custom preview pages.
5.  **Manual Page & Asset Explorer**: Browse manual contents and extracted page images (like weld defect pictures from page 38) side-by-side with the active assistant chat.

---

## Getting Started

Follow these steps to run the application locally.

### 1. Prerequisites
Ensure you have **Node.js (v20+)** and **Python (v3.10+)** installed on your system.

### 2. Install Dependencies
Clone the repository and install npm packages:
```bash
npm install --legacy-peer-deps
```

Install Python PDF extraction dependencies:
```bash
python -m pip install pypdf pymupdf
```

### 3. Extract the Manuals
Run the pre-processing extraction script. This parses the manual PDFs from `files/` page-by-page, extracts text files, pulls out the schematic diagrams, and indexes keywords:
```bash
python scripts/extract_manuals.py
```

### 4. Configure Environmental Variables
Copy the `.env.example` file to `.env` and plug in your Anthropic API Key:
```bash
cp .env.example .env
```
Open `.env` and edit:
```
ANTHROPIC_API_KEY=your-api-key-here
```

### 5. Launch the Server
Start the Next.js development server:
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to start using the console.

---

## Workspace Architecture

```mermaid
graph TD
    PDF[Owner Manual PDFs] -->|extract_manuals.py| Extracted[public/extracted/]
    Extracted -->|Text & Images| App[Next.js Client app]
    App -->|User Message| API[src/app/api/chat/route.ts]
    API -->|Claude Agent SDK| Agent[Agent Runner Engine]
    Agent -->|Read / Grep| Extracted
    Agent -->|Streaming SSE Events| API
    API -->|SSE Stream| App
    App -->|Parse antArtifact| Preview[Right Workspace Panel]
```

### Key Source Files
*   [extract_manuals.py](file:///c:/Users/henez/Documents/some_project/prox-challenge/scripts/extract_manuals.py): Pipeline parsing PDFs into structured pages and image assets.
*   [route.ts](file:///c:/Users/henez/Documents/some_project/prox-challenge/src/app/api/chat/route.ts): Connects to the Claude Agent SDK, restricting it to manual reading tools.
*   [page.tsx](file:///c:/Users/henez/Documents/some_project/prox-challenge/src/app/page.tsx): Main console interface containing chat, tool logs, manual explorer, and sandbox preview tabs.
*   [globals.css](file:///c:/Users/henez/Documents/some_project/prox-challenge/src/app/globals.css): Visual style system containing colors, telemetry glow styling, and warning hazard striping.
