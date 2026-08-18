export type StoryTone = 'user' | 'engine' | 'search' | 'tool' | 'event';

export type StoryItem = {
  id: string;
  tone: StoryTone;
  label: string;
  text: string;
  detail?: string[];
  status?: 'complete' | 'active' | 'quiet';
};

export const story: StoryItem[] = [
  {
    id: 'ask',
    tone: 'user',
    label: 'YOU',
    text: 'Build a tool that extracts every link from a webpage.'
  },
  {
    id: 'intent',
    tone: 'engine',
    label: 'ENGINE',
    text: "I'll investigate the task and determine the best approach.",
    status: 'complete'
  },
  {
    id: 'search',
    tone: 'search',
    label: 'WEB SEARCH',
    text: 'Collecting relevant context...',
    detail: [
      'Scoped target: static HTML and redirected documents',
      'Risk check: duplicate links, fragments, relative URLs',
      'Output shape: source URL, resolved URL, anchor text'
    ],
    status: 'complete'
  },
  {
    id: 'build',
    tone: 'engine',
    label: 'ENGINE',
    text: "I found the required information. I'm building the solution.",
    status: 'active'
  },
  {
    id: 'write',
    tone: 'tool',
    label: 'TOOL',
    text: 'Write(src/tools/extract_links.py)',
    detail: ['completed'],
    status: 'complete'
  },
  {
    id: 'ready',
    tone: 'engine',
    label: 'ENGINE',
    text: 'The first pass is complete. The result is ready to inspect.',
    status: 'quiet'
  }
];

export type LauncherViewId =
  | 'conversations'
  | 'workspaces'
  | 'capabilities'
  | 'policies'
  | 'assist'
  | 'settings'
  | 'help';

export type LauncherItem = {
  id: LauncherViewId;
  label: string;
  hint: string;
  entries: string[];
};

export const launcherItems: LauncherItem[] = [
  {
    id: 'conversations',
    label: 'Conversations',
    hint: 'Recent story threads and pinned work.',
    entries: ['Link extractor prototype', 'Credential scrubber design', 'Scheduler repair notes']
  },
  {
    id: 'workspaces',
    label: 'Workspaces',
    hint: 'Local project surfaces known to the console.',
    entries: ['aurora-labs/site', 'engine-sandbox', 'dragon-console-prototype']
  },
  {
    id: 'capabilities',
    label: 'Capabilities',
    hint: 'Mock capability registry for visual direction.',
    entries: ['Research', 'Patch files', 'Render document', 'Inspect browser']
  },
  {
    id: 'policies',
    label: 'Policies',
    hint: 'Operating boundaries and approval modes.',
    entries: ['Visual prototype only', 'No engine integration', 'Mock execution events']
  },
  {
    id: 'assist',
    label: 'Assist',
    hint: 'Contextual operator assistance.',
    entries: ['Explain current step', 'Show hidden details', 'Suggest next action']
  },
  {
    id: 'settings',
    label: 'Settings',
    hint: 'Console appearance and interaction settings.',
    entries: ['Signal density: calm', 'Boot sequence: cinematic', 'Composer mode: keyboard-first']
  },
  {
    id: 'help',
    label: 'Help',
    hint: 'Keyboard and console affordances.',
    entries: ['Ctrl+K opens launcher', 'Escape closes contextual UI', 'Q quits prototype']
  }
];
