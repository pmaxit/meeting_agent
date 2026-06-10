import { generateText } from "ai";
import { getModel, isAIConfigured } from "@/lib/ai-model";
import {
  JIRA_INTENT_INSTRUCTION,
  buildOverridesContext,
  detectHeuristicIntent,
  extractJsonObject,
  formatTranscriptForAnalysis,
  getFocusUtterance,
  normalizeIntent,
  selectFocusSegments,
  type DetectionOverridesInput,
  type JiraIntentPayload,
} from "@/lib/jira-intent";
import type { TranscriptSegment } from "@/types/vexa";

export const runtime = "nodejs";

interface AnalyzeRequest {
  transcripts: TranscriptSegment[];
  overrides?: DetectionOverridesInput;
  reportedFingerprints?: string[];
  sessionStartedAt?: string | null;
  focusSegmentId?: string | null;
}

async function analyzeWithLLM(
  focusSegments: TranscriptSegment[],
  focusText: string,
  overrides: DetectionOverridesInput,
  reportedFingerprints: string[]
): Promise<JiraIntentPayload | null> {
  const overrideContext = buildOverridesContext(overrides);
  const transcript = formatTranscriptForAnalysis(focusSegments);
  const prompt = [
    "Analyze the FOCUS utterance for a NEW Jira intent.",
    "Use prior lines only as context. Classify the line marked [FOCUS] only.",
    `Already reported intent fingerprints (do not repeat): ${JSON.stringify(reportedFingerprints)}`,
    overrideContext ? `\nDetection overrides:\n${overrideContext}` : "",
    `\nTranscript:\n${transcript}`,
    `\nFocus utterance text:\n${focusText}`,
  ]
    .filter(Boolean)
    .join("\n");

  const model = getModel();
  const result = await generateText({
    model,
    system: JIRA_INTENT_INSTRUCTION,
    prompt,
    temperature: 0.2,
  });

  const parsed = extractJsonObject(result.text);
  if (!parsed?.detected) return null;

  const normalized = normalizeIntent(parsed, overrides, focusText);
  if (!normalized.detected || !normalized.fingerprint) return null;
  if (reportedFingerprints.includes(normalized.fingerprint)) return null;

  normalized.source = "llm";
  return normalized;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as AnalyzeRequest;
    const transcripts = Array.isArray(body.transcripts) ? body.transcripts : [];
    const overrides = body.overrides ?? {
      defaultProject: "",
      speakerAssigneeMap: "",
      priorityKeywords: "",
      ignorePhrases: "",
      customHint: "",
      custom: [],
    };
    const reportedFingerprints = Array.isArray(body.reportedFingerprints)
      ? body.reportedFingerprints
      : [];

    const focusSegments = selectFocusSegments(transcripts, body.focusSegmentId ?? null, {
      maxSegments: 15,
      sinceIso: body.sessionStartedAt ?? null,
    });

    const focusText = getFocusUtterance(focusSegments);
    if (!focusText.trim()) {
      return Response.json({ intent: null, aiConfigured: isAIConfigured() });
    }

    const aiConfigured = isAIConfigured();

    const heuristic = detectHeuristicIntent(focusSegments, overrides, reportedFingerprints);
    if (heuristic) {
      return Response.json({
        intent: heuristic,
        aiConfigured,
        method: "heuristic",
      });
    }

    if (!aiConfigured) {
      return Response.json({
        intent: null,
        aiConfigured: false,
        method: "none",
      });
    }

    try {
      const llmIntent = await analyzeWithLLM(
        focusSegments,
        focusText,
        overrides,
        reportedFingerprints
      );
      return Response.json({
        intent: llmIntent,
        aiConfigured: true,
        method: llmIntent ? "llm" : "none",
      });
    } catch (error) {
      console.error("Jira LLM analysis failed:", error);
      return Response.json({
        intent: null,
        aiConfigured: true,
        method: "llm_error",
        error: error instanceof Error ? error.message : "LLM analysis failed",
      });
    }
  } catch (error) {
    console.error("Jira analyze API error:", error);
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
