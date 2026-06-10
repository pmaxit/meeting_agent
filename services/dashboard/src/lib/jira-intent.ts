import { createHash } from "crypto";
import type { TranscriptSegment } from "@/types/vexa";

type FocusableSegment = TranscriptSegment & { _isFocus?: boolean };

export const JIRA_INTENT_TYPES = [
  "change_status",
  "update_issue",
  "add_comment",
  "assign_issue",
  "set_priority",
  "create_issue",
  "query_issue",
  "add_label",
  "link_issue",
] as const;

export type JiraIntentType = (typeof JIRA_INTENT_TYPES)[number];

export const JIRA_INTENT_INSTRUCTION = `You analyze live meeting transcripts for Jira ticket intents.

Return ONLY valid JSON (no markdown, no prose) using this schema:
{
  "detected": boolean,
  "intent_type": string | null,
  "confidence": number,
  "action": {
    "operation": "create" | "update" | "comment" | "assign" | "transition" | "query" | null,
    "project_key": string | null,
    "issue_type": string | null,
    "ticket_key": string | null,
    "summary": string | null,
    "description": string | null,
    "priority": string | null,
    "assignee": string | null,
    "status": string | null,
    "labels": [string],
    "fields": {string: any}
  },
  "evidence": {
    "speaker": string | null,
    "quote": string | null,
    "timestamp": string | null
  }
}

confidence MUST be an integer from 0 to 100 (not 0.0-1.0).

Classify ONLY the FOCUS utterance. Prior lines are context only.

Intent types and required operation + fields:
- query_issue → operation "query", ticket_key required
- create_issue → operation "create", summary required
- assign_issue → operation "assign", ticket_key + assignee required
- set_priority → operation "update", ticket_key + priority required
- add_comment → operation "comment", ticket_key + description (the note text)
- update_issue → operation "update", ticket_key + description or fields (field change, NOT a status move)
- change_status → operation "transition", ticket_key + status (Done, Blocked, In Progress, etc.)

Decision rules (apply to FOCUS utterance only, first match wins):
1. Questions/lookup ("what is the status", "look up", "pull up") → query_issue
2. Create ("create/open/file a ticket/jira") → create_issue
3. Assign ("assign/give/reassign to {person}") → assign_issue
4. Priority without status verb ("P0", "urgent", "raise priority") → set_priority
5. Narrative note ("we're waiting on", "note that", "log that") → add_comment
6. Field update ("update description/title/information/details") → update_issue
7. Status move ("move/mark/transition to done/blocked/review") → change_status
8. Vague ticket mention without concrete action → detected=false

Examples:
- "move jira ticket 163 to done" → change_status, status=Done, ticket_key=163
- "ticket 547 move it to block" → change_status, status=Blocked, ticket_key=547
- "update information on ticket 647 that we are waiting on further information" → add_comment or update_issue with description, NOT change_status
- "assign ticket 123 to Marcus" → assign_issue
- "make 123 P0" → set_priority, priority=Highest

Do NOT use change_status when the speaker asks to update information or add a note without a workflow transition.`;

export interface JiraIntentAction {
  operation: "create" | "update" | "comment" | "assign" | "transition" | "query" | null;
  project_key: string | null;
  issue_type: string | null;
  ticket_key: string | null;
  summary: string | null;
  description: string | null;
  priority: string | null;
  assignee: string | null;
  status: string | null;
  labels: string[];
  fields: Record<string, unknown>;
}

export interface JiraIntentEvidence {
  speaker: string | null;
  quote: string | null;
  timestamp: string | null;
}

export interface JiraIntentPayload {
  detected: boolean;
  intent_type: string | null;
  confidence: number;
  action: JiraIntentAction;
  evidence: JiraIntentEvidence;
  fingerprint?: string;
  source?: "heuristic" | "llm";
  correctedFrom?: string | null;
}

export type JiraIntentStatus = "pending" | "executing" | "executed" | "cancelled";

