import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Upload, FileText, CheckCircle2, AlertTriangle,
    Download, RefreshCw, Briefcase, Star, Search
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { api } from '@/lib/api';

interface CareerResponse {
    status: string;
    data: {
        score: number;
        critique: {
            red_flags: string[];
            green_flags: string[];
        };
        missing_keywords: string[];
        rewritten_markdown: string;
        cover_letter: string;
    };
    message?: string;
}

export default function CareerCube() {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<CareerResponse['data'] | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<'resume' | 'cover'>('resume');

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setError(null);
            setResult(null);
        }
    };

    const handleOptimize = async () => {
        if (!file) return;

        setLoading(true);
        setError(null);

        try {
            // Convert to Base64
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = async () => {
                const base64 = reader.result as string;

                try {
                    const res = await api.post('/cubes/run', {
                        cube_id: 'career',
                        input: { pdf_base64: base64 }
                    });

                    if (res.data.status === 'success') {
                        setResult(res.data.data);
                    } else {
                        setError(res.data.message || "Analysis failed.");
                    }
                } catch (err) {
                    setError("Failed to connect to the Career Cube brain.");
                    console.error(err);
                } finally {
                    setLoading(false);
                }
            };
        } catch (err) {
            setError("Error processing file.");
            setLoading(false);
        }
    };

    const handlePrint = () => {
        const printContent = document.getElementById('printable-resume');
        if (printContent) {
            const win = window.open('', '', 'width=900,height=1200');
            if (win) {
                win.document.write(`
                    <html>
                        <head>
                            <title>Optimized Resume</title>
                            <style>
                                body { font-family: sans-serif; padding: 40px; line-height: 1.5; color: #333; }
                                h1, h2, h3 { color: #111; border-bottom: 2px solid #eee; padding-bottom: 10px; margin-top: 20px; }
                                ul { padding-left: 20px; }
                                li { margin-bottom: 8px; }
                                p { margin-bottom: 12px; }
                            </style>
                        </head>
                        <body>
                            ${document.getElementById('markdown-source')?.innerHTML || ''}
                        </body>
                    </html>
                `);
                win.document.close();
                win.focus();
                win.print();
                win.close();
            }
        }
    };

    return (
        <div className="h-full flex flex-col p-6 relative overflow-hidden">
            {/* Header */}
            <div className="flex justify-between items-start mb-8 z-10">
                <div>
                    <h2 className="text-4xl font-display font-bold text-foreground mb-2 tracking-tight">
                        <span className="text-blue-500">Career</span> Cube
                    </h2>
                    <p className="text-muted-foreground max-w-md">
                        Upload your PDF resume. I will rewrite it to pass ATS filters and impress recruiters.
                    </p>
                </div>
                {result && (
                    <div className="flex flex-col items-end">
                        <div className="text-6xl font-bold text-foreground mb-1">
                            {result.score}<span className="text-2xl text-muted-foreground">/100</span>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest ${result.score > 80 ? 'bg-green-500/20 text-success' :
                            result.score > 60 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'
                            }`}>
                            ATS Score
                        </div>
                    </div>
                )}
            </div>

            {/* Main Content Area */}
            <div className="flex-1 flex gap-6 min-h-0 z-10">

                {/* Left Panel: Input & Analysis */}
                <div className="w-1/3 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">

                    {/* Upload Zone */}
                    <div
                        onClick={() => fileInputRef.current?.click()}
                        className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center text-center cursor-pointer transition-all duration-300 group
                            ${file ? 'border-blue-500 bg-blue-500/5' : 'border-border hover:border-border hover:bg-muted/50'}
                        `}
                    >
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept=".pdf"
                            className="hidden"
                        />
                        {file ? (
                            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
                                <FileText className="w-12 h-12 text-blue-400 mb-3 mx-auto" />
                                <p className="text-foreground font-medium truncate max-w-[200px]">{file.name}</p>
                                <p className="text-muted-foreground text-xs mt-1">Click to change</p>
                            </motion.div>
                        ) : (
                            <>
                                <Upload className="w-12 h-12 text-foreground/20 group-hover:text-muted-foreground mb-3 transition-colors" />
                                <p className="text-muted-foreground font-medium">Drop PDF Resume</p>
                                <p className="text-muted-foreground text-xs mt-1">or click to browse</p>
                            </>
                        )}
                    </div>

                    {file && !loading && !result && (
                        <motion.button
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            onClick={handleOptimize}
                            className="w-full py-4 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-foreground rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 transition-all"
                        >
                            <Briefcase size={20} />
                            Optimize Resume
                        </motion.button>
                    )}

                    {error && (
                        <motion.div 
                            initial={{ opacity: 0, scale: 0.95 }} 
                            animate={{ opacity: 1, scale: 1 }}
                            className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm flex items-start gap-3 shadow-lg"
                        >
                            <AlertTriangle className="shrink-0 mt-0.5" size={16} />
                            <p className="font-medium">{error}</p>
                        </motion.div>
                    )}

                    {loading && (
                        <div className="text-center py-12">
                            <motion.div
                                animate={{ rotate: 360 }}
                                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                                className="inline-block"
                            >
                                <RefreshCw className="w-12 h-12 text-blue-500" />
                            </motion.div>
                            <h3 className="text-foreground font-bold mt-4 text-lg">Analyzing...</h3>
                            <p className="text-muted-foreground text-sm mt-2">Checking keywords, grammar, and impact.</p>
                        </div>
                    )}

                    {/* Analysis Results */}
                    {result && (
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex flex-col gap-4"
                        >
                            {/* Critique Cards */}
                            <div className="bg-muted/50 rounded-xl p-5 border border-border">
                                <h4 className="text-foreground font-bold mb-4 flex items-center gap-2">
                                    <AlertTriangle size={16} className="text-yellow-500" />
                                    Critique
                                </h4>

                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <p className="text-xs font-bold text-red-400 uppercase tracking-wider">Red Flags (Fixed)</p>
                                        {result.critique?.red_flags?.map((flag, i) => (
                                            <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                                <span className="text-red-500/50 mt-1">•</span>
                                                {flag}
                                            </div>
                                        )) || <p className="text-muted-foreground text-sm">None detected.</p>}
                                    </div>
                                    <div className="space-y-2">
                                        <p className="text-xs font-bold text-success uppercase tracking-wider">Green Flags</p>
                                        {result.critique?.green_flags?.map((flag, i) => (
                                            <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                                                <span className="text-success/50 mt-1">•</span>
                                                {flag}
                                            </div>
                                        )) || <p className="text-muted-foreground text-sm">None detected.</p>}
                                    </div>
                                </div>
                            </div>

                            <div className="bg-muted/50 rounded-xl p-5 border border-border">
                                <h4 className="text-foreground font-bold mb-4 flex items-center gap-2">
                                    <Search size={16} className="text-blue-500" />
                                    Missing Keywords
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                    {result.missing_keywords?.map((kw, i) => (
                                        <span key={i} className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-xs font-medium border border-blue-500/20">
                                            {kw}
                                        </span>
                                    )) || <p className="text-muted-foreground text-sm">No keywords missing.</p>}
                                </div>
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* Right Panel: Preview */}
                <div className="flex-1 bg-muted/50 rounded-2xl border border-border flex flex-col overflow-hidden relative">
                    {result ? (
                        <>
                            {/* Toolbar */}
                            <div className="h-14 border-b border-border flex items-center justify-between px-6 bg-muted/50 backdrop-blur-sm">
                                <div className="flex gap-1 bg-background/20 p-1 rounded-lg">
                                    <button
                                        onClick={() => setActiveTab('resume')}
                                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'resume' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-muted-foreground'}`}
                                    >
                                        Resume
                                    </button>
                                    <button
                                        onClick={() => setActiveTab('cover')}
                                        className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${activeTab === 'cover' ? 'bg-muted text-foreground shadow-sm' : 'text-muted-foreground hover:text-muted-foreground'}`}
                                    >
                                        Cover Letter
                                    </button>
                                </div>
                                <button
                                    onClick={handlePrint}
                                    className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-400 hover:text-blue-300 transition-colors"
                                >
                                    <Download size={16} />
                                    Save as PDF
                                </button>
                            </div>

                            {/* Content Viewer */}
                            <div className="flex-1 overflow-y-auto bg-card p-12 text-foreground shadow-inner custom-scrollbar relative">
                                <div className="max-w-[800px] mx-auto min-h-[1000px] bg-card">
                                    {/* Separate div for print logic */}
                                    <div id="markdown-source" className="hidden">
                                        <ReactMarkdown>
                                            {activeTab === 'resume' ? result.rewritten_markdown : result.cover_letter}
                                        </ReactMarkdown>
                                    </div>

                                    {/* Visible Viewer */}
                                    <div className="prose prose-sm max-w-none font-sans">
                                        <ReactMarkdown>
                                            {activeTab === 'resume' ? result.rewritten_markdown : result.cover_letter}
                                        </ReactMarkdown>
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-foreground/20">
                            <Briefcase className="w-24 h-24 mb-6 opacity-20" />
                            <p className="text-lg font-medium">Upload a resume to begin</p>
                            <p className="text-sm mt-2 opacity-60">I will optimize it for ATS systems</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
