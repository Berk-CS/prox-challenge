import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";
import Anthropic from "@anthropic-ai/sdk";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

const OPENAI_MODEL = "gpt-5.4";

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

interface VisualDecision {
  visual_needed: boolean;
  visual_type?: "react_component" | "svg_diagram" | "mermaid_flowchart";
  proposed_title?: string;
}

function extractVisualDecision(text: string): { decision: VisualDecision; cleanText: string } {
  const jsonBlockRegex = /```json\s*([\s\S]*?)```/g;
  const match = jsonBlockRegex.exec(text);

  if (match) {
    try {
      const decision = JSON.parse(match[1].trim());
      const cleanText = text.replace(match[0], "").trim();
      return { decision, cleanText };
    } catch (e) {
      console.error("Failed to parse JSON decision from markdown block:", e);
    }
  }

  // Fallback: search for raw JSON curly braces
  const firstBrace = text.indexOf("{");
  const lastBrace = text.indexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    try {
      const jsonStr = text.substring(firstBrace, lastBrace + 1);
      const decision = JSON.parse(jsonStr.trim());
      const cleanText = text.replace(jsonStr, "").trim();
      // Strip any residual markdown formatting if JSON block was naked
      const finalCleanText = cleanText.replace(/```json\s*```/g, "").trim();
      return { decision, cleanText: finalCleanText };
    } catch (e) {
      console.error("Failed to parse raw JSON decision:", e);
    }
  }

  return {
    decision: { visual_needed: false },
    cleanText: text
  };
}