export interface JiraIntent {
  id: string;
  payload: JiraIntentPayload;
  status: JiraIntentStatus;
  createdAt: number;
}

export interface DetectionOverridesInput {
  defaultProject: string;
  speakerAssigneeMap: string;
  priorityKeywords: string;
  ignorePhrases: string;
  customHint: string;
  custom: Array<{ label: string; value: string }>;
}

export interface DetectionOverrideField {
  id: string;
  label: string;
  placeholder: string;
  value: string;
}

const STATUS_SYNONYMS: Record<string, string> = {
  done: "Done",
  complete: "Done",
  completed: "Done",
  finished: "Done",
  block: "Blocked",
  blocked: "Blocked",
  blocking: "Blocked",
  progress: "In Progress",
  "in progress": "In Progress",
  wip: "In Progress",
  review: "In Review",
  "in review": "In Review",
  backlog: "To Do",
  todo: "To Do",
  "to do": "To Do",
};

const INTENT_OPERATION_MAP: Record<JiraIntentType, JiraIntentAction["operation"]> = {
  change_status: "transition",
  update_issue: "update",
  add_comment: "comment",
  assign_issue: "assign",
  set_priority: "update",
  create_issue: "create",
  query_issue: "query",
  add_label: "update",
  link_issue: "update",
};

const INTENT_BADGE_CLASSES: Record<string, string> = {
  change_status: "bg-violet-100 text-violet-800 border-violet-200",
  update_issue: "bg-amber-100 text-amber-900 border-amber-200",
  add_comment: "bg-sky-100 text-sky-900 border-sky-200",
  assign_issue: "bg-emerald-100 text-emerald-900 border-emerald-200",
  set_priority: "bg-orange-100 text-orange-900 border-orange-200",
  create_issue: "bg-indigo-100 text-indigo-900 border-indigo-200",
  query_issue: "bg-slate-100 text-slate-800 border-slate-200",
  add_label: "bg-pink-100 text-pink-900 border-pink-200",
  link_issue: "bg-teal-100 text-teal-900 border-teal-200",
};

export function getSegmentId(segment: TranscriptSegment): string {
  return segment.segment_id || segment.id || `${segment.absolute_start_time}-${segment.speaker}`;
}

export function parseDetectionOverrides(overrides: DetectionOverrideField[]): DetectionOverridesInput {
  const byId = Object.fromEntries(overrides.map((item) => [item.id, item.value]));
  const knownIds = new Set(["ov-1", "ov-2", "ov-3", "ov-4", "ov-5"]);

  return {
    defaultProject: byId["ov-1"]?.trim() ?? "",
    speakerAssigneeMap: byId["ov-2"]?.trim() ?? "",
    priorityKeywords: byId["ov-3"]?.trim() ?? "",
    ignorePhrases: byId["ov-4"]?.trim() ?? "",
    customHint: byId["ov-5"]?.trim() ?? "",
    custom: overrides
      .filter((item) => !knownIds.has(item.id) && item.value.trim())
      .map((item) => ({ label: item.label, value: item.value.trim() })),
  };
}

export function formatTranscriptForAnalysis(segments: TranscriptSegment[]): string {
  return segments
    .filter((segment) => segment.text?.trim())
    .map((segment) => {
      const speaker = segment.speaker || "Unknown";
      const marker = segment._isFocus ? " [FOCUS]" : "";
      return `${speaker}${marker}: ${segment.text.trim()}`;
    })
    .join("\n");
}

export interface AnalysisWindowOptions {
  maxSegments?: number;
  sinceIso?: string | null;
}

export function selectSegmentsForAnalysis(
  segments: TranscriptSegment[],
  options: AnalysisWindowOptions = {}
): TranscriptSegment[] {
  const maxSegments = options.maxSegments ?? 12;
  let filtered = segments.filter((segment) => segment.text?.trim());

  if (options.sinceIso) {
    const sinceMs = new Date(options.sinceIso).getTime() - 5000;
    filtered = filtered.filter((segment) => {
      if (!segment.absolute_start_time) return true;
      return new Date(segment.absolute_start_time).getTime() >= sinceMs;
    });
  }

  return filtered.slice(-maxSegments);
}

