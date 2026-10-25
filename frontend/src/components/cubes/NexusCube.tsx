import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Brain, Send, MessageSquare, Database, Sparkles } from 'lucide-react';
import { api } from '../../lib/api';
import { toast } from 'sonner';

interface Message {
    role: 'user' | 'assistant';
    content: string;
}

export const NexusCube = () => {
    const [messages, setMessages] = useState<Message[]>([
        { role: 'assistant', content: "Hello. I am your Second Brain. Tell me something you want me to remember." }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const [memorySize, setMemorySize] = useState(0);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim()) return;

        const userMsg: Message = { role: 'user', content: input };
        setMessages(prev => [...prev, userMsg]);
        setInput('');
        setLoading(true);

        try {
            const response = await api.post('/cubes/run', {
                cube_id: 'nexus',
                input: { text: userMsg.content }
            });

            if (response.data.status === 'error') {
                toast.error("Memory Access Error");
            } else {
                const botMsg: Message = { role: 'assistant', content: response.data.reply };
                setMessages(prev => [...prev, botMsg]);
                setMemorySize(response.data.memory_size);
            }
        } catch (error) {
            toast.error("Failed to connect to Nexus.");
            console.error(error);
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
            <div className="bg-background w-full h-full relative overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-border flex items-center justify-between bg-background/40">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center text-indigo-400">
                            <Brain size={24} />
                        </div>
                        <div>
                            <h2 className="text-2xl font-bold text-foreground">Nexus Cube</h2>
                            <div className="flex items-center gap-2 text-muted-foreground text-xs font-mono">
                                <span className={`w-2 h-2 rounded-full ${loading ? 'bg-indigo-400 animate-pulse' : 'bg-green-500'}`}></span>
                                {loading ? "PROCESSING..." : "ACTIVE MEMORY"}
                                <span className="text-foreground/20">|</span>
                                <Database size={12} />
                                <span>{memorySize} ITEMS STORED</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Chat Area */}
                <div className="flex-grow overflow-y-auto p-6 space-y-6 custom-scrollbar bg-gradient-to-b from-black/20 to-indigo-900/5 relative" ref={scrollRef}>
                    {/* Background decoration */}
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center opacity-5">
                        <Brain size={300} />
                    </div>

                    {messages.map((msg, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                        >
                            <div className={`max-w-[80%] rounded-2xl p-4 border ${msg.role === 'user'
                                    ? 'bg-indigo-600 text-white border-indigo-500'
                                    : 'bg-muted/50 text-foreground/90 border-border'
                                }`}>
                                <div className="flex items-center gap-2 mb-1 text-xs font-bold opacity-50 uppercase tracking-wider">
                                    {msg.role === 'user' ? 'You' : 'Nexus'}
                                </div>
                                <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            </div>
                        </motion.div>
                    ))}

                    {loading && (
                        <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex justify-start"
                        >
                            <div className="bg-muted/50 rounded-2xl p-4 border border-border flex items-center gap-2">
                                <Sparkles size={16} className="text-indigo-400 animate-pulse" />
                                <span className="text-sm text-indigo-300">Thinking...</span>
                            </div>
                        </motion.div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-6 border-t border-border bg-background/40">
                    <div className="relative">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="Tell me a fact, or ask me what I know..."
                            className="w-full bg-muted/50 border border-border rounded-xl pl-6 pr-14 py-4 text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-indigo-500/50 transition-colors font-medium"
                            disabled={loading}
                        />
                        <button
                            onClick={handleSend}
                            disabled={loading || !input.trim()}
                            className="absolute right-2 top-2 p-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors disabled:opacity-50 disabled:bg-transparent"
                        >
                            <Send size={20} />
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>
    );
};
