import React from "react";
import { motion } from "framer-motion";
import { Search, ChevronRight, FileText, Code, Box, Zap, BookOpen, Activity, Users, Headset } from "lucide-react";
import { useLocation, Link } from "react-router-dom";

export default function DocsTemplate() {
    const location = useLocation();
    const rawPath = location.pathname.split("/").pop() || "documentation";
    
    const titles: Record<string, string> = {
        "api-docs": "API Reference",
        "changelog": "Changelog",
        "documentation": "Documentation",
        "blog": "Engineering Blog",
        "community": "Community",
        "support": "Support Center",
        "status": "System Status"
    };

    const pageName = titles[rawPath] || "Documentation";

    return (
        <div className="min-h-screen bg-[#000] text-foreground font-sans selection:bg-white/30 pt-32 pb-24">
            <div className="max-w-[1600px] mx-auto px-6 flex flex-col lg:flex-row gap-12">
                
                {/* Sidebar */}
                <aside className="w-full lg:w-72 flex-shrink-0">
                    <div className="sticky top-32">
                        <div className="relative mb-8">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                            <input 
                                type="text" 
                                placeholder="Search docs..." 
                                className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-white placeholder-white/40 focus:outline-none focus:border-white/30 transition-colors"
                            />
                        </div>

                        <nav className="space-y-8">
                            <div>
                                <h4 className="text-xs font-mono font-bold text-white/40 mb-4 tracking-wider uppercase">Platform</h4>
                                <ul className="space-y-2">
                                    <li><Link to="/documentation" className={`flex items-center gap-2 text-sm transition-colors px-3 py-2 rounded-lg ${rawPath === 'documentation' ? 'bg-white/10 text-white border border-white/10' : 'text-white/60 hover:text-white'}`}><BookOpen className="w-4 h-4" /> Documentation</Link></li>
                                    <li><Link to="/api-docs" className={`flex items-center gap-2 text-sm transition-colors px-3 py-2 rounded-lg ${rawPath === 'api-docs' ? 'bg-white/10 text-white border border-white/10' : 'text-white/60 hover:text-white'}`}><Code className="w-4 h-4" /> API Reference</Link></li>
                                    <li><Link to="/changelog" className={`flex items-center gap-2 text-sm transition-colors px-3 py-2 rounded-lg ${rawPath === 'changelog' ? 'bg-white/10 text-white border border-white/10' : 'text-white/60 hover:text-white'}`}><Box className="w-4 h-4" /> Changelog</Link></li>
                                </ul>
                            </div>
                            
                            <div>
                                <h4 className="text-xs font-mono font-bold text-white/40 mb-4 tracking-wider uppercase">Resources</h4>
                                <ul className="space-y-2 border-l border-white/10 ml-3">
                                    <li><Link to="/blog" className={`flex items-center gap-2 text-sm transition-colors pl-4 py-1 ${rawPath === 'blog' ? 'text-white font-bold border-l-2 border-white -ml-[1px]' : 'text-white/60 hover:text-white'}`}><Zap className="w-4 h-4" /> Engineering Blog</Link></li>
                                    <li><Link to="/community" className={`flex items-center gap-2 text-sm transition-colors pl-4 py-1 ${rawPath === 'community' ? 'text-white font-bold border-l-2 border-white -ml-[1px]' : 'text-white/60 hover:text-white'}`}><Users className="w-4 h-4" /> Community</Link></li>
                                    <li><Link to="/support" className={`flex items-center gap-2 text-sm transition-colors pl-4 py-1 ${rawPath === 'support' ? 'text-white font-bold border-l-2 border-white -ml-[1px]' : 'text-white/60 hover:text-white'}`}><Headset className="w-4 h-4" /> Support Center</Link></li>
                                    <li><Link to="/status" className={`flex items-center gap-2 text-sm transition-colors pl-4 py-1 ${rawPath === 'status' ? 'text-white font-bold border-l-2 border-white -ml-[1px]' : 'text-white/60 hover:text-white'}`}><Activity className="w-4 h-4" /> System Status</Link></li>
                                </ul>
                            </div>
                        </nav>
                    </div>
                </aside>

                {/* Main Content Area */}
                <main className="flex-1 min-w-0">
                    <motion.div 
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="bg-[#0a0a0a] border border-white/10 rounded-[2rem] p-8 md:p-16 shadow-2xl relative overflow-hidden"
                    >
                        {/* Background subtle glow */}
                        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-white/5 blur-[120px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/3"></div>

                        <div className="flex items-center gap-2 text-xs font-mono text-white/40 mb-8">
                            <span>Platform</span> <ChevronRight className="w-3 h-3" /> <span className="text-white">{pageName}</span>
                        </div>

                        <h1 className="text-5xl md:text-6xl font-bold tracking-tighter text-white mb-6">
                            {pageName}
                        </h1>
                        <p className="text-xl text-white/60 font-light max-w-2xl leading-relaxed mb-12">
                            {rawPath === 'api-docs' && "Everything you need to know about integrating and building with ReflexCube's autonomous model engine."}
                            {rawPath === 'changelog' && "Track all the latest updates, features, and fixes for the ReflexCube ecosystem."}
                            {rawPath === 'blog' && "Deep dives into autonomous architectures, engineering, and the future of AI."}
                            {rawPath === 'community' && "Join thousands of builders shaping the future of autonomous intelligent systems."}
                            {rawPath === 'support' && "Get help, report issues, and find solutions from our engineering team."}
                            {rawPath === 'status' && "Real-time metrics and uptime information for all ReflexCube services."}
                            {rawPath === 'documentation' && "The central hub for all ReflexCube platform documentation and guides."}
                        </p>

                        <div className="prose prose-invert max-w-none prose-p:text-white/70 prose-headings:text-white prose-a:text-white prose-a:underline-offset-4 hover:prose-a:text-white/80">
                            
                            {rawPath === 'api-docs' || rawPath === 'documentation' ? (
                                <>
                                    <h2 className="text-3xl font-bold mb-6 mt-12 border-b border-white/10 pb-4">Introduction</h2>
                                    <p className="mb-6 leading-relaxed">
                                        Reflex Cube exposes one API for queueing prompt-to-model training jobs, streaming their progress, and dispatching to the Intelligence Cubes. An interactive reference generated from the code is served at <code>/docs</code> on the running backend.
                                    </p>

                                    <div className="my-10 bg-[#050505] border border-white/10 rounded-2xl p-6 relative group">
                                        <div className="absolute top-4 right-4 text-xs font-mono text-white/40">BASH</div>
                                        <pre className="font-mono text-sm text-white/80 overflow-x-auto whitespace-pre">
                                            <span className="text-green-400">curl</span> -X POST http://localhost:8000/api/models/create \<br/>
                                            {"  "}-H <span className="text-yellow-300">"Content-Type: application/json"</span> \<br/>
                                            {"  "}-d <span className="text-blue-300">'{"{"} "name": "review-sentiment", "prompt": "classify movie reviews" {"}"}'</span>
                                        </pre>
                                    </div>

                                    <h2 className="text-3xl font-bold mb-6 mt-12 border-b border-white/10 pb-4">Rate Limits</h2>
                                    <p className="mb-6 leading-relaxed">
                                        The API ships without authentication or rate limiting — every endpoint is open to whoever can reach the port. Put it behind your own auth layer and rate-limit <code>POST /api/models/create</code> before exposing it, since each call spawns a training process.
                                    </p>
                                </>
                            ) : rawPath === 'changelog' ? (
                                <>
                                    <h2 className="text-3xl font-bold mb-6 mt-12 border-b border-white/10 pb-4">v2.1.0 - The Visual Overhaul</h2>
                                    <p className="text-sm font-mono text-white/40 mb-4">June 8, 2026</p>
                                    <ul>
                                        <li><strong>New:</strong> Animated Footer with hover micro-interactions.</li>
                                        <li><strong>New:</strong> Global Telemetry Dashboard with Video Background.</li>
                                        <li><strong>New:</strong> AI App Store rebuilt with Staggered Bento Grid.</li>
                                        <li><strong>Fix:</strong> Removed visual seams across dark mode transitions.</li>
                                    </ul>
                                    <h2 className="text-3xl font-bold mb-6 mt-12 border-b border-white/10 pb-4">v2.0.0 - Reflex Architectures</h2>
                                    <p className="text-sm font-mono text-white/40 mb-4">May 1, 2026</p>
                                    <ul>
                                        <li>Initial release of the new autonomous training pipeline.</li>
                                    </ul>
                                </>
                            ) : rawPath === 'blog' ? (
                                <>
                                    <div className="mb-12 border border-white/10 p-6 rounded-2xl hover:bg-white/5 transition-colors cursor-pointer">
                                        <h3 className="text-2xl font-bold mb-2">Designing the Future of Autonomous Systems</h3>
                                        <p className="text-sm text-white/40 font-mono mb-4">By Engineering Team • June 5, 2026</p>
                                        <p>A deep dive into why we chose a bento grid aesthetic for displaying complex telemetry data...</p>
                                    </div>
                                    <div className="mb-12 border border-white/10 p-6 rounded-2xl hover:bg-white/5 transition-colors cursor-pointer">
                                        <h3 className="text-2xl font-bold mb-2">Optimizing Local Inference Speeds</h3>
                                        <p className="text-sm text-white/40 font-mono mb-4">By Research Team • May 20, 2026</p>
                                        <p>How we reduced latency by 40% using quantized int8 models on edge devices...</p>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <p className="text-xl text-white/50 italic mb-8">
                                        This page is under construction as we rapidly scale the ReflexCube platform. Check back soon for updates.
                                    </p>
                                </>
                            )}

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
                                <div className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group">
                                    <FileText className="w-8 h-8 text-white/60 mb-4 group-hover:text-white transition-colors" />
                                    <h3 className="text-lg font-bold text-white mb-2">Read the Guides</h3>
                                    <p className="text-sm text-white/60">Step-by-step tutorials for building your first Cube.</p>
                                </div>
                                <div className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer group">
                                    <Code className="w-8 h-8 text-white/60 mb-4 group-hover:text-white transition-colors" />
                                    <h3 className="text-lg font-bold text-white mb-2">API Reference</h3>
                                    <p className="text-sm text-white/60">Complete endpoint details, parameters, and responses.</p>
                                </div>
                            </div>
                        </div>
                    </motion.div>
                </main>
            </div>
        </div>
    );
}
