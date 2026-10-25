import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { DollarSign, Upload, AlertTriangle, FileText, CheckCircle, Search, PieChart, ArrowRight, Database } from 'lucide-react';
import { api } from '../../lib/api';

interface Discrepancy {
    type: string;
    severity: 'HIGH' | 'CRITICAL';
    details: string;
    source: string;
}

interface GhostVendor {
    vendor: string;
    reason: string;
    severity: 'CRITICAL';
}

interface AuditResult {
    audit_score: number;
    matched_count: number;
    discrepancies: Discrepancy[];
    red_flags: GhostVendor[];
}

interface LiveEvent {
    status: string;
    timestamp: string;
    message: string;
}

export default function LedgerCube() {
    const [invoices, setInvoices] = useState("INV-001 | $5,000.00 | Acme Corp\nINV-002 | $1,250.50 | Shell Corp LLC\nINV-003 | $3,000.00 | Globex Inc");
    const [bankFeed, setBankFeed] = useState("2024-01-15 | DEBIT | $5,000.00 | ACH ACME CORP\n2024-01-16 | DEBIT | $3,000.00 | WIRE GLOBEX");
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState<AuditResult | null>(null);

    const [liveMode, setLiveMode] = useState(false);
    const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);

    // Live Audit Loop
    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
        if (liveMode) {
            interval = setInterval(async () => {
                try {
                    const res = await api.post('/cubes/run', {
                        cube_id: 'ledger',
                        input: { simulation_mode: true }
                    });
                    const data = res.data;
                    if (data.status === 'success') {
                        setLiveEvents(prev => [...data.data.events, ...prev].slice(0, 100)); // Keep last 100
                    }
                } catch (e) { console.error(e); }
            }, 1500);
        }
        return () => clearInterval(interval);
    }, [liveMode]);

    const handleDownload = async () => {
        try {
            const res = await api.post('/cubes/run', {
                cube_id: 'ledger',
                input: { action: 'generate_report' } // Will work stateless now
            });
            const data = res.data;
            if (data.status === 'success') {
                const blob = new Blob([data.content], { type: data.mime });
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = data.filename;
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
            }
        } catch (e) { console.error(e); }
    };

    const runAudit = async () => {
        setAnalyzing(true);
        try {
            const res = await api.post('/cubes/run', {
                cube_id: 'ledger',
                input: { invoices: invoices, bank_feed: bankFeed }
            });
            const data = res.data;
            if (data.status === 'success') {
                // Slight delay for effect
                setTimeout(() => {
                    setResult(data.data);
                    setAnalyzing(false);
                }, 1000);
            }
        } catch (e) {
            console.error(e);
            setAnalyzing(false);
        }
    };

    return (
        <div className="h-full w-full bg-surface text-foreground font-sans flex flex-col overflow-hidden">
            {/* Header */}
            <header className="h-16 border-b border-border bg-card flex items-center justify-between px-8 shadow-sm z-10 shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-emerald-600 p-2 rounded text-white">
                        <DollarSign size={20} />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight text-foreground">THE AUDITOR</h1>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">Autonomous Forensic Accounting</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    {/* Live Mode Toggle */}
                    <button
                        onClick={() => {
                            setLiveMode(!liveMode);
                            if (!liveMode) { setResult(null); } // Clear manual result if switching to live
                        }}
                        className={`flex items-center gap-2 px-4 py-1.5 rounded-full font-bold text-xs transition-all ${liveMode ? 'bg-red-100 text-red-600 border border-red-200 animate-pulse' : 'bg-surface text-muted-foreground border border-border hover:bg-muted'}`}
                    >
                        <div className={`w-2 h-2 rounded-full ${liveMode ? 'bg-red-500' : 'bg-muted-foreground/60'}`} />
                        {liveMode ? 'STOP LIVE FEED' : 'ENABLE LIVE FEED'}
                    </button>

                    {!liveMode && !result && (
                        <button
                            onClick={runAudit}
                            disabled={analyzing}
                            className={`flex items-center gap-2 px-6 py-2 rounded-full font-bold text-sm shadow-lg transition-all ${analyzing ? 'bg-muted-foreground/60 text-muted-foreground cursor-not-allowed' : 'bg-emerald-600 text-white hover:bg-emerald-700 hover:scale-105'}`}
                        >
                            {analyzing ? (
                                <>
                                    <Search className="animate-spin" size={16} /> Scanning...
                                </>
                            ) : (
                                <>
                                    <PieChart size={16} /> Run Full Audit
                                </>
                            )}
                        </button>
                    )}
                    {result && !liveMode && (
                        <div className="flex items-center gap-3">
                            <button onClick={handleDownload} className="flex items-center gap-2 px-4 py-1.5 border border-border rounded-full font-bold text-xs text-muted-foreground hover:bg-surface transition-colors">
                                <FileText size={14} /> Download Report
                            </button>
                            <button onClick={() => setResult(null)} className="text-muted-foreground hover:text-foreground text-sm font-medium underline">
                                Reset Audit
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 flex overflow-hidden relative">

                {/* LIVE FEED OVERLAY */}
                {liveMode && (
                    <div className="absolute inset-0 z-20 bg-background text-foreground flex flex-col p-8 font-mono">
                        <div className="flex items-center justify-between mb-6 border-b border-border pb-4">
                            <h2 className="text-xl text-emerald-400 font-bold flex items-center gap-2">
                                <Search className="animate-pulse" /> LIVE TRANSACTION STREAM
                            </h2>
                            <div className="text-xs text-muted-foreground">
                                Processing real-time ledger updates...
                            </div>
                        </div>
                        <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                            {liveEvents.map((ev, i) => (
                                <div key={i} className={`p-3 rounded border-l-4 text-sm flex items-start gap-4 ${ev.status === 'FRAUD_DETECTED' ? 'bg-red-900/20 border-red-500 text-red-200' : ev.status === 'DISCREPANCY' ? 'bg-orange-900/20 border-orange-500 text-orange-200' : 'bg-emerald-900/10 border-emerald-500/50 text-emerald-100/70'}`}>
                                    <span className="text-muted-foreground shrink-0">{ev.timestamp}</span>
                                    <span className="font-bold shrink-0 w-32">{ev.status}</span>
                                    <span>{ev.message}</span>
                                </div>
                            ))}
                            {liveEvents.length === 0 && <div className="text-muted-foreground italic">Waiting for transaction stream...</div>}
                        </div>
                    </div>
                )}

                {/* LEFT: Data Input (Hidden if Live) */}
                <div className={`flex-1 flex flex-col border-r border-border bg-surface transition-all duration-500 ${result ? 'w-1/3 max-w-sm opacity-50 pointer-events-none blur-[1px]' : 'w-1/2'} ${liveMode ? 'hidden' : ''}`}>
                    <div className="flex-1 p-6 flex flex-col gap-6 overflow-y-auto">

                        {/* Input 1: Invoices */}
                        <div className="bg-card border border-border rounded-xl shadow-sm p-4 flex-1 flex flex-col">
                            <div className="flex items-center gap-2 mb-3 text-muted-foreground font-bold text-sm uppercase">
                                <FileText size={16} className="text-blue-500" /> Accounts Payable (Invoices)
                            </div>
                            <textarea
                                value={invoices}
                                onChange={(e) => setInvoices(e.target.value)}
                                className="flex-1 w-full bg-surface border border-border rounded-lg p-3 text-xs font-mono text-muted-foreground focus:outline-none focus:border-blue-500 resize-none"
                                placeholder="Paste invoice data here (Format: ID | $$ | Vendor)"
                            />
                        </div>

                        {/* Input 2: Bank Feed */}
                        <div className="bg-card border border-border rounded-xl shadow-sm p-4 flex-1 flex flex-col">
                            <div className="flex items-center gap-2 mb-3 text-muted-foreground font-bold text-sm uppercase">
                                <Database size={16} className="text-purple-500" /> Bank Transactions (CSV)
                            </div>
                            <textarea
                                value={bankFeed}
                                onChange={(e) => setBankFeed(e.target.value)}
                                className="flex-1 w-full bg-surface border border-border rounded-lg p-3 text-xs font-mono text-muted-foreground focus:outline-none focus:border-purple-500 resize-none"
                                placeholder="Paste bank feed here (Format: Date | Type | $$ | Desc)"
                            />
                        </div>

                    </div>
                </div>

                {/* RIGHT: Analysis Results */}
                <div className="flex-1 bg-card relative overflow-hidden flex flex-col">

                    {!result && !analyzing && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-foreground">
                            <Upload size={64} className="mb-4 opacity-50" />
                            <p className="font-medium">Ready for Data</p>
                            <p className="text-xs max-w-xs text-center mt-2">Paste financial records on the left or click "Enable Live Feed" for real-time monitoring.</p>
                        </div>
                    )}

                    {analyzing && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-card z-20">
                            <div className="w-16 h-16 border-4 border-emerald-100 border-t-emerald-600 rounded-full animate-spin mb-4" />
                            <p className="text-emerald-800 font-bold animate-pulse">Cross-referencing Transactions...</p>
                            <p className="text-xs text-emerald-600/70 mt-1">Analyzing Vendors • Checking Sums • Finding Ghosts</p>
                        </div>
                    )}

                    {result && (
                        <div className="flex-1 overflow-y-auto p-8 animate-in slide-in-from-right-10 duration-500">

                            {/* Score Card */}
                            <div className="flex items-center gap-8 mb-10">
                                <div className="relative w-32 h-32 flex items-center justify-center">
                                    <svg className="w-full h-full transform -rotate-90">
                                        <circle cx="64" cy="64" r="60" stroke="#f1f5f9" strokeWidth="8" fill="transparent" />
                                        <circle cx="64" cy="64" r="60" stroke={result.audit_score > 80 ? '#10b981' : result.audit_score > 50 ? '#f59e0b' : '#ef4444'} strokeWidth="8" fill="transparent" strokeDasharray={377} strokeDashoffset={377 - (377 * result.audit_score / 100)} className="transition-all duration-1000 ease-out" />
                                    </svg>
                                    <div className="absolute text-center">
                                        <span className="text-3xl font-bold text-foreground">{result.audit_score}</span>
                                        <span className="block text-[10px] text-muted-foreground uppercase font-bold">Health Score</span>
                                    </div>
                                </div>
                                <div>
                                    <h2 className="text-2xl font-bold text-foreground mb-1">Audit Completed</h2>
                                    <p className="text-muted-foreground text-sm mb-4">
                                        Found <span className="font-bold text-foreground">{result.discrepancies.length} Discrepancies</span> and <span className="font-bold text-red-600">{result.red_flags.length} Red Flags</span>.
                                    </p>
                                    <div className="flex gap-2">
                                        <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded text-xs font-bold border border-emerald-100 flex items-center gap-1">
                                            <CheckCircle size={12} /> {result.matched_count} Reconciled
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Red Flags (Fraud) */}
                            {result.red_flags.length > 0 && (
                                <div className="mb-8">
                                    <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b border-border pb-2">Top Risks (Fraud Detection)</h3>
                                    <div className="space-y-3">
                                        {result.red_flags.map((flag, i) => (
                                            <div key={i} className="bg-red-50 border-l-4 border-red-500 p-4 rounded-r-lg">
                                                <div className="flex justify-between items-start mb-1">
                                                    <h4 className="font-bold text-red-900 flex items-center gap-2"><AlertTriangle size={16} /> {flag.vendor}</h4>
                                                    <span className="bg-red-200 text-red-800 text-[10px] font-bold px-2 py-0.5 rounded">{flag.severity}</span>
                                                </div>
                                                <p className="text-sm text-red-700">{flag.reason}</p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Discrepancies */}
                            <div>
                                <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-4 border-b border-border pb-2">Reconciliation Errors</h3>
                                <div className="space-y-3">
                                    {result.discrepancies.map((disc, i) => (
                                        <div key={i} className="bg-orange-50 border border-orange-100 p-4 rounded-lg flex items-start gap-4">
                                            <div className="mt-1 bg-orange-200 p-1 rounded text-orange-700">
                                                <AlertTriangle size={14} />
                                            </div>
                                            <div>
                                                <h4 className="font-bold text-foreground text-sm mb-1">{disc.type}</h4>
                                                <p className="text-sm text-muted-foreground mb-2">{disc.details}</p>
                                                <div className="bg-muted/500 p-2 rounded text-xs font-mono text-muted-foreground border border-orange-100/50">
                                                    Missing in Bank Feed: "{disc.source}"
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                    {result.discrepancies.length === 0 && (
                                        <div className="text-center py-8 text-muted-foreground italic">
                                            No discrepancies found. All invoices match bank records.
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
