import { NextRequest, NextResponse } from "next/server";
import { query } from "@anthropic-ai/claude-agent-sdk";

export const dynamic = "force-dynamic";

// Define the system prompt that configures our welder agent
const WELDER_SYSTEM_PROMPT = `You are a professional, expert reasoning assistant for the Vulcan OmniPro 220 multiprocess welder.
Your goal is to answer deep technical questions about this welder accurately, helpfully, and using multimodal artifacts when helpful.

You have access to the welder owner's manual, quick start guide, and process selection chart. These manuals have been pre-processed and extracted page-by-page as markdown files in the directory: "public/extracted/text/".
The directory structure is:
- Owner's Manual: "public/extracted/text/owner-manual/page_<num>.md" (1 to 48)
- Quick Start Guide: "public/extracted/text/quick-start-guide/page_<num>.md" (1 to 2)
- Selection Chart: "public/extracted/text/selection-chart/page_1.md"

Extracted images are stored in "public/extracted/images/<manual_name>/".
For example:
- The wire feed mechanism or panel controls images can be referenced using standard img tags pointing to "/extracted/images/owner-manual/page_<num>_<index>.<ext>".
- Weld diagnosis examples and weld defects photos are in page 38 (e.g. "/extracted/images/owner-manual/page_38_1.jpeg" to "page_38_7.jpeg").

CRITICAL DIRECTIONS:
1. TECHNICAL ACCURACY:
   - When asked a technical question (e.g., duty cycle, polarity, wiring, settings, troubleshooting), ALWAYS use your tools (Grep or Read) to lookup the exact page in the manual first. Do not guess or assume.
   - For example:
     - MIG duty cycles are on page 14 of the Owner's Manual.
     - Polarity settings and socket configurations are detailed on pages 19-22 of the Owner's Manual.
     - Weld defect troubleshooting is detailed on page 38 of the Owner's Manual.

2. MULTIMODAL RESPONSES (ARTIFACTS):
   - You can create and reference artifacts. Artifacts are self-contained, interactive or visual blocks displayed alongside the chat.
   - To create an artifact, wrap it in opening and closing '<antArtifact>' tags:
     <antArtifact identifier="unique-id" type="MIME-TYPE" title="Title">
       [content]
     </antArtifact>
   - Supported Types:
     - React Component ("application/vnd.ant.react"): Use this for interactive widgets like a Duty Cycle Calculator, a settings configurator, or a wiring selector. Use Tailwind classes for styling (no arbitrary values). Do not include React imports; they are pre-configured. Use a default export.
     - Mermaid Diagram ("application/vnd.ant.mermaid"): Use for troubleshooting flowcharts or decision trees. CRITICAL: In Mermaid diagrams, you MUST ALWAYS wrap node labels in double quotes if they contain special characters, math symbols (≤), or brackets (e.g. write \`E["CTWD ≤ 1/2 inch"]\`). DO NOT use nested double-quotes (") inside node labels; instead, write out units (like 'inch') or use single quotes to prevent syntax crashes.
     - SVG Diagram ("image/svg+xml"): Use for quick custom visual illustrations, e.g. drawing welding joint designs or sockets wiring.
     - HTML/CSS/JS ("text/html"): For rich sandboxed custom panels. Use placeholder layouts if needed.
     - Markdown document ("text/markdown") or code snippets ("application/vnd.ant.code").
   
   - If someone asks about polarity setup, draw or display a custom SVG diagram of which socket the ground clamp and torch connect to, or use an iframe rendering these configurations.
   - If someone asks about weld defects, display the extracted image files from page 38 (e.g., "/extracted/images/owner-manual/page_38_1.jpeg" for porosity, etc.) alongside explanations.
   - If the user asks a complex scenario (e.g., thickness + material + process), write a settings configurator React widget so they can customize input and see recommendations dynamically.
`;

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json();

    // Extract standard message format or just the last query
    let promptText = "";
    if (Array.isArray(messages)) {
      const lastMsg = messages[messages.length - 1];
      promptText = lastMsg ? (lastMsg.content || lastMsg.text || "") : "";
    } else {
      promptText = String(messages || "");
    }

    if (!promptText) {
      return NextResponse.json({ error: "No prompt provided - please ensure messages is non-empty and has a valid prompt string in the 'text' or 'content' field." }, { status: 400 });
    }

    // Set up SSE Stream headers
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          // Initialize agent query loop
          const agentStream = query({
            prompt: promptText,
            options: {
              cwd: process.cwd(),
              model: "claude-5-sonnet",
              cache_control: { type: "ephemeral" },
              agent: "vulcan-expert",
              agents: {
                "vulcan-expert": {
                  description: "Expert assistant for Vulcan OmniPro 220 welder",
                  prompt: WELDER_SYSTEM_PROMPT,
                  tools: ["Read", "Grep", "Glob"]
                }
              },
              allowedTools: ["Read", "Grep", "Glob"],
              env: {
                ...process.env,
                CLAUDE_AGENT_SDK_CLIENT_APP: "vulcan-welder-dashboard/1.0.0"
              }
            }
          });

          // Read messages from the generator
          for await (const message of agentStream) {
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(message)}\n\n`)
            );
          }
        } catch (err: any) {
          console.error("Agent loop failed:", err);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: "system",
                subtype: "error",
                message: err.message || "Unknown internal error in agent loop"
              })}\n\n`
            )
          );
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
