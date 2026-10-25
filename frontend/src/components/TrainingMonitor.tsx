import React, { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { streamTrainingLog } from "../lib/api";

interface LossPoint {
  step: number;
  loss: number;
}

interface TrainingMonitorProps {
  jobId: string;
  className?: string;
}

/**
 * Live loss curve for a training job.
 *
 * Reads the same SSE stream as the log terminal, keeping only the points that
 * carry a loss value.
 */
const TrainingMonitor: React.FC<TrainingMonitorProps> = ({ jobId, className = "" }) => {
  const [points, setPoints] = useState<LossPoint[]>([]);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    setPoints([]);
    setFinished(false);

    return streamTrainingLog(jobId, {
      onEvent: (event) => {
        if (typeof event.loss !== "number" || typeof event.step !== "number") return;
        setPoints((prev) => [...prev, { step: event.step as number, loss: event.loss as number }]);
      },
      onEnd: () => setFinished(true),
      onError: () => setFinished(true),
    });
  }, [jobId]);

  const latest = points.at(-1);
  // A fixed domain would flatten the curve once loss drops; pad the observed
  // range instead so the shape stays readable throughout the run.
  const domain = useMemo<[number, number]>(() => {
    if (!points.length) return [0, 1];
    const values = points.map((p) => p.loss);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const pad = (max - min) * 0.1 || 0.1;
    return [Math.max(0, min - pad), max + pad];
  }, [points]);

  return (
    <div className={`rounded-lg border border-border bg-card p-4 ${className}`}>
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-foreground">Training loss</h3>
        {latest ? (
          <span className="font-mono text-sm text-muted-foreground">
            step {latest.step} · {latest.loss.toFixed(4)}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">
            {finished ? "No loss reported" : "Waiting for the first step…"}
          </span>
        )}
      </div>

      <div className="h-48">
        {points.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 4, right: 8, bottom: 4, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
              <XAxis
                dataKey="step"
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
                fontSize={11}
              />
              <YAxis
                domain={domain}
                stroke="hsl(var(--muted-foreground))"
                tickLine={false}
                axisLine={false}
                fontSize={11}
                tickFormatter={(value: number) => value.toFixed(2)}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 6,
                  fontSize: 12,
                }}
                labelFormatter={(step) => `Step ${step}`}
                formatter={(value: number) => [value.toFixed(4), "loss"]}
              />
              <Line
                type="monotone"
                dataKey="loss"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {finished ? "This run reported no loss values." : "Collecting data…"}
          </div>
        )}
      </div>
    </div>
  );
};

export default TrainingMonitor;
