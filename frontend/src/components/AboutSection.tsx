import { motion } from "framer-motion";
import { cn } from "../lib/utils";

const features = [
    {
        title: "AI-First Architecture",
        description: "Built from the ground up for autonomous agent orchestration.",
        className: "col-span-1 md:col-span-2 lg:col-span-3",
    },
    {
        title: "Neural Networks",
        description: "Advanced model training visualization and management.",
        className: "col-span-1 md:col-span-1 lg:col-span-1",
    },
    {
        title: "Real-time Metrics",
        description: "Live performance tracking and loss function monitoring.",
        className: "col-span-1 md:col-span-1 lg:col-span-1",
    },
    {
        title: "Global Edge Network",
        description: "Deploy models instantly to 35+ regions worldwide.",
        className: "col-span-1 md:col-span-2 lg:col-span-2",
    },
];

export const AboutSection = () => {
    return (
        <section className="relative z-10 py-32 px-4 md:px-8 max-w-7xl mx-auto">
            <div className="mb-20">
                <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    className="text-4xl md:text-6xl font-bold font-display tracking-tight mb-6"
                >
                    Redefining Intelligence.
                </motion.h2>
                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.1 }}
                    className="text-xl text-muted-foreground max-w-2xl font-light"
                >
                    We build the infrastructure for the next generation of AI models.
                    Powerful, scalable, and beautifully designed.
                </motion.p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[200px]">
                {features.map((feature, i) => (
                    <motion.div
                        key={i}
                        initial={{ opacity: 0, scale: 0.95 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.1 }}
                        className={cn(
                            "group relative overflow-hidden rounded-3xl bg-card border border-border p-8 hover:bg-muted/50 transition-colors shadow-sm",
                            feature.className
                        )}
                    >
                        <div className="relative z-10 h-full flex flex-col justify-between">
                            <h3 className="text-2xl font-bold font-display text-foreground">{feature.title}</h3>
                            <p className="text-muted-foreground">{feature.description}</p>
                        </div>
                        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                    </motion.div>
                ))}
            </div>
        </section>
    );
};
