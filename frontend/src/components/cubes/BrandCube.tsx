import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Crown, Palette, Type, Mic2, Download, Check, Copy } from 'lucide-react';
import { api } from '../../lib/api';

interface Color { hex: string; name: string; usage: string; }
interface Fonts { header: string; body: string; }
interface BrandResult {
    brand_name: string;
    archetype: string;
    manifesto: string;
    traits: string[];
    voice: string;
    colors: Color[];
    fonts: Fonts;
    logo_url: string;
    logo_concept: string;
}

export default function BrandCube() {
    const [input, setInput] = useState('');
    const [industry, setIndustry] = useState('general');
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<BrandResult | null>(null);

    const generate = async () => {
        if (!input) return;
        setLoading(true);
        try {
            const res = await api.post('/cubes/run', {
                cube_id: 'brand',
                input: { brand_input: input, industry }
            });
            const data = res.data;
            if (data.status === 'success') setResult(data.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full w-full bg-[#050505] text-foreground p-8 overflow-y-auto font-sans">
            {/* Header */}
            <header className="max-w-7xl mx-auto mb-12 flex justify-between items-end border-b border-border pb-6">
                <div>
                    <h1 className="text-4xl font-bold tracking-tighter mb-2 bg-gradient-to-r from-white to-white/50 bg-clip-text text-transparent">
                        Brand Alchemist
                    </h1>
                    <p className="text-muted-foreground font-mono text-sm">ARCHETYPE INTELLIGENCE SYSTEM v2.0</p>
                </div>
                {!result && (
                    <div className="flex gap-4 items-center">
                        <input
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Describe your brand..."
                            className="bg-muted/50 border border-border px-4 py-2 rounded-lg w-80 focus:outline-none focus:border-white/30 transition-colors"
                            onKeyDown={(e) => e.key === 'Enter' && generate()}
                        />
                        <button
                            onClick={generate}
                            disabled={loading}
                            className="bg-white text-black px-6 py-2 rounded-lg font-bold hover:bg-gray-200 transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Distilling...' : 'Ignite'}
                        </button>
                    </div>
                )}
            </header>

            {loading && (
                <div className="flex flex-col items-center justify-center h-[60vh]">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                        className="w-16 h-16 border-t-2 border-white rounded-full mb-8"
                    />
                    <p className="font-mono text-foreground/50 animate-pulse">ANALYZING BRAND DNA...</p>
                </div>
            )}

            {result && !loading && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="max-w-7xl mx-auto grid grid-cols-12 gap-6"
                >
                    {/* 1. Identity Card (Top Left) */}
                    <div className="col-span-12 md:col-span-4 bg-card rounded-3xl p-8 border border-border relative overflow-hidden group">
                        <div className="absolute top-0 right-0 p-4 opacity-10">
                            <Crown size={120} />
                        </div>
                        <p className="font-mono text-xs text-purple-400 mb-2">PRIMARY ARCHETYPE</p>
                        <h2 className="text-5xl font-bold mb-6 tracking-tight">{result.archetype}</h2>
                        <div className="flex flex-wrap gap-2 mb-8">
                            {result.traits.map(t => (
                                <span key={t} className="px-3 py-1 rounded-full border border-border text-xs font-mono text-foreground/70">
                                    {t.toUpperCase()}
                                </span>
                            ))}
                        </div>
                        <div className="bg-muted/50 p-6 rounded-xl border-l-2 border-purple-500">
                            <p className="text-xl italic font-serif leading-relaxed text-foreground/90">"{result.manifesto}"</p>
                        </div>
                    </div>

                    {/* 2. Logo Studio (Top Middle) */}
                    <div className="col-span-12 md:col-span-4 bg-card rounded-3xl p-8 border border-border flex flex-col items-center justify-center relative">
                        <p className="absolute top-6 left-6 font-mono text-xs text-foreground/30 flex items-center gap-2">
                            <Sparkles size={12} /> ARCHETYPE SEAL
                        </p>
                        <img
                            src={result.logo_url}
                            className="w-64 h-64 object-contain drop-shadow-2xl hover:scale-105 transition-transform duration-500"
                        />
                        <p className="mt-6 text-center text-muted-foreground text-xs max-w-[80%]">
                            <strong className="block text-muted-foreground mb-1">Visual Direction:</strong>
                            {result.logo_concept}
                        </p>
                    </div>

                    {/* 3. Typography (Top Right) */}
                    <div className="col-span-12 md:col-span-4 bg-card rounded-3xl p-8 border border-border flex flex-col justify-between">
                        <div className="flex items-center gap-2 mb-6">
                            <Type className="text-foreground/30" />
                            <span className="font-mono text-xs text-foreground/30">TYPOGRAPHY SYSTEM</span>
                        </div>
                        <div className="space-y-8">
                            <div>
                                <p className="text-muted-foreground text-xs mb-2">HEADER FONT</p>
                                <p className="text-4xl font-bold">{result.fonts.header}</p>
                                <p className="text-sm text-foreground/50 mt-1">Aa Bb Cc Dd Ee 123</p>
                            </div>
                            <div className="h-px bg-muted" />
                            <div>
                                <p className="text-muted-foreground text-xs mb-2">BODY FONT</p>
                                <p className="text-2xl font-light">{result.fonts.body}</p>
                                <p className="text-sm text-foreground/50 mt-1">The quick brown fox jumps over the lazy dog.</p>
                            </div>
                        </div>
                    </div>

                    {/* 4. Color Palette (Bottom Wide) */}
                    <div className="col-span-12 md:col-span-8 bg-card rounded-3xl p-8 border border-border">
                        <div className="flex items-center gap-2 mb-6">
                            <Palette className="text-foreground/30" />
                            <span className="font-mono text-xs text-foreground/30">CHROMATIC IDENTITY</span>
                        </div>
                        <div className="grid grid-cols-5 gap-4 h-40">
                            {result.colors.map((c, i) => (
                                <div key={i} className="group relative h-full rounded-xl cursor-pointer hover:scale-105 transition-all duration-300" style={{ backgroundColor: c.hex }}>
                                    <div className="absolute inset-x-0 bottom-0 p-3 bg-background/50 backdrop-blur-md opacity-0 group-hover:opacity-100 transition-opacity rounded-b-xl">
                                        <p className="text-xs font-bold text-foreground">{c.name}</p>
                                        <p className="text-[10px] font-mono text-foreground/70">{c.hex}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* 5. Voice & Tone (Bottom Right) */}
                    <div className="col-span-12 md:col-span-4 bg-gradient-to-br from-purple-900/20 to-blue-900/20 rounded-3xl p-8 border border-border flex flex-col justify-center relative overflow-hidden">
                        <div className="absolute inset-0 bg-[url('/noise.png')] opacity-20" />
                        <Mic2 className="mb-4 text-purple-400" />
                        <h3 className="text-xl font-bold mb-2">Brand Voice</h3>
                        <p className="text-2xl text-foreground/80 font-light leading-relaxed">
                            "{result.voice}"
                        </p>
                        <div className="mt-6 flex gap-1 items-end h-8">
                            {[40, 70, 30, 80, 50, 90, 40, 60, 30, 50].map((h, i) => (
                                <motion.div
                                    key={i}
                                    animate={{ height: [h / 2, h, h / 2] }}
                                    transition={{ duration: 1, repeat: Infinity, delay: i * 0.1 }}
                                    className="w-1 bg-purple-500/50 rounded-full"
                                    style={{ height: h + '%' }}
                                />
                            ))}
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
