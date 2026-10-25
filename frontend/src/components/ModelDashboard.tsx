import React, { useEffect, useState } from "react";
import { getAllModels, requestModelZip, deleteModel, testModel } from "../lib/api";
import { Play, Download, Cpu, Clock, AlertTriangle, Trash2, Activity, Network } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface ModelJob {
  id: string;
  name: string;
  prompt: string;
  status: string;
  progress: number;
  epoch?: number;
  loss?: number;
  accuracy?: number;
  result_path?: string;
  metadata?: Record<string, unknown>;
  error?: string;
  task?: string;
}

const LiveWaveGraph = () => {
  return (
    <div className="w-full h-full flex items-end gap-1 opacity-50">
      {Array.from({ length: 40 }).map((_, i) => (
        <motion.div
          key={i}
          className="flex-1 bg-white/20 rounded-t-sm"
          initial={{ height: "10%" }}
          animate={{ height: `${Math.random() * 80 + 20}%` }}
          transition={{ duration: 0.5, repeat: Infinity, repeatType: "reverse", delay: i * 0.05 }}
        />
      ))}
    </div>
  );
};

const ModelDashboard: React.FC = () => {
  const [jobs, setJobs] = useState<ModelJob[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJobs = async () => {
    try {
      const res = await getAllModels();
      setJobs(res);
      setLoading(false);
    } catch (err) {
      console.error("Failed to fetch models:", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
    const interval = setInterval(fetchJobs, 3000);
    return () => clearInterval(interval);
  }, []);

  const handleDownload = async (id: string) => {
    try {
      const z = await requestModelZip(id);
      if (z?.url) window.open(z.url, "_blank");
    } catch {
      alert("Download failed.");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this model permanently?")) return;
    try {
      await deleteModel(id);
      setJobs(prev => prev.filter(j => j.id !== id));
    } catch (e) {
      console.error(e);
    }
  };

  if (loading) {
    return (
      <section className="min-h-screen flex items-center justify-center bg-[#050505]">
        <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-white/10 border-t-white rounded-full animate-spin"></div>
            <p className="text-white/40 font-mono text-sm tracking-widest uppercase">Initializing Neural Link...</p>
        </div>
      </section>
    );
  }

  return (
    <section className="relative min-h-screen pt-32 pb-24 overflow-hidden bg-[#000]">
      {/* Abstract Video Background */}
      <div className="absolute inset-0 z-0">
        <video autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-20 mix-blend-screen">
            <source src="/hero-bg.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 bg-gradient-to-t from-[#000] via-[#000]/80 to-[#000]/60"></div>
      </div>

      <div className="relative z-10 max-w-[1600px] mx-auto px-6">
        <div className="flex flex-col md:flex-row items-start md:items-end justify-between mb-12 border-b border-white/10 pb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-md bg-white/5 border border-white/10 text-white/60 text-xs font-mono mb-4">
                <Activity size={12} className="text-green-400" />
                DASHBOARD ACTIVE
            </div>
            <h2 className="text-5xl md:text-6xl font-bold tracking-tighter text-white">
              Global <span className="text-white/40">Telemetry.</span>
            </h2>
          </div>
          <div className="mt-4 md:mt-0 flex gap-4 text-sm font-mono text-white/40">
              <div className="bg-[#111] border border-white/5 px-4 py-2 rounded-lg">
                  <span className="text-white">Active Nodes:</span> {jobs.filter(j => j.status === 'running').length}
              </div>
              <div className="bg-[#111] border border-white/5 px-4 py-2 rounded-lg">
                  <span className="text-white">Completed:</span> {jobs.filter(j => j.status === 'completed').length}
              </div>
          </div>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          
          {/* Active Training Bento */}
          <div className="xl:col-span-8 flex flex-col gap-6">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2"><Network className="w-5 h-5 text-white/50" /> Active Operations</h3>
            
            {jobs.filter(j => j.status !== "completed" && j.status !== "failed").length === 0 ? (
                <div className="w-full h-64 border border-white/5 rounded-3xl bg-[#0a0a0a]/50 backdrop-blur-xl flex flex-col items-center justify-center">
                    <Cpu size={48} className="text-white/10 mb-4" />
                    <p className="text-white/40 font-mono">No active operations detected.</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {jobs.filter(j => j.status !== "completed" && j.status !== "failed").map((job) => (
                    <motion.div layout key={job.id} className="relative rounded-[2rem] p-6 overflow-hidden border border-white/10 bg-[#0a0a0a]/80 backdrop-blur-2xl shadow-2xl flex flex-col justify-between min-h-[300px]">
                        <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-50 z-0 pointer-events-none"></div>
                        
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div className="p-3 rounded-xl bg-white/5 border border-white/10 text-white">
                                    <Cpu className="w-6 h-6" />
                                </div>
                                <div className="px-3 py-1 bg-white/10 rounded-full text-xs font-mono text-white/80 border border-white/10 flex items-center gap-2">
                                    <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
                                    {job.status.toUpperCase()}
                                </div>
                            </div>
                            <h4 className="text-2xl font-bold text-white mb-2">{job.name}</h4>
                            <p className="text-sm text-white/40 line-clamp-2">{job.prompt}</p>
                        </div>

                        <div className="relative z-10 mt-8">
                            <div className="flex justify-between text-sm font-mono mb-2">
                                <span className="text-white/40">ALLOCATION</span>
                                <span className="text-white">{job.progress?.toFixed(1)}%</span>
                            </div>
                            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                                <motion.div 
                                    className="h-full bg-white relative"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${job.progress || 0}%` }}
                                    transition={{ duration: 0.5 }}
                                >
                                    <div className="absolute top-0 right-0 bottom-0 w-20 bg-gradient-to-r from-transparent to-white opacity-50 blur-sm"></div>
                                </motion.div>
                            </div>
                            
                            <div className="flex justify-between mt-4 text-xs font-mono text-white/40">
                                <div className="flex flex-col gap-1">
                                    <span>EPOCH</span>
                                    <span className="text-white text-lg">{job.epoch?.toFixed(1) || "0.0"}</span>
                                </div>
                                <div className="flex flex-col gap-1 text-right">
                                    <span>LOSS</span>
                                    <span className="text-white text-lg">{job.loss?.toFixed(4) || "N/A"}</span>
                                </div>
                            </div>
                            
                            {/* Live Graph Background inside the card */}
                            <div className="absolute bottom-0 left-0 right-0 h-32 -z-10 opacity-20 pointer-events-none">
                                <LiveWaveGraph />
                            </div>
                        </div>
                    </motion.div>
                ))}
                </div>
            )}
          </div>

          {/* Archived / Completed */}
          <div className="xl:col-span-4 flex flex-col gap-6">
            <h3 className="text-xl font-semibold text-white flex items-center gap-2"><Clock className="w-5 h-5 text-white/50" /> System Archive</h3>
            
            <div className="flex flex-col gap-4">
                {jobs.filter(j => j.status === "completed").slice(0, 5).map((job) => (
                    <div key={job.id} className="p-5 rounded-3xl bg-[#0a0a0a] border border-white/5 hover:bg-[#111] transition-colors">
                        <div className="flex justify-between items-start mb-3">
                            <h4 className="font-bold text-white">{job.name}</h4>
                            <span className="text-[10px] font-mono px-2 py-1 bg-white/10 text-white rounded-md uppercase tracking-wider">{job.task || "GENERIC"}</span>
                        </div>
                        <p className="text-xs text-white/40 line-clamp-1 mb-4">{job.prompt}</p>
                        
                        <div className="flex gap-2">
                            <button onClick={() => handleDownload(job.id)} className="flex-1 bg-white text-black text-xs font-bold py-2 rounded-lg flex items-center justify-center gap-2 hover:bg-white/80 transition-colors">
                                <Download size={14} /> EXPORT
                            </button>
                            <button onClick={() => handleDelete(job.id)} className="px-4 bg-white/5 text-white/60 hover:text-red-400 hover:bg-white/10 rounded-lg transition-colors">
                                <Trash2 size={14} />
                            </button>
                        </div>
                        
                        {/* Minimal Test UI */}
                        <div className="mt-3 pt-3 border-t border-white/5">
                            <details className="text-xs group cursor-pointer">
                                <summary className="text-white/40 hover:text-white transition-colors font-mono flex items-center gap-2 outline-none list-none">
                                    <Play size={12} /> RUN INFERENCE TEST
                                </summary>
                                <div className="mt-3">
                                    <textarea
                                        id={`test-input-${job.id}`}
                                        className="w-full bg-[#000] border border-white/10 rounded-lg p-3 text-white placeholder:text-white/20 outline-none focus:border-white/30 font-mono text-xs resize-none"
                                        placeholder="Enter payload..."
                                        rows={2}
                                    />
                                    <button
                                        id={`test-btn-${job.id}`}
                                        className="w-full mt-2 py-2 bg-white/10 hover:bg-white/20 text-white font-mono text-xs rounded-lg transition-colors"
                                        onClick={async () => {
                                            const input = (document.getElementById(`test-input-${job.id}`) as HTMLTextAreaElement).value;
                                            if (!input) return;
                                            const btn = document.getElementById(`test-btn-${job.id}`) as HTMLButtonElement;
                                            const out = document.getElementById(`test-out-${job.id}`) as HTMLDivElement;
                                            btn.disabled = true; btn.innerText = "EXECUTING...";
                                            out.innerHTML = "Processing...";
                                            try {
                                                const res = await testModel(job.id, input);
                                                out.innerText = typeof res.result === 'object' ? JSON.stringify(res.result, null, 2) : res.result;
                                            } catch {
                                                out.innerText = "ERROR: Inference failed.";
                                            } finally {
                                                btn.disabled = false; btn.innerText = "EXECUTE";
                                            }
                                        }}
                                    >
                                        EXECUTE
                                    </button>
                                    <div id={`test-out-${job.id}`} className="mt-2 text-[10px] font-mono text-white/60 bg-[#000] p-3 rounded-lg border border-white/5 min-h-[40px] break-all"></div>
                                </div>
                            </details>
                        </div>
                    </div>
                ))}

                {jobs.filter(j => j.status === "failed").length > 0 && (
                    <div className="p-5 rounded-3xl bg-red-950/20 border border-red-500/20">
                        <div className="flex items-center gap-2 mb-3">
                            <AlertTriangle className="text-red-400 w-4 h-4" />
                            <h4 className="font-bold text-red-400 text-sm font-mono">CRITICAL FAILURES</h4>
                        </div>
                        {jobs.filter(j => j.status === "failed").map(f => (
                            <div key={f.id} className="text-xs font-mono text-red-400/60 mb-2 border-l-2 border-red-500/30 pl-2">
                                <span className="text-red-400">{f.name}</span>: {f.error?.slice(0,50)}...
                            </div>
                        ))}
                    </div>
                )}
            </div>
          </div>

        </div>
      </div>
    </section>
  );
};

export default ModelDashboard;
