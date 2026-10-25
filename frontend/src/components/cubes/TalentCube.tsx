import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Briefcase, FileText, Users, CheckCircle, XCircle, AlertTriangle, Brain, Search, Award, Upload, Zap, Database, ArrowRight } from 'lucide-react';
import { api } from '../../lib/api';

interface Candidate {
    name?: string;
    score: number;
    decision: 'HIRE' | 'REJECT' | 'MAYBE';
    reasoning: string;
}

/** Criteria set extracted from a job description by the talent cube's `train` action. */
interface RoleCriterion {
    name: string;
    weight: number;
    description?: string;
}

interface RoleModel {
    role_title?: string;
    summary?: string;
    criteria?: RoleCriterion[];
}

export default function TalentCube() {
    // Mode: 'setup' | 'pipeline'
    const [view, setView] = useState<'setup' | 'pipeline'>('setup');
    const [jdData, setJdData] = useState('');
    const [loading, setLoading] = useState(false);

    // "Trained" Model State
    const [roleModel, setRoleModel] = useState<RoleModel | null>(null);

    // Candidates
    const [candidatesInput, setCandidatesInput] = useState('');
    const [pipeline, setPipeline] = useState<Candidate[]>([]);

    const handleTrainModel = async () => {
        if (!jdData.trim()) return;
        setLoading(true);
        try {
            const res = await api.post('/cubes/run', {
                cube_id: 'talent',
                input: { mode: 'train_role', job_description: jdData }
            });
            const json = res.data;
            if (json.status === 'success') {
                setRoleModel(json.data);
                setView('pipeline');
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleBatchScreen = async () => {
        if (!candidatesInput.trim()) return;
        setLoading(true);

        // Split by double newline or delimiter
        const resumes = candidatesInput.split(/\n\s*\n/).filter(x => x.length > 50);

        try {
            const res = await api.post('/cubes/run', {
                cube_id: 'talent',
                input: {
                    mode: 'batch_screen',
                    criteria: roleModel,
                    candidates: resumes
                }
            });
            const json = res.data;
            if (json.status === 'success') {
                setPipeline(prev => [...prev, ...json.data.results]);
                setCandidatesInput(''); // clear input
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="h-full w-full bg-surface text-foreground font-sans flex flex-col overflow-hidden">
            {/* Header */}
            <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6 shrink-0 z-10 shadow-sm">
                <div className="flex items-center gap-3">
                    <div className="bg-indigo-600 p-2 rounded-lg text-white shadow-lg shadow-indigo-600/20">
                        <Users size={20} />
                    </div>
                    <div>
                        <h1 className="font-bold text-lg tracking-tight text-foreground">THE HEADHUNTER <span className="text-xs ml-2 px-2 py-0.5 rounded bg-indigo-100 text-indigo-700">ENTERPRISE</span></h1>
                        <p className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider">
                            {roleModel ? `Active Model: ${roleModel.role_title}` : 'No Model Loaded'}
                        </p>
                    </div>
                </div>

                {roleModel && (
                    <div className="flex gap-2">
                        <button
                            onClick={() => setView('setup')}
                            className="px-4 py-2 text-xs font-bold text-muted-foreground hover:text-foreground"
                        >
                            NEW ROLE
                        </button>
                    </div>
                )}
            </header>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative">

                {/* 1. SETUP / TRAIN */}
                {view === 'setup' && (
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        className="h-full flex flex-col items-center justify-center p-8 max-w-3xl mx-auto"
                    >
                        <div className="w-full bg-card rounded-xl shadow-xl border border-border p-8">
                            <h2 className="text-2xl font-bold text-foreground mb-2 flex items-center gap-2">
                                <Database className="text-indigo-600" /> Train Retrieval Model
                            </h2>
                            <p className="text-muted-foreground mb-6">
                                Paste a Job Description to fine-tune the screening criteria.
                                The system will extract weights and keywords for batch processing.
                            </p>

                            <textarea
                                value={jdData}
                                onChange={(e) => setJdData(e.target.value)}
                                className="w-full h-48 bg-surface border border-border rounded-lg p-4 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 mb-6"
                                placeholder="Paste Job Description (JD) here..."
                            />

                            <button
                                onClick={handleTrainModel}
                                disabled={loading || !jdData}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow-lg shadow-indigo-600/20 transition-all flex items-center justify-center gap-2"
                            >
                                {loading ? <Zap className="animate-spin" /> : <Zap />}
                                {loading ? 'TRAINING MODEL...' : 'COMPILE ROLE MODEL'}
                            </button>
                        </div>
                    </motion.div>
                )}

                {/* 2. PIPELINE / DASHBOARD */}
                {view === 'pipeline' && (
                    <div className="h-full flex flex-col">
                        {/* Metrics Bar */}
                        <div className="bg-card border-b border-border p-4 flex gap-4 shrink-0">
                            <div className="flex-1 bg-surface rounded-lg p-3 border border-border">
                                <span className="text-xs font-bold text-muted-foreground uppercase">Total Candidates</span>
                                <div className="text-2xl font-bold text-muted-foreground">{pipeline.length}</div>
                            </div>
                            <div className="flex-1 bg-green-50 rounded-lg p-3 border border-green-100">
                                <span className="text-xs font-bold text-green-600 uppercase">Top Talent (HIRE)</span>
                                <div className="text-2xl font-bold text-green-700">
                                    {pipeline.filter(p => p.decision === 'HIRE').length}
                                </div>
                            </div>
                        </div>

                        <div className="flex-1 flex overflow-hidden">
                            {/* Input Sidebar */}
                            <div className="w-1/3 min-w-[300px] border-r border-border bg-card p-4 flex flex-col z-10 transition-transform">
                                <h3 className="font-bold text-sm text-muted-foreground mb-2 flex items-center gap-2">
                                    <Upload size={16} /> Batch Upload
                                </h3>
                                <p className="text-xs text-muted-foreground mb-4">
                                    Paste multiple resumes separated by double newlines.
                                </p>
                                <textarea
                                    value={candidatesInput}
                                    onChange={(e) => setCandidatesInput(e.target.value)}
                                    className="flex-1 bg-surface border border-border rounded-lg p-3 text-xs font-mono resize-none mb-4 focus:ring-2 focus:ring-indigo-500/20"
                                    placeholder="Paste Resume 1...&#10;&#10;Paste Resume 2...&#10;&#10;Paste Resume 3..."
                                />
                                <button
                                    onClick={handleBatchScreen}
                                    disabled={loading || !candidatesInput}
                                    className="w-full bg-card hover:bg-background text-foreground font-bold py-3 rounded-lg flex items-center justify-center gap-2"
                                >
                                    {loading ? 'PROCESSING...' : `PROCESS BATCH`}
                                </button>
                            </div>

                            {/* Results Table */}
                            <div className="flex-1 bg-surface overflow-auto p-6">
                                {pipeline.length === 0 ? (
                                    <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
                                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4">
                                            <Search size={24} />
                                        </div>
                                        <p>Pipeline is empty.</p>
                                        <p className="text-sm">Upload candidates to start screening.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {pipeline.map((p, i) => (
                                            <motion.div
                                                key={i}
                                                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                                                className="bg-card rounded-lg shadow-sm border border-border p-4 flex items-center gap-6 hover:shadow-md transition-shadow"
                                            >
                                                <div
                                                    className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-foreground shrink-0 ${p.score > 80 ? 'bg-green-500' : p.score > 50 ? 'bg-amber-400' : 'bg-red-500'
                                                        }`}
                                                >
                                                    {p.score}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex justify-between items-center mb-1">
                                                        <h4 className="font-bold text-lg text-foreground">{p.name || 'Unknown Candidate'}</h4>
                                                        <span className={`text-xs font-bold px-2 py-1 rounded border ${p.decision === 'HIRE' ? 'bg-green-50 text-green-700 border-green-200' :
                                                                p.decision === 'REJECT' ? 'bg-red-50 text-red-700 border-red-200' :
                                                                    'bg-amber-50 text-amber-700 border-amber-200'
                                                            }`}>
                                                            {p.decision}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-muted-foreground">{p.reasoning}</p>
                                                </div>
                                                <button className="text-muted-foreground hover:text-indigo-600">
                                                    <ArrowRight size={20} />
                                                </button>
                                            </motion.div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
