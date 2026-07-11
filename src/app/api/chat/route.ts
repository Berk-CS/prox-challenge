import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";


const OPENAI_MODEL = "gpt-4o-mini";

const tools = [
  {
    type: "function" as const,
    function: {
      name: "read_pages",
      description: "Reads the content of specified page-level markdown files for a given manual source.",
      parameters: {
        type: "object",
        properties: {
          source: {
            type: "string",
            enum: ["owner-manual", "quick-start-guide", "selection-chart"],
            description: "The source manual to read from."
          },
          pages: {
            type: "array",
            items: {
              type: "integer"
            },
            description: "An array of page numbers to load."
          }
        },
        required: ["source", "pages"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "grep",
      description: "Searches for a keyword or phrase across all page markdown files.",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "The exact search term or phrase to look for."
          },
          source: {
            type: "string",
            enum: ["owner-manual", "quick-start-guide", "selection-chart"],
            description: "Optional. Restricts search to a specific manual source."
          }
        },
        required: ["query"]
      }
    }
  }
];

function readPage(source: string, pageNum: number): string {
  const textDir = path.resolve(process.cwd(), "public", "extracted", "text");
  const filePath = path.resolve(textDir, source, `page_${pageNum}.md`);
  if (!filePath.startsWith(textDir)) {
    return "Error: Invalid path access.";
  }
  if (fs.existsSync(filePath)) {
    return fs.readFileSync(filePath, "utf-8");
  }
  return `Error: Page ${pageNum} not found in ${source}.`;
}

interface GrepMatch {
  source: string;
  page: number;
  lineNum: number;
  lineContent: string;
}

function runGrep(query: string, sourceFilter?: string): GrepMatch[] {
  const matches: GrepMatch[] = [];
  const textDir = path.resolve(process.cwd(), "public", "extracted", "text");

  const sources = sourceFilter
    ? [sourceFilter]
    : ["owner-manual", "quick-start-guide", "selection-chart"];

  const lowerQuery = query.toLowerCase();

  for (const src of sources) {
    const srcDir = path.resolve(textDir, src);
    if (!srcDir.startsWith(textDir)) continue;
    if (!fs.existsSync(srcDir)) continue;

    const files = fs.readdirSync(srcDir);
    for (const file of files) {
      if (!file.endsWith(".md")) continue;

      const matchPage = file.match(/page_(\d+)\.md/);
      if (!matchPage) continue;
      const pageNum = parseInt(matchPage[1], 10);

      const filePath = path.join(srcDir, file);
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.split("\n");

      for (let i = 0; i < lines.length; i++) {
        if (lines[i].toLowerCase().includes(lowerQuery)) {
          matches.push({
            source: src,
            page: pageNum,
            lineNum: i + 1,
            lineContent: lines[i].trim()
          });

          if (matches.length >= 30) {
            return matches;
          }
        }
      }
    }
  }
  return matches;
}

