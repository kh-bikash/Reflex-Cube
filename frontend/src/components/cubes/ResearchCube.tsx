import { useState } from "react";
import { Search, Loader2, Download, Globe } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { api, downloadPdf } from "../../lib/api";

export const ResearchCube = () => {
    const [query, setQuery] = useState("");
    const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
    const [result, setResult] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!query.trim()) return;

        setStatus("running");
        try {
            const response = await api.post("/cubes/run", {
                cube_id: "research",
                input: `Perform deep OSINT/web research on the following topic using Google Search (SerpApi) and Apify Web Scraper: ${query}`
            });

            if (response.data.status === "error") {
                setStatus("error");
            } else {
                setResult(response.data.result);
                setStatus("success");
            }
        } catch (error) {
            console.error(error);
            setStatus("error");
        }
    };

    const handleDownloadPdf = async () => {
        if (!result) return;
        try {
            await downloadPdf(`Research Report - ${query}`, result);
        } catch (error) {
            console.error("PDF Download failed:", error);
            alert("Failed to download PDF.");
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0a0a] text-foreground">
            {/* Header */}
            <div className="p-6 md:p-8 border-b border-border flex items-center gap-4 bg-card/[0.02]">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 p-[1px]">
                    <div className="w-full h-full bg-[#0a0a0a] rounded-xl flex items-center justify-center">
                        <Globe className="w-6 h-6 text-blue-400" />
                    </div>
                </div>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">OSINT Research Cube</h2>
                    <p className="text-foreground/40 text-sm">Autonomous Web Research & Scraping</p>
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                <AnimatePresence mode="wait">
                    {status === "idle" && (
                        <motion.div
                            key="idle"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            className="h-full flex flex-col items-center justify-center text-center max-w-lg mx-auto"
                        >
                            <div className="w-24 h-24 rounded-full bg-blue-500/10 flex items-center justify-center mb-6">
                                <Search className="w-10 h-10 text-blue-400" />
                            </div>
                            <h3 className="text-2xl font-bold mb-3">What shall we investigate?</h3>
                            <p className="text-foreground/40 mb-8 leading-relaxed">
                                Enter a topic, company, or person. The cube will autonomously search the web using SerpApi, scrape the top sources using Apify, and synthesize a comprehensive report.
                            </p>
                        </motion.div>
                    )}

                    {status === "running" && (
                        <motion.div
                            key="running"
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="h-full flex flex-col items-center justify-center"
                        >
                            <div className="relative">
                                <div className="absolute inset-0 bg-blue-500 blur-[50px] opacity-20 rounded-full animate-pulse"></div>
                                <Loader2 className="w-16 h-16 text-blue-400 animate-spin relative z-10" />
                            </div>
                            <h3 className="text-xl font-bold mt-8 mb-2">Compiling Intelligence...</h3>
                            <p className="text-foreground/40 font-mono text-sm animate-pulse">Running Apify & SerpApi Agents</p>
                        </motion.div>
                    )}

                    {status === "success" && result && (
                        <motion.div
                            key="success"
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="max-w-4xl mx-auto w-full"
                        >
                            <div className="flex justify-end mb-6">
                                <button
                                    onClick={handleDownloadPdf}
                                    className="flex items-center gap-2 px-4 py-2 bg-card/10 hover:bg-card/20 text-foreground rounded-lg transition-colors border border-border"
                                >
                                    <Download className="w-4 h-4" />
                                    <span className="text-sm font-medium">Download PDF Report</span>
                                </button>
                            </div>
                            <div className="prose prose-invert max-w-none prose-p:text-foreground/80 prose-headings:text-foreground prose-a:text-blue-400 prose-pre:bg-card/5 prose-pre:border prose-pre:border-border p-8 rounded-2xl bg-card/[0.02] border border-border">
                                <ReactMarkdown>{result}</ReactMarkdown>
                            </div>
                        </motion.div>
                    )}

                    {status === "error" && (
                        <motion.div
                            key="error"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="h-full flex flex-col items-center justify-center text-red-400"
                        >
                            <p className="text-xl font-bold">Failed to generate research report.</p>
                            <button 
                                onClick={() => setStatus("idle")}
                                className="mt-4 px-4 py-2 bg-card/10 text-foreground rounded-lg hover:bg-card/20 transition-colors"
                            >
                                Try Again
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Input Form */}
            <div className="p-6 border-t border-border bg-[#050505]">
                <form onSubmit={handleSubmit} className="max-w-3xl mx-auto relative">
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="E.g., Deep dive into recent advancements in solid-state batteries..."
                        disabled={status === "running"}
                        className="w-full bg-card/5 border border-border rounded-2xl pl-6 pr-32 py-5 text-foreground placeholder-white/30 focus:outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 transition-all disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={!query.trim() || status === "running"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {status === "running" ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <span>Investigate</span>
                                <Search className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};
