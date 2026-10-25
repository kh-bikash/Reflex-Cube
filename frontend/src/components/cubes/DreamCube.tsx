import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { X, Image as ImageIcon, Wand2, Palette, Download, Share2 } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';

export const DreamCube = () => {
    const [activeTab, setActiveTab] = useState<'generate' | 'train'>('generate');
    const [prompt, setPrompt] = useState('A futuristic city with flying cars at sunset, cyberpunk style');
    const [loading, setLoading] = useState(false);
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);

    // Training State
    const [isTraining, setIsTraining] = useState(false);
    const [epoch, setEpoch] = useState(0);
    const [loss, setLoss] = useState<number[]>([]);
    const [datasetCount, setDatasetCount] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);
    const [modelSize, setModelSize] = useState(0.0);
    const [isQuantized, setIsQuantized] = useState(false);
    const [trainSteps, setTrainSteps] = useState(500);

    useEffect(() => {
        const interval = setInterval(fetchStatus, 1000);
        return () => clearInterval(interval);
    }, []);

    const fetchStatus = async () => {
        try {
            const res = await api.post('/cubes/run', { cube_id: 'dream', input: { action: 'status' } });
            if (res.data) {
                setIsTraining(res.data.is_training);
                setEpoch(res.data.epoch);
                setLoss(res.data.losses || []);
                setDatasetCount(res.data.dataset_count || 0);
                setLogs(res.data.logs || []);
                setModelSize(res.data.model_size_mb || 0);
                setIsQuantized(res.data.is_quantized || false);
            }
        } catch (e) {
            console.warn("Failed to fetch DreamCube status", e);
        }
    };

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files?.[0]) return;
        const reader = new FileReader();
        reader.onload = async () => {
            await api.post('/cubes/run', {
                cube_id: 'dream',
                input: { action: 'upload_sample', image: reader.result }
            });
            toast.success("Image Uploaded");
        };
        reader.readAsDataURL(e.target.files[0]);
    };

    const handleTrain = async () => {
        try {
            await api.post('/cubes/run', { cube_id: 'dream', input: { action: 'train', steps: trainSteps, lr: 0.001 } });
            toast.success(`Training Started (${trainSteps} steps)!`);
        } catch (e) { toast.error("Failed to start training"); }
    };

    const handleQuantize = async () => {
        try {
            toast.info("Compressing model to INT8...");
            await api.post('/cubes/run', { cube_id: 'dream', input: { action: 'quantize' } });
            toast.success("Quantization Complete! Nano Mode Ready.");
        } catch (e) { toast.error("Quantization failed"); }
    };

    const handleGenerate = async () => {
        setLoading(true);
        try {
            const res = await api.post('/cubes/run', {
                cube_id: 'dream',
                input: { action: 'generate', prompt: prompt }
            });
            if (res.data.status === 'success') {
                setGeneratedImage(res.data.image);
                toast.success(isQuantized ? "Generated on Edge (Nano)" : "Generated on Cloud");
            } else {
                toast.error(res.data.message);
            }
        } catch (error) {
            toast.error("Failed to generate image.");
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
            <div className="bg-card w-full h-full relative overflow-hidden flex flex-col md:flex-row">

                {/* Left Panel: Controls */}
                <div className="w-full md:w-1/3 p-8 border-r border-border flex flex-col bg-background/40">
                    <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 rounded-xl bg-pink-500/20 flex items-center justify-center text-pink-400">
                            <Palette size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-foreground">Neural Forge</h2>
                            <p className="text-muted-foreground text-sm">Build Generative AI</p>
                        </div>
                    </div>

                    {/* Tabs */}
                    <div className="flex bg-muted/50 p-1 rounded-lg mb-6">
                        <button onClick={() => setActiveTab('generate')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${activeTab === 'generate' ? 'bg-pink-600 text-white' : 'text-muted-foreground'}`}>Generate</button>
                        <button onClick={() => setActiveTab('train')} className={`flex-1 py-2 text-xs font-bold rounded-md transition-colors ${activeTab === 'train' ? 'bg-pink-600 text-white' : 'text-muted-foreground'}`}>Forge Model</button>
                    </div>

                    {activeTab === 'generate' ? (
                        <div className="space-y-6">
                            <div className="p-4 bg-muted/50 rounded-xl border border-border">
                                <h3 className="text-foreground font-bold mb-2">Current Model</h3>
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>Architecture</span>
                                    <span className="text-foreground">Attention U-Net</span>
                                </div>
                                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                    <span>Precision</span>
                                    <span className={isQuantized ? "text-success font-bold" : "text-foreground"}>
                                        {isQuantized ? "INT8 (Nano)" : "FP32 (Full)"}
                                    </span>
                                </div>
                                <div className="flex justify-between text-xs text-muted-foreground mt-1">
                                    <span>Status</span>
                                    <span className={epoch > 0 ? "text-success" : "text-yellow-400"}>
                                        {epoch > 0 ? `Trained (Ep ${epoch})` : "Untrained"}
                                    </span>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Prompt</label>
                                <textarea
                                    value={prompt}
                                    onChange={(e) => setPrompt(e.target.value)}
                                    placeholder="Describe what you want to see..."
                                    className="w-full h-24 bg-muted/50 border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-pink-500/50 transition-colors resize-none"
                                />
                            </div>

                            <button
                                onClick={handleGenerate}
                                disabled={loading}
                                className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 hover:from-pink-500 hover:to-purple-500 text-foreground font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-lg shadow-pink-900/20"
                            >
                                {loading ? (
                                    <>Dreaming...</>
                                ) : (
                                    <>
                                        <Wand2 size={18} /> Generate Dream
                                    </>
                                )}
                            </button>

                            {generatedImage && (
                                <button
                                    onClick={() => {
                                        const link = document.createElement('a');
                                        link.href = generatedImage;
                                        link.download = `dream_${Date.now()}.jpg`;
                                        document.body.appendChild(link);
                                        link.click();
                                        document.body.removeChild(link);
                                    }}
                                    className="w-full py-3 bg-muted/50 hover:bg-muted text-foreground font-bold rounded-xl transition-all flex items-center justify-center gap-2 border border-border"
                                >
                                    <Download size={18} /> Download Image
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-6">
                            <div className="p-4 bg-muted/50 rounded-xl border border-border text-center">
                                <h3 className="text-foreground font-bold mb-2">Dataset</h3>
                                <p className="text-3xl font-mono text-foreground mb-2">{datasetCount}</p>
                                <label className="inline-block px-4 py-2 bg-muted hover:bg-muted/80 rounded-lg text-xs font-bold cursor-pointer transition-colors text-foreground">
                                    Upload Images
                                    <input type="file" className="hidden" multiple accept="image/*" onChange={handleUpload} />
                                </label>
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>Training Steps</span>
                                    <span className="text-foreground">{trainSteps}</span>
                                </div>
                                <input
                                    type="range"
                                    min="50" max="2000" step="50"
                                    value={trainSteps}
                                    onChange={(e) => setTrainSteps(parseInt(e.target.value))}
                                    className="w-full accent-pink-500 h-1 bg-muted rounded-lg appearance-none cursor-pointer"
                                />
                            </div>

                            <div className="p-4 bg-background/40 rounded-xl border border-border h-32 overflow-y-auto font-mono text-[10px] text-muted-foreground">
                                {logs.map((l, i) => <div key={i}>{l}</div>)}
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={handleTrain}
                                    disabled={isTraining}
                                    className="flex-1 py-3 bg-card text-foreground font-bold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-muted"
                                >
                                    {isTraining ? "Training..." : "Start Training"}
                                </button>

                                {epoch > 0 && !isTraining && (
                                    <button
                                        onClick={handleQuantize}
                                        className="py-3 px-4 bg-green-900/40 text-success font-bold rounded-xl border border-green-500/20 hover:bg-green-900/60 transition-all flex flex-col items-center justify-center leading-none"
                                        title="Compress to INT8 for Mobile"
                                    >
                                        <span className="text-xs">MAKE</span>
                                        <span>NANO</span>
                                    </button>
                                )}
                            </div>
                            {modelSize > 0 && <p className="text-xs text-center text-foreground/30">Model Size: {modelSize.toFixed(2)} MB</p>}
                        </div>
                    )}
                </div>

                {/* Right Panel: Canvas */}
                <div className="w-full md:w-2/3 bg-[#050505] p-8 flex items-center justify-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-pink-500/5 to-transparent opacity-50" />

                    {generatedImage ? (
                        <div className="relative group w-full max-w-lg aspect-square">
                            <img
                                src={generatedImage}
                                alt="Generated"
                                className="w-full h-full object-cover rounded-xl shadow-2xl ring-1 ring-white/10"
                            />
                            <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 backdrop-blur-sm rounded-xl">
                                <button className="p-3 bg-muted hover:bg-muted/80 rounded-full text-foreground transition-colors">
                                    <Download size={24} />
                                </button>
                                <button className="p-3 bg-muted hover:bg-muted/80 rounded-full text-foreground transition-colors">
                                    <Share2 size={24} />
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="text-center text-foreground/20">
                            <div className="w-24 h-24 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
                                <ImageIcon size={48} />
                            </div>
                            <h3 className="text-xl font-medium mb-2">Blank Canvas</h3>
                            <p className="text-sm">Enter a prompt to start dreaming.</p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