export function selectFocusSegments(
  segments: TranscriptSegment[],
  focusSegmentId?: string | null,
  options: AnalysisWindowOptions = {}
): FocusableSegment[] {
  const window = selectSegmentsForAnalysis(segments, options);
  if (window.length === 0) return [];

  let focusIndex = window.length - 1;
  if (focusSegmentId) {
    const found = window.findIndex((segment) => getSegmentId(segment) === focusSegmentId);
    if (found >= 0) focusIndex = found;
  }

  const start = Math.max(0, focusIndex - 1);
  return window.slice(start, focusIndex + 1).map((segment, index, array) => ({
    ...segment,
    _isFocus: index === array.length - 1,
  }));
}

export function getFocusUtterance(segments: FocusableSegment[]): string {
  const focus = segments.find((segment) => segment._isFocus) ?? segments[segments.length - 1];
  return focus?.text?.trim() ?? "";
}

export function buildOverridesContext(overrides: DetectionOverridesInput): string {
  const lines: string[] = [];
  if (overrides.defaultProject) {
    lines.push(`Default Jira project: ${overrides.defaultProject}`);
  }
  if (overrides.speakerAssigneeMap) {
    lines.push(`Speaker → assignee map: ${overrides.speakerAssigneeMap}`);
  }
  if (overrides.priorityKeywords) {
    lines.push(`Priority keywords: ${overrides.priorityKeywords}`);
  }
  if (overrides.ignorePhrases) {
    lines.push(`Ignore phrases: ${overrides.ignorePhrases}`);
  }
  if (overrides.customHint) {
    lines.push(`Custom detection hint: ${overrides.customHint}`);
  }
  for (const custom of overrides.custom) {
    lines.push(`${custom.label}: ${custom.value}`);
  }
  return lines.join("\n");
}

export function formatConfidencePercent(confidence: number): number {
  if (!Number.isFinite(confidence)) return 0;
  const normalized = confidence <= 1 ? confidence * 100 : confidence;
  return Math.max(0, Math.min(100, Math.round(normalized)));
}

export function getIntentTypeLabel(intentType: string | null): string {
  if (!intentType) return "Jira action";
  return intentType.replace(/_/g, " ");
}

export function getIntentBadgeClass(intentType: string | null): string {
  if (!intentType) return "bg-blue-100 text-blue-900 border-blue-200";
  return INTENT_BADGE_CLASSES[intentType] ?? "bg-blue-100 text-blue-900 border-blue-200";
}

export function intentFingerprint(payload: Pick<JiraIntentPayload, "intent_type" | "action">): string {
  const action = payload.action ?? ({} as JiraIntentAction);
  const core = {
    intent_type: payload.intent_type,
    operation: action.operation,
    ticket_key: action.ticket_key,
    summary: action.summary,
    description: action.description,
    status: action.status,
    assignee: action.assignee,
    priority: action.priority,
  };
  const blob = JSON.stringify(core, Object.keys(core).sort());
  return createHash("sha256").update(blob).digest("hex");
}

function matchesIgnorePhrases(text: string, ignorePhrases: string): boolean {
  if (!ignorePhrases.trim()) return false;
  const lower = text.toLowerCase();
  return ignorePhrases
    .split(/[,;\n]+/)
    .map((phrase) => phrase.trim().toLowerCase())
    .filter(Boolean)
    .some((phrase) => lower.includes(phrase));
}

export function resolveTicketKey(rawKey: string, defaultProject: string): string {
  if (/^[A-Z][A-Z0-9]+-\d+$/i.test(rawKey)) {
    return rawKey.toUpperCase();
  }
  if (/^\d+$/.test(rawKey) && defaultProject) {
    return `${defaultProject.toUpperCase()}-${rawKey}`;
  }
  return rawKey;
}

