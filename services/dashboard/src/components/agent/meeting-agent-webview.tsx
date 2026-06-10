"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import {
  AudioLines,
  Bot,
  BrainCircuit,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileText,
  Link2,
  Lock,
  Play,
  Radio,
  RefreshCw,
  Settings,
  ShieldCheck,
  Sparkles,
  TicketCheck,
  XCircle,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

const transcript = [
  {
    speaker: "Priya",
    time: "10:18:04",
    text: "Checkout keeps timing out for Marketplace sellers when they attach a large CSV.",
    active: false,
  },
  {
    speaker: "Marcus",
    time: "10:18:21",
    text: "Let's create a Jira for Platform Tools. Priority should be high because onboarding is blocked.",
    active: true,
  },
  {
    speaker: "Avery",
    time: "10:18:37",
    text: "Add the logs from yesterday and assign it to the intake triage owner.",
    active: false,
  },
];

const confidenceFactors = ["Issue intent", "Team", "Priority", "Assignee"];

type ExecutionMode = "approval" | "always" | "never";

function SignalRing({ connected }: { connected: boolean }) {
  return (
    <div className="relative mx-auto flex aspect-square min-h-[250px] w-full max-w-[380px] items-center justify-center rounded-full border border-[#0071dc]/30 bg-[radial-gradient(circle_at_center,rgba(0,113,220,0.28),rgba(0,0,0,0)_62%)] shadow-[0_0_80px_rgba(0,113,220,0.28)]">
      <div className="absolute inset-5 rounded-full border border-dashed border-[#78b9ff]/40" />
      <div className="absolute inset-12 rounded-full border border-[#ffc220]/25" />
      <div className="absolute h-[72%] w-[72%] rounded-full bg-[conic-gradient(from_120deg,rgba(0,113,220,0.08),rgba(120,185,255,0.85),rgba(255,194,32,0.55),rgba(0,113,220,0.08))] p-[1px]">
        <div className="h-full w-full rounded-full bg-[#061526]/80 backdrop-blur" />
      </div>
      <div className="relative z-10 flex h-[52%] w-[52%] flex-col items-center justify-center rounded-full border border-[#78b9ff]/40 bg-[#061526]/90 text-center shadow-[inset_0_0_50px_rgba(0,113,220,0.18)]">
        <div className="mb-3 rounded-full border border-[#ffc220]/40 bg-[#ffc220]/15 p-3 text-[#ffc220]">
          <Bot className="h-8 w-8" />
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.34em] text-[#78b9ff]">Jarvis Mode</p>
        <p className="mt-2 text-3xl font-semibold text-white">{connected ? "Live" : "Ready"}</p>
        <p className="mt-1 text-xs text-[#c7ddf4]">Walmart Meeting Agent</p>
      </div>
      <div className="absolute bottom-7 flex items-center gap-2 rounded-full border border-[#78b9ff]/25 bg-black/25 px-3 py-1.5 text-xs text-[#c7ddf4]">
        <Radio className={cn("h-3.5 w-3.5", connected && "text-emerald-300")} />
        {connected ? "Streaming conversation" : "Awaiting connection"}
      </div>
    </div>
  );
}

function ModeButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors",
        active
          ? "border-[#ffc220]/70 bg-[#ffc220]/15 text-white shadow-[0_0_24px_rgba(255,194,32,0.15)]"
          : "border-white/10 bg-white/[0.04] text-[#a9c4de] hover:border-[#78b9ff]/40 hover:text-white"
      )}
    >
      {children}
    </button>
  );
}