export async function POST(req: NextRequest) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    }

    const { messages, model } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 });
    }

    const compactIndexPath = path.join(process.cwd(), "public", "extracted", "manual_index_compact.json");
    let compactIndexStr = "";
    if (fs.existsSync(compactIndexPath)) {
      compactIndexStr = fs.readFileSync(compactIndexPath, "utf-8");
    }

    const SYSTEM_PROMPT = `You are a professional, expert reasoning assistant for the Vulcan OmniPro 220 multiprocess welder.
Your goal is to answer deep technical questions about this welder accurately, helpfully, and using the official manuals.

To ensure accuracy and avoid hallucination, you must check the manuals. You have access to a compacted index of the manuals which maps section titles to page numbers and outlines visual assets.
Here is the compacted manual index content:
${compactIndexStr}

Key Mapping for the compact index:
- om = Owner's Manual, qsg = Quick Start Guide, sc = Selection Chart
- t = Section Title
- p = Page numbers belonging to this section
- v = Visual assets on the pages (omitted if none exist)
- d = Detailed description of the diagram/visual (useful for checking if a diagram is relevant)

CRITICAL PROCESS FOR RECOVERING MANUAL CONTENT:
1. Lookup the index inside your prompt to find relevant pages.
2. Call the "read_pages" tool to load the contents of the relevant pages.
3. If the index does not help or your search is too specific, use the "grep" tool to find word matches across the manual pages.
4. Cite your sources in your final response: use [Owner's Manual p. XX], [Quick Start Guide p. XX], or [Selection Chart p. XX] format.

REAL-TIME DIAGRAMS, PROGRAMMATIC SCHEMATICS & INTERACTIVE CONTENT (ARTIFACTS):
- You must proactively decide when a visual is appropriate and generate it.
- Render artifacts in your response to present code-generated visualizations, interactive tools, flowcharts, or diagrams.
- Write your text response first, and then append the artifact block at the very end of your response.

1. GENERATING PROGRAMMATIC DIAGRAMS & SCHEMATICS (SVG / React):
   When the user asks for a control layout, a wire loader setup, joint designs, or socket polarity connections, you should draw it programmatically inside an artifact:
   - For simple layouts/schematics: Use the SVG Diagram ("image/svg+xml") type to draw vector graphics (e.g. circles, lines, rectangles, paths) showing wire spool components, front panel knob positions, or joint geometries.
   - For sockets polarity wiring: Use the React Component type to show a beautiful interactive mock of the welder's front panel sockets (+ and - terminals) with cables (ground clamp vs electrode holder/gun) dynamically plugged in based on the selected configuration.

2. GENERATING INTERACTIVE WIDGETS (React Components):
   Write custom React components to create interactive tools for complex math or setups:
   - Polarity Socket wiring: For process setup questions, create an interactive React component that displays the sockets (+ and - terminals) and wires/cables plug-in locations based on the selected process (MIG Solid-core DCEP vs MIG Flux-core DCEN vs Stick vs TIG).
   - Duty Cycle Calculator: For duty cycle queries, write a React component calculator. It should take process and input amperage, and calculate: duty cycle %, weld time (min), rest time (min), and include a startable rest countdown timer widget.
   - Settings Configurator: For voltage/wire speed queries, write a React component settings configurator. Let the user select process, material type, wire size, and thickness, and instantly print the recommended wire feed speed, voltage, polarity setup, and gas choice.

Expectations when writing React component code:
* Structure: Write a standard, fully functional single-file React component.
* Imports: You MUST explicitly include all necessary 'import' statements at the top of the file (e.g., 'import React, { useState, useEffect } from "react";').
* Third-Party Packages: You can freely import and use components from 'lucide-react' or 'recharts'. Assume they are available dependencies. Do NOT use relative path imports for custom local files.
* Exports: You MUST include exactly one 'export default function App()' as the main entry point component so the builder can render it.
* Mounting: Do NOT write any manual 'ReactDOM.render' or 'createRoot' calls.
* Aesthetics: Style widgets to look premium and tactile, matching an industrial control panel (slate/zinc containers, custom border styling, amber/orange highlights, glowing indicators, fully functional form inputs, and transitions). Prefer clean inline styles or vanilla CSS unless Tailwind is explicitly pre-configured in the environment template.

3. TROUBLESHOOTING FLOWCHARTS (Mermaid Diagrams):
   Use Mermaid diagram artifacts for step-by-step defect troubleshooting. Remember to quote special characters in node labels: 'E["CTWD <= 1/2 inch"]'.

To create an artifact, wrap it in opening and closing '<antArtifact>' tags:
<antArtifact identifier="unique-id" type="MIME-TYPE" title="Title">
  [content]
</antArtifact>
`;

    const isAnthropic = model === "claude" || model === "anthropic" || model === "claude-code";

    let finalAssistantText = "";
    let toolLogs: any[] = [];

    if (isAnthropic) {
      const client = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });

      const apiMessages: any[] = [];
      for (const m of messages) {
        if (m.role === "system") continue;
        apiMessages.push({
          role: m.role === "user" ? "user" : "assistant",
          content: m.text || m.content || ""
        });
      }

      const anthropicTools: Anthropic.Messages.Tool[] = [
        {
          name: "read_pages",
          description: "Reads the content of specified page-level markdown files for a given manual source.",
          input_schema: {
            type: "object",
            properties: {
              source: {
                type: "string",
                enum: ["owner-manual", "quick-start-guide", "selection-chart"],
                description: "The source manual to read from."
              },
              pages: {
                type: "array",
                items: {
                  type: "integer"
                },
                description: "An array of page numbers to load."
              }
            },
            required: ["source", "pages"]
          }
        },
        {
          name: "grep",
          description: "Searches for a keyword or phrase across all page markdown files.",
          input_schema: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "The exact search term or phrase to look for."
              },
              source: {
                type: "string",
                enum: ["owner-manual", "quick-start-guide", "selection-chart"],
                description: "Optional source filter. If omitted, searches all manuals."
              }
            },
            required: ["query"]
          }
        }
      ];

      let keepRunning = true;
      let iterations = 0;
      const maxIterations = 5;

      while (keepRunning && iterations < maxIterations) {
        iterations++;
        console.log(`Claude Agent Loop Turn ${iterations}`);

        toolLogs.push({
          id: `llm-turn-${iterations}`,
          type: "llm_turn",
          toolName: `LLM Completion (Turn ${iterations})`,
          arguments: "Prompting Claude with context...",
          status: "completed",
          timestamp: new Date().toLocaleTimeString()
        });

        const response = await client.messages.create({
          model: "claude-sonnet-5",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          cache_control: { type: "ephemeral" },
          messages: apiMessages,
          tools: anthropicTools,
          stream: false
        });

        let assistantText = "";
        let toolCalls = [];

        for (const block of response.content) {
          if (block.type === "text") {
            assistantText += block.text;
          } else if (block.type === "tool_use") {
            toolCalls.push(block);
          }
        }

        if (assistantText) {
          finalAssistantText += assistantText;
        }

        if (toolCalls.length > 0) {
          const assistantContentBlocks: any[] = [];
          if (assistantText) {
            assistantContentBlocks.push({ type: "text", text: assistantText });
          }
          for (const tc of toolCalls) {
            assistantContentBlocks.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: tc.input
            });
          }
          apiMessages.push({ role: "assistant", content: assistantContentBlocks });

          const toolResultBlocks: any[] = [];

          for (const tc of toolCalls) {
            let result = "";
            let summary = "";
            let isError = false;

            try {
              if (tc.name === "read_pages") {
                const { source, pages } = tc.input as any;
                if (!source || !pages || !Array.isArray(pages)) throw new Error("Missing parameters");
                const contents = pages.map((p: number) => `--- Page ${p} (${source}) ---\n${readPage(source, p)}`);
                result = contents.join("\n\n");
                summary = `Loaded ${pages.length} pages of '${source}'`;
              } else if (tc.name === "grep") {
                const { query, source } = tc.input as any;
                if (!query) throw new Error("Missing parameter 'query'");
                const matches = runGrep(query, source);
                result = JSON.stringify(matches, null, 2);
                summary = `Searched for "${query}". Found ${matches.length} matches.`;
              } else {
                throw new Error(`Unknown tool: ${tc.name}`);
              }
            } catch (err: any) {
              result = `Error executing tool: ${err.message}`;
              summary = `Failed: ${err.message}`;
              isError = true;
            }

            toolResultBlocks.push({
              type: "tool_result",
              tool_use_id: tc.id,
              content: result,
              is_error: isError
            });

            toolLogs.push({
              id: tc.id,
              type: "tool",
              toolName: tc.name,
              arguments: tc.input,
              status: isError ? "failed" : "completed",
              resultSummary: summary,
              rawOutput: result,
              timestamp: new Date().toLocaleTimeString()
            });
          }
          apiMessages.push({ role: "user", content: toolResultBlocks });
          keepRunning = true;
        } else {
          keepRunning = false;
        }
      }

      return NextResponse.json({
        text: finalAssistantText,
        toolLogs: toolLogs
      });

    } else {
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 60 * 1000,
        maxRetries: 3
      });

      const apiMessages: any[] = [
        { role: "system", content: SYSTEM_PROMPT },
        ...messages.map((m: any) => ({
          role: m.role,
          content: m.text || m.content || ""
        }))
      ];

      let keepRunning = true;
      let iterations = 0;
      const maxIterations = 5;

      while (keepRunning && iterations < maxIterations) {
        iterations++;
        console.log(`Agent Loop Turn ${iterations}`);

        toolLogs.push({
          id: `llm-turn-${iterations}`,
          type: "llm_turn",
          toolName: `LLM Completion (Turn ${iterations})`,
          arguments: "Prompting OpenAI with context...",
          status: "completed",
          timestamp: new Date().toLocaleTimeString()
        });

        const response = await client.chat.completions.create({
          model: OPENAI_MODEL,
          messages: apiMessages,
          tools: tools,
          stream: false
        });

        const choice = response.choices[0];
        const message = choice.message;

        if (message.content) {
          finalAssistantText += message.content;
        }

        const toolCalls = message.tool_calls || [];

        if (toolCalls.length > 0) {
          apiMessages.push(message);

          for (const tc of toolCalls) {
            if (tc.type !== "function") continue;
            let parsedArgs: any = {};
            try {
              parsedArgs = JSON.parse(tc.function.arguments);
            } catch (e) {
              console.error("Args parsing failed:", tc.function.arguments);
            }

            let result = "";
            let summary = "";
            let isError = false;

            try {
              if (tc.function.name === "read_pages") {
                const { source, pages } = parsedArgs;
                if (!source || !pages || !Array.isArray(pages)) throw new Error("Missing parameters");
                const contents = pages.map((p: number) => `--- Page ${p} (${source}) ---\n${readPage(source, p)}`);
                result = contents.join("\n\n");
                summary = `Loaded ${pages.length} pages of '${source}'`;
              } else if (tc.function.name === "grep") {
                const { query, source } = parsedArgs;
                if (!query) throw new Error("Missing parameter 'query'");
                const matches = runGrep(query, source);
                result = JSON.stringify(matches, null, 2);
                summary = `Searched for "${query}". Found ${matches.length} matches.`;
              } else {
                throw new Error(`Unknown tool: ${tc.function.name}`);
              }
            } catch (err: any) {
              result = `Error executing tool: ${err.message}`;
              summary = `Failed: ${err.message}`;
              isError = true;
            }

            apiMessages.push({
              role: "tool",
              tool_call_id: tc.id,
              name: tc.function.name,
              content: result
            });

            toolLogs.push({
              id: tc.id,
              type: "tool",
              toolName: tc.function.name,
              arguments: parsedArgs,
              status: isError ? "failed" : "completed",
              resultSummary: summary,
              rawOutput: result,
              timestamp: new Date().toLocaleTimeString()
            });
          }
          keepRunning = true;
        } else {
          keepRunning = false;
        }
      }

      return NextResponse.json({
        text: finalAssistantText,
        toolLogs: toolLogs
      });
    }

  } catch (err: any) {
    console.error("API route failed:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