function emptyAction(): JiraIntentAction {
  return {
    operation: null,
    project_key: null,
    issue_type: null,
    ticket_key: null,
    summary: null,
    description: null,
    priority: null,
    assignee: null,
    status: null,
    labels: [],
    fields: {},
  };
}

function normalizeStatus(raw: string | null): string | null {
  if (!raw?.trim()) return null;
  const key = raw.trim().toLowerCase();
  return STATUS_SYNONYMS[key] ?? raw.trim().replace(/\b\w/g, (c) => c.toUpperCase());
}

function parseAssigneeMap(mapText: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of mapText.split(/[,;\n]+/)) {
    const match = part.trim().match(/^(.+?)\s*→\s*(.+)$/);
    if (match) {
      result[match[1].trim().toLowerCase()] = match[2].trim();
    }
  }
  return result;
}

function resolveAssigneeFromSpeaker(
  speaker: string | null,
  overrides: DetectionOverridesInput
): string | null {
  if (!speaker || !overrides.speakerAssigneeMap.trim()) return null;
  const map = parseAssigneeMap(overrides.speakerAssigneeMap);
  return map[speaker.trim().toLowerCase()] ?? null;
}

function extractAssigneeFromText(text: string): string | null {
  const match =
    text.match(/\bassign(?:\s+\w+){0,4}\s+to\s+([A-Za-z][A-Za-z.\s'-]{1,40})/i) ||
    text.match(/\bgive(?:\s+\w+){0,4}\s+to\s+([A-Za-z][A-Za-z.\s'-]{1,40})/i) ||
    text.match(/\breassign(?:\s+\w+){0,4}\s+to\s+([A-Za-z][A-Za-z.\s'-]{1,40})/i);
  return match?.[1]?.trim() ?? null;
}

function extractPriorityFromText(text: string, overrides: DetectionOverridesInput): string | null {
  const lower = text.toLowerCase();
  if (/\bp0\b|\bcritical\b|\burgent\b|\bblocker\b|\bhighest\b/i.test(lower)) return "Highest";
  if (/\bp1\b|\bhigh\b/i.test(lower)) return "High";
  if (/\bp2\b|\bmedium\b/i.test(lower)) return "Medium";
  if (/\bp3\b|\bnice-to-have\b|\blow\b/i.test(lower)) return "Low";

  for (const part of overrides.priorityKeywords.split(/[,;\n]+/)) {
    const match = part.trim().match(/^(.+?)\s*→\s*(.+)$/);
    if (match && lower.includes(match[1].trim().toLowerCase())) {
      return match[2].trim();
    }
  }
  return null;
}

function extractStatusFromText(text: string): string | null {
  const moveMatch = text.match(
    /\b(?:move|mark|transition)(?:\s+\w+){0,6}\s+(?:to|as)\s+([a-z][a-z\s-]{1,20})/i
  );
  if (moveMatch) return normalizeStatus(moveMatch[1]);

  if (/\bto\s+done\b/i.test(text)) return "Done";
  if (/\bto\s+block(?:ed)?\b/i.test(text)) return "Blocked";
  if (/\bin\s+progress\b/i.test(text)) return "In Progress";
  if (/\bin\s+review\b/i.test(text)) return "In Review";
  return null;
}

export function extractTicketNumber(text: string): string | null {
  const jiraTicket = text.match(
    /\bjira\s+ticket(?:\s+number)?\s+#?([A-Z][A-Z0-9]*-?\d+|\d+)/i
  );
  if (jiraTicket) return jiraTicket[1];

  const ticket = text.match(/\bticket(?:\s+number)?\s+#?([A-Z][A-Z0-9]*-\d+|\d+)/i);
  if (ticket) return ticket[1];

  const keyed = text.match(/\b([A-Z][A-Z0-9]+-\d+)\b/);
  if (keyed) return keyed[1];

  return null;
}

function hasTransitionVerb(text: string): boolean {
  return /\b(move|mark|transition|send|set\s+status)\b/i.test(text);
}

export function inferIntentFromText(text: string): JiraIntentType | null {
  const lower = text.toLowerCase();
  if (!/\bjira\b|\bticket\b|\bissue\b/i.test(lower)) return null;

  if (/\b(what('s| is)|status of|look up|pull up|show me|find)\b/i.test(lower)) {
    return "query_issue";
  }
  if (/\b(create|open|file|log)\b.*\b(jira|ticket|issue|bug)\b/i.test(lower)) {
    return "create_issue";
  }
  if (/\b(assign|give|reassign)\b/i.test(lower) && /\bto\b/i.test(lower)) {
    return "assign_issue";
  }
  if (/\b(p0|p1|p2|p3|priority|urgent|critical|blocker|nice-to-have)\b/i.test(lower) && !hasTransitionVerb(text)) {
    return "set_priority";
  }
  if (
    /\b(waiting on|note that|log that|add a note|add comment|comment that|we are waiting)\b/i.test(lower)
  ) {
    return "add_comment";
  }
  if (/\b(update|change|edit)\b.*\b(information|description|title|details|field)\b/i.test(lower)) {
    return "update_issue";
  }
  if (hasTransitionVerb(text) || extractStatusFromText(text)) {
    return "change_status";
  }
  if (/\b(add|leave|post)\s+(?:a\s+)?comment\b/i.test(lower)) {
    return "add_comment";
  }
  return null;
}

export function normalizeIntent(
  payload: JiraIntentPayload,
  overrides: DetectionOverridesInput,
  focusText: string
): JiraIntentPayload {
  const result: JiraIntentPayload = {
    ...payload,
    action: { ...emptyAction(), ...payload.action },
    evidence: {
      speaker: payload.evidence?.speaker ?? null,
      quote: payload.evidence?.quote ?? null,
      timestamp: payload.evidence?.timestamp ?? null,
    },
    confidence: formatConfidencePercent(payload.confidence),
  };

  if (!result.detected) {
    result.intent_type = null;
    result.action = emptyAction();
    return result;
  }

  const originalType = result.intent_type;
  const inferred = inferIntentFromText(focusText);

  if (
    result.intent_type === "change_status" &&
    inferred &&
    inferred !== "change_status" &&
    /\b(update|information|waiting|note|comment)\b/i.test(focusText)
  ) {
    result.intent_type = inferred;
    result.correctedFrom = originalType;
  } else if (!result.intent_type && inferred) {
    result.intent_type = inferred;
  }

  const intentType = result.intent_type as JiraIntentType | null;
  if (intentType && INTENT_OPERATION_MAP[intentType]) {
    result.action.operation = INTENT_OPERATION_MAP[intentType];
  }

  if (result.action.ticket_key) {
    result.action.ticket_key = resolveTicketKey(result.action.ticket_key, overrides.defaultProject);
  } else {
    const ticket = extractTicketNumber(focusText);
    if (ticket) {
      result.action.ticket_key = resolveTicketKey(ticket, overrides.defaultProject);
    }
  }

  if (result.action.status) {
    result.action.status = normalizeStatus(result.action.status);
  } else if (result.intent_type === "change_status") {
    result.action.status = extractStatusFromText(focusText);
  }

  if (result.intent_type === "assign_issue" && !result.action.assignee) {
    result.action.assignee =
      extractAssigneeFromText(focusText) ??
      resolveAssigneeFromSpeaker(result.evidence.speaker, overrides);
  }

  if (result.intent_type === "set_priority" && !result.action.priority) {
    result.action.priority = extractPriorityFromText(focusText, overrides);
  }

  if (
    (result.intent_type === "add_comment" || result.intent_type === "update_issue") &&
    !result.action.description
  ) {
    result.action.description = focusText;
  }

  if (result.intent_type === "create_issue" && !result.action.summary) {
    result.action.summary = focusText.slice(0, 120);
  }

  if (overrides.defaultProject && !result.action.project_key) {
    result.action.project_key = overrides.defaultProject.toUpperCase();
  }

  if (!result.evidence.quote) {
    result.evidence.quote = focusText;
  }

  result.action.summary = describeIntent(result);

  if (!isValidIntent(result)) {
    result.detected = false;
    result.intent_type = null;
    result.action = emptyAction();
    result.fingerprint = undefined;
    return result;
  }

  result.fingerprint = intentFingerprint(result);
  return result;
}

function isValidIntent(payload: JiraIntentPayload): boolean {
  if (!payload.intent_type) return false;
  const { action } = payload;

  switch (payload.intent_type) {
    case "change_status":
      return Boolean(action.ticket_key && action.status);
    case "update_issue":
      return Boolean(action.ticket_key && (action.description || Object.keys(action.fields).length));
    case "add_comment":
      return Boolean(action.ticket_key && action.description);
    case "assign_issue":
      return Boolean(action.ticket_key && action.assignee);
    case "set_priority":
      return Boolean(action.ticket_key && action.priority);
    case "create_issue":
      return Boolean(action.summary);
    case "query_issue":
      return Boolean(action.ticket_key);
    default:
      return Boolean(action.ticket_key || action.summary);
  }
}

function buildPayload(
  intentType: JiraIntentType,
  fields: Partial<JiraIntentAction> & { ticket_key?: string | null },
  evidence: JiraIntentEvidence,
  confidence: number,
  source: "heuristic" | "llm"
): JiraIntentPayload {
  const operation = INTENT_OPERATION_MAP[intentType];
  const payload: JiraIntentPayload = {
    detected: true,
    intent_type: intentType,
    confidence,
    action: {
      ...emptyAction(),
      operation,
      ...fields,
    },
    evidence,
    source,
  };
  return payload;
}

export function detectHeuristicIntent(
  segments: TranscriptSegment[],
  overrides: DetectionOverridesInput,
  reportedFingerprints: string[]
): JiraIntentPayload | null {
  if (segments.length === 0) return null;

  const focusSegments = segments.map((segment, index, array) => ({
    ...segment,
    _isFocus: index === array.length - 1,
  }));
  const focusText = getFocusUtterance(focusSegments);
  if (!focusText) return null;

  if (matchesIgnorePhrases(focusText, overrides.ignorePhrases)) return null;

  const inferred = inferIntentFromText(focusText);
  if (!inferred) return null;

  const ticketRaw = extractTicketNumber(focusText);
  const focusSegment = focusSegments[focusSegments.length - 1];
  const speaker = focusSegment?.speaker || null;
  const timestamp = focusSegment?.absolute_start_time || null;
  const defaultProject = overrides.defaultProject;
  const ticketKey = ticketRaw ? resolveTicketKey(ticketRaw, defaultProject) : null;

  let payload: JiraIntentPayload | null = null;

  switch (inferred) {
    case "query_issue":
      if (!ticketKey) break;
      payload = buildPayload(
        "query_issue",
        { ticket_key: ticketKey, project_key: defaultProject || null },
        { speaker, quote: focusText, timestamp },
        75,
        "heuristic"
      );
      break;
    case "create_issue":
      payload = buildPayload(
        "create_issue",
        {
          project_key: defaultProject || null,
          issue_type: "Task",
          summary: focusText.slice(0, 120),
          description: focusText,
        },
        { speaker, quote: focusText, timestamp },
        72,
        "heuristic"
      );
      break;
    case "assign_issue": {
      const assignee =
        extractAssigneeFromText(focusText) ?? resolveAssigneeFromSpeaker(speaker, overrides);
      if (!ticketKey || !assignee) break;
      payload = buildPayload(
        "assign_issue",
        { ticket_key: ticketKey, assignee, project_key: defaultProject || null },
        { speaker, quote: focusText, timestamp },
        76,
        "heuristic"
      );
      break;
    }
    case "set_priority": {
      const priority = extractPriorityFromText(focusText, overrides);
      if (!ticketKey || !priority) break;
      payload = buildPayload(
        "set_priority",
        { ticket_key: ticketKey, priority, project_key: defaultProject || null },
        { speaker, quote: focusText, timestamp },
        74,
        "heuristic"
      );
      break;
    }
    case "add_comment":
      if (!ticketKey) break;
      payload = buildPayload(
        "add_comment",
        {
          ticket_key: ticketKey,
          description: focusText,
          project_key: defaultProject || null,
        },
        { speaker, quote: focusText, timestamp },
        77,
        "heuristic"
      );
      break;
    case "update_issue":
      if (!ticketKey) break;
      payload = buildPayload(
        "update_issue",
        {
          ticket_key: ticketKey,
          description: focusText,
          project_key: defaultProject || null,
          fields: { description: focusText },
        },
        { speaker, quote: focusText, timestamp },
        76,
        "heuristic"
      );
      break;
    case "change_status": {
      const status = extractStatusFromText(focusText);
      if (!ticketKey || !status) break;
      payload = buildPayload(
        "change_status",
        {
          ticket_key: ticketKey,
          status,
          project_key: defaultProject || null,
        },
        { speaker, quote: focusText, timestamp },
        78,
        "heuristic"
      );
      break;
    }
    default:
      break;
  }

  if (!payload) return null;

  const normalized = normalizeIntent(payload, overrides, focusText);
  if (!normalized.detected || !normalized.fingerprint) return null;
  if (reportedFingerprints.includes(normalized.fingerprint)) return null;
  return normalized;
}

export function extractJsonObject(text: string): JiraIntentPayload | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() || trimmed;

  const parse = (raw: string): JiraIntentPayload | null => {
    try {
      const parsed = JSON.parse(raw) as JiraIntentPayload;
      if (typeof parsed.detected !== "boolean") return null;
      parsed.action = { ...emptyAction(), ...(parsed.action || {}) };
      parsed.evidence = {
        speaker: parsed.evidence?.speaker ?? null,
        quote: parsed.evidence?.quote ?? null,
        timestamp: parsed.evidence?.timestamp ?? null,
      };
      return parsed;
    } catch {
      return null;
    }
  };

  let parsed = parse(candidate);
  if (!parsed) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    parsed = parse(candidate.slice(start, end + 1));
  }
  return parsed;
}

export function describeIntent(payload: JiraIntentPayload): string {
  const action = payload.action;
  const ticket = action.ticket_key;

  switch (payload.intent_type) {
    case "change_status":
      return ticket && action.status
        ? `Move ${ticket} to ${action.status}`
        : "Change ticket status";
    case "update_issue":
      return ticket ? `Update ${ticket}` : "Update issue";
    case "add_comment":
      return ticket ? `Add comment on ${ticket}` : "Add comment";
    case "assign_issue":
      return ticket && action.assignee
        ? `Assign ${ticket} to ${action.assignee}`
        : "Assign issue";
    case "set_priority":
      return ticket && action.priority
        ? `Set ${ticket} priority to ${action.priority}`
        : "Set priority";
    case "create_issue":
      return action.summary
        ? `Create issue: ${action.summary.slice(0, 80)}`
        : "Create Jira issue";
    case "query_issue":
      return ticket ? `Look up ${ticket}` : "Query issue";
    default:
      if (action.summary) return action.summary;
      return payload.intent_type?.replace(/_/g, " ") ?? "Jira action";
  }
}

export function getIntentFieldPreview(payload: JiraIntentPayload): string[] {
  const { action } = payload;
  const lines: string[] = [];
  if (action.status) lines.push(`Status: ${action.status}`);
  if (action.assignee) lines.push(`Assignee: ${action.assignee}`);
  if (action.priority) lines.push(`Priority: ${action.priority}`);
  if (action.description && payload.intent_type !== "change_status") {
    const preview =
      action.description.length > 100
        ? `${action.description.slice(0, 100)}…`
        : action.description;
    lines.push(`Note: ${preview}`);
  }
  return lines;
}
