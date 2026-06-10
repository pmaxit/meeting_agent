"use client";

import { useEffect, useRef } from "react";
import { getPendingMeetingUrl } from "@/lib/pending-meeting";
import { parseMeetingInput, type ParsedMeetingInput } from "@/lib/parse-meeting-input";

export interface PendingMeetingPrefill {
  meetingUrl: string;
  parsed: ParsedMeetingInput;
}

interface UsePendingMeetingPrefillOptions {
  enabled: boolean;
  onPrefill: (prefill: PendingMeetingPrefill) => void;
}

export function usePendingMeetingPrefill({ enabled, onPrefill }: UsePendingMeetingPrefillOptions) {
  const appliedRef = useRef(false);

  useEffect(() => {
    if (!enabled || appliedRef.current) return;

    const meetingUrl = getPendingMeetingUrl();
    if (!meetingUrl) return;

    const parsed = parseMeetingInput(meetingUrl);
    if (!parsed) return;

    appliedRef.current = true;
    onPrefill({ meetingUrl, parsed });
  }, [enabled, onPrefill]);
}
