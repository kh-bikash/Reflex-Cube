import { Suspense } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2 } from "lucide-react";
import { motion } from "framer-motion";

import { getCube } from "../lib/cubes";

const ConsoleFallback = () => (
    <div className="flex h-full min-h-[60vh] flex-col items-center justify-center gap-4 text-white/50">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="font-mono text-xs uppercase tracking-widest">Booting cube…</p>
    </div>
);

const CubePage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const cube = getCube(id);

    return (
        <div className="relative z-10 flex min-h-screen flex-col overflow-hidden bg-[#000] px-6 pb-24 pt-32 font-sans text-foreground selection:bg-primary/30">
            {/* Global Abstract Background for Cube Page */}
            <div className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
                <div className="absolute left-[-10%] top-[-20%] h-[50%] w-[50%] animate-pulse rounded-full bg-[#2a1b54] opacity-20 blur-[150px]"></div>
                <div className="absolute bottom-[-20%] right-[-10%] h-[60%] w-[60%] rounded-full bg-[#0f2e4a] opacity-20 blur-[150px]"></div>
                <div className="absolute inset-0 bg-[url('/noise.png')] opacity-5 mix-blend-overlay"></div>
            </div>

            <div className="relative z-10 mx-auto flex w-full max-w-[1600px] flex-1 flex-col">
                <div className="mb-8 flex items-center justify-between">
                    <button
                        onClick={() => navigate(-1)}
                        className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-6 py-2.5 text-white/50 shadow-lg backdrop-blur-md transition-colors hover:bg-white/10 hover:text-white"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        <span className="text-sm font-bold tracking-wide">Back to Hub</span>
                    </button>
                    {cube && (
                        <div className="flex items-center gap-3">
                            <span className="hidden text-sm font-semibold text-white/70 sm:inline">{cube.title}</span>
                            <div className="rounded-full border border-white/10 bg-white/5 px-4 py-1.5 font-mono text-xs font-bold tracking-wider text-emerald-400 backdrop-blur-md">
                                SYSTEM ONLINE
                            </div>
                        </div>
                    )}
                </div>

                {/*
                    This container gives the cube a defined height and border so it doesn't stretch
                    infinitely and looks like a proper web application embedded in the page.
                */}
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative min-h-[80vh] w-full flex-1 overflow-hidden rounded-[2.5rem] border border-white/10 bg-[#0a0a0a]/80 shadow-2xl backdrop-blur-2xl"
                >
                    {/* Inner Edge Glow */}
                    <div className="pointer-events-none absolute inset-0 z-50 rounded-[2.5rem] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.05)]"></div>

                    {cube ? (
                        <Suspense fallback={<ConsoleFallback />}>
                            <cube.console />
                        </Suspense>
                    ) : (
                        <div className="flex h-[60vh] flex-col items-center justify-center text-foreground">
                            <h2 className="mb-4 text-3xl font-bold">Engine Offline</h2>
                            <p className="mb-8 text-muted-foreground">
                                {id ? `No cube is registered under "${id}".` : "No cube selected."}
                            </p>
                            <button
                                onClick={() => navigate("/services")}
                                className="rounded-full bg-primary px-6 py-2 text-primary-foreground hover:opacity-90"
                            >
                                Return to Hub
                            </button>
                        </div>
                    )}
                </motion.div>
            </div>
        </div>
    );
};

export default CubePage;
