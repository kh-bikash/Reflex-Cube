import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Terminal, Code, ArrowRight, Zap, RefreshCw, Copy, Check, Server, ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';

export default function LegacyCube() {
    const [sourceCode, setSourceCode] = useState('');
    const [targetLang, setTargetLang] = useState('Python 3.12');
    const [modernCode, setModernCode] = useState('');
    const [explanation, setExplanation] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [copied, setCopied] = useState(false);

    const languages = ["Python 3.12", "Rust", "Go", "TypeScript", "Modern Java", "Node.js"];

    const handleModernize = async () => {
        if (!sourceCode.trim()) return;

        setAnalyzing(true);
        setModernCode('');
        setExplanation('');

        try {
            const res = await api.post('/cubes/run', {
                cube_id: 'legacy',
                input: {
                    source_code: sourceCode,
                    target_lang: targetLang
                }
            });
            const data = res.data;

            if (data.status === 'success') {
                setModernCode(data.data.modern_code);
                setExplanation(data.data.explanation);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setAnalyzing(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(modernCode);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="h-full w-full bg-background text-foreground font-mono flex flex-col overflow-hidden">
            {/* Header */}
            <header className="h-16 border-b border-border bg-background flex items-center justify-between px-6 shrink-0 z-10">
                <div className="flex items-center gap-3">
                    <div className="bg-amber-600/20 p-2 rounded text-amber-500 border border-amber-500/30">
                        <Terminal size={20} />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight text-foreground">THE MODERNIZER</h1>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Legacy Code Refactoring Engine</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex items-center bg-card rounded-lg p-1 text-xs">
                        <span className="px-3 py-1.5 text-muted-foreground">Target Language:</span>
                        <select
                            value={targetLang}
                            onChange={(e) => setTargetLang(e.target.value)}
                            className="bg-muted text-foreground px-2 py-1.5 rounded font-bold focus:outline-none"
                        >
                            {languages.map(lang => <option key={lang} value={lang}>{lang}</option>)}
                        </select>
                    </div>

                    <button
                        onClick={handleModernize}
                        disabled={analyzing || !sourceCode}
                        className={`flex items-center gap-2 px-6 py-2 rounded-lg font-bold text-sm shadow-lg transition-all ${analyzing ? 'bg-card text-muted-foreground cursor-not-allowed' : 'bg-amber-600 text-white hover:bg-amber-500 hover:shadow-amber-500/20'}`}
                    >
                        {analyzing ? (
                            <>
                                <RefreshCw className="animate-spin" size={16} /> REFACTORING...
                            </>
                        ) : (
                            <>
                                <Zap size={16} fill="currentColor" /> MODERNIZE CODE
                            </>
                        )}
                    </button>
                </div>
            </header>

            {/* Split Screen Editor */}
            <div className="flex-1 flex overflow-hidden">

                {/* LEFT: Legacy Input */}
                <div className="flex-1 flex flex-col border-r border-border bg-background/50">
                    <div className="px-4 py-2 bg-background border-b border-border flex justify-between items-center">
                        <span className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                            <Server size={14} /> Legacy Source
                        </span>
                        <span className="text-[10px] text-muted-foreground">PASTE CODE BELOW</span>
                    </div>
                    <textarea
                        value={sourceCode}
                        onChange={(e) => setSourceCode(e.target.value)}
                        className="flex-1 bg-transparent p-6 text-sm font-mono text-success focus:outline-none resize-none placeholder:text-muted-foreground leading-relaxed"
                        placeholder="// Paste your legacy code here...
// COBOL, Fortran, Java 6, Python 2...
// We will modernize it."
                        spellCheck={false}
                    />
                </div>

                {/* CENTRE: Action Arrow (Mobile hidden, Desktop visible overlay) */}
                <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none hidden md:block opacity-20">
                    <ArrowRight size={120} className="text-muted-foreground" />
                </div>

                {/* RIGHT: Modern Output */}
                <div className="flex-1 flex flex-col bg-background">
                    <div className="px-4 py-2 bg-background border-b border-border flex justify-between items-center">
                        <span className="text-xs font-bold text-amber-500 uppercase flex items-center gap-2">
                            <ShieldCheck size={14} /> Modernized Output
                        </span>
                        {modernCode && (
                            <button
                                onClick={copyToClipboard}
                                className="flex items-center gap-1.5 text-[10px] font-bold text-muted-foreground hover:text-foreground transition-colors"
                            >
                                {copied ? <Check size={12} className="text-success" /> : <Copy size={12} />}
                                {copied ? 'COPIED' : 'COPY'}
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-6">
                        {!modernCode ? (
                            <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                                <Code size={48} className="mb-4 opacity-50" />
                                <p className="text-sm">Waiting for input...</p>
                            </div>
                        ) : (
                            <div className="space-y-6">
                                {/* Explanation Card */}
                                {explanation && (
                                    <motion.div
                                        initial={{ opacity: 0, y: -10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        className="bg-background rounded-lg p-4 border border-border"
                                    >
                                        <h3 className="text-xs font-bold text-foreground mb-2 uppercase tracking-wider">Refactoring Notes</h3>
                                        <p className="text-sm text-muted-foreground leading-relaxed">{explanation}</p>
                                    </motion.div>
                                )}

                                {/* Code Block */}
                                <motion.pre
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    transition={{ delay: 0.2 }}
                                    className="font-mono text-sm text-blue-300 leading-relaxed whitespace-pre-wrap theme-vscode"
                                >
                                    {modernCode}
                                </motion.pre>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
