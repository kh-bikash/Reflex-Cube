import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Scan, Camera, FileText, CheckCircle, Search, Copy } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';

interface LensResult {
    type: string;
    identified: string;
    confidence: string;
    details: string;
    ocr_text?: string;
}

export const LensCube = () => {
    const [image, setImage] = useState<string | null>(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState<LensResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImage(reader.result as string);
                setResult(null); // Reset result on new image
            };
            reader.readAsDataURL(file);
        }
    };

    const handleAnalyze = async () => {
        if (!image) return;
        setAnalyzing(true);
        try {
            const response = await api.post('/cubes/run', {
                cube_id: 'lens',
                input: { image: image }
            });
            if (response.data.status === 'error') {
                toast.error(response.data.message);
            } else {
                setResult(response.data.result);
                toast.success("Scan complete!");
            }
        } catch (error) {
            toast.error("Failed to scan image.");
            console.error(error);
        } finally {
            setAnalyzing(false);
        }
    };

    return (
        <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="w-full h-full flex items-center justify-center bg-background"
        >
            <div className="bg-background w-full h-full relative flex flex-col md:flex-row overflow-hidden">

                {/* Left Panel: Camera/Image */}
                <div className="w-full md:w-1/2 bg-background relative flex flex-col">
                    <div className="absolute top-6 left-6 z-10 flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-blue-500/20 flex items-center justify-center text-blue-400">
                            <Scan size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-foreground">Lens Cube</h2>
                            <p className="text-muted-foreground text-xs uppercase tracking-wider">Universal Scanner</p>
                        </div>
                    </div>

                    <div className="flex-grow relative flex items-center justify-center bg-grid-white/[0.05] overflow-hidden group">
                        {image ? (
                            <div className="relative w-full h-full">
                                <img src={image} alt="Scan target" className="w-full h-full object-contain" />
                                {analyzing && (
                                    <div className="absolute inset-0 bg-blue-500/10 pointer-events-none">
                                        <div className="absolute inset-x-0 top-0 h-1 bg-blue-400/50 shadow-[0_0_20px_rgba(96,165,250,0.5)] animate-scan" />
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="text-center p-8">
                                <div className="w-20 h-20 border-2 border-border border-dashed rounded-2xl flex items-center justify-center mx-auto mb-4 group-hover:border-blue-500/50 transition-colors">
                                    <Camera className="w-8 h-8 text-foreground/20 group-hover:text-blue-400 transition-colors" />
                                </div>
                                <p className="text-muted-foreground mb-6">Drop an image to identify objects or text.</p>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
                                >
                                    Activate Camera / Upload
                                </button>
                            </div>
                        )}
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept="image/*"
                            className="hidden"
                        />

                        {image && !analyzing && !result && (
                            <button
                                onClick={handleAnalyze}
                                className="absolute bottom-8 left-1/2 -translate-x-1/2 px-8 py-3 bg-card text-foreground font-bold rounded-full shadow-xl hover:scale-105 transition-transform flex items-center gap-2"
                            >
                                <Search size={18} /> Deep Scan
                            </button>
                        )}
                    </div>
                </div>

                {/* Right Panel: Analysis Results */}
                <div className="w-full md:w-1/2 p-8 bg-background border-t md:border-t-0 md:border-l border-border flex flex-col overflow-y-auto">
                    {result ? (
                        <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
                            {/* Identification Badge */}
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 text-xs font-bold uppercase tracking-wider mb-2">
                                <CheckCircle size={12} /> {result.type} Detected
                            </div>

                            <div>
                                <h3 className="text-3xl font-display font-bold text-foreground mb-2">{result.identified}</h3>
                                <p className="text-muted-foreground font-mono text-sm">Confidence: <span className="text-success">{result.confidence}</span></p>
                            </div>

                            <div className="p-6 rounded-2xl bg-muted/50 border border-border">
                                <h4 className="text-foreground font-bold mb-3 flex items-center gap-2 text-sm uppercase text-muted-foreground">
                                    Knowledge Base
                                </h4>
                                <p className="text-foreground/80 leading-relaxed">
                                    {result.details}
                                </p>
                            </div>

                            {result.ocr_text && (
                                <div className="mt-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <h4 className="text-foreground font-bold flex items-center gap-2 text-sm uppercase text-muted-foreground">
                                            <FileText size={14} /> Extracted Text
                                        </h4>
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(result.ocr_text);
                                                toast.success("Text copied!");
                                            }}
                                            className="p-1.5 hover:bg-muted rounded-md text-muted-foreground hover:text-foreground transition-colors"
                                        >
                                            <Copy size={14} />
                                        </button>
                                    </div>
                                    <div className="p-4 rounded-xl bg-background/40 border border-border font-mono text-sm text-foreground/70 whitespace-pre-wrap">
                                        {result.ocr_text}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-foreground/20 select-none">
                            <div className="relative">
                                <Scan className="w-24 h-24 mb-6 opacity-20" />
                                <div className="absolute inset-0 border-t-2 border-b-2 border-border animate-pulse" />
                            </div>
                            <p className="text-lg font-medium">Awaiting Input</p>
                            <p className="text-sm">Upload an image to begin analysis.</p>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                @keyframes scan {
                    0% { top: 0; opacity: 0; }
                    10% { opacity: 1; }
                    90% { opacity: 1; }
                    100% { top: 100%; opacity: 0; }
                }
                .animate-scan {
                    animation: scan 2s cubic-bezier(0.4, 0, 0.2, 1) infinite;
                }
            `}</style>
        </motion.div>
    );
};
