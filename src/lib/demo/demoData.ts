export const businessName = "2ndmynd Workspace";

export const latestArtifact = {
  title: "Operating cadence for a decision room",
  date: "Jan 22, 2026",
  decision:
    "Adopt a weekly decision room with one conclusion at a time and a single owner for follow-through.",
  why:
    "The team is reacting to requests without a shared boundary, which blurs priorities and delays closure.",
  boundary:
    "This conclusion applies to the next 6 weeks and excludes hiring or pricing changes.",
  nextSteps: [
    "Name the decision owner and document the next action in one place.",
    "Schedule the first decision room and invite only decision-makers.",
    "Draft the messaging plan for the affected teams.",
    "Confirm the end date and what will be reviewed then.",
  ],
  insights: [
    "Outside perspective: the team is overloading context before agreeing on a boundary.",
    "Signals show competing narratives and no shared finish line.",
    "One clear next step is missing a single owner.",
  ],
};

export const insightSignals = [
  "Request volume rises when decisions do not have a named owner.",
  "Teams defer closure because the boundary is not explicit.",
  "Messaging changes stall when they lack an agreed conclusion.",
];

export const insightPointsTo = [
  "You need a small, consistent decision room that ends with a conclusion.",
  "Boundaries should be time-bound and visible to everyone involved.",
  "Clarity improves when one person is accountable for the next step.",
];

export const artifacts = [
  {
    title: "Operating cadence for a decision room",
    date: "Jan 22, 2026",
    summary: "One conclusion, one owner, six-week boundary.",
  },
  {
    title: "Reset the service handoff messaging",
    date: "Jan 09, 2026",
    summary: "Align the team to one narrative before external updates.",
  },
  {
    title: "Triage rules for urgent requests",
    date: "Dec 18, 2025",
    summary: "Define request-only intake and a clear escalation path.",
  },
];

export const requests = [
  {
    title: "Clarify decision ownership for Q1 rollouts",
    date: "Today",
    status: "New",
  },
  {
    title: "Outside perspective on service handoff story",
    date: "Yesterday",
    status: "Reviewing",
  },
  {
    title: "Scope boundary for a remote access request",
    date: "Jan 16, 2026",
    status: "Closed",
  },
];

export const connectors = [
  {
    name: "Cal.com",
    status: "Available",
    description: "Connect scheduling to the decision room.",
  },
  {
    name: "Zoom",
    status: "Available",
    description: "Launch a secure meeting from the workspace.",
  },
  {
    name: "Remote Access",
    status: "Request-only",
    description:
      "Remote access is request-only and time-bound. You control approval and can end the session anytime.",
  },
  {
    name: "Jobber",
    status: "Coming soon",
    description: "Sync service ops context for decisions.",
  },
  {
    name: "ServiceTitan",
    status: "Coming soon",
    description: "Bring field insights into one conclusion.",
  },
  {
    name: "QuickBooks",
    status: "Coming soon",
    description: "Align the decision room with cash timing.",
  },
  {
    name: "Google Calendar",
    status: "Coming soon",
    description: "Coordinate focus time around decisions.",
  },
];
