import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings, Database, Terminal, Cpu, Save, FolderOpen, HardDrive, MessageSquare, BookOpen, Send, Bot, User } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import { BASIC_CHAT, SMART_INSTRUCT, SHAKESPEARE } from './forge_data';

// Recharts for Loss Graph
// Recharts removed due to stability issues. Using CSS visualization.

export default function ForgeCube() {
    const [activeTab, setActiveTab] = useState<'data' | 'arch' | 'train' | 'play' | 'models'>('data');
    const [dataText, setDataText] = useState('');
    const [logs, setLogs] = useState<string[]>([]);
    const [isTraining, setIsTraining] = useState(false);
    const [stats, setStats] = useState({ step: 0, loss: 0.0 });
    const [lossHistory, setLossHistory] = useState<Array<{ step: number; loss: number }>>([]);
    const [generatedText, setGeneratedText] = useState("");
    const [prompt, setPrompt] = useState("The");
    const [saveName, setSaveName] = useState("");
    const [models, setModels] = useState<Array<{ name: string; date?: string; size: number }>>([]);
    const [chatHistory, setChatHistory] = useState<{ role: 'user' | 'ai', content: string }[]>([]);
    const [chatInput, setChatInput] = useState("");

    // Config
    const [config, setConfig] = useState({
        n_layer: 4,
        n_head: 4,
        n_embd: 128
    });

    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        if (activeTab === 'train' || isTraining) {
            interval = setInterval(fetchStatus, 1000);
        }
        return () => clearInterval(interval);
    }, [activeTab, isTraining]);

    // Auto-scroll logs
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [logs]);

    const fetchStatus = async () => {
        try {
            const { data: res } = await api.post('/cubes/run', {
                cube_id: 'forge',
                input: { action: 'status' }
            });
            if (res) {
                setIsTraining(res.is_training);
                setStats({ step: res.step, loss: res.loss });
                setLogs(res.logs || []);

                // Format history for graph
                if (res.history) {
                    setLossHistory(res.history.map((val: number, idx: number) => ({ step: idx, loss: val })));
                }
            }
        } catch (e) {
            console.warn("Failed to fetch status in ForgeCube", e);
        }
    };

    const handleUpload = async () => {
        if (!dataText) return toast.error("Please enter some text first.");
        try {
            const { data: res } = await api.post('/cubes/run', {
                cube_id: 'forge',
                input: { action: 'upload', text: dataText }
            });
            if (res.status === 'success') {
                toast.success(`Uploaded ${res.char_count} chars.`);
                setActiveTab('arch');
            } else {
                toast.error(res.message || "Upload failed");
            }
        } catch (e) {
            const err = e as Error & { response?: { data?: { message?: string } } };
            console.error(err);
            toast.error("API Error: " + (err.response?.data?.message || err.message));
        }
    };

    const startTraining = async () => {
        try {
            const { data: res } = await api.post('/cubes/run', {
                cube_id: 'forge',
                input: { action: 'train', config }
            });
            if (res.status === 'success') {
                toast.success("Training Initialized");
                setIsTraining(true);
            } else {
                toast.error(res.message);
            }
        } catch (e) {
            const err = e as Error;
            toast.error("Training failed to start: " + err.message);
        }
    };

    const stopTraining = async () => {
        try {
            await api.post('/cubes/run', { cube_id: 'forge', input: { action: 'stop' } });
            setIsTraining(false);
            toast.info("Training stopped.");
        } catch (err) {
            console.error(err);
        }
    };

    const generate = async () => {
        try {
            setGeneratedText("Generating...");
            const { data: res } = await api.post('/cubes/run', {
                cube_id: 'forge',
                input: { action: 'generate', prompt }
            });
            if (res.status === 'success') {
                setGeneratedText(res.generated);
            } else {
                setGeneratedText("Error: " + res.message);
                toast.error(res.message);
            }
        } catch (e) {
            const err = e as Error;
            setGeneratedText("Error: " + err.message);
            toast.error("Generation failed");
        }
    };

    const handleChatSubmit = async () => {
        if (!chatInput.trim()) return;

        const userMsg = chatInput.trim();
        setChatInput("");
        setChatHistory(prev => [...prev, { role: 'user', content: userMsg }]);

        // Prepare prompt for model: User: <msg>\nAI:
        const prompt = `User: ${userMsg}\nAI:`;

        try {
            const { data: res } = await api.post('/cubes/run', {
                cube_id: 'forge',
                input: { action: 'generate', prompt: prompt }
            });

            if (res.status === 'success') {
                // Post-process: Remove the prompt echoes if model echoes them
                let answer = res.generated.replace(prompt, "").trim();
                // If model generates "User:" again, cut it off
                if (answer.includes("User:")) {
                    answer = answer.split("User:")[0].trim();
                }
                setChatHistory(prev => [...prev, { role: 'ai', content: answer || "..." }]);
            } else {
                toast.error(res.message);
            }
        } catch (e) {
            console.error("Chat Failed", e);
            toast.error("Chat Failed");
        }
    };

    const fetchModels = async () => {
        try {
            const { data: res } = await api.post('/cubes/run', {
                cube_id: 'forge',
                input: { action: 'list' }
            });
            if (res.status === 'success') {
                setModels(res.models);
            }
        } catch (e) {
            console.warn("Failed to fetch models", e);
        }
    };

    const saveModel = async () => {
        if (!saveName) return toast.error("Enter a name");
        try {
            const { data: res } = await api.post('/cubes/run', {
                cube_id: 'forge',
                input: { action: 'save', name: saveName }
            });
            if (res.status === 'success') {
                toast.success("Model Saved!");
                fetchModels();
            } else {
                toast.error(res.message);
            }
        } catch (e) {
            const err = e as Error;
            toast.error("Save failed: " + err.message);
        }
    };

    const loadModel = async (name: string) => {
        try {
            const { data: res } = await api.post('/cubes/run', {
                cube_id: 'forge',
                input: { action: 'load', name }
            });
            if (res.status === 'success') {
                toast.success(`Loaded ${name}`);
                setConfig(res.config);
                setActiveTab('play'); // Switch to play tab to test
            } else {
                toast.error(res.message);
            }
        } catch (e) {
            const err = e as Error;
            toast.error("Load failed: " + err.message);
        }
    };

    useEffect(() => {
        if (activeTab === 'models') fetchModels();
    }, [activeTab]);


    const handleLoadShakespeare = () => {
        setDataText(SHAKESPEARE);
        toast.success("Loaded Shakespeare sample");
    };

    const handleLoadChat = () => {
        // Repeat the data to ensure enough volume for training
        setDataText(Array(20).fill(BASIC_CHAT).flat().join("\n\n"));
        toast.success("Loaded Chat Dialogue sample");
    };

    const handleLoadSmart = () => {
        // Repeat more times because it's diverse
        setDataText(Array(30).fill(SMART_INSTRUCT).flat().join("\n\n"));
        toast.success("Loaded Smart Instruction Data (Mini-Alpaca)");
    };

    return (
        <div className="h-full flex flex-col bg-background/50 text-foreground p-6 relative overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-red-600">
                        Forge Cube
                    </h2>
                    <p className="text-slate-400">Architect and Train LLMs from Scratch.</p>
                </div>

                {/* Status Pill */}
                <div className={`px-4 py-2 rounded-full border ${isTraining ? 'border-green-500/50 bg-green-500/10 text-success animate-pulse' : 'border-slate-700 bg-slate-800'}`}>
                    {isTraining ? `Training | Step ${stats.step} | Loss ${stats.loss.toFixed(4)}` : 'Ready / Idle'}
                </div>
            </div>

            {/* Tabs */}
            <div className="flex space-x-2 mb-6 border-b border-slate-700 pb-2 overflow-x-auto">
                {[
                    { id: 'data', icon: Database, label: '1. Dataset' },
                    { id: 'arch', icon: Cpu, label: '2. Architecture' },
                    { id: 'train', icon: Terminal, label: '3. Train' },
                    { id: 'play', icon: Play, label: '4. Test' },
                    { id: 'models', icon: HardDrive, label: '5. Models' },
                ].map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as 'data' | 'arch' | 'train' | 'play' | 'models')}
                        className={`flex items-center space-x-2 px-4 py-2 rounded-t-lg transition-all ${activeTab === tab.id
                            ? 'bg-slate-800 text-orange-400 border-b-2 border-orange-400'
                            : 'text-slate-400 hover:text-foreground hover:bg-slate-800/50'
                            }`}
                    >
                        <tab.icon size={16} />
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="flex-1 bg-slate-950/50 rounded-xl border border-slate-800 p-6 overflow-y-auto">
                <AnimatePresence mode="wait">

                    {/* DATA TAB */}
                    {activeTab === 'data' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full flex flex-col">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium text-slate-300">Training Data</h3>
                                <div className="flex gap-2">
                                    <button
                                        onClick={handleLoadShakespeare}
                                        className="flex items-center space-x-2 px-3 py-1 bg-slate-800 hover:bg-slate-700 rounded text-xs text-slate-300 border border-slate-700 transition-colors"
                                    >
                                        <BookOpen size={14} />
                                        <span>Load Shakespeare</span>
                                    </button>
                                    <button
                                        onClick={handleLoadChat}
                                        className="flex items-center space-x-2 px-3 py-1 bg-blue-900/40 hover:bg-blue-900/60 rounded text-xs text-blue-200 border border-blue-800 transition-colors"
                                    >
                                        <MessageSquare size={14} />
                                        <span>Chat</span>
                                    </button>
                                    <button
                                        onClick={handleLoadSmart}
                                        className="flex items-center space-x-2 px-3 py-1 bg-yellow-900/40 hover:bg-yellow-900/60 rounded text-xs text-yellow-200 border border-yellow-800 transition-colors"
                                    >
                                        <Cpu size={14} />
                                        <span>Smart</span>
                                    </button>
                                </div>
                            </div>
                            <textarea
                                className="flex-1 bg-background border border-slate-700 rounded-lg p-4 font-mono text-sm focus:border-orange-500 outline-none resize-none"
                                placeholder="Paste your raw text here (e.g. Shakespeare, Code, Lyrics)..."
                                value={dataText}
                                onChange={(e) => setDataText(e.target.value)}
                            />
                            <div className="mt-4 flex justify-end">
                                <button onClick={handleUpload} className="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-foreground rounded-lg font-medium transition-colors">
                                    Map to Tokenizer &rarr;
                                </button>
                            </div>
                        </motion.div>
                    )}

                    {/* ARCHITECTURE TAB */}
                    {activeTab === 'arch' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full flex flex-col max-w-2xl mx-auto">
                            <h3 className="text-lg font-medium mb-6 text-slate-300">Model Configuration</h3>

                            <div className="space-y-8">
                                {/* Layers */}
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-slate-400">Transformer Layers (Depth)</label>
                                        <span className="text-orange-400 font-mono">{config.n_layer}</span>
                                    </div>
                                    <input
                                        type="range" min="1" max="12" step="1"
                                        value={config.n_layer}
                                        onChange={(e) => setConfig({ ...config, n_layer: parseInt(e.target.value) })}
                                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                    />
                                </div>

                                {/* Heads */}
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-slate-400">Attention Heads</label>
                                        <span className="text-orange-400 font-mono">{config.n_head}</span>
                                    </div>
                                    <input
                                        type="range" min="1" max="12" step="1"
                                        value={config.n_head}
                                        onChange={(e) => setConfig({ ...config, n_head: parseInt(e.target.value) })}
                                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                    />
                                </div>

                                {/* Embedding Dim */}
                                <div>
                                    <div className="flex justify-between mb-2">
                                        <label className="text-slate-400">Embedding Dimension (Width)</label>
                                        <span className="text-orange-400 font-mono">{config.n_embd}</span>
                                    </div>
                                    <input
                                        type="range" min="32" max="512" step="16"
                                        value={config.n_embd}
                                        onChange={(e) => setConfig({ ...config, n_embd: parseInt(e.target.value) })}
                                        className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-orange-500"
                                    />
                                </div>

                                <div className="p-4 bg-background rounded-lg border border-slate-800 mt-8">
                                    <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Estimated Params</h4>
                                    <p className="text-2xl font-mono text-foreground">
                                        {((12 * config.n_layer * Math.pow(config.n_embd, 2)) / 1000000).toFixed(2)} M
                                    </p>
                                </div>

                                <div className="mt-8 flex justify-end">
                                    <button onClick={() => setActiveTab('train')} className="px-6 py-2 bg-orange-600 hover:bg-orange-500 text-foreground rounded-lg font-medium transition-colors">
                                        Go to Terminal &rarr;
                                    </button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* TRAINING TAB */}
                    {activeTab === 'train' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full flex flex-col gap-6">

                            {/* Graph Area */}
                            <div className="h-64 bg-background/50 rounded-lg border border-slate-800 p-4 relative overflow-hidden flex items-end gap-1">
                                {lossHistory.length > 0 ? (
                                    lossHistory.map((pt, i) => (
                                        <div
                                            key={i}
                                            className="bg-orange-500/50 w-full hover:bg-orange-400 transition-colors"
                                            style={{ height: `${Math.min(100, Math.max(5, pt.loss * 10))}%` }}
                                            title={`Step ${pt.step}: Loss ${pt.loss.toFixed(4)}`}
                                        />
                                    ))
                                ) : (
                                    <div className="absolute inset-0 flex items-center justify-center text-slate-500">
                                        Waiting to start...
                                    </div>
                                )}
                                {/* Grid lines */}
                                <div className="absolute inset-0 pointer-events-none border-t border-slate-800/30" style={{ top: '25%' }} />
                                <div className="absolute inset-0 pointer-events-none border-t border-slate-800/30" style={{ top: '50%' }} />
                                <div className="absolute inset-0 pointer-events-none border-t border-slate-800/30" style={{ top: '75%' }} />
                            </div>

                            {/* Controls & Logs */}
                            <div className="flex-1 flex gap-6 min-h-0">
                                {/* Logs */}
                                <div className="flex-1 bg-background rounded-lg p-4 font-mono text-xs text-success overflow-y-auto" ref={scrollRef}>
                                    {logs.map((log, i) => (
                                        <div key={i} className="mb-1 opacity-80 border-b border-green-900/30 pb-1">
                                            {log}
                                        </div>
                                    ))}
                                    {logs.length === 0 && <span className="text-slate-600">// System ready. Waiting for command...</span>}
                                </div>

                                {/* Control Panel */}
                                <div className="w-48 flex flex-col gap-3">
                                    {!isTraining ? (
                                        <button onClick={startTraining} className="flex items-center justify-center space-x-2 py-4 bg-green-600 hover:bg-green-500 text-foreground rounded-lg font-bold transition-all shadow-lg shadow-green-900/20">
                                            <Play size={20} />
                                            <span>START RUN</span>
                                        </button>
                                    ) : (
                                        <button onClick={stopTraining} className="flex items-center justify-center space-x-2 py-4 bg-red-600 hover:bg-red-500 text-foreground rounded-lg font-bold transition-all shadow-lg">
                                            <Square size={20} />
                                            <span>ABORT</span>
                                        </button>
                                    )}

                                    {/* Save Checkpoint */}
                                    <div className="mt-4 pt-4 border-t border-slate-800 flex flex-col gap-2">
                                        <label className="text-xs text-slate-400 font-bold uppercase">Save Checkpoint</label>
                                        <div className="flex gap-1">
                                            <input
                                                className="w-full bg-background border border-slate-700 rounded px-2 py-1 text-xs"
                                                placeholder="Model Name"
                                                value={saveName}
                                                onChange={(e) => setSaveName(e.target.value)}
                                            />
                                            <button onClick={saveModel} className="bg-blue-600 hover:bg-blue-500 text-foreground p-1 rounded">
                                                <Save size={16} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="mt-auto">
                                        <button onClick={() => setActiveTab('play')} className="w-full py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded mb-2 text-sm">
                                            Open Playground
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* MODELS TAB */}
                    {activeTab === 'models' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full flex flex-col pt-10 px-20">
                            <h3 className="text-xl font-medium mb-6 text-center text-slate-300">Saved Models</h3>

                            <div className="bg-background border border-slate-800 rounded-xl overflow-hidden">
                                {models.length === 0 ? (
                                    <div className="p-8 text-center text-slate-500 italic">No saved models found. Train one first!</div>
                                ) : (
                                    <table className="w-full text-left text-sm text-slate-400">
                                        <thead className="bg-slate-950 text-slate-200">
                                            <tr>
                                                <th className="p-4">Name</th>
                                                <th className="p-4">Size (MB)</th>
                                                <th className="p-4 text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {models.map((m, i) => (
                                                <tr key={i} className="border-t border-slate-800 hover:bg-slate-800/50 transition-colors">
                                                    <td className="p-4 font-mono text-foreground flex items-center gap-2">
                                                        <FolderOpen size={16} className="text-orange-500" />
                                                        {m.name}
                                                    </td>
                                                    <td className="p-4">{(m.size / 1024 / 1024).toFixed(2)} MB</td>
                                                    <td className="p-4 text-right">
                                                        <button
                                                            onClick={() => loadModel(m.name)}
                                                            className="px-3 py-1 bg-green-600/20 text-success hover:bg-green-600 hover:text-foreground rounded border border-green-600/50 transition-colors text-xs font-bold"
                                                        >
                                                            LOAD
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </motion.div>
                    )}

                    {/* PLAYGROUND TAB */}
                    {activeTab === 'play' && (
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="h-full flex flex-col max-w-3xl mx-auto pt-4 pb-4">

                            {/* Chat Window */}
                            <div className="flex-1 bg-background/50 border border-slate-800 rounded-xl mb-4 overflow-y-auto p-4 flex flex-col gap-4">
                                {chatHistory.length === 0 && (
                                    <div className="flex flex-col items-center justify-center h-full text-slate-600 opacity-50">
                                        <Bot size={48} className="mb-4" />
                                        <p>Send a message to start chatting.</p>
                                    </div>
                                )}

                                {chatHistory.map((msg, i) => (
                                    <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                        <div className={`max-w-[80%] rounded-2xl px-4 py-3 flex gap-3 ${msg.role === 'user'
                                            ? 'bg-blue-600 text-foreground rounded-br-none'
                                            : 'bg-slate-800 text-slate-200 rounded-bl-none'
                                            }`}>
                                            <div className="mt-1 opacity-70">
                                                {msg.role === 'user' ? <User size={16} /> : <Bot size={16} />}
                                            </div>
                                            <div className="whitespace-pre-wrap text-sm leading-relaxed">{msg.content}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Input Area */}
                            <div className="flex gap-2 bg-background p-2 rounded-xl border border-slate-700 focus-within:border-blue-500 transition-colors">
                                <input
                                    className="flex-1 bg-transparent border-none outline-none px-4 text-foreground"
                                    placeholder="Message your AI..."
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleChatSubmit()}
                                />
                                <button
                                    onClick={handleChatSubmit}
                                    disabled={!chatInput.trim() || isTraining}
                                    className="p-3 bg-blue-600 hover:bg-blue-500 rounded-lg text-foreground disabled:opacity-50 disabled:grayscale transition-all"
                                >
                                    <Send size={18} />
                                </button>
                            </div>
                        </motion.div>
                    )}

                </AnimatePresence>
            </div>
        </div>
    );
}
