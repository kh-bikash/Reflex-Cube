import { useState } from "react";
import { User, Loader2, Download, AtSign } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import { api, downloadPdf } from "../../lib/api";

export const SocialCube = () => {
    const [username, setUsername] = useState("");
    const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
    const [result, setResult] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) return;

        setStatus("running");
        try {
            const response = await api.post("/cubes/run", {
                cube_id: "social",
                input: `Analyze the social media brand and recent posts of the Instagram user: @${username}. Use the Apify Instagram scraper to fetch their profile details and recent posts. Provide a comprehensive brand analysis.`
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
            await downloadPdf(`Brand Analysis - @${username}`, result);
        } catch (error) {
            console.error("PDF Download failed:", error);
            alert("Failed to download PDF.");
        }
    };

    return (
        <div className="flex flex-col h-full bg-[#0a0a0a] text-foreground">
            {/* Header */}
            <div className="p-6 md:p-8 border-b border-border flex items-center gap-4 bg-card/[0.02]">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 p-[1px]">
                    <div className="w-full h-full bg-[#0a0a0a] rounded-xl flex items-center justify-center">
                        <AtSign className="w-6 h-6 text-pink-400" />
                    </div>
                </div>
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Social Brand Cube</h2>
                    <p className="text-foreground/40 text-sm">Autonomous Instagram Profiler</p>
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
                            <div className="w-24 h-24 rounded-full bg-pink-500/10 flex items-center justify-center mb-6">
                                <User className="w-10 h-10 text-pink-400" />
                            </div>
                            <h3 className="text-2xl font-bold mb-3">Who are we analyzing?</h3>
                            <p className="text-foreground/40 mb-8 leading-relaxed">
                                Enter an Instagram username. The cube will use Apify to scrape their profile and latest posts, then generate a comprehensive brand and sentiment analysis.
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
                                <div className="absolute inset-0 bg-pink-500 blur-[50px] opacity-20 rounded-full animate-pulse"></div>
                                <Loader2 className="w-16 h-16 text-pink-400 animate-spin relative z-10" />
                            </div>
                            <h3 className="text-xl font-bold mt-8 mb-2">Analyzing Profile...</h3>
                            <p className="text-foreground/40 font-mono text-sm animate-pulse">Scraping data via Apify Actors</p>
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
                            <div className="prose prose-invert max-w-none prose-p:text-foreground/80 prose-headings:text-foreground prose-a:text-pink-400 prose-pre:bg-card/5 prose-pre:border prose-pre:border-border p-8 rounded-2xl bg-card/[0.02] border border-border">
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
                            <p className="text-xl font-bold">Failed to analyze profile.</p>
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
                <form onSubmit={handleSubmit} className="max-w-xl mx-auto relative">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-foreground/40 font-bold">@</span>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value.replace("@", ""))}
                        placeholder="username"
                        disabled={status === "running"}
                        className="w-full bg-card/5 border border-border rounded-2xl pl-12 pr-32 py-5 text-foreground placeholder-white/30 focus:outline-none focus:border-pink-500/50 focus:ring-1 focus:ring-pink-500/50 transition-all disabled:opacity-50"
                    />
                    <button
                        type="submit"
                        disabled={!username.trim() || status === "running"}
                        className="absolute right-3 top-1/2 -translate-y-1/2 px-6 py-2.5 bg-pink-600 hover:bg-pink-700 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {status === "running" ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            <>
                                <span>Analyze</span>
                                <User className="w-4 h-4" />
                            </>
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};
