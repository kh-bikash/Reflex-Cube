import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, ChefHat, Clock, Flame, List, Camera, Type } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';

/** Shapes mirror the payload returned by `ChefCube.run()` in backend/app/cubes/chef.py. */
interface Suggestion {
    name: string;
    cuisine?: string;
    difficulty?: string;
    time?: string;
}

interface Recipe {
    title: string;
    description?: string;
    calories?: string;
    time?: string;
    ingredients?: string[];
    steps?: string[];
    tips?: string;
    image_url?: string;
}

interface ChefResult {
    status?: 'success' | 'error';
    message?: string;
    detected?: string[];
    analysis?: string;
    safety?: string | null;
    suggestions?: Suggestion[];
    recipe?: Recipe;
}

export const ChefCube = () => {
    const [image, setImage] = useState<string | null>(null);
    const [textInput, setTextInput] = useState('');
    const [analyzing, setAnalyzing] = useState(false);
    const [result, setResult] = useState<ChefResult | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setImage(reader.result as string);
            };
            reader.readAsDataURL(file);
        }
    };

    const handleAnalyze = async () => {
        if (!image && !textInput) return;
        setAnalyzing(true);
        try {
            // Mock call for now, but wired to backend
            const response = await api.post('/cubes/run', {
                cube_id: 'chef',
                input: { image: image, text: textInput } // Send both
            });
            setResult(response.data);
            toast.success("Recipe generated!");
        } catch (error) {
            toast.error("Failed to analyze fridge.");
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
            <div className="bg-background w-full h-full overflow-y-auto relative flex flex-col md:flex-row">

                {/* Left Panel: Input */}
                <div className="w-full md:w-1/2 p-8 border-b md:border-b-0 md:border-r border-border flex flex-col">
                    <div className="flex items-center gap-3 mb-6">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/20 flex items-center justify-center text-orange-400">
                            <ChefHat size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-foreground">Chef Cube</h2>
                            <p className="text-muted-foreground text-sm">Fridge-to-Recipe Engine</p>
                        </div>
                    </div>

                    <div className="flex-grow flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl bg-muted/50 min-h-[300px] relative overflow-hidden group mb-4">
                        {image ? (
                            <img src={image} alt="Fridge content" className="w-full h-full object-cover" />
                        ) : (
                            <div className="text-center p-6">
                                <Camera className="w-12 h-12 text-foreground/20 mx-auto mb-4" />
                                <p className="text-muted-foreground mb-4">Upload a photo of your fridge</p>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="px-6 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
                                >
                                    Select Photo
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

                        {analyzing && (
                            <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                                <div className="text-center">
                                    <div className="w-12 h-12 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                                    <p className="text-orange-400 font-mono text-sm animate-pulse">Scanning Ingredients...</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Text Input Alternative */}
                    {!image && !result && (
                        <div className="w-full relative mb-4">
                            <div className="absolute inset-x-0 top-0 -translate-y-1/2 flex justify-center">
                                <span className="bg-background px-2 text-foreground/20 text-xs uppercase bg-[#0f111a]">OR</span>
                            </div>
                            <div className="relative mt-2">
                                <input
                                    type="text"
                                    placeholder="Type ingredients (e.g. apple, milk)..."
                                    value={textInput}
                                    onChange={(e) => setTextInput(e.target.value)}
                                    className="w-full bg-muted/50 border border-border rounded-xl px-4 py-3 pl-10 text-foreground placeholder-white/30 focus:outline-none focus:border-orange-500 transition-colors"
                                />
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/30">
                                    <Type size={16} />
                                </div>
                            </div>
                        </div>
                    )}

                    {(image || textInput) && !analyzing && !result && (
                        <button
                            onClick={handleAnalyze}
                            className="w-full py-4 bg-card text-foreground font-bold rounded-xl shadow-xl hover:scale-[1.02] transition-transform flex items-center justify-center gap-2"
                        >
                            <Flame size={18} className="text-orange-600" />
                            Generate Recipe
                        </button>
                    )}
                </div>

                {/* Right Panel: Result */}
                <div className="w-full md:w-1/2 p-8 bg-background/20">
                    {result ? (
                        <motion.div
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="h-full flex flex-col"
                        >
                            {result.status === 'error' ? (
                                <div className="h-full flex flex-col items-center justify-center text-center">
                                    <div className="text-red-400 text-6xl mb-6">⚠️</div>
                                    <h3 className="text-2xl font-bold text-foreground mb-2">Oops!</h3>
                                    <p className="text-muted-foreground mb-6">{result.message || "Something went wrong."}</p>
                                    <button
                                        onClick={() => setResult(null)}
                                        className="px-6 py-2 bg-muted hover:bg-muted/80 rounded-full text-sm transition-colors"
                                    >
                                        Try Again
                                    </button>
                                </div>
                            ) : (
                                <>
                                    <div className="mb-6 bg-muted/50 p-4 rounded-xl border border-border">
                                        <h4 className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2 flex items-center gap-2">
                                            🔍 Chef's Analysis
                                        </h4>
                                        <p className="text-foreground/80 text-sm italic">"{result.analysis}"</p>
                                    </div>

                                    <h3 className="text-3xl font-display font-bold text-foreground mb-2">{result.recipe?.title}</h3>
                                    <p className="text-muted-foreground text-sm mb-4">{result.recipe?.description}</p>

                                    {result.recipe?.image_url && (
                                        <div className="mb-6 w-full">
                                            <img
                                                src={result.recipe.image_url}
                                                alt="AI Generated Dish"
                                                className="w-full h-auto rounded-xl shadow-lg border border-border"
                                                loading="eager"
                                                referrerPolicy="no-referrer"
                                            />
                                        </div>
                                    )}

                                    {/* Dish Metadata */}
                                    <div className="flex flex-wrap gap-4 mb-6">
                                        <div className="flex items-center gap-2 text-orange-400 bg-orange-500/10 px-3 py-1 rounded-lg text-sm">
                                            <Flame size={14} />
                                            <span>{result.recipe?.calories || "N/A"}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-blue-400 bg-blue-500/10 px-3 py-1 rounded-lg text-sm">
                                            <Clock size={14} />
                                            <span>{result.recipe?.time || "N/A"}</span>
                                        </div>
                                    </div>

                                    {/* Safety Warning */}
                                    {result.safety && result.safety !== "None" && (
                                        <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg flex items-start gap-3">
                                            <div className="text-red-400 text-lg">⚠️</div>
                                            <div>
                                                <h4 className="text-red-400 font-bold text-xs uppercase">Food Safety Check</h4>
                                                <p className="text-red-200/80 text-xs">{result.safety}</p>
                                            </div>
                                        </div>
                                    )}

                                    {/* Other Suggestions */}
                                    {result.suggestions && result.suggestions.length > 0 && (
                                        <div className="mb-6">
                                            <h4 className="text-muted-foreground text-xs font-bold uppercase tracking-wider mb-2">Other Ideas Considered</h4>
                                            <div className="flex flex-wrap gap-2">
                                                {result.suggestions.map((s: Suggestion, idx: number) => (
                                                    <span key={idx} className="px-3 py-1 bg-muted/50 border border-border rounded-full text-xs text-muted-foreground">
                                                        {s.name} ({s.time})
                                                    </span>
                                                ))}
                                            </div>
                                        </div>
                                    )}

                                    {/* Ingredients */}
                                    <div className="mb-6">
                                        <h4 className="text-muted-foreground text-sm font-bold uppercase tracking-wider mb-3">Detected Ingredients</h4>
                                        <div className="flex flex-wrap gap-2">
                                            {result.recipe?.ingredients?.map((ing: string) => (
                                                <span key={ing} className="px-2 py-1 bg-muted rounded-md text-sm text-foreground/80">{ing}</span>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Steps */}
                                    <div className="flex-grow overflow-y-auto pr-2 custom-scrollbar">
                                        <h4 className="text-muted-foreground text-sm font-bold uppercase tracking-wider mb-4 flex items-center gap-2">
                                            <List size={14} /> Instructions
                                        </h4>
                                        <div className="space-y-6">
                                            {result.recipe?.steps?.map((step: string, i: number) => (
                                                <div key={i} className="flex gap-4 group">
                                                    <span className="w-8 h-8 rounded-full bg-orange-500/20 text-orange-400 flex-shrink-0 flex items-center justify-center text-sm font-bold group-hover:bg-orange-500 group-hover:text-white transition-colors">
                                                        {i + 1}
                                                    </span>
                                                    <p className="text-foreground/80 leading-relaxed text-sm pt-1 border-b border-border pb-4 w-full">{step}</p>
                                                </div>
                                            ))}
                                        </div>

                                        {result.recipe?.tips && (
                                            <div className="mt-8 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                                <h4 className="text-emerald-400 font-bold text-xs uppercase mb-2">Chef's Secret Tip</h4>
                                                <p className="text-emerald-100/80 text-sm italic">"{result.recipe.tips}"</p>
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </motion.div>
                    ) : (
                        <div className="h-full flex flex-col items-center justify-center text-foreground/20">
                            <ChefHat className="w-24 h-24 mb-4 opacity-20" />
                            <p className="text-lg">Your personal AI Chef is ready.</p>
                            <p className="text-sm">Upload a photo to start cooking.</p>
                        </div>
                    )}
                </div>
            </div>
        </motion.div >
    );
};