export function MeetingAgentWebview() {
  const [connected, setConnected] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(true);
  const [executionMode, setExecutionMode] = useState<ExecutionMode>("approval");
  const [jiraExecuted, setJiraExecuted] = useState(false);
  const [jiraDismissed, setJiraDismissed] = useState(false);
  const approvalRequired = executionMode === "approval" && !jiraExecuted && !jiraDismissed;
  const autoExecute = executionMode === "always";
  const blocked = executionMode === "never";

  return (
    <div className="min-h-full overflow-hidden rounded-3xl border border-[#0071dc]/20 bg-[#020b17] text-white shadow-2xl">
      <div className="relative isolate min-h-[calc(100vh-7rem)] overflow-hidden">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_12%,rgba(0,113,220,0.34),transparent_31%),radial-gradient(circle_at_88%_0%,rgba(255,194,32,0.18),transparent_28%),linear-gradient(135deg,#020b17,#061526_46%,#001e42)]" />
        <div className="absolute inset-0 -z-10 bg-grid-pattern text-[#78b9ff]/10" />

        <header className="flex flex-col gap-4 border-b border-white/10 bg-black/20 px-5 py-4 backdrop-blur md:flex-row md:items-center md:justify-between md:px-7">
          <div className="flex items-center gap-3">
            <div className="rounded-2xl border border-[#ffc220]/40 bg-[#ffc220]/15 p-2 text-[#ffc220]">
              <Sparkles className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-[-0.03em] text-white">Meeting Agent Command View</h1>
                <Badge className="border-[#0071dc]/40 bg-[#0071dc]/20 text-[#c7ddf4]" variant="outline">
                  Walmart Theme
                </Badge>
              </div>
              <p className="text-sm text-[#a9c4de]">Connect, listen, extract Jira intent, and decide execution policy in one Jarvis-style webview.</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              className="border-[#78b9ff]/30 bg-white/5 text-white hover:bg-white/10"
              variant="outline"
              onClick={() => setSettingsOpen((value) => !value)}
            >
              <Settings className="h-4 w-4" />
              Settings
            </Button>
            <Button
              className={cn(
                "text-[#04111f]",
                connected ? "bg-[#ffc220] hover:bg-[#f4b400]" : "bg-[#78b9ff] hover:bg-[#5faeff]"
              )}
              onClick={() => setConnected((value) => !value)}
            >
              {connected ? <RefreshCw className="h-4 w-4" /> : <Link2 className="h-4 w-4" />}
              {connected ? "Reconnect" : "Connect Meeting"}
            </Button>
          </div>
        </header>

        <main className="grid gap-5 p-5 md:p-7 xl:grid-cols-[1.05fr_1.35fr_0.9fr]">
          <section className="space-y-5">
            <Card className="border-white/10 bg-white/[0.05] p-5 shadow-none backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#78b9ff]">Meeting Link</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Connect to live meeting</h2>
                </div>
                <Badge className="border-emerald-300/40 bg-emerald-400/10 text-emerald-200" variant="outline">
                  {connected ? "Connected" : "Idle"}
                </Badge>
              </div>
              <div className="mt-4 space-y-3">
                <Label className="text-[#c7ddf4]" htmlFor="meeting-url">Meeting URL</Label>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="meeting-url"
                    value="https://meet.google.com/wmt-agent-sync"
                    readOnly
                    className="border-white/10 bg-black/25 text-[#dcecff]"
                  />
                  <Button className="bg-[#0071dc] text-white hover:bg-[#005fb8]">
                    <Play className="h-4 w-4" />
                    Join
                  </Button>
                </div>
                <div className="grid gap-2 text-xs text-[#a9c4de] sm:grid-cols-3">
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <Clock3 className="mb-2 h-4 w-4 text-[#ffc220]" />
                    18m active
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <AudioLines className="mb-2 h-4 w-4 text-[#78b9ff]" />
                    3 speakers
                  </div>
                  <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                    <ShieldCheck className="mb-2 h-4 w-4 text-emerald-300" />
                    SSO secured
                  </div>
                </div>
              </div>
            </Card>

            <SignalRing connected={connected} />
          </section>

          <section className="space-y-5">
            <Card className="border-white/10 bg-white/[0.05] p-0 shadow-none backdrop-blur">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#78b9ff]">Live Stream</p>
                  <h2 className="text-lg font-semibold text-white">Conversation transcript</h2>
                </div>
                <div className="flex items-center gap-2 text-xs text-[#a9c4de]">
                  <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_14px_rgba(110,231,183,0.9)]" />
                  212 words/min
                </div>
              </div>
              <div className="space-y-3 p-5">
                {transcript.map((item) => (
                  <div
                    key={`${item.speaker}-${item.time}`}
                    className={cn(
                      "rounded-2xl border p-4 transition-colors",
                      item.active
                        ? "border-[#ffc220]/50 bg-[#ffc220]/10 shadow-[0_0_28px_rgba(255,194,32,0.1)]"
                        : "border-white/10 bg-black/20"
                    )}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <span className="font-semibold text-white">{item.speaker}</span>
                      <span className="font-mono text-xs text-[#78b9ff]">{item.time}</span>
                    </div>
                    <p className="text-sm leading-6 text-[#dcecff]">{item.text}</p>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="border-[#ffc220]/30 bg-[#ffc220]/10 p-5 shadow-none backdrop-blur">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className="border-[#ffc220]/50 bg-[#ffc220]/20 text-[#fff5c2]" variant="outline">
                      Jira Intent Detected
                    </Badge>
                    <Badge className="border-emerald-300/40 bg-emerald-400/10 text-emerald-200" variant="outline">
                      94 percent confidence
                    </Badge>
                  </div>
                  <div>
                    <h2 className="text-xl font-semibold text-white">Create high-priority Platform Tools Jira</h2>
                    <p className="mt-1 text-sm text-[#dcecff]">Detected from live conversation: seller CSV upload timeout blocks onboarding.</p>
                  </div>
                  <div className="grid gap-2 text-sm sm:grid-cols-2">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#78b9ff]">Project</p>
                      <p className="mt-1 font-semibold text-white">PLATFORMTOOLS</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#78b9ff]">Priority</p>
                      <p className="mt-1 font-semibold text-white">High</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#78b9ff]">Issue Type</p>
                      <p className="mt-1 font-semibold text-white">Bug</p>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                      <p className="text-xs uppercase tracking-[0.18em] text-[#78b9ff]">Action</p>
                      <p className="mt-1 font-semibold text-white">Create ticket</p>
                    </div>
                  </div>
                </div>
                <div className="min-w-[220px] rounded-2xl border border-white/10 bg-black/25 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#78b9ff]">Execution</p>
                  <div className="mt-3 space-y-2 text-sm text-[#dcecff]">
                    {autoExecute && <StatusLine icon={Zap} label="Auto execution enabled" tone="blue" />}
                    {blocked && <StatusLine icon={Lock} label="Execution blocked by policy" tone="amber" />}
                    {approvalRequired && <StatusLine icon={CircleDashed} label="Awaiting approval" tone="blue" />}
                    {jiraExecuted && <StatusLine icon={CheckCircle2} label="Jira creation queued" tone="green" />}
                    {jiraDismissed && <StatusLine icon={XCircle} label="Intent dismissed" tone="red" />}
                  </div>
                  <div className="mt-4 flex flex-col gap-2">
                    <Button
                      className="bg-[#0071dc] text-white hover:bg-[#005fb8]"
                      disabled={blocked || jiraExecuted || jiraDismissed}
                      onClick={() => setJiraExecuted(true)}
                    >
                      <TicketCheck className="h-4 w-4" />
                      Execute Jira
                    </Button>
                    <Button
                      className="border-white/10 bg-white/5 text-white hover:bg-white/10"
                      disabled={autoExecute || jiraExecuted || jiraDismissed}
                      variant="outline"
                      onClick={() => setJiraDismissed(true)}
                    >
                      <XCircle className="h-4 w-4" />
                      Do Not Execute
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </section>

          <aside className="space-y-5">
            {settingsOpen && (
              <Card className="border-white/10 bg-white/[0.05] p-5 shadow-none backdrop-blur">
                <div className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-[#ffc220]" />
                  <h2 className="text-lg font-semibold text-white">Settings Override</h2>
                </div>
                <p className="mt-2 text-sm text-[#a9c4de]">Control whether extracted Jira intents require approval or follow an override policy.</p>
                <div className="mt-4 grid gap-2">
                  <ModeButton active={executionMode === "approval"} onClick={() => setExecutionMode("approval")}>
                    Ask before execution
                  </ModeButton>
                  <ModeButton active={executionMode === "always"} onClick={() => setExecutionMode("always")}>
                    Always execute Jira intents
                  </ModeButton>
                  <ModeButton active={executionMode === "never"} onClick={() => setExecutionMode("never")}>
                    Never execute automatically
                  </ModeButton>
                </div>
                <div className="mt-5 space-y-4 border-t border-white/10 pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-white">Require Jira preview</Label>
                      <p className="mt-1 text-xs text-[#a9c4de]">Show fields before action.</p>
                    </div>
                    <Switch checked={executionMode !== "always"} onCheckedChange={() => setExecutionMode(executionMode === "always" ? "approval" : "always")} />
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <Label className="text-white">Restrict destructive actions</Label>
                      <p className="mt-1 text-xs text-[#a9c4de]">Creation allowed, edits require approval.</p>
                    </div>
                    <Switch checked />
                  </div>
                </div>
              </Card>
            )}

            <Card className="border-white/10 bg-white/[0.05] p-5 shadow-none backdrop-blur">
              <div className="flex items-center gap-2">
                <BrainCircuit className="h-5 w-5 text-[#78b9ff]" />
                <h2 className="text-lg font-semibold text-white">Intent Analysis</h2>
              </div>
              <div className="mt-4 space-y-3">
                {confidenceFactors.map((factor, index) => (
                  <div key={factor}>
                    <div className="mb-1 flex items-center justify-between text-xs text-[#a9c4de]">
                      <span>{factor}</span>
                      <span>{96 - index * 3} percent</span>
                    </div>
                    <div className="h-2 rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#0071dc] to-[#ffc220]"
                        style={{ width: `${96 - index * 3}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="border-white/10 bg-white/[0.05] p-5 shadow-none backdrop-blur">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#ffc220]" />
                <h2 className="text-lg font-semibold text-white">Execution Log</h2>
              </div>
              <div className="mt-4 space-y-3 text-sm text-[#dcecff]">
                <LogLine label="Meeting connected" value="10:16:09" />
                <LogLine label="Transcript stream active" value="10:16:18" />
                <LogLine label="Jira intent extracted" value="10:18:22" />
                <LogLine label="Policy mode" value={executionMode} />
              </div>
            </Card>
          </aside>
        </main>
      </div>
    </div>
  );
}

function StatusLine({
  icon: Icon,
  label,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  tone: "amber" | "blue" | "green" | "red";
}) {
  const toneClass = {
    amber: "text-[#ffc220]",
    blue: "text-[#78b9ff]",
    green: "text-emerald-300",
    red: "text-red-300",
  }[tone];

  return (
    <div className="flex items-center gap-2">
      <Icon className={cn("h-4 w-4", toneClass)} />
      <span>{label}</span>
    </div>
  );
}

function LogLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
      <span className="text-[#a9c4de]">{label}</span>
      <span className="font-mono text-xs text-white">{value}</span>
    </div>
  );
}
