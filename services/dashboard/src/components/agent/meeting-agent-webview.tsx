"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Check,
  Circle,
  Loader2,
  Mic,
  PhoneOff,
  Play,
  Plus,
  Radio,
  Sparkles,
  Trash2,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Logo } from "@/components/ui/logo";
import { useJiraIntents } from "@/hooks/use-jira-intents";
import { useLiveTranscripts } from "@/hooks/use-live-transcripts";
import { usePendingMeetingPrefill } from "@/hooks/use-pending-meeting-prefill";
import { useRuntimeConfig } from "@/hooks/use-runtime-config";
import { describeIntent, formatConfidencePercent, getIntentBadgeClass, getIntentFieldPreview, getIntentTypeLabel, selectSegmentsForAnalysis, type JiraIntent } from "@/lib/jira-intent";
import { DEFAULT_BOT_NAME, APP_NAME } from "@/lib/brand";
import { vexaAPI } from "@/lib/api";
import { getUserFriendlyError } from "@/lib/error-messages";
import { parseMeetingInput } from "@/lib/parse-meeting-input";
import { clearPendingMeetingUrl } from "@/lib/pending-meeting";
import { parseUTCTimestamp, cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useMeetingsStore } from "@/stores/meetings-store";
import type {
  CreateBotRequest,
  Meeting,
  MeetingStatus,
  Platform,
  TranscriptSegment,
} from "@/types/vexa";
import { MEETING_STATUS_CONFIG } from "@/types/vexa";

interface DetectionOverride {
  id: string;
  label: string;
  placeholder: string;
  value: string;
}

const DEFAULT_OVERRIDES: DetectionOverride[] = [
  {
    id: "ov-1",
    label: "Default Jira project",
    placeholder: "e.g. PLATFORMTOOLS — used when the agent picks the wrong board",
    value: "",
  },
  {
    id: "ov-2",
    label: "Speaker → assignee map",
    placeholder: "Marcus → marcus.chen, Avery → avery.kim",
    value: "",
  },
  {
    id: "ov-3",
    label: "Priority keywords",
    placeholder: "blocked, outage, P0 → High; nice-to-have → Low",
    value: "",
  },
  {
    id: "ov-4",
    label: "Ignore phrases",
    placeholder: "Phrases that should never trigger Jira creation",
    value: "",
  },
  {
    id: "ov-5",
    label: "Custom detection hint",
    placeholder: "Free-form guidance for the intent extractor",
    value: "",
  },
];

function formatSegmentTime(segment: TranscriptSegment): string {
  try {
    const date = parseUTCTimestamp(segment.absolute_start_time);
    const hh = date.getHours().toString().padStart(2, "0");
    const mm = date.getMinutes().toString().padStart(2, "0");
    const ss = date.getSeconds().toString().padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  } catch {
    return "--:--:--";
  }
}

function formatDuration(startTime: string | null): string | null {
  if (!startTime) return null;
  try {
    const start = parseUTCTimestamp(startTime).getTime();
    const elapsed = Math.max(0, Date.now() - start);
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  } catch {
    return null;
  }
}

function StatusDot({ live }: { live: boolean }) {
  return (
    <span className="relative flex h-2 w-2">
      {live && (
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
      )}
      <span
        className={cn(
          "relative inline-flex h-2 w-2 rounded-full",
          live ? "bg-emerald-500" : "bg-muted-foreground/40"
        )}
      />
    </span>
  );
}

function filterSessionTranscripts(
  segments: TranscriptSegment[],
  sessionStartedAt: string | null
): TranscriptSegment[] {
  if (!sessionStartedAt) return segments;
  return selectSegmentsForAnalysis(segments, {
    maxSegments: 10_000,
    sinceIso: sessionStartedAt,
  });
}

