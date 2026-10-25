import React from "react";

/**
 * The prompt-to-model pipeline, drawn to scale.
 *
 * Hand-built SVG rather than an image: it inherits the theme's colours through
 * `currentColor` and CSS variables, stays sharp at any size, and the labels are
 * real text, so they are selectable and reachable by a screen reader.
 */

interface Stage {
  label: string;
  detail: string;
}

const STAGES: Stage[] = [
  { label: "Prompt", detail: "natural language" },
  { label: "Interpreter", detail: "task + dataset" },
  { label: "Trainer", detail: "subprocess" },
  { label: "Model", detail: "weights + card" },
];

const BOX_WIDTH = 150;
const BOX_HEIGHT = 56;
const GAP = 48;
const PADDING = 2;
const WIDTH = STAGES.length * BOX_WIDTH + (STAGES.length - 1) * GAP + PADDING * 2;
const HEIGHT = 150;
const ROW_Y = 30;

export const PipelineDiagram: React.FC<{ className?: string }> = ({ className = "" }) => {
  const title = "The prompt-to-model pipeline";
  const description =
    "A prompt goes to the interpreter, which resolves a task and dataset. The trainer " +
    "fine-tunes in a subprocess, streaming progress back to the browser, and produces " +
    "a model with weights and a model card.";

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full text-muted-foreground"
        role="img"
        aria-labelledby="pipeline-title pipeline-desc"
      >
        <title id="pipeline-title">{title}</title>
        <desc id="pipeline-desc">{description}</desc>

        <defs>
          <marker
            id="pipeline-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M0 0 8 4 0 8z" fill="currentColor" />
          </marker>
        </defs>

        {STAGES.map((stage, index) => {
          const x = PADDING + index * (BOX_WIDTH + GAP);
          const isLast = index === STAGES.length - 1;
          return (
            <g key={stage.label}>
              <rect
                x={x}
                y={ROW_Y}
                width={BOX_WIDTH}
                height={BOX_HEIGHT}
                rx="6"
                fill="hsl(var(--card))"
                stroke="hsl(var(--border))"
                strokeWidth="1"
              />
              <text
                x={x + BOX_WIDTH / 2}
                y={ROW_Y + 23}
                textAnchor="middle"
                className="fill-foreground text-[13px] font-semibold"
              >
                {stage.label}
              </text>
              <text
                x={x + BOX_WIDTH / 2}
                y={ROW_Y + 40}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                {stage.detail}
              </text>

              {!isLast && (
                <line
                  x1={x + BOX_WIDTH + 8}
                  y1={ROW_Y + BOX_HEIGHT / 2}
                  x2={x + BOX_WIDTH + GAP - 8}
                  y2={ROW_Y + BOX_HEIGHT / 2}
                  stroke="currentColor"
                  strokeWidth="1.25"
                  markerEnd="url(#pipeline-arrow)"
                />
              )}
            </g>
          );
        })}

        {/*
          Feedback path: the trainer streams progress back to the browser while
          it runs, which is why the dashboard updates live rather than polling.
        */}
        {(() => {
          const trainerX = PADDING + 2 * (BOX_WIDTH + GAP);
          const promptX = PADDING;
          const y = ROW_Y + BOX_HEIGHT + 34;
          return (
            <g>
              <path
                d={`M${trainerX + BOX_WIDTH / 2} ${ROW_Y + BOX_HEIGHT}
                    V${y}
                    H${promptX + BOX_WIDTH / 2}
                    V${ROW_Y + BOX_HEIGHT + 6}`}
                fill="none"
                stroke="currentColor"
                strokeWidth="1.25"
                strokeDasharray="4 4"
                markerEnd="url(#pipeline-arrow)"
              />
              <text
                x={trainerX - GAP / 2}
                y={y - 7}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px]"
              >
                live progress (server-sent events)
              </text>
            </g>
          );
        })()}
      </svg>
    </figure>
  );
};

export default PipelineDiagram;