export async function POST(req: NextRequest) {
  try {
    let body;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON request body." }, { status: 400 });
    }

    const { messages, model, generateVisual, userQuery, cleanText, retrievedContent } = body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 });
    }

    const compactIndexPath = path.join(process.cwd(), "public", "extracted", "manual_index_compact.json");
    let compactIndexStr = "";
    if (fs.existsSync(compactIndexPath)) {
      compactIndexStr = fs.readFileSync(compactIndexPath, "utf-8");
    }

    const RESEARCH_PROMPT = `You are an expert technical reasoning assistant for the Vulcan OmniPro 220 multiprocess welder.
Your goal is to provide deep, accurate technical answers using the official manuals via your tools.

MANUAL INDEX:
${compactIndexStr}
(Key: om=Owner's Manual, qsg=Quick Start Guide, sc=Selection Chart | t=Title, p=Page, v=Visuals, d=Description)

RECOVERY PROCESS:
1. Cross-reference the index to find relevant pages.
2. Call the "read_pages" tool to load the exact content.
3. Use the "grep" tool if your keyword search is highly specific or page lookup fails.
4. Cite sources in your text using the formats: [Owner's Manual p. XX], [Quick Start Guide p. XX], or [Selection Chart p. XX].

VISUAL ARTIFACT EVALUATION:
Dynamically evaluate if the technical solution would be significantly enhanced by a custom programmatic graphic, an interactive setup configurator, a data chart, or a troubleshooting flowchart. 
If a quesion is too difficult or complex to answer with just text, then use visual. If you are not sure whether or not to show visual, then show visual. 
OUTPUT FORMAT:
First append a single JSON block to declare your visual asset decision. Do not add any text after this block. then Provide your conversational, markdown-formatted technical answer.

Format exactly like this:
\`\`\`json
{
  "visual_needed": true, 
  "visual_type": "react_component", // Choose from: "react_component", "svg_diagram", "mermaid_flowchart"
  "proposed_title": "Descriptive Title of the Visual Asset"
}
\`\`\`

[Your clear, comprehensive markdown technical response here]`;

    const VISUAL_GENERATOR_PROMPT = `You are an expert frontend engineer and industrial UI designer specializing in welding equipment interfaces.
Your task is to generate a single standalone programmatic visual asset that aligns perfectly with the provided manual documentation and previous text answer.

ARTIFACT CAPABILITIES:
- "image/svg+xml": Use for static vector graphics, control panel physical layouts, knob indices, torch angles, or wire-loader schematics.
- "react": Use for interactive configuration tools, multi-variable calculators (voltage, speed, thickness), or interactive plug/cable polarity maps.
- "mermaid": Use for step-by-step troubleshooting defect flowcharts. Quote special characters in nodes like: E["CTWD <= 1/2 inch"].

CODE EXPECTATIONS (For React Components):
- Write a standard, fully functional single-file React component.
- Include all necessary React imports at the top. Do NOT import relative local files.
- Export exactly one main component: 'export default function App()'. Do NOT call ReactDOM.render.
- Aesthetics: Style widgets to look modern, clean but simple.

OUTPUT WRAPPER:
Wrap your entire generated code within opening and closing <antArtifact> tags. Do not output conversational filler text or write markdown wrappers around the artifact.

Format exactly like this:
<antArtifact identifier="dynamic-welder-asset" type="MIME-TYPE-HERE" title="TITLE-HERE">
[Your raw code content here]
</antArtifact>`;

    const isAnthropic = model === "claude" || model === "anthropic" || model === "claude-code";

    if (generateVisual) {
      const visualQuery = `User Query: ${userQuery || ""}

Manual Page Extracts:
${retrievedContent || "No specific manual pages retrieved."}

Technical Text Answer:
${cleanText || ""}`;

      if (isAnthropic) {
        const client = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY
        });

        const visualResponse = await client.messages.create({
          model: "claude-sonnet-5",
          max_tokens: 4096,
          system: VISUAL_GENERATOR_PROMPT,
          messages: [
            { role: "user", content: visualQuery }
          ],
          stream: false
        });

        let visualCode = "";
        for (const block of visualResponse.content) {
          if (block.type === "text") {
            visualCode += block.text;
          }
        }
        return NextResponse.json({ text: visualCode });
      } else {
        const client = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY,
          timeout: 60 * 1000,
          maxRetries: 3
        });

        const visualResponse = await client.chat.completions.create({
          model: OPENAI_MODEL,
          messages: [
            { role: "system", content: VISUAL_GENERATOR_PROMPT },
            { role: "user", content: visualQuery }
          ],
          stream: false
        });

        const visualCode = visualResponse.choices[0].message.content || "";
        return NextResponse.json({ text: visualCode });
      }
    }

    let finalAssistantText = "";
    let toolLogs: any[] = [];
    const retrievedPagesContent: string[] = [];

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

      // STEP 1 & 2: Research and Answer Loop
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
          max_tokens: 50000,
          system: RESEARCH_PROMPT,
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
                const contents = pages.map((p: number) => {
                  const pageText = readPage(source, p);
                  retrievedPagesContent.push(`Source: ${source}, Page ${p}:\n${pageText}`);
                  return `--- Page ${p} (${source}) ---\n${pageText}`;
                });
                result = contents.join("\n\n");
                summary = `Loaded ${pages.length} pages of '${source}'`;
              } else if (tc.name === "grep") {
                const { query, source } = tc.input as any;
                if (!query) throw new Error("Missing parameter 'query'");
                const matches = runGrep(query, source);
                result = JSON.stringify(matches, null, 2);
                summary = `Searched for "${query}". Found ${matches.length} matches.`;
                retrievedPagesContent.push(`Grep matches for query "${query}":\n${result}`);
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

      // STEP 2 Parsing: Extract technical response and decision JSON block
      const { decision, cleanText } = extractVisualDecision(finalAssistantText);
      console.log(`[Step 2] Visual needed evaluation:`, decision);

      toolLogs.push({
        id: `visual-decision-${Date.now()}`,
        type: "llm_turn",
        toolName: "Step 2: Visual Asset Decision",
        arguments: {
          raw_llm_response: finalAssistantText
        },
        status: "completed",
        resultSummary: `Visual needed: ${decision.visual_needed}${decision.visual_needed ? ` (${decision.visual_type})` : ""}`,
        rawOutput: JSON.stringify(decision, null, 2),
        timestamp: new Date().toLocaleTimeString()
      });

      return NextResponse.json({
        text: cleanText,
        toolLogs: toolLogs,
        decision: decision,
        retrievedContent: retrievedPagesContent.join("\n\n")
      });

    } else {
      const client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
        timeout: 60 * 1000,
        maxRetries: 3
      });

      const apiMessages: any[] = [
        { role: "system", content: RESEARCH_PROMPT },
        ...messages.map((m: any) => ({
          role: m.role,
          content: m.text || m.content || ""
        }))
      ];

      let keepRunning = true;
      let iterations = 0;
      const maxIterations = 5;

      // STEP 1 & 2: Research and Answer Loop
      while (keepRunning && iterations < maxIterations) {
        iterations++;
        console.log(`OpenAI Agent Loop Turn ${iterations}`);

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
                const contents = pages.map((p: number) => {
                  const pageText = readPage(source, p);
                  retrievedPagesContent.push(`Source: ${source}, Page ${p}:\n${pageText}`);
                  return `--- Page ${p} (${source}) ---\n${pageText}`;
                });
                result = contents.join("\n\n");
                summary = `Loaded ${pages.length} pages of '${source}'`;
              } else if (tc.function.name === "grep") {
                const { query, source } = parsedArgs;
                if (!query) throw new Error("Missing parameter 'query'");
                const matches = runGrep(query, source);
                result = JSON.stringify(matches, null, 2);
                summary = `Searched for "${query}". Found ${matches.length} matches.`;
                retrievedPagesContent.push(`Grep matches for query "${query}":\n${result}`);
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

      // STEP 2 Parsing: Extract technical response and decision JSON block
      const { decision, cleanText } = extractVisualDecision(finalAssistantText);
      console.log(`[Step 2] Visual needed evaluation:`, decision);

      toolLogs.push({
        id: `visual-decision-${Date.now()}`,
        type: "llm_turn",
        toolName: "Step 2: Visual Asset Decision",
        arguments: {
          raw_llm_response: finalAssistantText
        },
        status: "completed",
        resultSummary: `Visual needed: ${decision.visual_needed}${decision.visual_needed ? ` (${decision.visual_type})` : ""}`,
        rawOutput: JSON.stringify(decision, null, 2),
        timestamp: new Date().toLocaleTimeString()
      });

      return NextResponse.json({
        text: cleanText,
        toolLogs: toolLogs,
        decision: decision,
        retrievedContent: retrievedPagesContent.join("\n\n")
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
