"use client";

import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";

export default function HeroDepthVisual() {
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<number | null>(null);

  const [tilt, setTilt] = useState({
    x: 0,
    y: 0,
  });

  const [parallaxEnabled] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const finePointer = window.matchMedia("(pointer: fine)").matches;

    const wideScreen = window.matchMedia(
      "(min-width: 1280px)"
    ).matches;

    return !reduceMotion && finePointer && wideScreen;
  });

  useEffect(() => {
    if (!parallaxEnabled) {
      return;
    }

    const scene = sceneRef.current;

    if (!scene) {
      return;
    }

    function handleMouseMove(event: MouseEvent) {
      if (frameRef.current !== null) {
        return;
      }

      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;

        const currentScene = sceneRef.current;

        if (!currentScene) {
          return;
        }

        const rect = currentScene.getBoundingClientRect();

        const relX =
          (event.clientX - rect.left) / rect.width - 0.5;

        const relY =
          (event.clientY - rect.top) / rect.height - 0.5;

        setTilt({
          x: relY * -4,
          y: relX * 6,
        });
      });
    }

    function handleLeave() {
      setTilt({
        x: 0,
        y: 0,
      });
    }

    window.addEventListener("mousemove", handleMouseMove, {
      passive: true,
    });

    scene.addEventListener("mouseleave", handleLeave);

    return () => {
      window.removeEventListener(
        "mousemove",
        handleMouseMove
      );

      scene.removeEventListener(
        "mouseleave",
        handleLeave
      );

      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [parallaxEnabled]);

  return (
    <div
      ref={sceneRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-0 hidden overflow-hidden xl:block"
      style={{
        perspective: "1600px",
      }}
    >
      {/* Ambient depth */}

      <div className="absolute right-[2%] top-[5%] h-96 w-96 rounded-full bg-primary/[0.035] blur-3xl" />

      <div className="absolute bottom-[5%] left-[2%] h-72 w-72 rounded-full bg-accent/[0.05] blur-3xl" />

      {/* Mouse-controlled 3D layer */}

      <div
        className="absolute inset-0 transition-transform duration-300 ease-out"
        style={{
          transform: `
            rotateX(${tilt.x}deg)
            rotateY(${tilt.y}deg)
          `,
          transformStyle: "preserve-3d",
        }}
      >
        {/* Automatic subtle floating layer */}

        <div className="hero-depth-idle absolute inset-0">
          {/* =====================================================
              RIGHT TOP — QUESTION PAPER BLUEPRINT
          ====================================================== */}

          <div
            className="pointer-events-auto absolute right-[3%] top-[12%]"
            style={{
              transform:
                "translateZ(60px) rotateX(5deg) rotateY(-10deg)",
              transformStyle: "preserve-3d",
            }}
          >
            {/* Rear depth card */}

            <div
              className="absolute -right-6 top-6 h-[215px] w-64 rounded-xl border border-border bg-background/45 shadow-lg"
              style={{
                transform: "translateZ(-45px)",
              }}
            />

            {/* Middle depth card */}

            <div
              className="absolute -right-3 top-3 h-[215px] w-64 rounded-xl border border-border bg-background/70 shadow-lg"
              style={{
                transform: "translateZ(-22px)",
              }}
            />

            {/* Main card */}

            <MockCard
              className="relative z-10 w-64"
              eyebrow="Question Paper Blueprint"
            >
              <div className="mb-4">
                <p className="text-xs font-medium text-muted">
                  AD3301 · Data Visualization
                </p>

                <p className="mt-1 text-base font-semibold text-foreground">
                  Internal Assessment
                </p>
              </div>

              <div className="space-y-2">
                <BlueprintRow
                  label="Unit 1"
                  detail="2 × 2 Marks"
                />

                <BlueprintRow
                  label="Unit 2"
                  detail="1 × 5 Marks"
                />

                <BlueprintRow
                  label="Unit 3"
                  detail="1 × 13 Marks"
                />
              </div>

              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                    Blueprint
                  </span>

                  <span className="text-xs font-semibold text-foreground">
                    100%
                  </span>
                </div>

                <div className="h-1.5 overflow-hidden rounded-full bg-border">
                  <div className="h-full w-full rounded-full bg-accent" />
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <MiniBadge>CO Mapped</MiniBadge>
                <MiniBadge>Bloom Ready</MiniBadge>
              </div>
            </MockCard>
          </div>

          {/* =====================================================
              RIGHT BOTTOM — AI NOTES
              Kept far right so hero text stays clean
          ====================================================== */}

          <div
            className="pointer-events-auto absolute right-[2%] top-[59%]"
            style={{
              transform:
                "translateZ(36px) rotateX(-3deg) rotateY(-7deg)",
            }}
          >
            <MockCard
              className="w-52"
              eyebrow="AI Notes"
            >
              <p className="text-xs font-semibold text-foreground">
                Unit 2 · Visual Encoding
              </p>

              <div className="mt-3 space-y-2">
                <TextLine width="100%" />
                <TextLine width="82%" />
                <TextLine width="90%" />
                <TextLine width="65%" />
              </div>

              <div className="mt-4 border-t border-border pt-3">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-accent-hover">
                  Grounded in Materials
                </span>
              </div>
            </MockCard>
          </div>

          {/* =====================================================
              LEFT BOTTOM — ASSIGNED QUIZ
          ====================================================== */}

          <div
            className="pointer-events-auto absolute bottom-[13%] left-[3%]"
            style={{
              transform:
                "translateZ(45px) rotateX(-5deg) rotateY(10deg)",
            }}
          >
            <MockCard
              className="w-56"
              eyebrow="Assigned Quiz"
            >
              <div className="flex items-center gap-4">
                <ScoreRing percent={92} />

                <div>
                  <p className="text-lg font-bold text-foreground">
                    92%
                  </p>

                  <p className="text-xs text-muted">
                    Assessment Result
                  </p>
                </div>
              </div>

              <div className="mt-4 flex justify-between border-t border-border pt-3 text-xs">
                <div>
                  <p className="font-semibold text-foreground">
                    23
                  </p>

                  <p className="text-muted">
                    Correct
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-foreground">
                    2
                  </p>

                  <p className="text-muted">
                    Review
                  </p>
                </div>

                <div>
                  <p className="font-semibold text-foreground">
                    25
                  </p>

                  <p className="text-muted">
                    Questions
                  </p>
                </div>
              </div>
            </MockCard>

            {/* RAG pipeline */}

            <div className="mt-4 flex w-56 items-center gap-2 rounded-full border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-md">
              <FlowDot />

              <span className="text-[9px] font-semibold text-muted">
                RETRIEVE
              </span>

              <div className="relative h-px flex-1 bg-border-strong">
                <span className="hero-flow-pulse absolute top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-accent" />
              </div>

              <FlowDot />

              <span className="text-[9px] font-semibold text-muted">
                AI
              </span>

              <div className="h-px flex-1 bg-border-strong" />

              <FlowDot filled />
            </div>
          </div>

          {/* =====================================================
              LEFT TOP — ACADEMIC READINESS
          ====================================================== */}

          <div
            className="absolute left-[4%] top-[17%] rounded-xl border border-border bg-background/92 px-4 py-3 shadow-[0_14px_40px_rgba(11,37,69,0.12)] backdrop-blur-md"
            style={{
              transform:
                "translateZ(28px) rotateX(2deg) rotateY(7deg)",
            }}
          >
            <p className="text-[9px] font-bold uppercase tracking-[0.15em] text-accent-hover">
              Academic Readiness
            </p>

            <div className="mt-2.5 flex items-center gap-3">
              <div className="h-2 w-24 overflow-hidden rounded-full bg-border">
                <div className="h-full w-[76%] rounded-full bg-accent" />
              </div>

              <span className="text-xs font-semibold text-foreground">
                76%
              </span>
            </div>

            <p className="mt-2 text-[9px] text-muted">
              Subject configuration in progress
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* =========================================================
   CARD
========================================================= */

function MockCard({
  children,
  className = "",
  eyebrow,
}: {
  children: ReactNode;
  className?: string;
  eyebrow: string;
}) {
  return (
    <div
      className={`
        group
        rounded-xl
        border
        border-border
        bg-background/95
        p-5
        shadow-[0_20px_55px_rgba(11,37,69,0.14)]
        backdrop-blur-md
        transition-all
        duration-300
        hover:-translate-y-1.5
        hover:scale-[1.025]
        hover:shadow-[0_25px_65px_rgba(11,37,69,0.18)]
        ${className}
      `}
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="h-px w-5 bg-accent" />

        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-accent-hover">
          {eyebrow}
        </span>
      </div>

      {children}
    </div>
  );
}

/* =========================================================
   QUESTION PAPER ROW
========================================================= */

function BlueprintRow({
  label,
  detail,
}: {
  label: string;
  detail: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
      <div>
        <p className="text-xs font-semibold text-foreground">
          {label}
        </p>

        <p className="text-[10px] text-muted">
          {detail}
        </p>
      </div>

      <CheckIcon />
    </div>
  );
}

/* =========================================================
   SMALL BADGE
========================================================= */

function MiniBadge({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wide text-muted">
      {children}
    </span>
  );
}

/* =========================================================
   NOTES PLACEHOLDER LINE
========================================================= */

function TextLine({
  width,
}: {
  width: string;
}) {
  return (
    <div
      className="h-1.5 rounded-full bg-border-strong/70"
      style={{
        width,
      }}
    />
  );
}

/* =========================================================
   CHECK
========================================================= */

function CheckIcon() {
  return (
    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent-hover">
      ✓
    </span>
  );
}

/* =========================================================
   FLOW DOT
========================================================= */

function FlowDot({
  filled = false,
}: {
  filled?: boolean;
}) {
  return (
    <span
      className={`
        h-2
        w-2
        shrink-0
        rounded-full
        border
        ${
          filled
            ? "border-primary bg-primary"
            : "border-border-strong bg-background"
        }
      `}
    />
  );
}

/* =========================================================
   QUIZ SCORE RING
========================================================= */

function ScoreRing({
  percent,
}: {
  percent: number;
}) {
  const size = 52;
  const stroke = 5;

  const radius =
    (size - stroke) / 2;

  const circumference =
    2 * Math.PI * radius;

  const offset =
    circumference *
    (1 - percent / 100);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--border)"
        strokeWidth={stroke}
      />

      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--accent)"
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}