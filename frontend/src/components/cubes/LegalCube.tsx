import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Scale, FileText, AlertTriangle, CheckCircle, Shield, Upload, ChevronDown, Check } from 'lucide-react';
import { api } from '../../lib/api';

interface RedFlag {
    title: string;
    explanation: string;
    severity: "High" | "Medium" | "Low";
}

interface LegalResult {
    summary: string;
    risk_score: number;
    red_flags: RedFlag[];
    missing_clauses: string[];
    key_dates: string[];
    verdict: string;
}

export default function LegalCube() {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<LegalResult | null>(null);
    const [dragging, setDragging] = useState(false);

    // File upload handler
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            processFile(e.target.files[0]);
        }
    };

    const processFile = (file: File) => {
        if (file.type !== 'application/pdf') {
            alert("Please upload a PDF file.");
            return;
        }
        setFile(file);
    };

    const analyzeContract = async () => {
        if (!file) return;
        setLoading(true);
        setResult(null);

        try {
            // Convert to Base64
            const base64 = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => resolve(e.target?.result as string);
                reader.readAsDataURL(file);
            });

            const response = await api.post('/cubes/run', {
                cube_id: 'legal',
                input: { pdf_base64: base64 }
            });

            const data = response.data;
            if (data.status === 'success') {
                setResult(data.data);
            } else {
                alert("Analysis failed: " + data.message);
            }

        } catch (e) {
            console.error(e);
            alert("Connection error.");
        } finally {
            setLoading(false);
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return "text-success";
        if (score >= 50) return "text-yellow-500";
        return "text-red-500";
    };

    const getSeverityColor = (severity: string) => {
        switch (severity) {
            case "High": return "bg-red-500/20 text-red-400 border-red-500/30";
            case "Medium": return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
            default: return "bg-blue-500/20 text-blue-400 border-blue-500/30";
        }
    };

    return (
        <div className="h-full w-full bg-[#0a0f1e] text-foreground p-8 overflow-y-auto font-sans">
            {/* Disclaimer Banner */}
            <div className="max-w-5xl mx-auto mb-6 bg-blue-900/20 border border-blue-500/20 rounded-lg p-3 flex items-start gap-3">
                <Shield className="text-blue-400 shrink-0 mt-0.5" size={18} />
                <p className="text-xs text-blue-200/80 leading-relaxed">
                    <strong>AI LEGAL DISCLAIMER:</strong> This tool uses Artificial Intelligence to analyze documents.
                    It is NOT a lawyer and does NOT provide legal advice. Use these insights for informational purposes only
                    and always consult a qualified attorney for professional advice.
                </p>
            </div>

            {/* Header */}
            <div className="max-w-5xl mx-auto text-center mb-10">
                <div className="inline-flex items-center justify-center p-4 bg-gradient-to-br from-blue-900 to-indigo-900 rounded-2xl mb-4 shadow-2xl shadow-blue-900/20">
                    <Scale size={42} className="text-foreground" />
                </div>
                <h1 className="text-3xl font-bold mb-2">Legal Cube</h1>
                <p className="text-muted-foreground">AI Contract Risk Assessment & Simplification</p>
            </div>

            {/* Upload Area */}
            {!result && !loading && (
                <div
                    className={`max-w-2xl mx-auto border-2 border-dashed rounded-3xl p-12 text-center transition-all cursor-pointer ${dragging ? 'border-blue-500 bg-blue-500/10' : 'border-border hover:border-border hover:bg-muted/50'}`}
                    onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
                    onDragLeave={() => setDragging(false)}
                    onDrop={(e) => {
                        e.preventDefault();
                        setDragging(false);
                        if (e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
                    }}
                >
                    <input type="file" id="pdf-upload" accept=".pdf" className="hidden" onChange={handleFileChange} />

                    {!file ? (
                        <label htmlFor="pdf-upload" className="cursor-pointer flex flex-col items-center">
                            <Upload className="w-16 h-16 text-foreground/20 mb-6" />
                            <p className="text-xl font-semibold mb-2">Drop your Contract PDF here</p>
                            <p className="text-muted-foreground mb-6">or click to browse</p>
                            <span className="bg-card text-foreground px-6 py-2 rounded-full font-medium hover:bg-blue-50 transition-colors">Select File</span>
                        </label>
                    ) : (
                        <div className="flex flex-col items-center">
                            <FileText className="w-16 h-16 text-blue-400 mb-4" />
                            <p className="text-xl font-medium mb-6">{file.name}</p>
                            <div className="flex gap-4">
                                <button onClick={() => setFile(null)} className="px-6 py-2 rounded-full border border-border hover:bg-muted">Change</button>
                                <button onClick={analyzeContract} className="px-8 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-lg shadow-blue-600/20">Analyze Risks</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Loading State */}
            {loading && (
                <div className="max-w-2xl mx-auto text-center py-20">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-8"
                    />
                    <h3 className="text-2xl font-bold mb-2">Reviewing Logic...</h3>
                    <p className="text-muted-foreground">Scanning for risks and hidden clauses</p>
                </div>
            )}

            {/* Results Dashboard */}
            {result && (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="max-w-5xl mx-auto space-y-6"
                >
                    {/* Score & Verdict */}
                    <div className="grid md:grid-cols-3 gap-6">
                        <div className="md:col-span-1 bg-[#111827] rounded-3xl p-8 border border-border flex flex-col items-center justify-center text-center relative overflow-hidden">
                            <div className="absolute inset-0 bg-gradient-to-b from-blue-500/5 to-transparent" />
                            <p className="text-muted-foreground text-xs font-mono mb-4 uppercase tracking-wider">Safety Score</p>
                            <div className={`text-6xl font-bold mb-2 ${getScoreColor(result.risk_score)}`}>
                                {result.risk_score}
                            </div>
                            <div className="w-full bg-muted h-2 rounded-full max-w-[150px] mb-4 overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${result.risk_score}%` }}
                                    transition={{ duration: 1, delay: 0.5 }}
                                    className={`h-full ${result.risk_score >= 80 ? 'bg-green-500' : result.risk_score >= 50 ? 'bg-yellow-500' : 'bg-red-500'}`}
                                />
                            </div>
                            <p className="text-sm font-medium opacity-80">{result.risk_score >= 80 ? "Low Risk Contract" : result.risk_score >= 50 ? "Moderate Risk" : "High Risk Detected"}</p>
                        </div>

                        <div className="md:col-span-2 bg-[#111827] rounded-3xl p-8 border border-border relative">
                            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                                <FileText className="text-blue-400" size={20} />
                                Executive Summary
                            </h3>
                            <p className="text-foreground/70 leading-relaxed text-lg mb-6">{result.summary}</p>

                            <div className="bg-muted/50 rounded-xl p-4 border-l-4 border-blue-500">
                                <p className="text-sm font-mono text-blue-300 mb-1">LAWYER'S VERDICT</p>
                                <p className="font-medium">"{result.verdict}"</p>
                            </div>
                        </div>
                    </div>

                    {/* Red Flags Section */}
                    <div className="bg-[#111827] rounded-3xl p-8 border border-border">
                        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                            <AlertTriangle className="text-red-400" size={20} />
                            Risk Analysis
                        </h3>

                        <div className="space-y-4">
                            {result.red_flags.length === 0 ? (
                                <div className="text-center py-10 bg-muted/50 rounded-xl">
                                    <CheckCircle className="w-12 h-12 text-success mx-auto mb-3" />
                                    <p className="text-lg">No critical red flags detected.</p>
                                </div>
                            ) : (
                                result.red_flags.map((flag, i) => (
                                    <motion.div
                                        key={i}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: i * 0.1 }}
                                        className="bg-muted/50 rounded-xl p-5 border border-border hover:bg-muted transition-colors"
                                    >
                                        <div className="flex justify-between items-start mb-2">
                                            <h4 className="font-bold text-lg">{flag.title}</h4>
                                            <span className={`px-3 py-1 rounded-full text-xs font-bold border ${getSeverityColor(flag.severity)}`}>
                                                {flag.severity.toUpperCase()} RISK
                                            </span>
                                        </div>
                                        <p className="text-muted-foreground leading-relaxed">{flag.explanation}</p>
                                    </motion.div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="bg-[#111827] rounded-3xl p-6 border border-border">
                            <h4 className="text-sm font-bold text-foreground/50 uppercase mb-4 tracking-wider">Missing Clauses</h4>
                            {result.missing_clauses.length > 0 ? (
                                <ul className="space-y-2">
                                    {result.missing_clauses.map((clause, i) => (
                                        <li key={i} className="flex items-center gap-2 text-foreground/80">
                                            <div className="w-1.5 h-1.5 bg-red-400 rounded-full" />
                                            {clause}
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-muted-foreground text-sm">Standard clauses appear to be present.</p>
                            )}
                        </div>

                        <div className="bg-[#111827] rounded-3xl p-6 border border-border">
                            <h4 className="text-sm font-bold text-foreground/50 uppercase mb-4 tracking-wider">Key Dates & Terms</h4>
                            <ul className="space-y-2">
                                {result.key_dates.map((date, i) => (
                                    <li key={i} className="flex items-center gap-2 text-foreground/80">
                                        <Check size={14} className="text-blue-400" />
                                        {date}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>

                    {/* Re-analyze Button */}
                    <div className="text-center pt-8">
                        <button
                            onClick={() => { setFile(null); setResult(null); }}
                            className="text-muted-foreground hover:text-foreground transition-colors text-sm hover:underline"
                        >
                            Analyze another document
                        </button>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
