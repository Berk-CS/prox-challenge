# Vulcan OmniPro 220 Assistant Guidelines

This project implements a multimodal reasoning agent for the Vulcan OmniPro 220 multiprocess welder.

## Project Structure
- `files/` - Contains the raw PDF owner manuals and charts.
- `public/extracted/` - Contains extracted assets:
  - `text/` - Text page-by-page markdown extracts (useful for text lookup).
  - `images/` - Extracted layout images, diagrams, schematics, and photos.
  - `metadata.json` - High-level index mapping pages to figures, keywords, and topics.
- `src/app/` - The Next.js client App Router workspace layout and client application.
- `src/app/api/chat/route.ts` - The server-side API endpoint invoking the Claude Agent SDK.

## Agent Behavior Guidelines
1. **Document Reference**: When users ask technical queries about the welder, prioritize reading the page markdown files located in `public/extracted/text/`.
2. **Visual Surfacing**: If the content requires illustrations (e.g. socket wiring, polarity setup), generate SVG vector drawings or point to images in `/extracted/images/` using standard Markdown image links or wrapping in an `<antArtifact>` tag of type `image/svg+xml`.
3. **Interactive Components**: For calculators, configuration matrices, or interactive tables, generate React component code wrapped in `<antArtifact>` of type `application/vnd.ant.react`.
