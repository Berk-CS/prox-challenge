const { query } = require("@anthropic-ai/claude-agent-sdk");

async function test() {
  console.log("Starting Claude Agent SDK test...");
  console.log("Checking ANTHROPIC_API_KEY environment variable...");
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("Error: ANTHROPIC_API_KEY environment variable is not set!");
    console.log("Please set the environment variable, e.g. run: $env:ANTHROPIC_API_KEY='your-key'");
    process.exit(1);
  }
  
  try {
    const stream = query({
      prompt: "State your name and say hello.",
      options: {
        cwd: process.cwd(),
        allowedTools: []
      }
    });

    console.log("Streaming response from Agent SDK:");
    for await (const message of stream) {
      if (message.type === "stream_event") {
        const event = message.event;
        if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
          process.stdout.write(event.delta.text);
        }
      } else if (message.type === "assistant" && message.message.content) {
        // Complete message
        const textBlock = message.message.content.find(b => b.type === 'text');
        if (textBlock) {
          console.log("\n\nFinal Text Response:\n", textBlock.text);
        }
      }
    }
    console.log("\nTest completed successfully!");
  } catch (err) {
    console.error("Test failed with error:", err);
  }
}

test();
