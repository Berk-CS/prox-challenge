import { NextRequest, NextResponse } from "next/server";
import { OpenAI } from "openai";
import * as fs from "fs";
import * as path from "path";

export const dynamic = "force-dynamic";

// Model definition: we default to gpt-4o-mini for ultra-low latency and cost.
// If higher-level technical reasoning is desired, it can be changed to "gpt-4o".
const OPENAI_MODEL = "gpt-4o";

// Tool schemas for the OpenAI Chat Completions API
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

// Helper functions for reading page contents and grep
function readPage(source: string, pageNum: number): string {
  const filePath = path.join(
    process.cwd(),
    "public",
    "extracted",
    "text",
    source,
    `page_${pageNum}.md`
  );
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
  const textDir = path.join(process.cwd(), "public", "extracted", "text");

  const sources = sourceFilter
    ? [sourceFilter]
    : ["owner-manual", "quick-start-guide", "selection-chart"];

  const lowerQuery = query.toLowerCase();

  for (const src of sources) {
    const srcDir = path.join(textDir, src);
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
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: "No messages provided." }, { status: 400 });
    }

    // Load compact manual index dynamically
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
- CRITICAL: The pre-extracted manual image files are incomplete and must NOT be used. Do not include any HTML <img> tags pointing to '/extracted/images/'. Instead, you MUST generate all diagrams, schematics, and layouts programmatically using code.

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
    * Structure: Write modern, functional React components (using standard function or arrow function syntax).
    * Exports: Always end with a single default export exposing your component (e.g., 'export default PolaritySetup;').
    * Mounting: Do NOT write any 'render(...)' calls; the sandbox will compile and mount your default export automatically.
    * Imports: You can use standard ES imports for hooks (from 'react'), icons (from 'lucide-react'), and charts (from 'recharts'). The sandbox resolves them dynamically.
    * Aesthetics: Style widgets to look premium and tactile, matching an industrial control panel (slate/zinc containers, custom border styling, amber/orange highlights, glowing indicators, fully functional form inputs, and transitions).

3. TROUBLESHOOTING FLOWCHARTS (Mermaid Diagrams):
   Use Mermaid diagram artifacts for step-by-step defect troubleshooting. Remember to quote special characters in node labels: 'E["CTWD <= 1/2 inch"]'.

To create an artifact, wrap it in opening and closing '<antArtifact>' tags:
<antArtifact identifier="unique-id" type="MIME-TYPE" title="Title">
  [content]
