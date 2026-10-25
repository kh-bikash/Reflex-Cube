// frontend/src/components/PromptModel.tsx
import React, { useState, useEffect } from "react";
import { createModel, getJobStatus, downloadModel } from "../lib/api";
import { TrainingTerminal } from "./TrainingTerminal";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Mic } from "lucide-react";

const FloatingCubesBackground = () => {
    // Generate random floating cubes
    const cubes = Array.from({ length: 15 }).map((_, i) => {
        const size = Math.random() * 60 + 20; // 20px to 80px
        const left = Math.random() * 100;
        const delay = Math.random() * 5;
        const duration = Math.random() * 15 + 15; // 15s to 30s
        
        const gradients = [
            "from-white/40 to-white/10",
            "from-white/20 to-transparent"
        ];
        const gradient = gradients[Math.floor(Math.random() * gradients.length)];

        return (
            <motion.div
                key={i}
                initial={{ y: "100vh", rotateX: 0, rotateY: 0, opacity: 0 }}
                animate={{ 
                    y: "-20vh", 
                    rotateX: 360, 
                    rotateY: 360,
                    opacity: [0, 1, 0] 
                }}
                transition={{ 
                    duration, 
                    repeat: Infinity, 
                    delay,
                    ease: "linear"
                }}
                className={`absolute rounded-xl bg-gradient-to-br ${gradient} border border-white/40 backdrop-blur-md shadow-2xl`}
                style={{
                    width: size,
                    height: size,
                    left: `${left}%`,
                    zIndex: Math.random() > 0.5 ? 1 : 0
                }}
            />
        );
    });

    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0 bg-[#0a0a0a]">
            {/* Subtle central glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[900px] max-h-[900px] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/10 via-transparent to-transparent opacity-80 blur-3xl rounded-full"></div>
            
            {cubes}
            
            {/* A glass overlay to make the cubes look embedded in the depth */}
            <div className="absolute inset-0 bg-black/20 backdrop-blur-[1px]"></div>
        </div>
    );
};

