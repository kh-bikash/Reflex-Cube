import { useState } from 'react';
import { api } from '../../lib/api';
import { motion } from 'framer-motion';
import { Map, Calendar, DollarSign, Coffee, Navigation } from 'lucide-react';

interface Activity {
    time: string;
    title: string;
    desc: string;
    cost: string;
}

interface DayPlan {
    day: number;
    theme: string;
    activities: Activity[];
}

interface TravelResult {
    destination_name: string;
    tagline: string;
    total_budget_est: string;
    best_time: string;
    days: DayPlan[];
    local_tips: string[];
}

export default function TravelCube() {
    const [destination, setDestination] = useState("");
    const [vibe] = useState("Balanced");
    const [budget] = useState("Mid-Range");
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<TravelResult | null>(null);

    const generateItinerary = async () => {
        if (!destination) return;
        setLoading(true);
        try {
            const response = await api.post('/cubes/run', {
                cube_id: 'travel',
                input: { destination, vibe, budget }
            });
            const data = response.data;
            if (data.status === 'success') setResult(data.data);
            else alert(data.message);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full w-full bg-card text-foreground p-8 overflow-y-auto font-sans relative">
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-10 pointer-events-none" />

            <header className="relative z-10 max-w-5xl mx-auto flex flex-col md:flex-row justify-between items-center mb-12 border-b border-border pb-8">
                <div className="flex items-center gap-4 mb-4 md:mb-0">
                    <div className="p-3 bg-sky-500 rounded-2xl shadow-lg shadow-sky-500/20">
                        <Map className="text-foreground" size={32} />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight">Travel Guide</h1>
                        <p className="text-sky-400 font-mono text-sm">AI CONCIERGE</p>
                    </div>
                </div>

                {!result && !loading && (
                    <div className="flex bg-muted/50 p-2 rounded-2xl border border-border backdrop-blur-sm">
                        <input
                            value={destination}
                            onChange={(e) => setDestination(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && generateItinerary()}
                            placeholder="Where to? (e.g. Tokyo)"
                            className="bg-transparent border-none outline-none px-4 py-2 w-64 text-foreground placeholder-white/30"
                        />
                        <button
                            onClick={generateItinerary}
                            className="bg-sky-500 hover:bg-sky-400 text-foreground px-6 py-2 rounded-xl font-bold transition-transform active:scale-95"
                        >
                            Fly
                        </button>
                    </div>
                )}
            </header>

            {loading && (
                <div className="flex flex-col items-center justify-center h-[50vh]">
                    <motion.div
                        animate={{ y: [0, -20, 0] }}
                        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                        <Navigation className="w-24 h-24 text-sky-500 rotate-45 mb-8" />
                    </motion.div>
                    <h2 className="text-2xl font-bold mb-2">Charting Course...</h2>
                    <p className="text-muted-foreground">Calculating distances • Checking weather • Booking mental flight</p>
                </div>
            )}

            {result && !loading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-6xl mx-auto">
                    {/* Destination Hero */}
                    <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-sky-900 to-indigo-900 p-8 md:p-12 mb-8 border border-border">
                        <div className="absolute top-0 right-0 p-12 opacity-10">
                            <Map size={300} />
                        </div>
                        <h2 className="text-5xl md:text-7xl font-bold mb-2 tracking-tighter">{result.destination_name}</h2>
                        <p className="text-xl text-sky-200 italic mb-8">"{result.tagline}"</p>

                        <div className="flex flex-wrap gap-4">
                            <span className="bg-background/30 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 border border-border">
                                <DollarSign size={16} className="text-success" /> {result.total_budget_est}
                            </span>
                            <span className="bg-background/30 backdrop-blur-md px-4 py-2 rounded-full flex items-center gap-2 border border-border">
                                <Calendar size={16} className="text-orange-400" /> Best Time: {result.best_time}
                            </span>
                        </div>
                    </div>

                    {/* Itinerary Grid */}
                    <div className="grid md:grid-cols-3 gap-6 mb-8">
                        {result.days.map((day, i) => (
                            <motion.div
                                key={day.day}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.1 }}
                                className="bg-[#1E293B] rounded-2xl p-6 border border-border hover:border-sky-500/30 transition-colors"
                            >
                                <div className="flex items-center justify-between mb-4 border-b border-border pb-4">
                                    <h3 className="text-2xl font-bold text-sky-400">Day {day.day}</h3>
                                    <span className="text-xs font-mono text-foreground/50 uppercase tracking-widest">{day.theme}</span>
                                </div>
                                <div className="space-y-6">
                                    {day.activities.map((act, j) => (
                                        <div key={j} className="relative pl-6 border-l border-border">
                                            <div className={`absolute left-[-5px] top-0 w-2.5 h-2.5 rounded-full ${act.time === 'Morning' ? 'bg-yellow-400' : act.time === 'Afternoon' ? 'bg-orange-400' : 'bg-indigo-400'}`} />
                                            <p className="text-xs text-muted-foreground font-bold uppercase mb-1">{act.time}</p>
                                            <h4 className="font-bold text-lg mb-1">{act.title}</h4>
                                            <p className="text-sm text-foreground/70 mb-2 leading-relaxed">{act.desc}</p>
                                            <span className="text-xs bg-muted/50 px-2 py-1 rounded text-foreground/50">{act.cost}</span>
                                        </div>
                                    ))}
                                </div>
                            </motion.div>
                        ))}
                    </div>

                    {/* Local Tips */}
                    <div className="bg-sky-900/10 border border-sky-500/20 rounded-2xl p-6">
                        <h3 className="font-bold text-sky-400 mb-4 flex items-center gap-2">
                            <Coffee size={20} /> Local Secrets
                        </h3>
                        <ul className="grid md:grid-cols-2 gap-4">
                            {result.local_tips.map((tip, i) => (
                                <li key={i} className="flex items-start gap-3 text-sm text-foreground/80">
                                    <span className="text-sky-500 mt-1">•</span> {tip}
                                </li>
                            ))}
                        </ul>
                    </div>
                </motion.div>
            )}
        </div>
    );
}
