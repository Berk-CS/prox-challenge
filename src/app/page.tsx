"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Wrench,
  Settings,
  BookOpen,
  Terminal,
  Cpu,
  Layers,
  Send,
  Loader2,
  FileText,
  AlertTriangle,
  Flame,
  CheckCircle,
  Code,
  Eye,
  RefreshCw,
  Image as ImageIcon
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import * as Recharts from "recharts";
import { useRunner } from "react-runner";

interface ToolLog {
  id: string;
  toolName: string;
  arguments: any;
  status: "running" | "completed" | "failed";
  timestamp: string;
  resultSummary?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
  toolLogs?: ToolLog[];
}

interface ExtractedArtifact {
  id: string;
  type: string;
  title: string;
  content: string;
}

// ----------------------------------------------------
// SANDBOX 1: React Component Runner
// ----------------------------------------------------
const ReactRunnerSandbox = ({ code }: { code: string }) => {
  const processedCode = React.useMemo(() => {
    let processed = code;
    
    // Strip react imports
    processed = processed.replace(/import\s+React\b[\s\S]*?\s+from\s+['"]react['"];?/g, "");
    processed = processed.replace(/import\s+{[\s\S]*?}\s+from\s+['"]react['"];?/g, "");
    
    // Strip lucide-react and recharts imports
    processed = processed.replace(/import\s+[\s\S]*?\s+from\s+['"](?:lucide-react|lucid3-react)['"];?/g, "");
    processed = processed.replace(/import\s+[\s\S]*?\s+from\s+['"]recharts['"];?/g, "");
    
    // Clean up default exports to align with react-runner's render expectation
    const funcMatch = processed.match(/export\s+default\s+function\s+(\w+)/);
    const varMatch = processed.match(/export\s+default\s+(\w+)\s*;/);
    const arrowMatch = processed.includes("export default");

    if (funcMatch) {
      const name = funcMatch[1];
      processed = processed.replace(/export\s+default\s+function/g, "function");
      processed += `\nrender(<${name} />);`;
    } else if (varMatch) {
      const name = varMatch[1];
      processed = processed.replace(/export\s+default\s+(\w+)\s*;/g, "");
      processed += `\nrender(<${name} />);`;
    } else if (arrowMatch && !processed.includes("render(")) {
      processed = processed.replace(/export\s+default/g, "const TempComponent =");
      processed += `\nrender(<TempComponent />);`;
    }
    
    return processed.trim();
  }, [code]);

  const { element, error } = useRunner({
    code: processedCode,
    scope: {
      React,
      ...React,
      ...LucideIcons, // expose Camera, Wrench, etc directly
      ...Recharts,    // expose ResponsiveContainer, LineChart directly
      import: {
        react: React,
        "lucide-react": LucideIcons,
        "lucid3-react": LucideIcons,
        recharts: Recharts,
      },
    },
  });

  if (error) {
    return (
      <div className="rounded border border-error/20 bg-error/5 p-4 font-mono text-xs text-error">
        <h4 className="font-black text-xs uppercase mb-1">Compilation Failure:</h4>
        <pre className="whitespace-pre-wrap select-text">{error}</pre>
      </div>
    );
  }

  return (
    <div className="p-4 bg-surface rounded border border-border shadow-inner max-h-[550px] overflow-y-auto">
      {element}
    </div>
  );
};

// ----------------------------------------------------
// SANDBOX 2: Mermaid diagram renderer
// ----------------------------------------------------
const MermaidSandbox = ({ content, id }: { content: string; id: string }) => {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setError(null);
    setSvg("");

    // Dynamically load mermaid to prevent server-side errors
    import("mermaid")
      .then((m) => {
        m.default.initialize({
          startOnLoad: false,
          theme: "dark",
          securityLevel: "loose",
          themeVariables: {
            background: "#15151a",
            primaryColor: "#fbbf24",
            primaryTextColor: "#f3f4f6",
            lineColor: "#f97316"
          }
        });
        
        const cleanContent = content.trim();
        const renderId = `mermaid-render-${id.replace(/[^a-zA-Z0-9]/g, "-")}`;
        
        return m.default.render(renderId, cleanContent);
      })
      .then(({ svg: renderedSvg }) => {
        if (isMounted) {
          setSvg(renderedSvg);
        }
      })
      .catch((err) => {
        if (isMounted) {
          setError(err.message || "Failed to render Mermaid diagram");
        }
      });

    return () => {
      isMounted = false;
    };
  }, [content, id]);

  if (error) {
    return (
      <div className="rounded border border-error/20 bg-error/5 p-4 font-mono text-xs text-error">
        <h4 className="font-black text-xs uppercase mb-1">Mermaid Render Failure:</h4>
        <pre className="whitespace-pre-wrap select-text">{error}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center p-8 text-gray-500 text-xs font-mono">
        <Loader2 className="h-4 w-4 animate-spin mr-2" />
        Drawing flowchart...
      </div>
    );
  }

  return (
    <div
      className="p-4 overflow-auto flex justify-center bg-black/20 rounded border border-border"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

// ----------------------------------------------------
// SANDBOX 3: SVG Viewport
// ----------------------------------------------------
const SvgSandbox = ({ content }: { content: string }) => {
  return (
    <div
      className="p-4 flex items-center justify-center bg-black/20 rounded border border-border overflow-auto max-h-[500px]"
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
};

// ----------------------------------------------------
// SANDBOX 4: Safe HTML Iframe
// ----------------------------------------------------
const HtmlSandbox = ({ content }: { content: string }) => {
  return (
    <div className="w-full h-[500px] border border-border rounded overflow-hidden bg-[#111] shadow-inner">
      <iframe
        srcDoc={content}
        sandbox="allow-scripts"
        className="w-full h-full border-0 bg-transparent"
        title="HTML Preview Sandbox"
      />
    </div>
  );
};

// ----------------------------------------------------
// MAIN APP COMPONENT
// ----------------------------------------------------
export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "system-1",
      role: "system",
      text: "System initialized. Vulcan OmniPro 220 manual index and image libraries loaded. Ready to accept calibration queries.",
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toolLogs, setToolLogs] = useState<ToolLog[]>([]);
  const [extractedMetadata, setExtractedMetadata] = useState<any>(null);
  
  // Tab State
  const [activeRightTab, setActiveRightTab] = useState<"preview" | "manual" | "telemetry">("preview");
  const [previewSubTab, setPreviewSubTab] = useState<"view" | "code">("view");
  
  // Artifacts State
  const [artifacts, setArtifacts] = useState<Record<string, ExtractedArtifact>>({});
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);

  // Manual viewer state
  const [selectedDoc, setSelectedDoc] = useState<string>("owner-manual");
  const [selectedPage, setSelectedPage] = useState<number>(1);
  const [pageTextContent, setPageTextContent] = useState<string>("Loading manual content...");

  const chatEndRef = useRef<HTMLDivElement>(null);

  // Hydration guard
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolLogs]);

  // Load manual metadata on startup
  useEffect(() => {
    fetch("/extracted/metadata.json")
      .then((res) => res.json())
      .then((data) => {
        setExtractedMetadata(data);
      })
      .catch((err) => console.error("Error loading manual index:", err));
  }, []);

  // Fetch page content when selected
  useEffect(() => {
    if (!selectedDoc || !selectedPage) return;
    setPageTextContent("Loading page...");
    fetch(`/extracted/text/${selectedDoc}/page_${selectedPage}.md`)
      .then((res) => {
        if (!res.ok) throw new Error("Page not found");
        return res.text();
      })
      .then((text) => setPageTextContent(text))
      .catch(() => setPageTextContent("Could not load page content. It might not be extracted yet."));
  }, [selectedDoc, selectedPage]);

  // Parse complete & streaming artifacts from assistant responses
  const parseArtifacts = (text: string) => {
    const found: Record<string, ExtractedArtifact> = {};
    const completedIds = new Set<string>();
    
    // Parse complete tags
    const completeRegex = /<antArtifact\s+identifier="([^"]+)"\s+type="([^"]+)"\s+title="([^"]+)"(?:\s+language="([^"]+)")?>([\s\S]*?)<\/antArtifact>/g;
    let match;
    while ((match = completeRegex.exec(text)) !== null) {
      const [_, id, type, title, lang, content] = match;
      found[id] = { id, type, title, content: content.trim() };
      completedIds.add(id);
    }
    
    // Parse incomplete/streaming tags at the end of response
    const incompleteRegex = /<antArtifact\s+identifier="([^"]+)"\s+type="([^"]+)"\s+title="([^"]+)"(?:\s+language="([^"]+)")?>([\s\S]*?)$/g;
    incompleteRegex.lastIndex = 0;
    const incMatch = incompleteRegex.exec(text);
    if (incMatch) {
      const [_, id, type, title, lang, content] = incMatch;
      if (!completedIds.has(id)) {
        found[id] = { id, type, title, content: content.trim() };
      }
    }

    if (Object.keys(found).length > 0) {
      let hasChanges = false;
      const currentKeys = Object.keys(found);
      const prevKeys = Object.keys(artifacts);
      
      if (currentKeys.length !== prevKeys.length) {
        hasChanges = true;
      } else {
        for (const key of currentKeys) {
          if (!artifacts[key] || artifacts[key].content !== found[key].content || artifacts[key].title !== found[key].title || artifacts[key].type !== found[key].type) {
            hasChanges = true;
            break;
          }
        }
      }
      
      if (hasChanges) {
        setArtifacts(found);
        const lastKey = currentKeys[currentKeys.length - 1];
        if (lastKey && activeArtifactId !== lastKey) {
          setActiveArtifactId(lastKey);
          setActiveRightTab("preview");
        }
      }
    }
  };

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      text: input,
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setToolLogs([]); // clear logs

    const assistantMsgId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: "assistant",
        text: "",
        timestamp: new Date().toLocaleTimeString(),
        toolLogs: []
      }
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages.filter(m => m.role !== 'system'), userMessage]
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP Error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = "";
      
      if (!reader) throw new Error("Response body is not readable");

      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const jsonStr = line.slice(6);
          if (!jsonStr) continue;

          try {
            const data = JSON.parse(jsonStr);
            
            if (data.type === "stream_event") {
              const event = data.event;
              
              if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
                assistantText += event.delta.text;
                
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, text: assistantText }
                      : m
                  )
                );
                
                parseArtifacts(assistantText);
              }
            }
            
            if (data.type === "stream_event" && data.event.type === "tool_use") {
              const toolUse = data.event;
              const newLog: ToolLog = {
                id: toolUse.id || `tool-${Date.now()}`,
                toolName: toolUse.name,
                arguments: toolUse.input,
                status: "running",
                timestamp: new Date().toLocaleTimeString()
              };
              setToolLogs((prev) => [...prev, newLog]);
            }
            
            if (data.type === "tool_use_summary") {
              setToolLogs((prev) =>
                prev.map((log) =>
                  log.toolName === data.toolName
                    ? {
                        ...log,
                        status: data.isError ? "failed" : "completed",
                        resultSummary: data.summary
                      }
                    : log
                )
              );
            }
            
            if (data.type === "assistant" && data.message.content) {
              const textBlock = data.message.content.find((b: any) => b.type === "text");
              if (textBlock && textBlock.text) {
                assistantText = textBlock.text;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, text: assistantText }
                      : m
                  )
                );
                parseArtifacts(assistantText);
              }
            }

            if (data.type === "system" && data.subtype === "error") {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantMsgId
                    ? {
                        ...m,
                        text: assistantText + `\n\n[ERROR: ${data.message}]`
                      }
                    : m
                )
              );
            }
          } catch (e) {
            // Ignore incomplete chunk errors
          }
        }
      }
    } catch (err: any) {
      console.error("Stream reader error:", err);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
                ...m,
                text: m.text + `\n\n[Disconnected: ${err.message || "Connection timed out"}]`
              }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  const activeArtifact = activeArtifactId ? artifacts[activeArtifactId] : null;
  const isArtifactClosed = activeArtifact && messages.find(m => m.role === 'assistant' && m.text.includes(`</antArtifact>`));

  if (!isMounted) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-[#0d0d0f] text-primary">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-background text-foreground select-none">
      {/* Top Navbar */}
      <header className="flex h-14 items-center justify-between border-b border-border bg-surface px-6">
        <div className="flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-background font-black italic">
            V
          </div>
          <div>
            <h1 className="text-sm font-black tracking-wider text-primary">
              VULCAN OMNIPRO 220
            </h1>
            <p className="text-[10px] text-gray-500 font-mono tracking-widest uppercase">
              Multimodal Reasoning Workspace
            </p>
          </div>
        </div>

        <div className="hidden md:block w-36 h-2 hazard-stripes border border-border opacity-40"></div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 rounded-full border border-border bg-black/40 px-3 py-1 text-[11px] font-mono">
            <span className={`h-2 w-2 rounded-full ${isLoading ? "bg-accent animate-pulse" : "bg-success"} shadow-md`} />
            <span className="text-gray-400 uppercase tracking-widest text-[9px]">
              {isLoading ? "Analyzing..." : "Ready"}
            </span>
          </div>
          <button className="text-gray-400 hover:text-primary transition-colors">
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main Workspace Panels */}
      <main className="flex flex-1 overflow-hidden">
        {/* Left Panel: Chat Interface */}
        <section className="flex w-full md:w-[45%] flex-col border-r border-border bg-black/20">
          <div className="flex h-9 items-center justify-between border-b border-border bg-surface/50 px-4 font-mono text-[10px] text-gray-400">
            <div className="flex items-center space-x-2">
              <Terminal className="h-3.5 w-3.5 text-primary" />
              <span>COGNITIVE LOGS</span>
            </div>
            {isLoading && (
              <span className="flex items-center space-x-1 text-accent font-bold">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>CROSS-REFERENCING DOCUMENTS...</span>
              </span>
            )}
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                <div className="flex items-center space-x-2 text-[10px] text-gray-500 mb-1 font-mono uppercase">
                  <span>{msg.role}</span>
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                </div>
                
                {msg.role === "system" ? (
                  <div className="w-full rounded border border-success/20 bg-success/5 p-3 font-mono text-xs text-success/90">
                    {msg.text}
                  </div>
                ) : (
                  <div
                    className={`max-w-[90%] rounded p-3 text-sm font-sans leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-accent/10 border border-accent/20 text-foreground"
                        : "bg-surface border border-border text-gray-100"
                    }`}
                  >
                    {msg.role === "assistant"
                      ? msg.text.replace(/<antArtifact[\s\S]*?<\/antArtifact>/g, (m) => {
                          const titleMatch = m.match(/title="([^"]+)"/);
                          const title = titleMatch ? titleMatch[1] : "Interactive Tool";
                          return `\n\n[🔧 Mounted Artifact: "${title}" — Rendering side panel...]\n\n`;
                        })
                      : msg.text}
                  </div>
                )}
              </div>
            ))}

            {/* Display Realtime Tool Logs */}
            {toolLogs.length > 0 && (
              <div className="rounded border border-border bg-surface/30 p-3 font-mono text-xs text-gray-400 space-y-2">
                <div className="flex items-center space-x-2 text-primary border-b border-border/40 pb-1 mb-2">
                  <Cpu className="h-3.5 w-3.5" />
                  <span className="font-bold">AGENT RUNTIME LOGS</span>
                </div>
                {toolLogs.map((log) => (
                  <div key={log.id} className="flex items-start space-x-2 font-mono">
                    <span className="text-gray-500">[{log.timestamp}]</span>
                    <span>
                      {log.status === "running" && <Loader2 className="h-3 w-3 text-accent animate-spin inline mr-1" />}
                      {log.status === "completed" && <CheckCircle className="h-3 w-3 text-success inline mr-1" />}
                      {log.status === "failed" && <AlertTriangle className="h-3 w-3 text-error inline mr-1" />}
                      <span className="text-primary font-bold">{log.toolName}</span>:{" "}
                      <span className="text-gray-300 text-[11px]">{JSON.stringify(log.arguments)}</span>
                      {log.resultSummary && (
                        <div className="text-[10px] text-gray-500 pl-4 mt-0.5 border-l border-border/30">
                          ➔ {log.resultSummary}
                        </div>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="border-t border-border bg-surface p-4">
            <div className="flex items-center space-x-2 rounded border border-border bg-black/45 px-3 py-2 focus-within:border-primary transition-all">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask about duty cycle parameters, wire speed calibration, polarity sockets..."
                rows={1}
                className="flex-1 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-gray-600"
              />
              <button
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="rounded bg-primary p-2 text-background hover:bg-primary-hover disabled:bg-border disabled:text-gray-600 transition-colors"
              >
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </div>
        </section>

        {/* Right Panel: Artifact Preview and Reference Viewer */}
        <section className="hidden md:flex flex-1 flex-col bg-surface/30">
          <div className="flex h-11 items-center justify-between border-b border-border bg-surface/80 px-4">
            <div className="flex space-x-1">
              <button
                onClick={() => setActiveRightTab("preview")}
                className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono tracking-wider border rounded transition-all ${
                  activeRightTab === "preview"
                    ? "bg-primary text-background border-primary font-bold shadow-md"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>WORKSPACE PREVIEW</span>
              </button>
              <button
                onClick={() => setActiveRightTab("manual")}
                className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono tracking-wider border rounded transition-all ${
                  activeRightTab === "manual"
                    ? "bg-primary text-background border-primary font-bold shadow-md"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <BookOpen className="h-3.5 w-3.5" />
                <span>MANUAL EXPLORER</span>
              </button>
              <button
                onClick={() => setActiveRightTab("telemetry")}
                className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono tracking-wider border rounded transition-all ${
                  activeRightTab === "telemetry"
                    ? "bg-primary text-background border-primary font-bold shadow-md"
                    : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
              >
                <Terminal className="h-3.5 w-3.5" />
                <span>TELEMETRY</span>
              </button>
            </div>
          </div>

          {/* Right side body view */}
          <div className="flex-1 overflow-hidden p-6 flex flex-col">
            {activeRightTab === "preview" && (
              <div className="flex-1 flex flex-col rounded border border-border bg-black/60 overflow-hidden">
                {activeArtifact ? (
                  <>
                    <div className="flex h-10 items-center justify-between border-b border-border bg-surface px-4 font-mono text-xs">
                      <span className="text-gray-300 font-bold uppercase">{activeArtifact.title}</span>
                      
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] text-gray-600 bg-black/35 px-2 py-0.5 rounded border border-border">
                          {activeArtifact.type}
                        </span>
                        
                        <div className="flex rounded border border-border overflow-hidden">
                          <button
                            onClick={() => setPreviewSubTab("view")}
                            className={`p-1.5 ${previewSubTab === "view" ? "bg-primary text-background" : "bg-black/20 text-gray-400 hover:text-gray-200"}`}
                          >
                            <Eye className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setPreviewSubTab("code")}
                            className={`p-1.5 ${previewSubTab === "code" ? "bg-primary text-background" : "bg-black/20 text-gray-400 hover:text-gray-200"}`}
                          >
                            <Code className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex-1 overflow-auto p-4 bg-black/20">
                      {previewSubTab === "code" ? (
                        <pre className="whitespace-pre-wrap font-mono leading-relaxed text-xs text-primary bg-black/35 p-3 rounded border border-border overflow-auto max-h-[500px]">
                          <code>{activeArtifact.content}</code>
                        </pre>
                      ) : (
                        <div className="h-full">
                          {/* Live render condition */}
                          {isLoading && !isArtifactClosed ? (
                            <div className="flex flex-col items-center justify-center p-12 text-center text-gray-500 font-mono">
                              <Loader2 className="h-6 w-6 animate-spin text-accent mb-2" />
                              <span className="text-xs uppercase tracking-wider">Streaming Component Payload...</span>
                              <pre className="mt-4 w-full p-3 bg-surface border border-border rounded text-left text-[10px] text-gray-600 overflow-hidden text-ellipsis whitespace-nowrap">
                                {activeArtifact.content}
                              </pre>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {/* Dispatcher by type */}
                              {activeArtifact.type === "application/vnd.ant.react" && (
                                <ReactRunnerSandbox code={activeArtifact.content} />
                              )}
                              
                              {activeArtifact.type === "application/vnd.ant.mermaid" && (
                                <MermaidSandbox content={activeArtifact.content} id={activeArtifact.id} />
                              )}
                              
                              {activeArtifact.type === "image/svg+xml" && (
                                <SvgSandbox content={activeArtifact.content} />
                              )}
                              
                              {activeArtifact.type === "text/html" && (
                                <HtmlSandbox content={activeArtifact.content} />
                              )}
                              
                              {activeArtifact.type === "text/markdown" && (
                                <div className="prose prose-invert max-w-none text-sm text-gray-300 font-sans p-4 bg-surface rounded border border-border">
                                  {activeArtifact.content}
                                </div>
                              )}
                              
                              {activeArtifact.type === "application/vnd.ant.code" && (
                                <pre className="whitespace-pre-wrap font-mono leading-relaxed text-xs text-gray-300 bg-surface p-3 rounded border border-border">
                                  <code>{activeArtifact.content}</code>
                                </pre>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-gray-500 font-mono">
                    <Layers className="h-12 w-12 text-gray-700 mb-3" />
                    <p className="text-sm">NO ACTIVE ARTIFACT MOUNTED</p>
                    <p className="text-[11px] text-gray-600 mt-1 max-w-xs">
                      Ask the welder assistant to configure settings, troubleshoot defects, or draw wiring layouts. Rich tools will mount and render in this space.
                    </p>
                  </div>
                )}
              </div>
            )}

            {activeRightTab === "manual" && (
              <div className="flex-1 flex flex-col rounded border border-border bg-black/40 overflow-hidden">
                <div className="flex h-12 items-center justify-between border-b border-border bg-surface px-4 space-x-2">
                  <select
                    value={selectedDoc}
                    onChange={(e) => {
                      setSelectedDoc(e.target.value);
                      setSelectedPage(1);
                    }}
                    className="flex-1 bg-black/40 border border-border text-xs text-gray-300 px-2 py-1 rounded outline-none"
                  >
                    <option value="owner-manual">Owner's Manual (48 pgs)</option>
                    <option value="quick-start-guide">Quick Start Guide (2 pgs)</option>
                    <option value="selection-chart">Process Selection Chart (1 pg)</option>
                  </select>

                  <div className="flex items-center space-x-1">
                    <button
                      onClick={() => setSelectedPage((p) => Math.max(1, p - 1))}
                      disabled={selectedPage <= 1}
                      className="px-2 py-1 bg-black/40 hover:bg-black/60 disabled:opacity-40 text-xs rounded border border-border text-gray-400"
                    >
                      Prev
                    </button>
                    <span className="text-xs text-gray-400 font-mono px-2">
                      Page {selectedPage}
                    </span>
                    <button
                      onClick={() => setSelectedPage((p) => p + 1)}
                      disabled={
                        extractedMetadata && extractedMetadata[selectedDoc]
                          ? selectedPage >= extractedMetadata[selectedDoc].pages.length
                          : false
                      }
                      className="px-2 py-1 bg-black/40 hover:bg-black/60 disabled:opacity-40 text-xs rounded border border-border text-gray-400"
                    >
                      Next
                    </button>
                  </div>
                </div>

                <div className="flex-1 overflow-auto p-4 font-mono text-xs text-gray-300 leading-relaxed bg-black/20">
                  <div className="max-w-none prose prose-invert">
                    <pre className="whitespace-pre-wrap font-sans text-xs bg-transparent border-0 p-0 text-gray-300">
                      {pageTextContent}
                    </pre>
                  </div>

                  {extractedMetadata &&
                    extractedMetadata[selectedDoc] &&
                    extractedMetadata[selectedDoc].pages[selectedPage - 1]?.images?.length > 0 && (
                      <div className="mt-6 border-t border-border/40 pt-4">
                        <div className="flex items-center space-x-2 text-primary font-mono text-xs mb-3">
                          <ImageIcon className="h-4 w-4" />
                          <span>PAGE IMAGE ASSETS</span>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {extractedMetadata[selectedDoc].pages[selectedPage - 1].images.map((img: any) => (
                            <div key={img.url} className="rounded border border-border bg-black/60 p-2 text-center">
                              <img
                                src={img.url}
                                alt={`Page asset ${img.index}`}
                                className="max-h-36 mx-auto object-contain bg-white/5 rounded"
                              />
                              <div className="text-[10px] text-gray-500 font-mono mt-2">
                                Asset {img.index} • {img.filename}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              </div>
            )}

            {activeRightTab === "telemetry" && (
              <div className="flex-1 flex flex-col rounded border border-border bg-black/80 font-mono p-4 overflow-auto space-y-3 text-[11px] text-gray-400">
                <div className="flex items-center space-x-2 text-accent border-b border-border/40 pb-2 mb-2">
                  <Terminal className="h-4 w-4" />
                  <span className="font-bold tracking-widest uppercase">Agent Console Telemetry</span>
                </div>
                <div>[SYSTEM] Local runtime: Node.js v24.14.0</div>
                <div>[SYSTEM] API Key configured: TRUE</div>
                <div>[SYSTEM] Working Dir: c:\Users\henez\Documents\some_project\prox-challenge</div>
                <div>[SYSTEM] Extracted assets path: /public/extracted</div>
                <div>[SYSTEM] Claude Agent SDK Version: 1.x (Active)</div>
                <div className="border-t border-border/30 pt-2 text-[10px] text-gray-600">
                  Logs stream will record all SDK JSON messages and errors in this tab.
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
