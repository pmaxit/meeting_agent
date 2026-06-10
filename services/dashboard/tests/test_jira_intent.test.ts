/**
 * Unit tests for Jira intent heuristics and normalization.
 */
import { describe, it, expect } from "vitest";
import {
  detectHeuristicIntent,
  normalizeIntent,
  formatConfidencePercent,
  describeIntent,
  inferIntentFromText,
} from "@/lib/jira-intent";
import type { TranscriptSegment } from "@/types/vexa";

const EMPTY_OVERRIDES = {
  defaultProject: "",
  speakerAssigneeMap: "",
  priorityKeywords: "",
  ignorePhrases: "",
  customHint: "",
  custom: [],
};

function segment(text: string, speaker = "puneet girdhar"): TranscriptSegment {
  return {
    id: `seg-${text.slice(0, 8)}`,
    meeting_id: "1",
    start_time: 0,
    end_time: 1,
    absolute_start_time: "2026-06-10T10:00:00Z",
    absolute_end_time: "2026-06-10T10:00:01Z",
    text,
    speaker,
    language: "en",
    completed: true,
    session_uid: "s1",
    created_at: "2026-06-10T10:00:00Z",
    segment_id: `seg-${text.slice(0, 8)}`,
  };
}

describe("formatConfidencePercent", () => {
  it("scales fractional confidence to percent", () => {
    expect(formatConfidencePercent(0.95)).toBe(95);
    expect(formatConfidencePercent(1)).toBe(100);
  });

  it("keeps integer confidence as percent", () => {
    expect(formatConfidencePercent(78)).toBe(78);
  });
});

describe("detectHeuristicIntent", () => {
  it("detects move to done", () => {
    const result = detectHeuristicIntent(
      [segment("Okay. So can you move Jira ticket 163 to done?")],
      EMPTY_OVERRIDES,
      []
    );
    expect(result?.intent_type).toBe("change_status");
    expect(result?.action.status).toBe("Done");
    expect(result?.action.ticket_key).toBe("163");
  });

  it("detects move to blocked", () => {
    const result = detectHeuristicIntent(
      [segment("And also for Jira ticket number 547, I wanted to move it to block.")],
      EMPTY_OVERRIDES,
      []
    );
    expect(result?.intent_type).toBe("change_status");
    expect(result?.action.status).toBe("Blocked");
    expect(result?.action.ticket_key).toBe("547");
  });

  it("detects waiting-on note as add_comment not change_status", () => {
    const result = detectHeuristicIntent(
      [
        segment(
          "Also update the information on the Jira ticket 647 that we are waiting on the further information."
        ),
      ],
      EMPTY_OVERRIDES,
      []
    );
    expect(result?.intent_type).toBe("add_comment");
    expect(result?.action.ticket_key).toBe("647");
    expect(result?.action.operation).toBe("comment");
  });

  it("detects assign issue", () => {
    const result = detectHeuristicIntent(
      [segment("assign ticket 123 to Marcus")],
      EMPTY_OVERRIDES,
      []
    );
    expect(result?.intent_type).toBe("assign_issue");
    expect(result?.action.assignee).toBe("Marcus");
  });

  it("detects set priority", () => {
    const result = detectHeuristicIntent(
      [segment("make jira ticket 123 P0")],
      EMPTY_OVERRIDES,
      []
    );
    expect(result?.intent_type).toBe("set_priority");
    expect(result?.action.priority).toBe("Highest");
  });

  it("detects create issue", () => {
    const result = detectHeuristicIntent(
      [segment("create a Jira for the login bug")],
      EMPTY_OVERRIDES,
      []
    );
    expect(result?.intent_type).toBe("create_issue");
  });

  it("detects query issue", () => {
    const result = detectHeuristicIntent(
      [segment("what's the status of jira ticket 456")],
      EMPTY_OVERRIDES,
      []
    );
    expect(result?.intent_type).toBe("query_issue");
  });

  it("returns null for vague ticket mention", () => {
    const result = detectHeuristicIntent(
      [segment("we should think about tickets later")],
      EMPTY_OVERRIDES,
      []
    );
    expect(result).toBeNull();
  });
});

describe("normalizeIntent", () => {
  it("corrects misclassified change_status to add_comment", () => {
    const focus =
      "Also update the information on the Jira ticket 647 that we are waiting on the further information.";
    const normalized = normalizeIntent(
      {
        detected: true,
        intent_type: "change_status",
        confidence: 1,
        action: {
          operation: "transition",
          project_key: null,
          issue_type: null,
          ticket_key: "647",
          summary: "Move 647 to update",
          description: null,
          priority: null,
          assignee: null,
          status: "update",
          labels: [],
          fields: {},
        },
        evidence: { speaker: null, quote: focus, timestamp: null },
        source: "llm",
      },
      EMPTY_OVERRIDES,
      focus
    );
    expect(normalized.intent_type).toBe("add_comment");
    expect(normalized.correctedFrom).toBe("change_status");
    expect(normalized.confidence).toBe(100);
  });

  it("normalizes block status to Blocked", () => {
    const focus = "ticket 547 move it to block";
    const normalized = normalizeIntent(
      {
        detected: true,
        intent_type: "change_status",
        confidence: 0.85,
        action: {
          operation: "transition",
          project_key: null,
          issue_type: null,
          ticket_key: "547",
          summary: null,
          description: null,
          priority: null,
          assignee: null,
          status: "block",
          labels: [],
          fields: {},
        },
        evidence: { speaker: null, quote: focus, timestamp: null },
      },
      EMPTY_OVERRIDES,
      focus
    );
    expect(normalized.action.status).toBe("Blocked");
    expect(describeIntent(normalized)).toBe("Move 547 to Blocked");
  });
});

describe("inferIntentFromText", () => {
  it("classifies common utterances", () => {
    expect(inferIntentFromText("move ticket 163 to done")).toBe("change_status");
    expect(
      inferIntentFromText("update information on ticket 647 we are waiting on further information")
    ).toBe("add_comment");
  });
});
