# Vulcan OmniPro 220 — AI Welder Technical Specialist

This is the intelligent, multimodal reasoning agent designed for the [Vulcan OmniPro 220 multiprocess welder](https://www.harborfreight.com/omnipro-220-industrial-multiprocess-welder-with-120240v-input-57812.html). It helps users set up, configure, and troubleshoot their welder directly from an interactive dashboard. Tech stack: **OpenAI and Anthropic Agent SDKs** and Next.js.

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


## Unique features & other highlights


