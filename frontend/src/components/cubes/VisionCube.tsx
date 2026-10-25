import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, Layers, Play, Activity, Scan, Trash2, Plus, Image as ImageIcon, Zap, Brain, CheckCircle } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface VisionPrediction {
    prediction: string;
    confidence: number;
    all_results: Array<{
        class: string;
        confidence: number;
    }>;
}

export const VisionCube = () => {
    const [activeTab, setActiveTab] = useState<'dataset' | 'logic' | 'train' | 'lab'>('dataset');
    const [classes, setClasses] = useState<string[]>([]);
    const [counts, setCounts] = useState<Record<string, number>>({});

    // Logic State
    const [modelType, setModelType] = useState<'scratch' | 'pretrained'>('scratch');
    const [epochs, setEpochs] = useState(10);

    // Training State
    const [isTraining, setIsTraining] = useState(false);
    const [logs, setLogs] = useState<string[]>([]);
    const [stats, setStats] = useState<{ loss: number[], accuracy: number[] }>({ loss: [], accuracy: [] });
    const [currentEpoch, setCurrentEpoch] = useState(0);

    // Lab State
    const [labImage, setLabImage] = useState<string | null>(null);
    const [prediction, setPrediction] = useState<VisionPrediction | null>(null);

    const logEndRef = useRef<HTMLDivElement>(null);

    // Initial Fetch
    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 1000);
        return () => clearInterval(interval);
    }, []);

    const [debugInfo, setDebugInfo] = useState<string>("Ready");

    // Augmentation State
    const [augConfig, setAugConfig] = useState({
        rotation: 15,
        noise: 0.0,
        blur: 0.0,
        brightness: 0.2,
        flip: true
    });
    const [augPreviews, setAugPreviews] = useState<string[]>([]);

    const fetchStatus = async () => {
        try {
            const res = await api.post('/cubes/run', { cube_id: 'vision', input: { action: 'status' } });
            // API returns the object directly
            const data = res.data;
            if (data) {
                setClasses(data.classes || []);
                setCounts(data.dataset_counts || {});
                setIsTraining(data.is_training);
                setLogs(data.logs || []);
                setStats(data.stats || { loss: [], accuracy: [] });
                setCurrentEpoch(data.epoch || 0);
                if (data.aug_config) {
                    // Only update if we haven't touched it locally? Or sync?
                    // Let's rely on local state pushing to backend, but init from backend if needed.
                    // For now, keep local authoritative for UI responsiveness.
                }
            }
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            console.error(err);
            setDebugInfo(`Error: ${err.message}`);
        }
    };

    const handleUpdateAugment = async (newConfig: typeof augConfig) => {
        try {
            await api.post('/cubes/run', {
                cube_id: 'vision',
                input: { action: 'update_augment', config: newConfig }
            });
            refreshPreviews();
        } catch (e) {
            console.error("Failed to update augment settings");
        }
    };

    const refreshPreviews = async () => {
        try {
            const res = await api.post('/cubes/run', {
                cube_id: 'vision',
                input: { action: 'preview_augment' }
            });
            if (res.data.status === 'success') {
                setAugPreviews(res.data.previews);
            }
        } catch (e) {
            console.error("Failed to fetch previews");
        }
    };

    // Load initial previews on mount or tab change
    useEffect(() => {
        if (activeTab === 'dataset') {
            refreshPreviews();
        }
    }, [activeTab]);

    // Auto scroll logs
    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, label: string) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onloadend = async () => {
            try {
                const res = await api.post('/cubes/run', {
                    cube_id: 'vision',
                    input: {
                        action: 'upload_sample',
                        label: label,
                        image: reader.result
                    }
                });
                if (res.data.status === 'success') {
                    toast.success(`Uploaded to ${label}`);
                    fetchStatus();
                } else {
                    toast.error(res.data.message);
                }
            } catch (e) {
                toast.error("Upload failed");
            }
        };
        reader.readAsDataURL(file);
    };

    const handleTrain = async () => {
        try {
            const res = await api.post('/cubes/run', {
                cube_id: 'vision',
                input: {
                    action: 'train',
                    config: {
                        model_type: modelType,
                        epochs: epochs
                    }
                }
            });
            if (res.data.status === 'success') {
                toast.success("Training Started");
                setActiveTab('train');
            } else {
                toast.error(res.data.message);
            }
        } catch (e) {
            toast.error("Failed to start training");
        }
    };

    const [showHeatmap, setShowHeatmap] = useState(false);
    const [heatmapImage, setHeatmapImage] = useState<string | null>(null);

    const handlePredict = async (file: File) => {
        const reader = new FileReader();
        reader.onloadend = async () => {
            setLabImage(reader.result as string);
            setHeatmapImage(null); // Reset
            try {
                // 1. Predict
                const res = await api.post<VisionPrediction & { status?: string; message?: string }>(
                    '/cubes/run',
                    {
                        cube_id: 'vision',
                        input: {
                            action: 'predict',
                            image: reader.result
                        }
                    }
                );
                if (res.data.status === 'success') {
                    setPrediction(res.data);

                    // 2. Explain (if heatmap enabled or just pre-fetch?)
                    // Let's lazy load it or load if toggle is on.
                    // For now, always fetch to be ready? Or only when requested?
                    // Let's fetch immediately for snappiness.
                    handleExplain(reader.result as string);
                } else {
                    toast.error(res.data.message);
                }
            } catch (e) {
                toast.error("Prediction failed");
            }
        };
        reader.readAsDataURL(file);
    };

    const handleExplain = async (imageB64: string) => {
        try {
            const res = await api.post('/cubes/run', {
                cube_id: 'vision',
                input: {
                    action: 'explain',
                    image: imageB64
                }
            });
            if (res.data.status === 'success') {
                setHeatmapImage(res.data.heatmap_image);
            }
        } catch (e) {
            console.error("Explain failed", e);
        }
    };

    return (
        <div className="w-full h-full flex items-center justify-center bg-background font-sans">
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="w-full h-full bg-card flex flex-col overflow-hidden"
            >
                {/* Header */}
                <div className="h-20 border-b border-border flex items-center justify-between px-8 bg-white/[0.02]">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-purple-500/20 flex items-center justify-center text-purple-400">
                            <Layers size={24} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-foreground tracking-tight">Vision Forge</h2>
                            <p className="text-muted-foreground text-xs font-mono uppercase tracking-wider">Neural Network Lab</p>
                        </div>
                    </div>

                    <div className="flex bg-background/40 p-1 rounded-xl border border-border">
                        {[
                            { id: 'dataset', icon: ImageIcon, label: 'Dataset' },
                            { id: 'logic', icon: Brain, label: 'Intelligence' },
                            { id: 'train', icon: Activity, label: 'Training' },
                            { id: 'lab', icon: Scan, label: 'Vision Lab' },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as 'dataset' | 'logic' | 'train' | 'lab')}
                                className={`px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-all ${activeTab === tab.id
                                    ? 'bg-purple-600 text-foreground shadow-lg shadow-purple-900/20'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                                    }`}
                            >
                                <tab.icon size={16} />
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-hidden relative">
                    {/* Dataset Tab */}
                    {activeTab === 'dataset' && (
                        <div className="h-full flex overflow-hidden">
                            {/* Left: Class Manager */}
                            <div className="flex-1 p-8 overflow-y-auto border-r border-border">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 gap-6">
                                    {/* New Class Card */}
                                    <div className="aspect-square border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center p-6 hover:border-purple-500/50 hover:bg-purple-500/5 transition-all group cursor-pointer"
                                        onClick={async () => {
                                            const rawName = prompt("Enter Class Name (e.g., 'Cat')");
                                            if (rawName) {
                                                const name = rawName.replace(/[^a-zA-Z0-9-_]/g, '');
                                                if (name && !classes.includes(name)) {
                                                    try {
                                                        await api.post('/cubes/run', {
                                                            cube_id: 'vision',
                                                            input: { action: 'create_class', label: name }
                                                        });
                                                        toast.success(`Created class '${name}'`);
                                                        fetchStatus();
                                                    } catch (e) {
                                                        toast.error("Failed to create class");
                                                    }
                                                } else if (!name) {
                                                    alert("Invalid name. Use only letters, numbers, -");
                                                }
                                            }
                                        }}
                                    >
                                        <div className="w-16 h-16 rounded-full bg-muted/50 flex items-center justify-center mb-4 group-hover:bg-purple-500/20 group-hover:text-purple-400 transition-colors">
                                            <Plus size={32} />
                                        </div>
                                        <h3 className="text-foreground font-medium">Add Class</h3>
                                        <p className="text-muted-foreground text-sm text-center mt-2">Create a new category for the AI to learn.</p>
                                    </div>

                                    {/* Class Cards */}
                                    {classes.map(cls => (
                                        <div key={cls} className="aspect-square bg-muted/50 border border-border rounded-2xl p-6 flex flex-col relative group">
                                            <div className="flex items-center justify-between mb-4">
                                                <h3 className="text-xl font-bold text-foreground max-w-[70%] truncate" title={cls}>{cls}</h3>
                                                <div className="flex items-center gap-2">
                                                    <span className="px-2 py-1 bg-muted rounded text-xs font-mono text-muted-foreground">{counts[cls] || 0}</span>
                                                    <button
                                                        className="p-1 hover:bg-red-500/20 rounded text-foreground/20 hover:text-red-400 transition-colors"
                                                        onClick={async (e) => {
                                                            e.stopPropagation();
                                                            if (!confirm(`Delete class '${cls}' and all its images?`)) return;
                                                            await api.post('/cubes/run', {
                                                                cube_id: 'vision',
                                                                input: { action: 'delete_class', label: cls }
                                                            });
                                                            toast.success(`Deleted ${cls}`);
                                                            fetchStatus();
                                                        }}
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex-1 bg-background/40 rounded-xl border border-border flex flex-col items-center justify-center mb-4 overflow-hidden relative">
                                                {counts[cls] > 0 ? (
                                                    <div className="text-center">
                                                        <CheckCircle className="mx-auto mb-2 text-success" />
                                                        <span className="text-xs text-muted-foreground">Data Loaded</span>
                                                    </div>
                                                ) : (
                                                    <div className="text-center px-4">
                                                        <p className="text-xs text-muted-foreground">No images yet. Upload samples.</p>
                                                    </div>
                                                )}

                                                <label className="absolute inset-0 cursor-pointer opacity-0 hover:opacity-100 bg-background/60 flex items-center justify-center transition-opacity backdrop-blur-sm">
                                                    <div className="flex flex-col items-center text-foreground">
                                                        <Upload size={24} className="mb-2" />
                                                        <span className="text-sm font-medium">Upload Samples</span>
                                                        <input type="file" className="hidden" multiple accept="image/*" onChange={(e) => handleFileUpload(e, cls)} />
                                                    </div>
                                                </label>
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                <div className="mt-12 flex justify-end border-t border-border pt-6">
                                    <button
                                        className="px-4 py-2 text-xs font-mono text-red-400 hover:bg-red-500/10 rounded-lg flex items-center gap-2 transition-colors"
                                        onClick={async () => {
                                            if (!confirm("Are you sure you want to delete ALL classes and images? This cannot be undone.")) return;
                                            await api.post('/cubes/run', { cube_id: 'vision', input: { action: 'clear_dataset' } });
                                            toast.success("Dataset Cleared");
                                            fetchStatus();
                                        }}
                                    >
                                        <Trash2 size={14} />
                                        RESET DATASET
                                    </button>
                                </div>
                            </div>

                            {/* Right: Neuro-Optics Lab (Augmentation) */}
                            <div className="w-96 bg-background/20 p-8 overflow-y-auto border-l border-border">
                                <h3 className="text-foreground font-bold mb-6 flex items-center gap-2">
                                    <Zap size={18} className="text-yellow-400" /> Neuro-Optics Lab
                                </h3>
                                <div className="mb-6 p-4 rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                                    <p className="text-yellow-200/80 text-xs leading-relaxed">
                                        Augment your data to make the model robust. The AI will see randomized versions of each image during training.
                                    </p>
                                </div>

                                <div className="space-y-6">
                                    {/* Sliders */}
                                    {[
                                        { key: 'rotation', label: 'Rotation', min: 0, max: 180, step: 5, unit: '°' },
                                        { key: 'noise', label: 'Pixel Noise', min: 0, max: 0.5, step: 0.05, unit: '' },
                                        { key: 'blur', label: 'Motion Blur', min: 0, max: 5, step: 0.5, unit: 'px' },
                                        { key: 'brightness', label: 'Light Shift', min: 0, max: 1, step: 0.1, unit: '' },
                                    ].map((setting) => (
                                        <div key={setting.key}>
                                            <div className="flex justify-between mb-2">
                                                <label className="text-muted-foreground text-xs font-mono uppercase">{setting.label}</label>
                                                <span className="text-foreground text-xs font-bold">{augConfig[setting.key as keyof typeof augConfig]}{setting.unit}</span>
                                            </div>
                                            <input
                                                type="range"
                                                min={setting.min} max={setting.max} step={setting.step}
                                                value={augConfig[setting.key as keyof typeof augConfig] as number}
                                                onChange={(e) => {
                                                    const val = parseFloat(e.target.value);
                                                    setAugConfig(prev => ({ ...prev, [setting.key]: val }));
                                                    // Debounce update? For now just local, save on blur or separate effect?
                                                }}
                                                onMouseUp={() => handleUpdateAugment(augConfig)} // Send on release
                                                className="w-full accent-purple-500 bg-muted h-1 rounded-full appearance-none cursor-pointer"
                                            />
                                        </div>
                                    ))}

                                    <div className="flex items-center justify-between pt-2">
                                        <label className="text-muted-foreground text-xs font-mono uppercase">Horizontal Flip</label>
                                        <button
                                            onClick={() => {
                                                const newVal = !augConfig.flip;
                                                setAugConfig(prev => ({ ...prev, flip: newVal }));
                                                handleUpdateAugment({ ...augConfig, flip: newVal });
                                            }}
                                            className={`w-10 h-6 rounded-full p-1 transition-colors ${augConfig.flip ? 'bg-purple-500' : 'bg-muted'}`}
                                        >
                                            <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform ${augConfig.flip ? 'translate-x-4' : 'translate-x-0'}`} />
                                        </button>
                                    </div>
                                </div>

                                {/* Live Preview */}
                                <div className="mt-8">
                                    <div className="flex items-center justify-between mb-4">
                                        <h4 className="text-foreground font-medium text-sm">Robot Eye View</h4>
                                        <button onClick={refreshPreviews} className="text-xs text-purple-400 hover:text-purple-300">Refresh</button>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        {augPreviews.length > 0 ? augPreviews.map((src, i) => (
                                            <div key={i} className="aspect-square rounded-lg overflow-hidden border border-border bg-background">
                                                <img src={src} className="w-full h-full object-cover opacity-80" />
                                            </div>
                                        )) : (
                                            <div className="col-span-2 aspect-video flex items-center justify-center text-foreground/20 text-xs border border-border rounded-lg bg-background/40">
                                                Upload images to preview
                                            </div>
                                        )}
                                    </div>
                                    <p className="text-foreground/20 text-[10px] text-center mt-2">Simulated training samples</p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Logic Tab */}
                    {activeTab === 'logic' && (
                        <div className="h-full flex flex-col items-center justify-center p-8">
                            <div className="max-w-4xl w-full grid grid-cols-2 gap-8">
                                {/* Scratch Option */}
                                <div
                                    onClick={() => setModelType('scratch')}
                                    className={`relative p-8 rounded-3xl border-2 transition-all cursor-pointer ${modelType === 'scratch'
                                        ? 'bg-purple-500/10 border-purple-500'
                                        : 'bg-muted/50 border-transparent hover:border-border'
                                        }`}
                                >
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-pink-500 to-purple-600 flex items-center justify-center mb-6">
                                        <Brain className="text-foreground" size={28} />
                                    </div>
                                    <h3 className="text-2xl font-bold text-foreground mb-2">Build from Scratch</h3>
                                    <p className="text-muted-foreground mb-6">Train a custom Convolutional Neural Network (CNN) layer by layer. Best for learning core concepts.</p>
                                    <ul className="space-y-3 text-sm text-foreground/50">
                                        <li className="flex items-center gap-2"><Zap size={14} className="text-yellow-500" /> Learns filters from zero</li>
                                        <li className="flex items-center gap-2"><Zap size={14} className="text-yellow-500" /> Full control over architecture</li>
                                        <li className="flex items-center gap-2"><Zap size={14} className="text-yellow-500" /> Slower convergence (Educational)</li>
                                    </ul>
                                </div>

                                {/* Pretrained Option */}
                                <div
                                    onClick={() => setModelType('pretrained')}
                                    className={`relative p-8 rounded-3xl border-2 transition-all cursor-pointer ${modelType === 'pretrained'
                                        ? 'bg-blue-500/10 border-blue-500'
                                        : 'bg-muted/50 border-transparent hover:border-border'
                                        }`}
                                >
                                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center mb-6">
                                        <Layers className="text-foreground" size={28} />
                                    </div>
                                    <h3 className="text-2xl font-bold text-foreground mb-2">Industry Pretrained</h3>
                                    <p className="text-muted-foreground mb-6">Use MobileNetV3 with Transfer Learning. The standard for production applications.</p>
                                    <ul className="space-y-3 text-sm text-foreground/50">
                                        <li className="flex items-center gap-2"><CheckCircle size={14} className="text-success" /> Pre-learned features (ImageNet)</li>
                                        <li className="flex items-center gap-2"><CheckCircle size={14} className="text-success" /> High accuracy with few samples</li>
                                        <li className="flex items-center gap-2"><CheckCircle size={14} className="text-success" /> Instant results</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="mt-12 p-6 rounded-2xl bg-muted/50 border border-border w-full max-w-2xl flex items-center justify-between">
                                <div>
                                    <label className="block text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Training Epochs</label>
                                    <div className="flex items-center gap-4">
                                        <input
                                            type="range" min="1" max="50" value={epochs}
                                            onChange={(e) => setEpochs(parseInt(e.target.value))}
                                            className="w-48 accent-purple-500"
                                        />
                                        <span className="text-2xl font-mono text-foreground">{epochs}</span>
                                    </div>
                                </div>
                                <button
                                    onClick={() => { setActiveTab('train'); handleTrain(); }}
                                    className="px-8 py-4 bg-white text-black font-bold rounded-xl hover:scale-105 transition-transform flex items-center gap-2"
                                >
                                    <Play size={20} fill="currentColor" />
                                    Start Training
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Training Tab */}
                    {activeTab === 'train' && (
                        <div className="h-full flex flex-col md:flex-row">
                            {/* Charts */}
                            <div className="flex-1 p-8 flex flex-col gap-6">
                                <div className="flex-1 bg-muted/50 rounded-2xl border border-border p-6 flex flex-col">
                                    <h3 className="text-foreground font-medium mb-4 flex items-center gap-2">
                                        <Activity size={16} className="text-purple-400" /> Loss Curve
                                    </h3>
                                    <div className="flex-1 min-h-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={stats.loss.map((l, i) => ({ step: i, loss: l }))}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                                                <YAxis stroke="#666" fontSize={12} />
                                                <XAxis dataKey="step" stroke="#666" fontSize={12} />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }}
                                                    itemStyle={{ color: '#fff' }}
                                                />
                                                <Line type="monotone" dataKey="loss" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                <div className="flex-1 bg-muted/50 rounded-2xl border border-border p-6 flex flex-col">
                                    <h3 className="text-foreground font-medium mb-4 flex items-center gap-2">
                                        <Activity size={16} className="text-success" /> Accuracy
                                    </h3>
                                    <div className="flex-1 min-h-0">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={stats.accuracy.map((a, i) => ({ step: i, acc: a }))}>
                                                <CartesianGrid strokeDasharray="3 3" stroke="#ffffff10" />
                                                <YAxis stroke="#666" fontSize={12} domain={[0, 100]} />
                                                <XAxis dataKey="step" stroke="#666" fontSize={12} />
                                                <Tooltip
                                                    contentStyle={{ backgroundColor: '#000', border: '1px solid #333' }}
                                                    itemStyle={{ color: '#fff' }}
                                                />
                                                <Line type="monotone" dataKey="acc" stroke="#22c55e" strokeWidth={2} dot={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>

                            {/* Logs sidebar */}
                            <div className="w-full md:w-96 bg-background/40 border-l border-border p-6 flex flex-col">
                                <h3 className="text-foreground font-bold mb-4">Training Log</h3>
                                <div className="flex-1 overflow-y-auto space-y-2 font-mono text-sm">
                                    {logs.map((log, i) => (
                                        <div key={i} className="text-muted-foreground border-b border-border pb-1">
                                            {log}
                                        </div>
                                    ))}
                                    <div ref={logEndRef} />
                                </div>
                                {!isTraining && (
                                    <button
                                        onClick={() => setActiveTab('lab')}
                                        className="mt-4 w-full py-3 bg-purple-600 hover:bg-purple-500 text-foreground rounded-xl font-bold transition-colors"
                                    >
                                        Go to Lab
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Lab Tab */}
                    {activeTab === 'lab' && (
                        <div className="h-full p-8 flex flex-col items-center justify-center">
                            <div className="w-full max-w-lg mb-8">
                                <label className="block w-full aspect-video border-2 border-dashed border-border rounded-2xl flex flex-col items-center justify-center bg-muted/50 hover:bg-muted hover:border-purple-500/50 transition-all cursor-pointer relative overflow-hidden group">
                                    {labImage ? (
                                        <img src={labImage} alt="Test" className="w-full h-full object-contain" />
                                    ) : (
                                        <div className="text-center">
                                            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-4 group-hover:text-purple-400 transition-colors">
                                                <Upload size={24} />
                                            </div>
                                            <p className="text-foreground font-medium">Upload Test Image</p>
                                            <p className="text-muted-foreground text-sm">Drag or click to test model</p>
                                        </div>
                                    )}
                                    <input type="file" className="hidden" onChange={(e) => {
                                        if (e.target.files?.[0]) handlePredict(e.target.files[0]);
                                    }} />

                                    {/* Heatmap Overlay */}
                                    {heatmapImage && (
                                        <div className={`absolute inset-0 bg-background transition-opacity duration-500 ${showHeatmap ? 'opacity-100' : 'opacity-0'} pointer-events-none`}>
                                            <img src={heatmapImage} alt="Heatmap" className="w-full h-full object-contain" />
                                        </div>
                                    )}
                                </label>
                            </div>

                            {/* X-Ray Toggle */}
                            {prediction && (
                                <div className="mb-8 flex items-center justify-center gap-4">
                                    <span className={`text-sm font-bold ${!showHeatmap ? 'text-foreground' : 'text-muted-foreground'}`}>Original</span>
                                    <button
                                        onClick={() => setShowHeatmap(!showHeatmap)}
                                        className={`w-14 h-8 rounded-full p-1 transition-colors ${showHeatmap ? 'bg-purple-500' : 'bg-muted'}`}
                                    >
                                        <div className={`w-6 h-6 rounded-full bg-white shadow-sm transition-transform ${showHeatmap ? 'translate-x-6' : 'translate-x-0'}`} />
                                    </button>
                                    <span className={`text-sm font-bold flex items-center gap-2 ${showHeatmap ? 'text-purple-400' : 'text-muted-foreground'}`}>
                                        <Zap size={14} /> X-Ray Vision
                                    </span>
                                </div>
                            )}


                            {prediction && (
                                <motion.div
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="w-full max-w-lg bg-muted/50 border border-border rounded-2xl p-6"
                                >
                                    <div className="text-center mb-6">
                                        <p className="text-muted-foreground uppercase text-xs font-bold tracking-wider mb-2">Identification</p>
                                        <h3 className="text-4xl font-bold text-foreground mb-2">{prediction.prediction}</h3>
                                        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-green-500/10 text-success border border-green-500/20 text-sm">
                                            {(prediction.confidence * 100).toFixed(1)}% Confidence
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {prediction.all_results.slice(0, 3).map((res: { class: string; confidence: number }, i: number) => (
                                            <div key={i} className="flex items-center gap-4">
                                                <div className="w-24 text-right text-sm text-muted-foreground truncate">{res.class}</div>
                                                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-purple-500 rounded-full"
                                                        style={{ width: `${res.confidence * 100}%` }}
                                                    />
                                                </div>
                                                <div className="w-12 text-xs font-mono text-muted-foreground">{(res.confidence * 100).toFixed(0)}%</div>
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    )}
                </div>
            </motion.div>
        </div>
    );
};
