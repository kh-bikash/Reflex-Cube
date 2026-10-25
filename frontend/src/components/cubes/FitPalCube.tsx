import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dumbbell, Camera, Activity, PlayCircle, Plus, X, Upload } from 'lucide-react';
import { api } from '../../lib/api';

interface Exercise {
    name: string;
    sets: number;
    reps: string;
    rest: string;
    notes: string;
}

interface WorkoutPlan {
    workout_name: string;
    duration_minutes: number;
    equipment_used: string[];
    warmup: { name: string; duration: string; notes?: string }[];
    main_circuit: Exercise[];
    cooldown: { name: string; duration: string }[];
    coach_tip: string;
}

export default function FitPalCube() {
    // State
    const [step, setStep] = useState(1); // 1: Input, 2: Loading, 3: Result
    const [equipmentList, setEquipmentList] = useState<string[]>([]);
    const [currentInput, setCurrentInput] = useState("");
    const [goal, setGoal] = useState("Hypertrophy (Build Muscle)");
    const [experience, setExperience] = useState("Intermediate");
    const [result, setResult] = useState<WorkoutPlan | null>(null);
    const [selectedImage, setSelectedImage] = useState<string | null>(null);

    // Common equipment for quick add
    const commonGear = ["Dumbbells", "Barbell", "Bench", "Pull-up Bar", "Kettlebell", "Resistance Bands"];

    const addEquipment = (item: string) => {
        if (item && !equipmentList.includes(item)) {
            setEquipmentList([...equipmentList, item]);
            setCurrentInput("");
        }
    };

    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                setSelectedImage(ev.target?.result as string);
                // Simulate AI Vision for now (In real app, we'd send image to backend to extract items)
                // For MVP: We'll just assume they have some basics if they upload a gym pic, 
                // or prompt them to confirm.
                setEquipmentList(prev => [...prev, "Dumbbells", "Bench"]);
            };
            reader.readAsDataURL(file);
        }
    };

    const generateWorkout = async () => {
        if (equipmentList.length === 0) {
            alert("Please add at least one piece of equipment (or 'Bodyweight').");
            return;
        }
        setStep(2);
        try {
            const res = await api.post('/cubes/run', {
                cube_id: 'fitpal',
                input: {
                    equipment: equipmentList, // Backend handles list
                    goal: goal,
                    experience: experience
                }
            });
            const data = res.data;
            if (data.status === 'success') {
                setResult(data.data);
                setStep(3);
            } else {
                alert("Error: " + data.message);
                setStep(1);
            }
        } catch (e) {
            console.error(e);
            setStep(1);
        }
    };

    return (
        <div className="h-full w-full bg-[#121212] text-foreground p-8 overflow-y-auto font-sans">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8 pb-6 border-b border-border">
                <div className="bg-orange-500 p-3 rounded-xl">
                    <Dumbbell className="text-foreground" size={32} />
                </div>
                <div>
                    <h1 className="text-4xl font-black italic uppercase tracking-wider">FitPal</h1>
                    <p className="text-orange-500 font-mono text-sm">AI PERSONAL TRAINER</p>
                </div>
            </div>

            {/* STEP 1: INPUT */}
            {step === 1 && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-4xl mx-auto">
                    <div className="grid md:grid-cols-2 gap-8">
                        {/* Equipment Section */}
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold uppercase italic">1. Gear Check</h2>

                            {/* Photo Upload (Vision Simulation) */}
                            <div className="border-2 border-dashed border-border rounded-2xl p-6 text-center hover:bg-muted/50 transition-colors relative overflow-hidden group">
                                <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImageUpload} />
                                <Camera className="mx-auto mb-2 text-foreground/50 group-hover:text-orange-500 transition-colors" />
                                <p className="text-sm text-muted-foreground">Upload Gym Photo (Auto-Detect)</p>
                                {selectedImage && <img src={selectedImage} className="absolute inset-0 w-full h-full object-cover opacity-50" />}
                            </div>

                            {/* Manual Entry */}
                            <div>
                                <div className="flex gap-2 mb-4">
                                    <input
                                        value={currentInput}
                                        onChange={(e) => setCurrentInput(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && addEquipment(currentInput)}
                                        placeholder="Add equipment (e.g. 'Kettlebell')"
                                        className="flex-1 bg-muted border-none rounded-lg px-4 py-2 focus:ring-2 focus:ring-orange-500 outline-none"
                                    />
                                    <button onClick={() => addEquipment(currentInput)} className="bg-muted p-2 rounded-lg hover:bg-muted/80"><Plus /></button>
                                </div>
                                <div className="flex flex-wrap gap-2 mb-4">
                                    {commonGear.map(item => (
                                        <button key={item} onClick={() => addEquipment(item)} className="px-3 py-1 rounded-full text-xs border border-border hover:border-orange-500 transition-colors">
                                            + {item}
                                        </button>
                                    ))}
                                </div>
                                {/* Selected List */}
                                <div className="flex flex-wrap gap-2">
                                    {equipmentList.map(item => (
                                        <span key={item} className="bg-orange-500 text-white px-3 py-1 rounded-full text-sm font-bold flex items-center gap-2">
                                            {item} <X size={14} className="cursor-pointer hover:text-foreground" onClick={() => setEquipmentList(l => l.filter(i => i !== item))} />
                                        </span>
                                    ))}
                                    {equipmentList.length === 0 && <p className="text-foreground/30 text-sm italic">No equipment added yet.</p>}
                                </div>
                            </div>
                        </div>

                        {/* Settings Section */}
                        <div className="space-y-6">
                            <h2 className="text-2xl font-bold uppercase italic">2. Goal Setting</h2>
                            <div>
                                <label className="block text-sm text-foreground/50 mb-2">Primary Goal</label>
                                <select
                                    value={goal}
                                    onChange={(e) => setGoal(e.target.value)}
                                    className="w-full bg-muted p-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-orange-500"
                                >
                                    <option>Hypertrophy (Build Muscle)</option>
                                    <option>Strength (Powerlifting)</option>
                                    <option>Endurance (Fat Loss)</option>
                                    <option>Mobility & Recovery</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-foreground/50 mb-2">Experience Level</label>
                                <select
                                    value={experience}
                                    onChange={(e) => setExperience(e.target.value)}
                                    className="w-full bg-muted p-3 rounded-xl border-none outline-none focus:ring-2 focus:ring-orange-500"
                                >
                                    <option>Beginner</option>
                                    <option>Intermediate</option>
                                    <option>Advanced</option>
                                </select>
                            </div>

                            <button
                                onClick={generateWorkout}
                                className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black italic uppercase py-4 rounded-xl text-xl tracking-wider transition-all transform hover:scale-[1.02] shadow-xl shadow-orange-500/20 mt-8"
                            >
                                Generate Input
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}

            {/* STEP 2: LOADING */}
            {step === 2 && (
                <div className="flex flex-col items-center justify-center h-[50vh]">
                    <Activity className="w-24 h-24 text-orange-500 animate-bounce mb-8" />
                    <h2 className="text-3xl font-black italic uppercase">Building Routine...</h2>
                    <p className="text-foreground/50 font-mono mt-2">ANALYZING EQUIPMENT • CALCULATING LOAD • OPTIMIZING REST</p>
                </div>
            )}

            {/* STEP 3: RESULT */}
            {step === 3 && result && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-5xl mx-auto">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <span className="bg-orange-500/20 text-orange-400 px-3 py-1 rounded text-xs font-mono mb-2 inline-block">
                                {result.duration_minutes} MINUTES
                            </span>
                            <h2 className="text-4xl font-black italic uppercase mb-2">{result.workout_name}</h2>
                            <p className="text-muted-foreground text-lg">"{result.coach_tip}"</p>
                        </div>
                        <button onClick={() => setStep(1)} className="text-muted-foreground hover:text-foreground underline text-sm">New Workout</button>
                    </div>

                    <div className="grid md:grid-cols-3 gap-8">
                        {/* Main Workout List */}
                        <div className="md:col-span-2 space-y-4">
                            {/* Warmup */}
                            <div className="bg-muted/50 rounded-2xl p-6 border border-border">
                                <h3 className="text-xl font-bold text-orange-500 mb-4 uppercase">Warm Up</h3>
                                {(result.warmup || []).map((ex, i) => (
                                    <div key={i} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                                        <span className="font-bold">{ex.name}</span>
                                        <span className="text-foreground/50 text-sm mono">{ex.duration}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Main Circuit */}
                            <div className="bg-muted/50 rounded-2xl p-6 border border-2 border-orange-500/20 relative overflow-hidden">
                                <div className='absolute top-0 right-0 p-4 opacity-5'><Dumbbell size={100} /></div>
                                <h3 className="text-xl font-bold text-orange-500 mb-6 uppercase">Main Lift</h3>
                                <div className="space-y-6">
                                    {(result.main_circuit || []).map((ex, i) => (
                                        <div key={i} className="bg-background/20 rounded-xl p-4 hover:bg-background/40 transition-colors">
                                            <div className='flex justify-between items-start mb-2'>
                                                <h4 className='text-lg font-bold'>{ex.name}</h4>
                                                <div className='text-right'>
                                                    <div className='text-orange-400 font-black text-xl'>{ex.sets} X {ex.reps}</div>
                                                    <div className='text-xs text-muted-foreground font-mono'>Rest: {ex.rest}</div>
                                                </div>
                                            </div>
                                            <p className='text-sm text-muted-foreground italic border-l-2 border-border pl-3'>{ex.notes}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Sidebar */}
                        <div className="space-y-4">
                            <div className="bg-muted/50 rounded-2xl p-6 border border-border">
                                <h3 className="text-sm font-bold text-foreground/50 mb-4 uppercase tracking-widest">Cooldown</h3>
                                {(result.cooldown || []).map((ex, i) => (
                                    <div key={i} className="flex justify-between items-center py-2 border-b border-border last:border-0">
                                        <span className="text-sm">{ex.name}</span>
                                        <span className="text-foreground/50 text-xs mono">{ex.duration}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="bg-muted/50 rounded-2xl p-6 border border-border">
                                <h3 className="text-sm font-bold text-foreground/50 mb-4 uppercase tracking-widest">Equipment</h3>
                                <div className="flex flex-wrap gap-2">
                                    {(result.equipment_used || []).map(item => (
                                        <span key={item} className="text-xs border border-border rounded px-2 py-1 text-foreground/70">{item}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
