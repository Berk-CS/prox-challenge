"use client";

import React, { useState, useEffect, useRef, useMemo, useCallback, useReducer, useContext } from "react";
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
  Trash2,
  Image as ImageIcon
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import * as Recharts from "recharts";
import { SandpackProvider, SandpackPreview, useSandpack } from "@codesandbox/sandpack-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";


interface ToolLog {
  id: string;
  type?: "tool" | "llm_turn";
  toolName: string;
  arguments: any;
  status: "running" | "completed" | "failed";
  timestamp: string;
  resultSummary?: string;
  rawOutput?: string;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
  toolLogs?: ToolLog[];
  isError?: boolean;
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
function prepareCodeForSandpack(rawCode: string): string {
  if (!rawCode) return "";

  let cleanCode = rawCode;

  // 1. Ensure React is imported if JSX is used and no React import exists (case insensitive check)
  if (!/import\s+React\b/i.test(cleanCode) && !/import\s+\*\s+as\s+React\b/i.test(cleanCode)) {
    cleanCode = `import React from 'react';\n` + cleanCode;
  }

  // 2. Ensure we have a default export if missing (using case-insensitive search)
  const hasExportDefault = /export\s+default/i.test(cleanCode);
  if (!hasExportDefault) {
    const anyFuncMatch = cleanCode.match(/(?:function|const|let|var)\s+([A-Z]\w+)/);
    if (anyFuncMatch) {
      const name = anyFuncMatch[1];
      cleanCode += `\nexport default ${name};`;
    }
  }

  return cleanCode.trim();
}

const SandpackErrorListener = ({
  onError,
  onSuccess,
  isLoading
}: {
  onError: (error: string) => void;
  onSuccess?: () => void;
  isLoading: boolean;
}) => {
  const { sandpack, listen } = useSandpack();

  useEffect(() => {
    // Guard: Only process compilation errors / success once streaming has completed
    if (isLoading) return;

    if (sandpack.error) {
      onError(sandpack.error.message);
      return;
    }

    // Subscribe to bundler messaging
    const unsubscribe = listen((message: any) => {
      if (message.type === "done") {
        onSuccess?.();
      }
    });

    // Also fallback: if status is already running or done, trigger success
    if (sandpack.status === "done" || sandpack.status === "running") {
      const timer = setTimeout(() => {
        if (!sandpack.error) {
          onSuccess?.();
        }
      }, 1000);
      return () => {
        unsubscribe();
        clearTimeout(timer);
      };
    }

    return () => {
      unsubscribe();
    };
  }, [sandpack.error, sandpack.status, listen, isLoading, onError, onSuccess]);

  return null;
};

const SandpackLoadingOverlay = ({ isCompiling }: { isCompiling: boolean }) => {
  if (!isCompiling) return null;

  return (
    <div className="absolute inset-0 bg-[#0c0c0e]/80 backdrop-blur-sm z-30 flex flex-col items-center justify-center space-y-3 select-none">
      <Loader2 className="h-6 w-6 text-primary animate-spin" />
      <span className="font-mono text-[10px] text-gray-400 uppercase tracking-widest animate-pulse">
        Compiling Interactive Component...
      </span>
    </div>
  );
};

const SandpackSandbox = ({
  code,
  onError,
  onSuccess,
  isLoading
}: {
  code: string;
  onError: (error: string) => void;
  onSuccess: () => void;
  isLoading: boolean;
}) => {
  const [hasCompiledOnce, setHasCompiledOnce] = useState(false);
  const preparedCode = useMemo(() => prepareCodeForSandpack(code), [code]);

  // Failsafe: Ensure overlay is hidden after 1.5 seconds if compilation event is missed
  useEffect(() => {
    const timer = setTimeout(() => {
      setHasCompiledOnce(true);
    }, 1500);
    return () => clearTimeout(timer);
  }, [code]);

  const handleSuccess = useCallback(() => {
    setHasCompiledOnce(true);
    onSuccess();
  }, [onSuccess]);

  const handleError = useCallback((err: string) => {
    setHasCompiledOnce(true);
    onError(err);
  }, [onError]);

  return (
    <div className="relative w-full h-[550px] border border-border rounded overflow-hidden bg-[#111] shadow-inner">
      <SandpackProvider
        template="react"
        theme="dark"
        files={{
          "/App.js": preparedCode,
        }}
        customSetup={{
          dependencies: {
            "lucide-react": "latest",
            "recharts": "latest"
          }
        }}
      >
        <SandpackErrorListener onError={handleError} onSuccess={handleSuccess} isLoading={isLoading} />
        <SandpackLoadingOverlay isCompiling={!hasCompiledOnce} />
        <SandpackPreview style={{ height: "550px" }} showNavigator={false} showRestartButton={true} />
      </SandpackProvider>
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
// BEAUTIFIED MARKDOWN RENDERER
// ----------------------------------------------------
const MarkdownRenderer = ({ content }: { content: string }) => {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => (
          <h1 className="text-sm font-black text-primary mt-3 mb-1.5 border-b border-border/60 pb-0.5 uppercase tracking-wider">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-xs font-bold text-accent mt-2.5 mb-1 uppercase tracking-wider">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-xs font-bold text-gray-100 mt-2 mb-1">
            {children}
          </h3>
        ),
        p: ({ children }) => (
          <p className="mb-2 last:mb-0 leading-relaxed text-gray-200 text-xs">
            {children}
          </p>
        ),
        ul: ({ children }) => (
          <ul className="list-disc pl-4 mb-2 space-y-1 text-gray-300 text-xs">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-4 mb-2 space-y-1 text-gray-300 text-xs">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="leading-relaxed">{children}</li>
        ),
        table: ({ children }) => (
          <div className="my-2.5 overflow-x-auto rounded border border-border/40 bg-black/25">
            <table className="w-full text-left text-[11px] border-collapse">
              {children}
            </table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-surface/80 border-b border-border/50 text-gray-400 font-bold uppercase tracking-wider text-[9px] font-mono">
            {children}
          </thead>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-border/20">{children}</tbody>
        ),
        tr: ({ children }) => (
          <tr className="hover:bg-white/5 transition-colors">{children}</tr>
        ),
        th: ({ children }) => (
          <th className="px-2.5 py-1.5 font-bold">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-2.5 py-1.5 text-gray-300">{children}</td>
        ),
        code: ({ className, children }) => {
          const match = /language-(\w+)/.exec(className || "");
          const isInline = !match;
          if (isInline) {
            return (
              <code className="bg-surface-light border border-border/40 px-1 py-0.5 rounded font-mono text-[10px] text-accent">
                {children}
              </code>
            );
          }
          return (
            <pre className="my-2 bg-[#09090b] border border-border/40 rounded p-2 overflow-x-auto font-mono text-[10px] text-green-400 leading-normal">
              <code>{children}</code>
            </pre>
          );
        },
        strong: ({ children }) => (
          <strong className="font-bold text-primary">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-gray-300">{children}</em>
        ),
        blockquote: ({ children }) => (
          <blockquote className="border-l border-primary bg-surface/30 pl-2.5 py-0.5 my-1.5 text-[11px] italic text-gray-400">
            {children}
          </blockquote>
        )
      }}
    >
      {content}
    </ReactMarkdown>
  );
};