const PromptModel: React.FC = () => {
  const [prompt, setPrompt] = useState("");
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [progress, setProgress] = useState<number>(0);
  const [busy, setBusy] = useState(false);
  const [resultPath, setResultPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [zipBusy, setZipBusy] = useState(false);
  const [selectedTask, setSelectedTask] = useState("auto");

  const handleGenerate = async () => {
    if (!prompt.trim()) return setError("Please enter a prompt.");
    setBusy(true);
    setError(null);
    setStatus("queued");
    setProgress(0);
    setResultPath(null);
    try {
      const res = await createModel({
        name: "frontend-demo",
        prompt,
        task: selectedTask === "auto" ? undefined : selectedTask
      });
      setJobId(res.job_id);
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      setError(err.message || "Failed to create job");
      setBusy(false);
      setStatus("failed");
    }
  };

  useEffect(() => {
    if (!jobId) return;
    let stopped = false;
    const pollOnce = async () => {
      try {
        const data = await getJobStatus(jobId);
        if (stopped) return;
        setStatus(data.status);
        setProgress(Math.round(data.progress ?? 0));
        if (data.status === "completed") {
          setBusy(false);
          setResultPath(data.result_path ?? null);
        } else if (data.status === "failed") {
          setBusy(false);
        }
      } catch (e) {
        console.error("poll status error", e);
      }
    };

    // immediate poll + interval
    pollOnce();
    const intervalId = setInterval(pollOnce, 3000);

    return () => {
      stopped = true;
      clearInterval(intervalId);
    };
  }, [jobId]);

  const handleDownloadZip = async () => {
    if (!jobId) return;
    setZipBusy(true);
    setError(null);
    try {
      // The download endpoint needs an Authorization header, so this fetches
      // the archive and saves the blob rather than opening a URL in a tab.
      await downloadModel(jobId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download the model.");
    } finally {
      setZipBusy(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen w-full text-white font-sans relative">
      <FloatingCubesBackground />

      {/* Main Content Area */}
      <main className="flex-1 relative flex flex-col h-full pt-32 overflow-y-auto">

        {/* Center container for input */}
        <div className="flex-1 flex flex-col items-center justify-center w-full max-w-5xl mx-auto px-4 z-10 pb-[10vh]">
          <AnimatePresence>
            {status === "idle" && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className="text-center mb-12"
              >
                <h1 className="text-[40px] md:text-[56px] font-bold tracking-tight text-white leading-tight mb-4">
                  What will you create?
                </h1>
                <p className="text-white/40 text-lg">
                  Describe your architecture and start training immediately.
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          <motion.div 
            layout
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full bg-[#0a0a0a]/80 backdrop-blur-2xl rounded-[2rem] p-4 flex flex-col shadow-2xl border border-white/5"
          >
            <div className="flex items-start gap-3 px-4 pt-2">
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the model task..."
                    className="w-full bg-transparent border-none text-white placeholder-white/30 focus:ring-0 resize-none h-16 py-2.5 outline-none text-lg"
                    rows={2}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleGenerate();
                      }
                    }}
                />
            </div>

            <div className="flex items-center justify-between mt-4 px-2 pt-2 border-t border-white/5">
                <div className="flex items-center gap-4">
                    <select
                       value={selectedTask}
                       onChange={(e) => setSelectedTask(e.target.value)}
                       className="bg-white/5 text-sm text-white/60 cursor-pointer hover:bg-white/10 px-4 py-2 rounded-full appearance-none outline-none border border-white/5"
                    >
                       <option value="auto" className="bg-[#0a0a0a]">Auto-Route</option>
                       <option value="text-generation" className="bg-[#0a0a0a]">Text Generation</option>
                       <option value="sentiment-analysis" className="bg-[#0a0a0a]">Sentiment</option>
                    </select>
                </div>
                <button 
                    onClick={handleGenerate}
                    disabled={busy}
                    className="flex items-center gap-2 px-6 py-2.5 bg-white hover:bg-white/90 text-black font-semibold rounded-full transition-all disabled:opacity-50"
                >
                    <span>Generate</span>
                </button>
            </div>
          </motion.div>

          {/* Progress & Terminal UI below the input */}
          {error && <div className="text-red-400 mt-6 bg-red-900/20 px-4 py-2 rounded-lg border border-red-900/50">{error}</div>}

          {status !== "idle" && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full max-w-[830px] mt-8 bg-[#1e1f20] rounded-[2rem] p-6 shadow-xl border border-white/5"
            >
              <div className="flex justify-between items-center mb-4">
                <div className="text-sm font-medium text-gray-400 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${status === 'completed' ? 'bg-green-500' : status === 'failed' ? 'bg-red-500' : 'bg-blue-500 animate-pulse'}`}></div>
                  <span className="uppercase tracking-wider text-xs">{status}</span>
                </div>
                <div className="flex gap-3 items-center">
                    <div className="text-xs font-mono text-gray-500">{progress}%</div>
                    <button
                        onClick={() => {
                        setJobId(null);
                        setStatus("idle");
                        setProgress(0);
                        setBusy(false);
                        setResultPath(null);
                        setError(null);
                        setPrompt("");
                        }}
                        className="px-3 py-1.5 rounded-full hover:bg-white/10 text-xs text-gray-300 transition-colors"
                    >
                        Reset
                    </button>
                </div>
              </div>

              <div className="h-1.5 w-full bg-[#131314] rounded-full overflow-hidden mb-6">
                <motion.div
                  className="h-full bg-blue-500"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ type: "spring", stiffness: 50 }}
                />
              </div>

              <div className="rounded-xl overflow-hidden border border-white/5">
                <TrainingTerminal jobId={jobId!} />
              </div>

              {status === "completed" && jobId && (
                <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between">
                  <div className="text-sm text-gray-400">
                    Model <code>{jobId.slice(0,8)}</code> ready.
                  </div>
                  <div className="flex gap-3">
                      <button
                        className="px-6 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
                        onClick={handleDownloadZip}
                        disabled={zipBusy}
                      >
                        {zipBusy ? "Zipping..." : "Download Weights"}
                      </button>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
};

export default PromptModel;
