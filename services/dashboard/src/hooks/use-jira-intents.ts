"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { withBasePath } from "@/lib/base-path";
import {
  describeIntent,
  getSegmentId,
  parseDetectionOverrides,
  type DetectionOverrideField,
  type JiraIntent,
  type JiraIntentPayload,
  type JiraIntentStatus,
} from "@/lib/jira-intent";
import type { TranscriptSegment } from "@/types/vexa";

const DEBOUNCE_MS = 1500;

interface UseJiraIntentsOptions {
  enabled: boolean;
  isActive: boolean;
  meetingId: string | null;
  sessionStartedAt: string | null;
  transcripts: TranscriptSegment[];
  overrides: DetectionOverrideField[];
}

export function useJiraIntents({
  enabled,
  isActive,
  meetingId,
  sessionStartedAt,
  transcripts,
  overrides,
}: UseJiraIntentsOptions) {
  const [intents, setIntents] = useState<JiraIntent[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [autoExecuteEnabled, setAutoExecuteEnabled] = useState(false);
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const reportedRef = useRef<Set<string>>(new Set());
  const requestVersionRef = useRef(0);
  const lastAnalysisSignatureRef = useRef("");

  useEffect(() => {
    reportedRef.current = new Set();
    lastAnalysisSignatureRef.current = "";
    setIntents([]);
    setLastError(null);
    setAnalyzing(false);
  }, [meetingId]);

  const addIntent = useCallback((payload: JiraIntentPayload) => {
    if (!payload.fingerprint) return;

    setIntents((current) => {
      if (current.some((intent) => intent.payload.fingerprint === payload.fingerprint)) {
        return current;
      }

      return [
        ...current,
        {
          id: `intent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          payload,
          status: "pending",
          createdAt: Date.now(),
        },
      ];
    });
  }, []);

  const updateIntentStatus = useCallback((id: string, status: JiraIntentStatus) => {
    setIntents((current) =>
      current.map((intent) => (intent.id === id ? { ...intent, status } : intent))
    );
  }, []);

  const executeIntent = useCallback(
    (id: string) => {
      updateIntentStatus(id, "executing");
      window.setTimeout(() => updateIntentStatus(id, "executed"), 400);
    },
    [updateIntentStatus]
  );

  const handleExecuteOnce = useCallback(
    (id: string) => {
      executeIntent(id);
    },
    [executeIntent]
  );

  const handleAutoExecute = useCallback(
    (id: string) => {
      setAutoExecuteEnabled(true);
      executeIntent(id);
    },
    [executeIntent]
  );

  const handleCancel = useCallback(
    (id: string) => {
      updateIntentStatus(id, "cancelled");
    },
    [updateIntentStatus]
  );

  useEffect(() => {
    if (!enabled || !isActive) return;

    const completedSegments = transcripts.filter(
      (segment) => segment.completed !== false && segment.text?.trim()
    );
    const latestCompleted = completedSegments[completedSegments.length - 1];
    const analysisSignature = latestCompleted
      ? `${latestCompleted.segment_id || latestCompleted.id}:${latestCompleted.text}`
      : "";

    if (!analysisSignature || analysisSignature === lastAnalysisSignatureRef.current) {
      return;
    }

    lastAnalysisSignatureRef.current = analysisSignature;
    const version = ++requestVersionRef.current;

    const timer = window.setTimeout(async () => {
      setAnalyzing(true);
      setLastError(null);

      try {
        const response = await fetch(withBasePath("/api/jira/analyze"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            transcripts,
            overrides: parseDetectionOverrides(overrides),
            reportedFingerprints: [...reportedRef.current],
            sessionStartedAt,
            focusSegmentId: latestCompleted
              ? getSegmentId(latestCompleted)
              : null,
          }),
        });

        if (!response.ok) {
          throw new Error(`Analysis failed (${response.status})`);
        }

        const data = (await response.json()) as {
          intent: JiraIntentPayload | null;
          aiConfigured?: boolean;
          error?: string;
        };

        if (requestVersionRef.current !== version) return;

        setAiConfigured(data.aiConfigured ?? null);
        if (data.error) {
          setLastError(data.error);
        }

        if (data.intent?.detected && data.intent.fingerprint) {
          reportedRef.current.add(data.intent.fingerprint);
          addIntent(data.intent);

          if (autoExecuteEnabled) {
            window.setTimeout(() => {
              setIntents((current) => {
                const match = current.find(
                  (intent) => intent.payload.fingerprint === data.intent?.fingerprint
                );
                if (match && match.status === "pending") {
                  return current.map((intent) =>
                    intent.id === match.id ? { ...intent, status: "executed" } : intent
                  );
                }
                return current;
              });
            }, 0);
          }
        }
      } catch (error) {
        if (requestVersionRef.current === version) {
          setLastError(error instanceof Error ? error.message : "Failed to analyze transcript");
        }
      } finally {
        if (requestVersionRef.current === version) {
          setAnalyzing(false);
        }
      }
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [enabled, isActive, sessionStartedAt, transcripts, overrides, addIntent, autoExecuteEnabled]);

  useEffect(() => {
    if (!enabled) {
      setAnalyzing(false);
    }
  }, [enabled]);

  const pendingIntents = intents.filter((intent) => intent.status !== "cancelled");

  return {
    intents: pendingIntents,
    analyzing,
    aiConfigured,
    lastError,
    autoExecuteEnabled,
    handleExecuteOnce,
    handleAutoExecute,
    handleCancel,
    describeIntent,
  };
}