</antArtifact>
`;

    // Set up SSE Stream headers
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: any) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        try {
          const client = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
            timeout: 60 * 1000, // 60 seconds timeout
            maxRetries: 3       // automatically retry up to 3 times
          });

          // Formulate full message history
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

            // Send LLM turn start log to client
            const lastMsg = apiMessages.filter(m => m.role === "user").pop();
            const turnInput = lastMsg
              ? `Prompting ${OPENAI_MODEL} with context (last query: "${lastMsg.content.slice(0, 100)}...") [Messages History Length: ${apiMessages.length}]`
              : `Prompting ${OPENAI_MODEL} (Turn ${iterations}) [Messages History Length: ${apiMessages.length}]`;

            sendEvent({
              type: "llm_turn",
              id: `llm-turn-${iterations}`,
              input: turnInput,
              status: "running"
            });

            const responseStream = await client.chat.completions.create({
              model: OPENAI_MODEL,
              messages: apiMessages,
              tools: tools,
              stream: true
            });

            let assistantText = "";
            let toolCallsAccumulator: any[] = [];

            for await (const chunk of responseStream) {
              const delta = chunk.choices[0]?.delta;
              if (!delta) continue;

              // 1. Text deltas
              if (delta.content) {
                assistantText += delta.content;
                sendEvent({
                  type: "stream_event",
                  event: {
                    type: "content_block_delta",
                    delta: {
                      type: "text_delta",
                      text: delta.content
                    }
                  }
                });
              }

              // 2. Tool calls deltas
              if (delta.tool_calls) {
                for (const toolCallDelta of delta.tool_calls) {
                  const idx = toolCallDelta.index;
                  if (toolCallsAccumulator[idx] === undefined) {
                    toolCallsAccumulator[idx] = {
                      id: toolCallDelta.id || "",
                      name: toolCallDelta.function?.name || "",
                      arguments: toolCallDelta.function?.arguments || ""
                    };
                  } else {
                    if (toolCallDelta.id) {
                      toolCallsAccumulator[idx].id = toolCallDelta.id;
                    }
                    if (toolCallDelta.function?.name) {
                      toolCallsAccumulator[idx].name = toolCallDelta.function.name;
                    }
                    if (toolCallDelta.function?.arguments) {
                      toolCallsAccumulator[idx].arguments += toolCallDelta.function.arguments;
                    }
                  }
                }
              }
            }

            const toolCalls = toolCallsAccumulator.filter(tc => tc !== undefined && tc.name !== "");

            // Send LLM completion turn summary
            const summaryText = assistantText
              ? assistantText
              : (toolCalls.length ? `[Requested tool calls: ${toolCalls.map(tc => tc.name).join(", ")}]` : "[No content returned]");

            sendEvent({
              type: "llm_turn_summary",
              id: `llm-turn-${iterations}`,
              output: summaryText
            });

            if (toolCalls.length > 0) {
              console.log("Executing tools:", toolCalls);

              // Add assistant message with tool calls to message history
              apiMessages.push({
                role: "assistant",
                content: assistantText || null,
                tool_calls: toolCalls.map(tc => ({
                  id: tc.id,
                  type: "function" as const,
                  function: {
                    name: tc.name,
                    arguments: tc.arguments
                  }
                }))
              });

              for (const tc of toolCalls) {
                let parsedArgs: any = {};
                try {
                  parsedArgs = JSON.parse(tc.arguments);
                } catch (e) {
                  console.error("Arguments parsing failed:", tc.arguments);
                }

                // Send tool_use initiation event to client
                sendEvent({
                  type: "stream_event",
                  event: {
                    type: "tool_use",
                    id: tc.id,
                    name: tc.name,
                    input: parsedArgs
                  }
                });

                let result = "";
                let summary = "";
                let isError = false;

                try {
                  if (tc.name === "read_pages") {
                    const { source, pages } = parsedArgs;
                    if (!source || !pages || !Array.isArray(pages)) {
                      throw new Error("Missing parameters 'source' or 'pages' in read_pages");
                    }
                    const contents = pages.map((p: number) => {
                      const text = readPage(source, p);
                      return `--- Page ${p} (${source}) ---\n${text}`;
                    });
                    result = contents.join("\n\n");
                    summary = `Loaded ${pages.length} pages of '${source}': [${pages.join(", ")}]`;
                  } else if (tc.name === "grep") {
                    const { query, source } = parsedArgs;
                    if (!query) {
                      throw new Error("Missing parameter 'query' in grep");
                    }
                    const matches = runGrep(query, source);
                    result = JSON.stringify(matches, null, 2);
                    summary = `Searched for "${query}" across manuals. Found ${matches.length} matches.`;
                  } else {
                    throw new Error(`Unknown tool: ${tc.name}`);
                  }
                } catch (err: any) {
                  console.error(`Tool execution failed for ${tc.name}:`, err);
                  result = `Error executing tool: ${err.message}`;
                  summary = `Failed: ${err.message}`;
                  isError = true;
                }

                // Add tool result to message history
                apiMessages.push({
                  role: "tool",
                  tool_call_id: tc.id,
                  name: tc.name,
                  content: result
                });

                // Stream tool summary with full result
                sendEvent({
                  type: "tool_use_summary",
                  toolName: tc.name,
                  isError: isError,
                  summary: summary,
                  result: result
                });
              }

              keepRunning = true;
            } else {
              keepRunning = false;
              // Stream final message package
              sendEvent({
                type: "assistant",
                message: {
                  content: [
                    {
                      type: "text",
                      text: assistantText
                    }
                  ]
                }
              });
            }
          }
        } catch (err: any) {
          console.error("Agent loop failed:", err);
          sendEvent({
            type: "system",
            subtype: "error",
            message: err.message || "Unknown internal error in agent loop"
          });
        } finally {
          controller.close();
        }
      }
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });
  } catch (err: any) {
    console.error("API route failed:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