function LeftPanel({
  meetingUrl,
  onMeetingUrlChange,
  platform,
  onPlatformChange,
  passcode,
  onPasscodeChange,
  meeting,
  isJoining,
  onJoin,
  onReconnect,
  onLeave,
  autoTranscribe,
  onAutoTranscribeChange,
  jiraEnabled,
  onJiraEnabledChange,
  speakerCount,
  durationLabel,
}: {
  meetingUrl: string;
  onMeetingUrlChange: (value: string) => void;
  platform: Platform;
  onPlatformChange: (value: Platform) => void;
  passcode: string;
  onPasscodeChange: (value: string) => void;
  meeting: Meeting | null;
  isJoining: boolean;
  onJoin: () => void;
  onReconnect: () => void;
  onLeave: () => void;
  autoTranscribe: boolean;
  onAutoTranscribeChange: (value: boolean) => void;
  jiraEnabled: boolean;
  onJiraEnabledChange: (value: boolean) => void;
  speakerCount: number;
  durationLabel: string | null;
}) {
  const isLive = meeting !== null;
  const statusConfig = meeting ? MEETING_STATUS_CONFIG[meeting.status] : null;

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-border bg-[#fbfbfa]">
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <StatusDot live={isLive && meeting?.status === "active"} />
          <span className="text-sm font-medium">
            {statusConfig?.label ?? (isJoining ? "Joining…" : "Not connected")}
          </span>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Meeting agent</p>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-6 p-4">
          <section className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Join meeting
            </p>
            <div className="space-y-2">
              <Label htmlFor="platform" className="text-xs text-muted-foreground">
                Platform
              </Label>
              <Select
                value={platform}
                onValueChange={(value) => onPlatformChange(value as Platform)}
                disabled={isLive || isJoining}
              >
                <SelectTrigger id="platform" className="h-9 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="google_meet">Google Meet</SelectItem>
                  <SelectItem value="teams">Microsoft Teams</SelectItem>
                  <SelectItem value="zoom">Zoom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="meeting-url" className="text-xs text-muted-foreground">
                Meeting link
              </Label>
              <Input
                id="meeting-url"
                value={meetingUrl}
                onChange={(e) => onMeetingUrlChange(e.target.value)}
                placeholder="Paste Google Meet, Teams, or Zoom URL"
                className="h-9 bg-white text-sm"
                disabled={isLive || isJoining}
              />
            </div>
            {platform === "teams" && !isLive && (
              <div className="space-y-2">
                <Label htmlFor="passcode" className="text-xs text-muted-foreground">
                  Teams passcode
                </Label>
                <Input
                  id="passcode"
                  value={passcode}
                  onChange={(e) => onPasscodeChange(e.target.value)}
                  placeholder="Required for Teams meetings"
                  className="h-9 bg-white text-sm"
                  disabled={isJoining}
                />
              </div>
            )}
            {isLive ? (
              <div className="space-y-2">
                <Button
                  className="w-full"
                  onClick={onReconnect}
                  disabled={isJoining}
                >
                  {isJoining ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                  Reconnect bot
                </Button>
                <Button variant="outline" className="w-full" onClick={onLeave} disabled={isJoining}>
                  <PhoneOff className="h-4 w-4" />
                  Leave meeting
                </Button>
              </div>
            ) : (
              <Button
                className="w-full"
                onClick={onJoin}
                disabled={!meetingUrl.trim() || isJoining}
              >
                {isJoining ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                Join meeting
              </Button>
            )}
          </section>

          <Separator />

          <section className="space-y-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              Session
            </p>
            <OptionRow
              label="Live transcription"
              description="Stream speech to the conversation panel"
              checked={autoTranscribe}
              onCheckedChange={onAutoTranscribeChange}
              disabled={isLive}
            />
            <OptionRow
              label="Jira intent detection"
              description="Extract actionable tickets from speech"
              checked={jiraEnabled}
              onCheckedChange={onJiraEnabledChange}
            />
          </section>

          {isLive && meeting && (
            <>
              <Separator />
              <section className="space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                  Active session
                </p>
                <div className="rounded-md border border-border bg-white p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <span>{statusConfig?.label ?? meeting.status}</span>
                  </div>
                  {durationLabel && (
                    <div className="mt-2 flex items-center justify-between">
                      <span className="text-muted-foreground">Duration</span>
                      <span className="font-mono">{durationLabel}</span>
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-muted-foreground">Speakers</span>
                    <span>{speakerCount}</span>
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
      </ScrollArea>
    </aside>
  );
}

function OptionRow({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
}: {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-md border border-border bg-white p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium leading-tight">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

function TranscriptBubble({ segment }: { segment: TranscriptSegment }) {
  const isPending = segment.completed === false;

  return (
    <div className="flex gap-3 px-1 py-1">
      <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-medium">
        {(segment.speaker || "?").slice(0, 1).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <span className="text-sm font-medium">{segment.speaker || "Unknown"}</span>
          <span className="font-mono text-[11px] text-muted-foreground">
            {formatSegmentTime(segment)}
          </span>
          {isPending && (
            <Badge
              variant="outline"
              className="h-5 border-emerald-200 bg-emerald-50 px-1.5 text-[10px] text-emerald-700"
            >
              live
            </Badge>
          )}
        </div>
        <p className="mt-1 text-sm leading-relaxed text-foreground/90">{segment.text}</p>
      </div>
    </div>
  );
}

function SystemEvent({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-center py-2">
      <span className="rounded-full border border-border bg-muted/50 px-3 py-1 text-[11px] text-muted-foreground">
        {children}
      </span>
    </div>
  );
}

function JiraIntentCard({
  intent,
  onExecuteOnce,
  onAutoExecute,
  onCancel,
}: {
  intent: JiraIntent;
  onExecuteOnce: (id: string) => void;
  onAutoExecute: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const { payload, status } = intent;
  const title = describeIntent(payload);
  const confidenceLabel = formatConfidencePercent(payload.confidence);
  const fieldPreview = getIntentFieldPreview(payload);
  const badgeClass = getIntentBadgeClass(payload.intent_type);
  const isDone = status === "executed" || status === "executing";
  const sourceLabel =
    payload.correctedFrom && payload.source === "llm"
      ? "via AI (corrected)"
      : payload.source === "heuristic"
        ? "via pattern match"
        : payload.source === "llm"
          ? "via AI"
          : null;

  return (
    <div className="mx-1 my-3 rounded-lg border border-blue-200 bg-blue-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="h-5 bg-blue-600 px-2 text-[10px] hover:bg-blue-600">Jira intent</Badge>
            {payload.intent_type && (
              <span
                className={cn(
                  "rounded border px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
                  badgeClass
                )}
              >
                {getIntentTypeLabel(payload.intent_type)}
              </span>
            )}
            {sourceLabel && (
              <span className="text-[10px] text-blue-700/60">{sourceLabel}</span>
            )}
          </div>
          <p className="mt-2 text-sm font-medium text-blue-950">{title}</p>
          {payload.action.ticket_key && (
            <p className="mt-1 font-mono text-xs text-blue-800/80">{payload.action.ticket_key}</p>
          )}
          {fieldPreview.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {fieldPreview.map((line) => (
                <p key={line} className="text-xs text-blue-900/75">
                  {line}
                </p>
              ))}
            </div>
          )}
          {payload.evidence.quote && (
            <p className="mt-2 text-xs leading-relaxed text-blue-900/70">
              &ldquo;{payload.evidence.quote}&rdquo;
              {payload.evidence.speaker ? ` — ${payload.evidence.speaker}` : ""}
            </p>
          )}
        </div>
        <span className="shrink-0 text-[11px] text-blue-800/60">{confidenceLabel}%</span>
      </div>

      {status === "pending" && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" className="h-8" onClick={() => onExecuteOnce(intent.id)}>
            <Zap className="h-3.5 w-3.5" />
            Execute once
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 border-blue-200 bg-white"
            onClick={() => onAutoExecute(intent.id)}
          >
            Auto execute
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 text-blue-900/70"
            onClick={() => onCancel(intent.id)}
          >
            Cancel
          </Button>
        </div>
      )}

      {isDone && (
        <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700">
          <Check className="h-3.5 w-3.5" />
          {status === "executing" ? "Executing…" : "Queued for execution"}
        </div>
      )}
    </div>
  );
}

function MainStream({
  meeting,
  isJoining,
  transcripts,
  wsConnecting,
  wsConnected,
  wsError,
  autoTranscribe,
  jiraEnabled,
  jiraIntents,
  jiraAnalyzing,
  jiraAiConfigured,
  jiraLastError,
  onExecuteOnce,
  onAutoExecute,
  onCancelIntent,
}: {
  meeting: Meeting | null;
  isJoining: boolean;
  transcripts: TranscriptSegment[];
  wsConnecting: boolean;
  wsConnected: boolean;
  wsError: string | null;
  autoTranscribe: boolean;
  jiraEnabled: boolean;
  jiraIntents: JiraIntent[];
  jiraAnalyzing: boolean;
  jiraAiConfigured: boolean | null;
  jiraLastError: string | null;
  onExecuteOnce: (id: string) => void;
  onAutoExecute: (id: string) => void;
  onCancelIntent: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcripts.length, transcripts.at(-1)?.text]);

  const jiraModeLabel =
    jiraAiConfigured === true ? "AI detection" : jiraAiConfigured === false ? "Pattern detection" : "Jira detection";

  const waitingMessage = useMemo(() => {
    if (!meeting) return null;
    switch (meeting.status) {
      case "requested":
      case "joining":
        return "Bot is connecting to the meeting…";
      case "awaiting_admission":
        return "Waiting to be admitted to the meeting…";
      case "active":
        return autoTranscribe
          ? "Connected. Waiting for speech…"
          : "Connected. Enable live transcription to see speech here.";
      case "failed":
        return meeting.data?.failure_reason || meeting.data?.error || "Bot failed to join the meeting.";
      default:
        return null;
    }
  }, [meeting, autoTranscribe]);

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-white">
      <header className="flex items-center justify-between border-b border-border px-5 py-3">
        <div>
          <h1 className="text-sm font-semibold">Live conversation</h1>
          <p className="text-xs text-muted-foreground">
            Real-time transcript via WebSocket from the meeting bot
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          {jiraEnabled && meeting?.status === "active" && (
            <span className="flex items-center gap-1.5">
              {jiraAnalyzing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
              )}
              {jiraAnalyzing ? "Detecting Jira intents…" : `${jiraModeLabel} on`}
            </span>
          )}
          {meeting && wsConnected ? (
            <>
              <Radio className="h-3.5 w-3.5 text-emerald-600" />
              Streaming
            </>
          ) : meeting && wsConnecting ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Connecting
            </>
          ) : meeting ? (
            <>
              <WifiOff className="h-3.5 w-3.5" />
              Disconnected
            </>
          ) : (
            <>
              <Mic className="h-3.5 w-3.5" />
              Waiting to join
            </>
          )}
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4">
        {!meeting && !isJoining && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="rounded-full border border-border bg-[#fbfbfa] p-4">
              <Circle className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="mt-4 text-sm font-medium">No active meeting</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Paste a meeting link in the left panel and join. Live transcript will appear here.
            </p>
          </div>
        )}

        {isJoining && !meeting && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="mt-4 text-sm font-medium">Starting bot…</p>
          </div>
        )}

        {meeting && (
          <div className="mx-auto max-w-3xl space-y-1">
            <SystemEvent>
              {MEETING_STATUS_CONFIG[meeting.status]?.label ?? meeting.status}
              {wsConnected ? " · transcript stream connected" : wsConnecting ? " · connecting stream…" : ""}
            </SystemEvent>

            {wsError && (
              <div className="mx-1 my-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{wsError}</span>
              </div>
            )}

            {jiraLastError && (
              <div className="mx-1 my-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Jira detection: {jiraLastError}</span>
              </div>
            )}

            {jiraEnabled && meeting.status === "active" && jiraAiConfigured === false && (
              <div className="mx-1 my-3 rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2 text-xs text-blue-900/80">
                Pattern-based Jira detection is active. Set <code className="text-[11px]">AI_MODEL</code> and{" "}
                <code className="text-[11px]">AI_API_KEY</code> for richer intent extraction.
              </div>
            )}

            {transcripts.length === 0 ? (
              waitingMessage && (
                <p className="py-8 text-center text-sm text-muted-foreground">{waitingMessage}</p>
              )
            ) : (
              transcripts.map((segment) => (
                <TranscriptBubble
                  key={segment.segment_id || segment.id || `${segment.absolute_start_time}-${segment.speaker}`}
                  segment={segment}
                />
              ))
            )}

            {jiraEnabled &&
              jiraIntents.map((intent) => (
                <JiraIntentCard
                  key={intent.id}
                  intent={intent}
                  onExecuteOnce={onExecuteOnce}
                  onAutoExecute={onAutoExecute}
                  onCancel={onCancelIntent}
                />
              ))}

            {meeting.status === "active" && wsConnected && transcripts.length > 0 && (
              <div className="flex items-center gap-2 px-1 py-3 text-xs text-muted-foreground">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
                Listening…
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

function OverridesPanel({
  overrides,
  onChange,
  onAdd,
  onRemove,
}: {
  overrides: DetectionOverride[];
  onChange: (id: string, value: string) => void;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  return (
    <aside className="flex w-[300px] shrink-0 flex-col border-l border-border bg-[#fbfbfa]">
      <div className="border-b border-border px-4 py-4">
        <h2 className="text-sm font-semibold">Detection overrides</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Steer intent extraction when the agent makes consistent mistakes.
        </p>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-4 p-4">
          {overrides.map((override) => (
            <div key={override.id} className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor={override.id} className="text-xs font-medium">
                  {override.label}
                </Label>
                {overrides.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemove(override.id)}
                    className="rounded p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-label={`Remove ${override.label}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <Textarea
                id={override.id}
                value={override.value}
                onChange={(e) => onChange(override.id, e.target.value)}
                placeholder={override.placeholder}
                className="min-h-[72px] resize-none bg-white text-sm"
              />
            </div>
          ))}

          <Button variant="outline" size="sm" className="w-full bg-white" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            Add override
          </Button>
        </div>
      </ScrollArea>
    </aside>
  );
}

export function MeetingAgentWebview() {
  const router = useRouter();
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const { config } = useRuntimeConfig();

  const [meetingUrl, setMeetingUrl] = useState("");
  const [platform, setPlatform] = useState<Platform>("google_meet");
  const [passcode, setPasscode] = useState("");
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [isJoining, setIsJoining] = useState(false);
  const [autoTranscribe, setAutoTranscribe] = useState(true);
  const [jiraEnabled, setJiraEnabled] = useState(true);
  const [overrides, setOverrides] = useState<DetectionOverride[]>(DEFAULT_OVERRIDES);
  const [sessionStartedAt, setSessionStartedAt] = useState<string | null>(null);
  const [, tick] = useState(0);

  const transcripts = useMeetingsStore((state) => state.transcripts);
  const liveTranscripts = useMemo(
    () => filterSessionTranscripts(transcripts, sessionStartedAt),
    [transcripts, sessionStartedAt]
  );
  const setCurrentMeeting = useMeetingsStore((state) => state.setCurrentMeeting);
  const clearCurrentMeeting = useMeetingsStore((state) => state.clearCurrentMeeting);
  const updateMeetingStatus = useMeetingsStore((state) => state.updateMeetingStatus);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/login");
    }
  }, [isLoading, isAuthenticated, router]);

  const applyPendingMeeting = useCallback(
    (prefill: { meetingUrl: string; parsed: ReturnType<typeof parseMeetingInput> }) => {
      if (!prefill.parsed) return;
      setMeetingUrl(prefill.meetingUrl);
      setPlatform(prefill.parsed.platform);
      if (prefill.parsed.passcode) {
        setPasscode(prefill.parsed.passcode);
      }
    },
    []
  );

  usePendingMeetingPrefill({
    enabled: isAuthenticated && !isLoading,
    onPrefill: applyPendingMeeting,
  });

  const parsedInput = useMemo(() => parseMeetingInput(meetingUrl), [meetingUrl]);

  useEffect(() => {
    if (parsedInput) {
      setPlatform(parsedInput.platform);
      if (parsedInput.passcode) {
        setPasscode(parsedInput.passcode);
      }
    }
  }, [parsedInput]);

  const handleStatusChange = useCallback(
    (status: MeetingStatus) => {
      setMeeting((current) => {
        if (current) {
          updateMeetingStatus(current.id, status);
          return { ...current, status };
        }
        return current;
      });
    },
    [updateMeetingStatus]
  );

  const isEarlyState =
    meeting?.status === "requested" ||
    meeting?.status === "joining" ||
    meeting?.status === "awaiting_admission";
  const shouldUseWebSocket =
    meeting !== null &&
    autoTranscribe &&
    (meeting.status === "active" || isEarlyState || meeting.status === "stopping");

  const { isConnecting: wsConnecting, isConnected: wsConnected, connectionError: wsError } =
    useLiveTranscripts({
      platform: meeting?.platform ?? "google_meet",
      nativeId: meeting?.platform_specific_id ?? "",
      meetingId: meeting?.id ?? "",
      isActive: shouldUseWebSocket,
      onStatusChange: handleStatusChange,
      skipBootstrap: true,
    });

  useEffect(() => {
    if (!meeting?.start_time) return;
    const interval = window.setInterval(() => tick((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [meeting?.start_time]);

  const speakerCount = useMemo(() => {
    return new Set(liveTranscripts.map((segment) => segment.speaker).filter(Boolean)).size;
  }, [liveTranscripts]);

  const durationLabel = meeting ? formatDuration(meeting.start_time) : null;

  const {
    intents: jiraIntents,
    analyzing: jiraAnalyzing,
    aiConfigured: jiraAiConfigured,
    lastError: jiraLastError,
    handleExecuteOnce,
    handleAutoExecute,
    handleCancel,
  } = useJiraIntents({
    enabled: jiraEnabled,
    isActive: meeting?.status === "active" && liveTranscripts.length > 0,
    meetingId: meeting?.id ?? null,
    sessionStartedAt,
    transcripts: liveTranscripts,
    overrides,
  });

  const onJiraExecuteOnce = useCallback(
    (id: string) => {
      handleExecuteOnce(id);
      toast.success("Jira action queued", { description: "Execute once — integration coming soon." });
    },
    [handleExecuteOnce]
  );

  const onJiraAutoExecute = useCallback(
    (id: string) => {
      handleAutoExecute(id);
      toast.success("Auto execute enabled", {
        description: "New intents will be queued automatically for this session.",
      });
    },
    [handleAutoExecute]
  );

  const handleJoin = useCallback(async () => {
    if (!parsedInput) {
      toast.error("Invalid meeting link", {
        description: "Enter a valid Google Meet, Teams, or Zoom URL or meeting code.",
      });
      return;
    }

    const effectivePlatform = parsedInput.platform || platform;
    const finalPasscode = parsedInput.passcode || passcode.trim() || undefined;

    if (effectivePlatform === "teams" && !finalPasscode) {
      toast.error("Passcode required", {
        description: "Microsoft Teams meetings require a passcode.",
      });
      return;
    }

    const request: CreateBotRequest = {
      platform: effectivePlatform,
      native_meeting_id: parsedInput.meetingId || "",
      bot_name: config?.defaultBotName || DEFAULT_BOT_NAME,
    };

    if ((effectivePlatform === "teams" || effectivePlatform === "zoom") && finalPasscode) {
      request.passcode = finalPasscode;
    }
    if (parsedInput.originalUrl) {
      request.meeting_url = parsedInput.originalUrl;
    }
    if (!autoTranscribe) {
      request.transcribe_enabled = false;
    }

    setIsJoining(true);

    if (meeting) {
      try {
        await vexaAPI.stopBotIfExists(meeting.platform, meeting.platform_specific_id);
      } catch {
        // Best effort — createBot will replace any remaining session.
      }
      setMeeting(null);
    }

    clearCurrentMeeting();
    setSessionStartedAt(new Date().toISOString());

    try {
      const created = await vexaAPI.createBot(request, { replaceExisting: true });
      clearPendingMeetingUrl();
      setMeeting(created);
      setCurrentMeeting(created);
      toast.success("Bot joining meeting", {
        description: "Live transcript will appear once speech is detected.",
      });
    } catch (error) {
      console.error("Failed to join meeting:", error);
      const { title, description } = getUserFriendlyError(error as Error);
      toast.error(title, { description });
    } finally {
      setIsJoining(false);
    }
  }, [
    parsedInput,
    platform,
    passcode,
    autoTranscribe,
    meeting,
    config?.defaultBotName,
    clearCurrentMeeting,
    setCurrentMeeting,
  ]);

  const handleLeave = useCallback(async () => {
    if (!meeting) return;

    try {
      await vexaAPI.stopBot(meeting.platform, meeting.platform_specific_id);
      toast.success("Bot stopped", {
        description: "The transcription bot has left the meeting.",
      });
    } catch (error) {
      const { title, description } = getUserFriendlyError(error as Error);
      toast.error(title, { description });
      return;
    }

    setMeeting(null);
    setSessionStartedAt(null);
    clearCurrentMeeting();
  }, [meeting, clearCurrentMeeting]);

  const handleOverrideChange = (id: string, value: string) => {
    setOverrides((current) =>
      current.map((item) => (item.id === id ? { ...item, value } : item))
    );
  };

  const handleAddOverride = () => {
    setOverrides((current) => [
      ...current,
      {
        id: `ov-${Date.now()}`,
        label: "Custom override",
        placeholder: "Describe the correction the agent should apply",
        value: "",
      },
    ]);
  };

  const handleRemoveOverride = (id: string) => {
    setOverrides((current) => current.filter((item) => item.id !== id));
  };

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-white text-foreground">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-5 py-3">
        <div className="flex items-center gap-3">
          <Logo size="sm" showText={false} />
          <div>
            <h1 className="text-base font-semibold tracking-[-0.02em]">{APP_NAME}</h1>
            <p className="text-xs text-muted-foreground">Join, listen, review Jira intents, steer detection</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {meeting && wsConnected && (
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Wifi className="h-3.5 w-3.5 text-emerald-600" />
              Live
            </span>
          )}
          {meeting && (
            <Button variant="ghost" size="sm" onClick={handleLeave}>
              <X className="h-4 w-4" />
              Close session
            </Button>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <LeftPanel
          meetingUrl={meetingUrl}
          onMeetingUrlChange={setMeetingUrl}
          platform={platform}
          onPlatformChange={setPlatform}
          passcode={passcode}
          onPasscodeChange={setPasscode}
          meeting={meeting}
          isJoining={isJoining}
          onJoin={handleJoin}
          onReconnect={handleJoin}
          onLeave={handleLeave}
          autoTranscribe={autoTranscribe}
          onAutoTranscribeChange={setAutoTranscribe}
          jiraEnabled={jiraEnabled}
          onJiraEnabledChange={setJiraEnabled}
          speakerCount={speakerCount}
          durationLabel={durationLabel}
        />

        <MainStream
          meeting={meeting}
          isJoining={isJoining}
          transcripts={liveTranscripts}
          wsConnecting={wsConnecting}
          wsConnected={wsConnected}
          wsError={wsError}
          autoTranscribe={autoTranscribe}
          jiraEnabled={jiraEnabled}
          jiraIntents={jiraIntents}
          jiraAnalyzing={jiraAnalyzing}
          jiraAiConfigured={jiraAiConfigured}
          jiraLastError={jiraLastError}
          onExecuteOnce={onJiraExecuteOnce}
          onAutoExecute={onJiraAutoExecute}
          onCancelIntent={handleCancel}
        />

        <OverridesPanel
          overrides={overrides}
          onChange={handleOverrideChange}
          onAdd={handleAddOverride}
          onRemove={handleRemoveOverride}
        />
      </div>
    </div>
  );
}