const PRESET_MESSAGES = [
  "What's the duty cycle for MIG welding at 200A on 240V?",
  "I'm getting porosity in my flux-cored welds. What should I check?",
  "What polarity setup do I need for TIG welding? Which socket does the ground clamp go in?",
  "generate interactive content: a duty cycle calculator",
  "I just bought a 10lb spool of steel wire and I'm looking at this wire feed tensioner inside the door. The manual talks about V-grooves, knurled grooves, and a specific tension scale. Can you show me exactly how to flip the roller for my wire size and how tight to screw down the tensioner knob?"
];

const PROGRESS_MESSAGES = [
  "Consulting librarian index...",
  "Searching documentation database...",
  "Reading manual specifications and charts...",
  "Analyzing referenced details and page data...",
  "Formulating safety and settings guidelines...",
  "Compiling technical configurations...",
  "Assembling visual layouts and schematics...",
  "Polishing interactive dashboard..."
];

export default function Home() {
  const [isMounted, setIsMounted] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "system-1",
      role: "system",
      text: "Welcome to the Vulcan OmniPro 220 Assistant! I've loaded the owner's manual and am ready to help you with any setup, troubleshooting, or calibration questions you might have.",
      timestamp: new Date().toLocaleTimeString()
    }
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [toolLogs, setToolLogs] = useState<ToolLog[]>([]);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [extractedMetadata, setExtractedMetadata] = useState<any>(null);

  // STT / TTS State
  const [isListening, setIsListening] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [loadingPhase, setLoadingPhase] = useState<number>(0);

  // Cycle thinking progress messages every 7 seconds
  useEffect(() => {
    if (!isLoading) {
      setLoadingPhase(0);
      return;
    }
    const interval = setInterval(() => {
      setLoadingPhase((p) => p + 1);
    }, 7000);
    return () => clearInterval(interval);
  }, [isLoading]);

  // Automatically adjust textarea height based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);

  // Cleanup speech synthesis on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const [activeTab, setActiveTab] = useState<"chat" | "preview" | "manual">("chat");
  const [previewSubTab, setPreviewSubTab] = useState<"view" | "code">("view");

  const [artifacts, setArtifacts] = useState<Record<string, ExtractedArtifact>>({
    "custom-artifact": {
      id: "custom-artifact",
      title: "Custom Component",
      type: "react",
      content: `import React from "react";\nimport { Zap } from "lucide-react";\n\nexport default function App() {\n  return (\n    <div style={{\n      minHeight: "100vh",\n      background: "#0b0e12",\n      color: "#e5e7eb",\n      fontFamily: "system-ui, sans-serif",\n      display: "flex",\n      alignItems: "center",\n      justifyContent: "center",\n      padding: 24,\n      boxSizing: "border-box"\n    }}>\n      <div style={{\n        maxWidth: 400,\n        width: "100%",\n        background: "linear-gradient(180deg, #111827 0%, #0b1220 100%)",\n        border: "1px solid rgba(245, 158, 11, 0.25)",\n        borderRadius: 20,\n        boxShadow: "0 20px 50px rgba(0,0,0,0.5)",\n        padding: "40px 24px",\n        textAlign: "center"\n      }}>\n        <div style={{\n          width: 56,\n          height: 56,\n          borderRadius: 14,\n          background: "#1e293b",\n          border: "1px solid #fbbf24",\n          color: "#fbbf24",\n          display: "grid",\n          placeItems: "center",\n          margin: "0 auto 20px"\n        }}>\n          <Zap size={24} />\n        </div>\n\n        <h1 style={{ margin: "0 0 12px 0", fontSize: 24, fontWeight: 800, color: "#fff" }}>\n          Welcome to Your Workspace\n        </h1>\n        \n        <p style={{ margin: 0, fontSize: 14, color: "#9ca3af", lineHeight: 1.5 }}>\n          This interactive area lets you view, calculate, and adjust tool settings generated by the AI assistant in real time.\n        </p>\n      </div>\n    </div>\n  );\n}`
    }
  });
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>("custom-artifact");

  const [retryCount, setRetryCount] = useState<number>(0);
  const [sandboxError, setSandboxError] = useState<string | null>(null);

  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [isDeveloperMode, setIsDeveloperMode] = useState<boolean>(false);
  const [selectedModel, setSelectedModel] = useState<"openai" | "claude">("claude");
  const [isReadAloud, setIsReadAloud] = useState<boolean>(false);

  const [localCode, setLocalCode] = useState<string>(" ");
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    const currentContent = activeArtifactId && artifacts[activeArtifactId] ? artifacts[activeArtifactId].content : "";
    setLocalCode(currentContent);
  }, [activeArtifactId, artifacts]);

  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedUpdateArtifact = useCallback((newContent: string) => {
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }
    debounceTimeoutRef.current = setTimeout(() => {
      if (!activeArtifactId) return;
      setArtifacts((prev) => ({
        ...prev,
        [activeArtifactId]: {
          ...prev[activeArtifactId],
          content: newContent
        }
      }));
    }, 1000);
  }, [activeArtifactId]);

  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  const [selectedDoc, setSelectedDoc] = useState<string>("owner-manual");
  const [selectedPage, setSelectedPage] = useState<number>(1);
  const [pageTextContent, setPageTextContent] = useState<string>("Loading manual content...");

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);

    const savedDevMode = localStorage.getItem("omni-pro-dev-mode");
    if (savedDevMode !== null) setIsDeveloperMode(savedDevMode === "true");

    const savedModel = localStorage.getItem("omni-pro-model");
    if (savedModel === "openai" || savedModel === "claude") setSelectedModel(savedModel as "openai" | "claude");

    const savedReadAloud = localStorage.getItem("omni-pro-read-aloud");
    if (savedReadAloud !== null) setIsReadAloud(savedReadAloud === "true");

    const savedMessages = localStorage.getItem("omni-pro-chat-messages");
    if (savedMessages) {
      try {
        setMessages(JSON.parse(savedMessages));
      } catch (e) {
        console.error("Error loading persisted messages:", e);
      }
    }
  }, []);

  useEffect(() => {
    if (isMounted) {
      localStorage.setItem("omni-pro-dev-mode", isDeveloperMode.toString());
      localStorage.setItem("omni-pro-model", selectedModel);
      localStorage.setItem("omni-pro-read-aloud", isReadAloud.toString());
      localStorage.setItem("omni-pro-chat-messages", JSON.stringify(messages));
    }
  }, [isDeveloperMode, selectedModel, isReadAloud, messages, isMounted]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, toolLogs]);

  useEffect(() => {
    fetch("/extracted/metadata.json")
      .then((res) => res.json())
      .then((data) => {
        setExtractedMetadata(data);
      })
      .catch((err) => console.error("Error loading manual index:", err));
  }, []);

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

  const parseArtifacts = useCallback((text: string) => {
    const found: Record<string, ExtractedArtifact> = {};
    const completedIds = new Set<string>();

    const completeRegex = /<antArtifact\s+identifier="([^"]+)"\s+type="([^"]+)"\s+title="([^"]+)"(?:\s+language="([^"]+)")?>([\s\S]*?)<\/antArtifact>/g;
    let match;
    while ((match = completeRegex.exec(text)) !== null) {
      const [_, id, type, title, lang, content] = match;
      found[id] = { id, type, title, content: content.trim() };
      completedIds.add(id);
    }

    const incompleteRegex = /<antArtifact\s+identifier="([^"]+)"\s+type="([^"]+)"\s+title="([^"]+)"(?:\s+language="([^"]+)")?>([\s\S]*?)$/g;
    incompleteRegex.lastIndex = 0;
    const incMatch = incompleteRegex.exec(text);
    if (incMatch) {
      const [_, id, type, title, lang, content] = incMatch;
      if (!completedIds.has(id)) {
        found[id] = { id, type, title, content: content.trim() };
      }
    }

    // Fallback: Parse markdown code blocks containing React components
    const mdCodeBlockRegex = /```(jsx|tsx|javascript|typescript)\s*([\s\S]*?)```/g;
    let mdMatch;
    let fallbackCount = 0;
    while ((mdMatch = mdCodeBlockRegex.exec(text)) !== null) {
      const [_, lang, codeContent] = mdMatch;
      const code = codeContent.trim();
      if (code.includes("export default") || code.includes("import React") || code.includes("return (") || code.includes("return  (")) {
        const exists = Object.values(found).some(art => art.content.trim() === code);
        if (!exists) {
          fallbackCount++;
          const id = `fallback-${Date.now()}-${fallbackCount}`;
          let title = "Generated Component";
          const exportDefaultMatch = code.match(/export\s+default\s+([A-Z]\w+)/);
          if (exportDefaultMatch) {
            title = exportDefaultMatch[1].replace(/([A-Z])/g, " $1").trim();
          } else {
            const funcMatch = code.match(/(?:function|const)\s+([A-Z]\w+)/);
            if (funcMatch) {
              title = funcMatch[1].replace(/([A-Z])/g, " $1").trim();
            }
          }
          found[id] = { id, type: "react", title, content: code };
        }
      }
    }

    if (Object.keys(found).length > 0) {
      setArtifacts((prev) => {
        let hasChanges = false;
        const currentKeys = Object.keys(found);
        const prevKeys = Object.keys(prev);

        if (currentKeys.length !== prevKeys.length) {
          hasChanges = true;
        } else {
          for (const key of currentKeys) {
            if (!prev[key] || prev[key].content !== found[key].content || prev[key].title !== found[key].title || prev[key].type !== found[key].type) {
              hasChanges = true;
              break;
            }
          }
        }

        if (hasChanges) {
          const lastKey = currentKeys[currentKeys.length - 1];
          if (lastKey) {
            setActiveArtifactId(lastKey);
          }
          return found;
        }
        return prev;
      });
    }
  }, []);

  const handleArtifactContentChange = useCallback((content: string) => {
    if (!activeArtifactId) return;
    setArtifacts((prev) => ({
      ...prev,
      [activeArtifactId]: {
        ...prev[activeArtifactId],
        content: content
      }
    }));
  }, [activeArtifactId]);

  // --- TEXT TO SPEECH (TTS) ---
  const toggleSpeak = useCallback((text: string, messageId: string) => {
    if (speakingMessageId === messageId) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }

    window.speechSynthesis.cancel();

    // Clean text of artifact tags, code blocks, and markdown
    const cleanText = text
      .replace(/```[\s\S]*?```/g, " code snippet ")
      .replace(/<antArtifact[\s\S]*?<\/antArtifact>/g, " interactive artifact generated ")
      .replace(/<antArtifact[\s\S]*$/g, " interactive artifact generated ")
      .replace(/[*_#`]/g, " ");

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);

    setSpeakingMessageId(messageId);
    window.speechSynthesis.speak(utterance);
  }, [speakingMessageId]);

  const handleSend = useCallback(async (customText?: string) => {
    const textToSend = customText || input;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      text: textToSend,
      timestamp: new Date().toLocaleTimeString()
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!customText) {
      setInput("");
      setRetryCount(0);
      setSandboxError(null);
    }
    setIsLoading(true);
    setToolLogs([]);
    setExpandedLogs({});

    const assistantMsgId = `assistant-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      {
        id: assistantMsgId,
        role: "assistant",
        text: "Thinking...",
        timestamp: new Date().toLocaleTimeString(),
        toolLogs: []
      }
    ]);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages.filter(m => m.role !== 'system'), userMessage],
          model: selectedModel
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP Error: ${response.status}`);
      }

      const data = await response.json();

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? { ...m, text: data.text, toolLogs: data.toolLogs }
            : m
        )
      );

      setToolLogs(data.toolLogs || []);

      if (data.toolLogs) {
        const readPagesTool = data.toolLogs.find((t: ToolLog) => t.toolName === "read_pages");
        if (readPagesTool) {
          const { source, pages } = readPagesTool.arguments || {};
          if (source) setSelectedDoc(source);
          if (pages && Array.isArray(pages) && pages.length > 0) setSelectedPage(pages[0]);
        }
      }

      if (data.text) {
        parseArtifacts(data.text);
        if (isReadAloud) {
          toggleSpeak(data.text, assistantMsgId);
        }
      }

    } catch (err: unknown) {
      console.error("Chat error:", err);
      const errorMsg = err instanceof Error ? err.message : "Request failed";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantMsgId
            ? {
              ...m,
              isError: true,
              text: errorMsg
            }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, messages, selectedModel, parseArtifacts, isReadAloud, toggleSpeak]);

  const handleSandboxSuccess = useCallback(() => {
    setSandboxError(null);
    setRetryCount(0);
  }, []);

  const handleRefreshSandbox = useCallback(() => {
    setPreviewSubTab("code");
    setTimeout(() => {
      setPreviewSubTab("view");
    }, 50);
  }, []);

  const handleClearChat = useCallback(() => {
    if (confirm("Are you sure you want to clear the chat history?")) {
      const defaultMsg = [
        {
          id: "system-1",
          role: "system",
          text: "Welcome to the Vulcan OmniPro 220 Assistant! I've loaded the owner's manual and am ready to help you with any setup, troubleshooting, or calibration questions you might have.",
          timestamp: new Date().toLocaleTimeString()
        }
      ];
      setMessages(defaultMsg);
      localStorage.setItem("omni-pro-chat-messages", JSON.stringify(defaultMsg));
      if (typeof window !== "undefined" && window.speechSynthesis) {
        window.speechSynthesis.cancel();
      }
      setSpeakingMessageId(null);
    }
  }, []);

  const handleAutoRetry = useCallback((errorMsg: string) => {
    if (isLoading) return;

    if (retryCount < 2) {
      setRetryCount((prev) => prev + 1);
      setSandboxError(errorMsg);

      const attemptNum = retryCount + 1;
      const errorPrompt = `[Auto-Correction Attempt ${attemptNum}/2] The React component code you generated failed to compile in the workspace sandbox with the following error:
\`\`\`
${errorMsg}
\`\`\`
Please analyze this error, fix your code, and output the entire corrected React component code block wrapped in <antArtifact> tags. Ensure it compiles cleanly.`;

      handleSend(errorPrompt);
    } else {
      setSandboxError(errorMsg);
    }
  }, [isLoading, retryCount, handleSend]);

  // --- SPEECH RECOGNITION (STT) ---
  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Speech Recognition is not supported in this browser. Try using Chrome or Edge.");
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onstart = () => setIsListening(true);
      recognition.onresult = (event: any) => {
        let finalTranscript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          }
        }
        if (finalTranscript) {
          setInput((prev) => prev ? prev + " " + finalTranscript : finalTranscript);
        }
      };
      recognition.onerror = (event: any) => {
        console.error("Speech recognition error", event.error);
        setIsListening(false);
      };
      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error(err);
      setIsListening(false);
    }
  }, [isListening]);



  const renderChatContent = (isSidebar = false) => {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto py-4 space-y-4 pr-2">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
              <div className="flex items-center space-x-2 text-[10px] text-gray-500 mb-1 font-mono uppercase">
                <span>{msg.role}</span>
                <span>•</span>
                <span>{msg.timestamp}</span>
                {msg.role === "assistant" && !msg.isError && (
                  <button
                    onClick={() => toggleSpeak(msg.text, msg.id)}
                    className="ml-2 flex items-center justify-center p-1 rounded hover:bg-white/10 text-gray-400 hover:text-primary transition-colors cursor-pointer"
                    title={speakingMessageId === msg.id ? "Stop speaking" : "Read aloud"}
                  >
                    {speakingMessageId === msg.id ? (
                      <LucideIcons.VolumeX className="h-3.5 w-3.5 text-accent animate-pulse" />
                    ) : (
                      <LucideIcons.Volume2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>

              {msg.role === "system" ? (
                <div className="w-full rounded border border-success/20 bg-success/5 p-3 font-mono text-xs text-success/90">
                  {msg.text}
                </div>
              ) : msg.isError ? (
                <div className="w-full flex items-center space-x-2 rounded border border-error/20 bg-error/5 p-3 text-xs text-error font-medium">
                  <AlertTriangle className="h-4.5 w-4.5 shrink-0 text-error animate-pulse" />
                  <span>Error: {msg.text}</span>
                </div>
              ) : (
                <div
                  className={`max-w-[90%] rounded p-3 text-sm font-sans leading-relaxed ${msg.role === "user"
                      ? "bg-accent/10 border border-accent/20 text-foreground whitespace-pre-wrap text-xs"
                      : "bg-surface border border-border text-gray-100 w-full"
                    }`}
                >
                  {/* Render tool logs first if role is assistant */}
                  {msg.role === "assistant" && msg.toolLogs && msg.toolLogs.length > 0 && isDeveloperMode && (
                    <div className="mb-3 rounded border border-border/40 bg-black/25 p-2.5 font-mono text-[11px] text-gray-400 space-y-2 select-none w-full">
                      <div className="flex items-center space-x-2 text-primary border-b border-border/20 pb-1 mb-2 font-bold uppercase tracking-wider text-[10px]">
                        <Cpu className="h-3.5 w-3.5" />
                        <span>AGENT RUNTIME LOGS (CLICK TO EXPAND)</span>
                      </div>
                      <div className="space-y-2">
                        {msg.toolLogs.map((log) => {
                          const isExpanded = !!expandedLogs[log.id];
                          return (
                            <div key={log.id} className="border-b border-border/10 pb-1.5 last:border-b-0">
                              <div
                                onClick={() => {
                                  setExpandedLogs((prev) => ({
                                    ...prev,
                                    [log.id]: !prev[log.id]
                                  }));
                                }}
                                className="flex items-start justify-between cursor-pointer hover:bg-white/5 p-1 rounded transition-colors"
                              >
                                <div className="flex items-start space-x-2">
                                  <span className="text-gray-500 font-mono">[{log.timestamp}]</span>
                                  <span className="font-mono text-[10.5px]">
                                    {log.status === "running" && <Loader2 className="h-3 w-3 text-accent animate-spin inline mr-1" />}
                                    {log.status === "completed" && <CheckCircle className="h-3 w-3 text-success inline mr-1" />}
                                    {log.status === "failed" && <AlertTriangle className="h-3 w-3 text-error inline mr-1" />}
                                    <span className="text-primary font-bold">{log.toolName}</span>
                                    {log.resultSummary && (
                                      <span className="text-gray-500 ml-2">➔ {log.resultSummary}</span>
                                    )}
                                  </span>
                                </div>
                                <div className="text-gray-500 pl-2">
                                  {isExpanded ? (
                                    <LucideIcons.ChevronDown className="h-3 w-3 inline" />
                                  ) : (
                                    <LucideIcons.ChevronRight className="h-3 w-3 inline" />
                                  )}
                                </div>
                              </div>

                              {/* Collapsible Details Drawer */}
                              {isExpanded && (
                                <div className="pl-6 pr-2 py-2 mt-1.5 space-y-2 border-l border-primary/30 bg-black/40 rounded text-[10.5px] select-text">
                                  <div>
                                    <span className="text-accent font-bold uppercase tracking-widest text-[8.5px] font-mono block">
                                      {log.type === "llm_turn" ? "Turn Context / Request Prompt:" : "Arguments / Parameters:"}
                                    </span>
                                    <pre className="mt-1 p-1.5 bg-[#09090b] border border-border/40 rounded overflow-x-auto text-[9.5px] text-gray-300 font-mono max-h-40 overflow-y-auto whitespace-pre-wrap leading-normal">
                                      {typeof log.arguments === "string"
                                        ? log.arguments
                                        : JSON.stringify(log.arguments, null, 2)}
                                    </pre>
                                  </div>
                                  {log.rawOutput && (
                                    <div>
                                      <span className="text-success font-bold uppercase tracking-widest text-[8.5px] font-mono block">
                                        {log.type === "llm_turn" ? "AI Response Output:" : "Raw Tool Execution Output:"}
                                      </span>
                                      <pre className="mt-1 p-1.5 bg-[#09090b] border border-border/40 rounded max-h-60 overflow-y-auto overflow-x-auto text-[9.5px] text-gray-300 font-mono whitespace-pre-wrap leading-normal">
                                        {log.rawOutput}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {msg.role === "assistant" ? (
                    <div className="flex flex-col w-full">
                      {msg.text === "Thinking..." ? (
                        <div className="flex flex-col space-y-3 py-2 w-full max-w-sm">
                          <div className="flex items-center space-x-2.5 text-xs font-mono text-gray-300">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <span className="font-bold tracking-wide animate-pulse">
                              {PROGRESS_MESSAGES[loadingPhase % PROGRESS_MESSAGES.length]}
                            </span>
                          </div>
                          <div className="flex space-x-1.5 items-center">
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.3s]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce [animation-delay:-0.15s]" />
                            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" />
                          </div>
                        </div>
                      ) : (
                        <MarkdownRenderer
                          content={msg.text
                            .replace(/<antArtifact[\s\S]*?<\/antArtifact>/g, "")
                            .replace(/<antArtifact[\s\S]*$/g, "")
                            .replace(/```(jsx|tsx|javascript|typescript)\s*([\s\S]*?)```/g, (match, lang, codeContent) => {
                              const code = codeContent.trim();
                              if (code.includes("export default") || code.includes("import React") || code.includes("return (") || code.includes("return  (")) {
                                return ""; // Hide the raw code block from the chat layout
                              }
                              return match;
                            })
                          }
                        />
                      )}

                      {/* Interactive Action Buttons */}
                      <div className="flex flex-wrap gap-2 mt-3 w-full">
                        {Array.from(msg.text.matchAll(/<antArtifact\s+identifier="([^"]+)"\s+type="([^"]+)"\s+title="([^"]+)"/g)).map((match, i) => (
                          <button
                            key={`art-${msg.id}-${i}`}
                            onClick={() => {
                              setActiveArtifactId(match[1]);
                              setActiveTab("preview");
                            }}
                            className="flex items-center space-x-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded px-2.5 py-1.5 transition-colors shadow-sm cursor-pointer select-none"
                          >
                            <Layers className="h-4 w-4" />
                            <span className="text-xs font-bold font-mono tracking-wide">Open: {match[3]}</span>
                          </button>
                        ))}

                        {/* Fallback React Code Blocks */}
                        {(() => {
                          const mdCodeBlockRegex = /```(jsx|tsx|javascript|typescript)\s*([\s\S]*?)```/g;
                          const buttons: React.ReactNode[] = [];
                          let mdMatch;
                          let count = 0;
                          while ((mdMatch = mdCodeBlockRegex.exec(msg.text)) !== null) {
                            const [_, lang, codeContent] = mdMatch;
                            const code = codeContent.trim();
                            if (code.includes("export default") || code.includes("import React") || code.includes("return (") || code.includes("return  (")) {
                              count++;
                              const id = `fallback-${msg.id}-${count}`;
                              let title = "Generated Component";
                              const exportDefaultMatch = code.match(/export\s+default\s+([A-Z]\w+)/);
                              if (exportDefaultMatch) {
                                title = exportDefaultMatch[1].replace(/([A-Z])/g, " $1").trim();
                              } else {
                                const funcMatch = code.match(/(?:function|const)\s+([A-Z]\w+)/);
                                if (funcMatch) {
                                  title = funcMatch[1].replace(/([A-Z])/g, " $1").trim();
                                }
                              }

                              buttons.push(
                                <button
                                  key={`fallback-btn-${msg.id}-${count}`}
                                  onClick={() => {
                                    setArtifacts(prev => ({
                                      ...prev,
                                      [id]: { id, type: "react", title, content: code }
                                    }));
                                    setActiveArtifactId(id);
                                    setActiveTab("preview");
                                  }}
                                  className="flex items-center space-x-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded px-2.5 py-1.5 transition-colors shadow-sm cursor-pointer select-none"
                                >
                                  <Layers className="h-4 w-4" />
                                  <span className="text-xs font-bold font-mono tracking-wide">Open: {title}</span>
                                </button>
                              );
                            }
                          }
                          return buttons;
                        })()}

                        {msg.toolLogs?.filter(t => t.toolName === "read_pages").map((log, i) => {
                          const { source, pages } = log.arguments || {};
                          if (source && pages?.length > 0) {
                            return (
                              <button
                                key={`man-${msg.id}-${i}`}
                                onClick={() => {
                                  setSelectedDoc(source);
                                  setSelectedPage(pages[0]);
                                  setActiveTab("manual");
                                }}
                                className="flex items-center space-x-1.5 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/30 rounded px-2.5 py-1.5 transition-colors shadow-sm cursor-pointer select-none"
                              >
                                <BookOpen className="h-4 w-4" />
                                <span className="text-xs font-bold font-mono tracking-wide">View Manual (Page {pages[0]})</span>
                              </button>
                            );
                          }
                          return null;
                        })}
                      </div>
                    </div>
                  ) : (
                    msg.text
                  )}
                </div>
              )}
            </div>
          ))}
          <div ref={chatEndRef} />
        </div>

        {/* Chat input */}
        <div className="border-t border-border bg-background py-4 space-y-3">
          {!isSidebar && (
            <div className="flex flex-col space-y-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-500 font-mono font-bold select-none">Suggested Inquiries</span>
              <div className="flex flex-wrap gap-2 max-h-[145px] overflow-y-auto pr-1">
                {PRESET_MESSAGES.map((msg, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setInput(msg)}
                    className="text-left px-2.5 py-1.5 text-[11px] font-sans text-gray-300 hover:text-primary bg-black/40 hover:bg-black/60 border border-border hover:border-primary/40 rounded transition-all cursor-pointer select-none leading-normal"
                  >
                    {msg}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex items-center space-x-2 rounded border border-border bg-black/45 px-3 py-2 focus-within:border-primary transition-all">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isSidebar ? "Ask assistant..." : "Ask about duty cycle parameters, wire speed calibration, polarity sockets..."}
              rows={1}
              className="flex-1 resize-none bg-transparent text-sm text-foreground outline-none placeholder:text-gray-600 max-h-[200px]"
            />
            <button
              onClick={toggleListening}
              className={`rounded p-2 transition-colors flex-shrink-0 ${isListening
                  ? "bg-error text-background animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.5)]"
                  : "bg-black/40 text-gray-400 hover:text-primary hover:bg-black/60 border border-border"
                }`}
              title={isListening ? "Stop listening" : "Speech to Text"}
            >
              {isListening ? <LucideIcons.MicOff className="h-4 w-4" /> : <LucideIcons.Mic className="h-4 w-4" />}
            </button>
            <button
              onClick={() => handleSend()}
              disabled={isLoading || !input.trim()}
              className="rounded bg-primary p-2 text-background hover:bg-primary-hover disabled:bg-border disabled:text-gray-600 transition-colors flex-shrink-0"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    );
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
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Top Navbar */}
      <header className="relative flex h-16 items-end pb-3 justify-between border-b border-border bg-surface px-6">
        <div className="flex items-center">
          <div className="hidden md:block w-36 h-2 hazard-stripes border border-border opacity-30"></div>
        </div>

        <div className="absolute left-1/2 bottom-3 -translate-x-1/2 flex items-center space-x-3">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-background font-black italic select-none">
            V
          </div>
          <div className="flex flex-col items-start">
            <h1 className="text-sm font-black tracking-wider text-primary leading-none">
              VULCAN OMNIPRO 220
            </h1>
            <p className="text-[10px] text-gray-500 font-mono tracking-widest uppercase mt-1">
              Technical Support Specialist
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4 relative">
          <div className="flex items-center space-x-2 rounded-full border border-border bg-black/40 px-3 py-1 text-[11px] font-mono">
            <span className={`h-2 w-2 rounded-full ${isLoading ? "bg-accent animate-pulse" : "bg-success"} shadow-md`} />
            <span className="text-gray-400 uppercase tracking-widest text-[9px]">
              {isLoading ? "Analyzing..." : "Ready"}
            </span>
          </div>
          <button
            onClick={handleClearChat}
            className="px-2.5 py-1 text-[10px] font-mono border border-border rounded bg-black/30 text-gray-400 hover:text-error hover:border-error/40 transition-colors focus:outline-none cursor-pointer select-none"
            title="Clear Chat History"
          >
            Clear Chat
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`text-gray-400 hover:text-primary transition-colors focus:outline-none ${showSettings ? "text-primary" : ""}`}
          >
            <Settings className="h-5 w-5" />
          </button>

          {/* Backdrop to close dropdown on click outside */}
          {showSettings && (
            <div
              className="fixed inset-0 z-40 bg-transparent cursor-default"
              onClick={() => setShowSettings(false)}
            />
          )}

          {/* Settings Dropdown */}
          {showSettings && (
            <div className="absolute right-0 top-10 z-50 w-56 rounded border border-border bg-surface p-3 shadow-xl font-mono text-xs text-gray-300">
              <div className="border-b border-border pb-1.5 mb-2 font-bold text-[10px] uppercase text-primary tracking-wider">
                System Workspace Mode
              </div>
              <div className="space-y-2">
                <label className="flex items-center justify-between cursor-pointer py-1 hover:bg-black/20 px-1 rounded transition-colors select-none">
                  <span>Developer Mode</span>
                  <input
                    type="radio"
                    name="workspace-mode"
                    checked={isDeveloperMode}
                    onChange={() => setIsDeveloperMode(true)}
                    className="accent-primary"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer py-1 hover:bg-black/20 px-1 rounded transition-colors select-none">
                  <span>User Mode</span>
                  <input
                    type="radio"
                    name="workspace-mode"
                    checked={!isDeveloperMode}
                    onChange={() => setIsDeveloperMode(false)}
                    className="accent-primary"
                  />
                </label>
              </div>

              <div className="border-b border-border pb-1.5 mb-2 mt-4 font-bold text-[10px] uppercase text-primary tracking-wider">
                Language Model
              </div>
              <div className="space-y-2">
                <label className="flex items-center justify-between cursor-pointer py-1 hover:bg-black/20 px-1 rounded transition-colors select-none">
                  <span>GPT-5.4 (OpenAI)</span>
                  <input
                    type="radio"
                    name="model-select"
                    checked={selectedModel === "openai"}
                    onChange={() => setSelectedModel("openai")}
                    className="accent-primary"
                  />
                </label>
                <label className="flex items-center justify-between cursor-pointer py-1 hover:bg-black/20 px-1 rounded transition-colors select-none">
                  <span>Claude Code (SDK)</span>
                  <input
                    type="radio"
                    name="model-select"
                    checked={selectedModel === "claude"}
                    onChange={() => setSelectedModel("claude")}
                    className="accent-primary"
                  />
                </label>
              </div>

              <div className="border-b border-border pb-1.5 mb-2 mt-4 font-bold text-[10px] uppercase text-primary tracking-wider">
                Voice Assistant
              </div>
              <div className="space-y-2">
                <label className="flex items-center justify-between cursor-pointer py-1 hover:bg-black/20 px-1 rounded transition-colors select-none">
                  <span>Auto Read Aloud</span>
                  <input
                    type="checkbox"
                    checked={isReadAloud}
                    onChange={(e) => setIsReadAloud(e.target.checked)}
                    className="accent-primary h-3.5 w-3.5"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* Main Workspace Panel */}
      <main className="flex h-full flex-col overflow-hidden bg-background">
        {/* Unified Tab Header Bar */}
        <div className="flex h-11 items-center justify-between border-b border-border bg-surface/80 px-6">
          <div className="flex space-x-1">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono tracking-wider border rounded transition-all ${activeTab === "chat"
                  ? "bg-primary text-background border-primary font-bold shadow-md"
                  : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
            >
              <Send className="h-3.5 w-3.5" />
              <span>CHAT</span>
            </button>
            <button
              onClick={() => setActiveTab("preview")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono tracking-wider border rounded transition-all ${activeTab === "preview"
                  ? "bg-primary text-background border-primary font-bold shadow-md"
                  : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
            >
              <Layers className="h-3.5 w-3.5" />
              <span>ARTIFACT</span>
            </button>
            <button
              onClick={() => setActiveTab("manual")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono tracking-wider border rounded transition-all ${activeTab === "manual"
                  ? "bg-primary text-background border-primary font-bold shadow-md"
                  : "border-transparent text-gray-400 hover:text-gray-200"
                }`}
            >
              <BookOpen className="h-3.5 w-3.5" />
              <span>MANUAL EXPLORER</span>
            </button>
          </div>
        </div>

        {/* Tab Body Viewports */}
        <div className="flex-1 flex flex-row overflow-hidden relative">

          {/* Left/Center Pane: Main view switcher */}
          <div className="flex-1 flex flex-col overflow-hidden h-full">
            {/* 1. CHAT TAB */}
            {activeTab === "chat" && (
              <div className="h-full flex flex-col max-w-4xl mx-auto w-full px-4 md:px-6">
                {renderChatContent()}
              </div>
            )}

            {/* 2. ARTIFACT TAB */}
            {activeTab === "preview" && (
              <div className="h-full flex-1 overflow-hidden p-6 flex flex-col">
                <div className="flex-1 flex flex-col rounded border border-border bg-black/60 overflow-hidden">
                  {activeArtifact ? (
                    <>
                      <div className="flex h-10 items-center justify-between border-b border-border bg-surface px-4 font-mono text-xs">
                        <span className="text-gray-300 font-bold uppercase">{activeArtifact.title}</span>

                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] text-gray-600 bg-black/35 px-2 py-0.5 rounded border border-border">
                            {activeArtifact.type}
                          </span>
                          <button
                            onClick={handleRefreshSandbox}
                            className="flex items-center space-x-1.5 px-2.5 py-1 text-[10px] bg-black/30 border border-border hover:border-primary/30 rounded text-gray-400 hover:text-primary transition-all font-mono"
                            title="Refresh Component"
                          >
                            <LucideIcons.RefreshCw className="h-3.5 w-3.5" />
                            <span className="text-[9px]">Refresh</span>
                          </button>

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
                        {/* Notice Banner */}
                        <div className="mb-4 flex items-center justify-between space-x-3 rounded border border-accent bg-accent/90 px-4 py-2.5 text-xs font-sans text-white shadow-[0_4px_12px_rgba(249,115,22,0.15)] select-none">
                          <div className="flex items-center space-x-2.5">
                            <AlertTriangle className="h-4.5 w-4.5 text-white shrink-0" />
                            <span className="font-semibold tracking-wide">
                              Not seeing anything? please refresh the artifact.
                            </span>
                          </div>
                          <button
                            onClick={handleRefreshSandbox}
                            className="flex items-center space-x-1.5 px-2.5 py-1 text-[10px] bg-white text-accent hover:bg-white/95 rounded font-mono font-bold transition-all shadow-sm shrink-0 cursor-pointer"
                          >
                            <LucideIcons.RefreshCw className="h-3 w-3 animate-spin-hover" />
                            <span>Refresh</span>
                          </button>
                        </div>

                        {previewSubTab === "code" ? (
                          <div className="relative w-full h-full flex-1">
                            <button
                              onClick={async () => {
                                if (!activeArtifact) return;
                                await navigator.clipboard.writeText(localCode);
                                setCopied(true);
                                setTimeout(() => setCopied(false), 2000);
                              }}
                              className="absolute top-2 right-4 flex items-center space-x-1.5 px-2.5 py-1 text-[10px] bg-black/70 hover:bg-black/90 border border-border hover:border-primary/30 rounded text-gray-400 hover:text-primary transition-all font-mono z-10"
                            >
                              {copied ? (
                                <>
                                  <LucideIcons.CheckCircle className="h-3 w-3 text-success animate-pulse" />
                                  <span className="text-success font-bold text-[9px]">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <LucideIcons.FileText className="h-3 w-3" />
                                  <span className="text-[9px]">Copy</span>
                                </>
                              )}
                            </button>
                            <textarea
                              value={localCode}
                              onChange={(e) => {
                                setLocalCode(e.target.value);
                                debouncedUpdateArtifact(e.target.value);
                              }}
                              className="w-full min-h-[500px] h-full flex-1 font-mono text-xs text-primary bg-black/35 p-3 pr-16 rounded border border-border outline-none focus:border-primary/50 whitespace-pre overflow-auto leading-relaxed resize-y"
                            />
                          </div>
                        ) : (
                          <div className="h-full">
                            {/* Live render condition */}
                            {isLoading ? (
                              <div className="flex flex-col h-full text-gray-500 font-mono p-4 overflow-auto">
                                <div className="flex items-center space-x-2 mb-3 text-xs uppercase tracking-wider border-b border-border pb-2 text-gray-400 select-none">
                                  <Loader2 className="h-4 w-4 animate-spin text-accent" />
                                  <span>Streaming Component Payload...</span>
                                </div>
                                <pre className="flex-1 w-full p-3 bg-surface border border-border rounded text-left text-[11px] text-gray-300 overflow-auto whitespace-pre-wrap font-mono leading-relaxed max-h-[450px]">
                                  <code>{activeArtifact.content}</code>
                                </pre>
                              </div>
                            ) : (
                              retryCount >= 2 && sandboxError ? (
                                <div className="p-6 bg-error/10 border border-error/20 rounded text-center max-w-md mx-auto space-y-4 my-12 overflow-auto">
                                  <AlertTriangle className="h-10 w-10 text-error mx-auto animate-bounce" />
                                  <h3 className="text-xs font-black uppercase text-error tracking-wider font-mono">Workspace Component Failure</h3>
                                  <p className="text-xs text-gray-300 leading-relaxed">
                                    The welder assistant was unable to render this interactive component after multiple automatic self-correction attempts.
                                  </p>
                                  {isDeveloperMode ? (
                                    <>
                                      <div className="bg-black/40 border border-border p-3 rounded font-mono text-[10px] text-left text-error overflow-auto max-h-32">
                                        {sandboxError}
                                      </div>
                                      <p className="text-[10px] text-gray-500 font-mono">
                                        You can manually inspect or correct the code in the [Code] tab.
                                      </p>
                                    </>
                                  ) : (
                                    <p className="text-xs text-error/80 font-medium font-sans">
                                      An internal setup error prevented this widget from launching.
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <div className="space-y-4">
                                  {/* Dispatcher by type */}
                                  {(activeArtifact.type.toLowerCase().includes("react") || activeArtifact.type.toLowerCase().includes("component") || activeArtifact.type.toLowerCase() === "jsx" || activeArtifact.type.toLowerCase() === "tsx") && (
                                    <SandpackSandbox
                                      key={activeArtifact.id}
                                      code={activeArtifact.content}
                                      onError={handleAutoRetry}
                                      onSuccess={handleSandboxSuccess}
                                      isLoading={isLoading}
                                    />
                                  )}

                                  {activeArtifact.type.toLowerCase().includes("mermaid") && (
                                    <MermaidSandbox content={activeArtifact.content} id={activeArtifact.id} />
                                  )}

                                  {activeArtifact.type.toLowerCase().includes("svg") && (
                                    <SvgSandbox content={activeArtifact.content} />
                                  )}

                                  {activeArtifact.type.toLowerCase().includes("html") && (
                                    <HtmlSandbox content={activeArtifact.content} />
                                  )}

                                  {activeArtifact.type.toLowerCase().includes("markdown") && (
                                    <div className="prose prose-invert max-w-none text-sm text-gray-300 font-sans p-4 bg-surface rounded border border-border">
                                      {activeArtifact.content}
                                    </div>
                                  )}

                                  {(activeArtifact.type.toLowerCase().includes("code") || activeArtifact.type.toLowerCase().includes("json") || activeArtifact.type.toLowerCase().includes("text")) && (
                                    <pre className="whitespace-pre-wrap font-mono leading-relaxed text-xs text-gray-300 bg-surface p-3 rounded border border-border">
                                      <code>{activeArtifact.content}</code>
                                    </pre>
                                  )}
                                </div>
                              )
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
              </div>
            )}

            {/* 3. MANUAL EXPLORER TAB */}
            {activeTab === "manual" && (
              <div className="h-full flex-1 overflow-hidden p-6 flex flex-col">
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

                  <div className="flex-1 bg-white overflow-hidden relative w-full h-full">
                    <iframe
                      src={`/extracted/pdf/${selectedDoc}/page_${selectedPage}.pdf#toolbar=0&navpanes=0`}
                      className="w-full h-full border-0 absolute inset-0"
                      title={`PDF Viewer - ${selectedDoc} Page ${selectedPage}`}
                      key={`${selectedDoc}-${selectedPage}`}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Pane: Chat Sidebar */}
          {/* Only rendered if activeTab is NOT "chat"! */}
          {activeTab !== "chat" && (
            <div className="w-[350px] md:w-[400px] border-l border-border bg-surface/10 flex flex-col h-full font-sans">
              <div className="flex h-9 items-center justify-between border-b border-border bg-surface/50 px-4 font-mono text-[10px] text-gray-400 select-none">
                <div className="flex items-center space-x-2">
                  <Send className="h-3 w-3 text-primary" />
                  <span>ASSISTANT CHAT</span>
                </div>
              </div>

              <div className="flex-1 overflow-hidden px-4 flex flex-col bg-black/20 animate-fade-in">
                {renderChatContent(true /* isSidebar mode */)}
              </div>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
