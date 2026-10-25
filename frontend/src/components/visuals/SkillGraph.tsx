import { motion } from "framer-motion";
import { useRef, useState, useEffect } from "react";
import { useUISound } from "../../hooks/useUISound";

const skills = [
    { id: "root", label: "Orchestrator", x: 50, y: 50, type: "trigger" },
    { id: "fe", label: "Interface", x: 75, y: 20, type: "action" },
    { id: "be", label: "Neural Engine", x: 75, y: 80, type: "action" },
    { id: "ai", label: "Agents", x: 25, y: 50, type: "trigger" },
    { id: "react", label: "Dashboard", x: 90, y: 10, type: "item" },
    { id: "three", label: "Visualization", x: 90, y: 30, type: "item" },
    { id: "node", label: "Processing", x: 90, y: 70, type: "item" },
    { id: "db", label: "Memory", x: 90, y: 90, type: "item" },
];

const connections = [
    { from: "ai", to: "root" },
    { from: "root", to: "fe" },
    { from: "root", to: "be" },
    { from: "fe", to: "react" },
    { from: "fe", to: "three" },
    { from: "be", to: "node" },
    { from: "be", to: "db" },
];

export const SkillGraph = () => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [dimensions, setDimensions] = useState({ w: 0, h: 0 });
    const { playHover } = useUISound();

    useEffect(() => {
        if (containerRef.current) {
            setDimensions({
                w: containerRef.current.offsetWidth,
                h: containerRef.current.offsetHeight,
            });
        }
    }, []);

    return (
        <section className="relative py-32 bg-background/50 backdrop-blur-sm z-10 overflow-hidden">
            <div className="container mx-auto px-6 mb-12 text-center">
                <h2 className="text-4xl md:text-6xl font-bold mb-4 text-foreground">
                    Integrated <span className="text-primary">Workflow</span>
                </h2>
                <p className="text-muted-foreground max-w-2xl mx-auto">
                    Visualize your tech stack as a seamless node execution graph.
                </p>
            </div>

            <div ref={containerRef} className="relative w-full h-[600px] border-y border-border">
                <svg className="absolute inset-0 w-full h-full pointer-events-none">
                    {connections.map((conn, i) => {
                        const start = skills.find((s) => s.id === conn.from)!;
                        const end = skills.find((s) => s.id === conn.to)!;

                        const x1 = (start.x / 100) * dimensions.w;
                        const y1 = (start.y / 100) * dimensions.h;
                        const x2 = (end.x / 100) * dimensions.w;
                        const y2 = (end.y / 100) * dimensions.h;

                        return (
                            <motion.path
                                key={i}
                                initial={{ pathLength: 0, opacity: 0 }}
                                whileInView={{ pathLength: 1, opacity: 1 }}
                                transition={{ duration: 1.5, delay: 0.5 + i * 0.1 }}
                                d={`M ${x1} ${y1} C ${x1 + 100} ${y1}, ${x2 - 100} ${y2}, ${x2} ${y2}`}
                                fill="none"
                                stroke="url(#gradient-line)"
                                strokeWidth="2"
                            />
                        );
                    })}
                    <defs>
                        <linearGradient id="gradient-line" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#3B82F6" />
                            <stop offset="100%" stopColor="#8B5CF6" />
                        </linearGradient>
                    </defs>
                </svg>

                {skills.map((skill, i) => (
                    <motion.div
                        key={skill.id}
                        onMouseEnter={() => playHover()}
                        className={`absolute transform -translate-x-1/2 -translate-y-1/2 px-6 py-3 rounded-xl border border-border shadow-sm backdrop-blur-md cursor-pointer hover:border-primary/50 transition-colors
              ${skill.type === 'trigger' ? 'bg-primary/10' : 'bg-card'}
            `}
                        style={{
                            left: `${skill.x}%`,
                            top: `${skill.y}%`,
                        }}
                        whileHover={{ scale: 1.1 }}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`w-3 h-3 rounded-full ${skill.type === 'trigger' ? 'bg-primary' : 'bg-secondary'}`} />
                            <span className="text-foreground font-mono font-medium">{skill.label}</span>
                        </div>
                        {/* Fake connection points */}
                        <div className="absolute -right-1 top-1/2 w-2 h-2 bg-gray-500 rounded-full -translate-y-1/2" />
                        <div className="absolute -left-1 top-1/2 w-2 h-2 bg-gray-500 rounded-full -translate-y-1/2" />
                    </motion.div>
                ))}
            </div>
        </section>
    );
};
