import { useState } from 'react';
import { motion } from 'framer-motion';
import { X, TrendingUp, DollarSign, Activity, PieChart, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';

interface AlphaResult {
    ticker: string;
    sector: string;
    price: number;
    rating: 'BUY' | 'SELL' | 'HOLD';
    pe_ratio?: number;
    market_cap?: number;
    thesis: string;
    description: string;
}

export const AlphaCube = () => {
    const [ticker, setTicker] = useState('AAPL');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<AlphaResult | null>(null);

    const handleAnalyze = async () => {
        if (!ticker) return;
        setLoading(true);
        try {
            const response = await api.post<AlphaResult & { status?: string; message?: string }>('/cubes/run', {
                cube_id: 'alpha',
                input: { text: ticker }
            });
            if (response.data.status === 'error') {
                toast.error(response.data.message);
            } else {
                setResult(response.data);
                toast.success("Analysis complete!");
            }
        } catch (error) {
            toast.error("Failed to analyze stock.");
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full h-full flex items-center justify-center bg-background"
        >
            <div className="bg-background w-full h-full relative overflow-hidden flex flex-col md:flex-row">

                {/* Left Panel: Input */}
                <div className="w-full md:w-1/3 p-8 border-b md:border-b-0 md:border-r border-border flex flex-col bg-background/40">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl bg-green-500/20 flex items-center justify-center text-success">
                            <TrendingUp size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-foreground">Alpha Cube</h2>
                            <p className="text-muted-foreground text-sm">Autonomous Analyst</p>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Stock Ticker</label>
                            <input
                                type="text"
                                value={ticker}
                                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                                placeholder="E.g. TSLA"
                                className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-green-500/50 transition-colors font-mono text-xl"
                            />
                        </div>

                        <button
                            onClick={handleAnalyze}
                            disabled={loading}
                            className="w-full py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <>Analyzing...</>
                            ) : (
                                <>
                                    <Activity size={18} /> Run Analysis
                                </>
                            )}
                        </button>
                    </div>

                    <div className="mt-auto pt-8 border-t border-border text-xs text-foreground/30">
                        <p>Powered by yFinance & LLM.</p>
                        <p>Not financial advice.</p>
                    </div>
                </div>

                {/* Right Panel: Result */}
                <div className="w-full md:w-2/3 p-8 bg-background/20 overflow-y-auto custom-scrollbar relative">
                    {loading && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10">
                            <div className="w-16 h-16 border-4 border-green-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                            <p className="text-success font-mono animate-pulse">READING MARKET DATA...</p>
                        </div>
                    )}

                    {result ? (
                        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                            {/* Header Stats */}
                            <div className="flex justify-between items-end border-b border-border pb-6">
                                <div>
                                    <h1 className="text-5xl font-mono font-bold text-foreground tracking-tighter mb-1">{result.ticker}</h1>
                                    <p className="text-muted-foreground text-sm">{result.sector}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-3xl font-mono font-bold text-foreground">${result.price}</p>
                                    <div className={`inline-flex items-center gap-1 text-sm font-bold px-2 py-0.5 rounded ${result.rating === 'BUY' ? 'bg-green-500/20 text-success' : result.rating === 'SELL' ? 'bg-red-500/20 text-red-400' : 'bg-yellow-500/20 text-yellow-400'}`}>
                                        {result.rating}
                                    </div>
                                </div>
                            </div>

                            {/* Metrics Grid */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-4 rounded-xl bg-muted/50 border border-border">
                                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                                        <PieChart size={16} />
                                        <span className="text-xs uppercase font-bold tracking-wider">P/E Ratio</span>
                                    </div>
                                    <p className="text-2xl font-mono text-foreground">{result.pe_ratio ? result.pe_ratio.toFixed(2) : "N/A"}</p>
                                </div>
                                <div className="p-4 rounded-xl bg-muted/50 border border-border">
                                    <div className="flex items-center gap-2 text-muted-foreground mb-2">
                                        <DollarSign size={16} />
                                        <span className="text-xs uppercase font-bold tracking-wider">Market Cap</span>
                                    </div>
                                    <p className="text-lg font-mono text-foreground truncate">
                                        {result.market_cap ? (result.market_cap / 1e9).toFixed(2) + "B" : "N/A"}
                                    </p>
                                </div>
                            </div>

                            {/* Thesis */}
                            <div className="bg-gradient-to-br from-white/5 to-transparent p-6 rounded-xl border border-border">
                                <h3 className="text-foreground font-bold mb-3 flex items-center gap-2">
                                    Investment Thesis
                                </h3>
                                <p className="text-foreground/80 leading-relaxed font-light italic border-l-2 border-green-500 pl-4 py-1">
                                    "{result.thesis}"
                                </p>
                            </div>

                            <div className="text-sm text-muted-foreground leading-relaxed">
                                {result.description}
                            </div>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-foreground/20">
                            <TrendingUp className="w-24 h-24 mb-4 opacity-20" />
                            <p className="text-lg">Ready to analyze markets.</p>
                            <p className="text-sm">Enter a ticker to begin.</p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
