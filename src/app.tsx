import React, {useRef, useState} from 'react';
import {Box, useInput} from 'ink';
import {BootSequence} from './boot/BootSequence.js';
import {ConsoleShell} from './console/ConsoleShell.js';
import {EngineDiagnostics} from './diagnostics/EngineDiagnostics.js';
import {launcherItems} from './data/fakeConversation.js';
import {clamp} from './utils/clamp.js';
import {useTerminalSize} from './utils/useTerminalSize.js';

const MAX_INPUT = 120;

type Line = {value: string; cursor: number};

// Someone reaching for the keyboard, rather than a byte arriving on stdin: a
// printable character that is not part of a chord, or one of the keys a person
// presses to move a screen along.
function pressedAKey(input: string, key: {[flag: string]: boolean}) {
  // The named keys count first. Ink reports a bare Escape with meta set too,
  // so asking about the chord flags before them lost Escape entirely.
  if (
    key.return ||
    key.escape ||
    key.tab ||
    key.upArrow ||
    key.downArrow ||
    key.leftArrow ||
    key.rightArrow ||
    key.pageUp ||
    key.pageDown ||
    key.backspace ||
    key.delete
  ) {
    return true;
  }
  // A chord is aimed at something, not at getting the screen out of the way —
  // and a stray NUL arrives as one, reported as ctrl with a backtick.
  if (key.ctrl || key.meta) return false;
  return [...input].some(char => char >= ' ' && char !== '\u007f');
}

export function App() {
  const size = useTerminalSize();
  const [bootComplete, setBootComplete] = useState(false);
  // Placed after the dragon for now. What gates it — first run only, or every
  // launch — is still open, so it is a plain step in the sequence.
  const [diagnosticsComplete, setDiagnosticsComplete] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState('');

  // The composed line is one value, and a ref is what the key handlers read.
  //
  // It used to be two pieces of state read out of the handler's closure, which
  // meant every key arriving inside the same render saw the same stale line and
  // the last one won. Typed at speed, "explain the project" arrived as
  // "epantepoet" — nine of nineteen characters gone. Typed slowly, or pasted as
  // one chunk, it was fine, which is why it went unnoticed. The ref settles
  // synchronously, so each key edits what the key before it left behind.
  const [line, setLineState] = useState<Line>({value: '', cursor: 0});
  const lineRef = useRef(line);
  const {value, cursor} = line;

  const edit = (change: (current: Line) => Line) => {
    const next = change(lineRef.current);
    const clipped = next.value.slice(0, MAX_INPUT);
    const settled = {value: clipped, cursor: clamp(next.cursor, 0, clipped.length)};
    lineRef.current = settled;
    setLineState(settled);
  };

  const setLine = (next: string, at: number) => edit(() => ({value: next, cursor: at}));

  const recall = (step: -1 | 1) => {
    if (history.length === 0) return;
    if (step === -1) {
      const next = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
      if (historyIndex === null) setDraft(lineRef.current.value);
      setHistoryIndex(next);
      setLine(history[next]!, MAX_INPUT);
      return;
    }

    if (historyIndex === null) return;
    if (historyIndex >= history.length - 1) {
      setHistoryIndex(null);
      setLine(draft, MAX_INPUT);
      return;
    }
    const next = historyIndex + 1;
    setHistoryIndex(next);
    setLine(history[next]!, MAX_INPUT);
  };

  // Ctrl+C quits: Ink's exitOnCtrlC owns it, which keeps every printable key
  // free for the composer. A plain letter must never be a command.
  useInput((input, key) => {
    // Any key during the opening goes straight to the console. The welcome page
    // and the diagnostics screen run 15.8 seconds between them, which is worth
    // watching once and tiresome by the tenth run. The key that skips is spent
    // on skipping and does not also reach the composer.
    //
    // A key, though, and not merely something on stdin. Skipping on anything at
    // all meant a single NUL byte — which arrives as ctrl+` whenever stdin is
    // not a keyboard — jumped straight past both screens: recorded from a pty,
    // the welcome page and the diagnostics screen never rendered once.
    if (!bootComplete || !diagnosticsComplete) {
      if (!pressedAKey(input, key)) return;
      setBootComplete(true);
      setDiagnosticsComplete(true);
      return;
    }

    if (key.ctrl && input === 'k') {
      setLauncherOpen(open => !open);
      return;
    }

    if (key.escape) {
      setLauncherOpen(false);
      return;
    }

    if (launcherOpen) {
      if (key.upArrow) setSelectedIndex(index => Math.max(0, index - 1));
      if (key.downArrow) setSelectedIndex(index => Math.min(launcherItems.length - 1, index + 1));
      const asNumber = Number(input);
      if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= launcherItems.length) {
        setSelectedIndex(asNumber - 1);
      }
      return;
    }

    if (key.leftArrow) {
      edit(current => ({...current, cursor: current.cursor - 1}));
      return;
    }

    if (key.rightArrow) {
      edit(current => ({...current, cursor: current.cursor + 1}));
      return;
    }

    if (key.upArrow) {
      recall(-1);
      return;
    }

    if (key.downArrow) {
      recall(1);
      return;
    }

    if (key.ctrl) {
      // Readline chords, so the arrow keys stay free for history.
      if (input === 'a') edit(current => ({...current, cursor: 0}));
      if (input === 'e') edit(current => ({...current, cursor: current.value.length}));
      if (input === 'u') setLine('', 0);
      if (input === 'd') {
        edit(current => ({
          value: current.value.slice(0, current.cursor) + current.value.slice(current.cursor + 1),
          cursor: current.cursor
        }));
      }
      return;
    }

    if (key.backspace || key.delete) {
      edit(current =>
        current.cursor === 0
          ? current
          : {
              value: current.value.slice(0, current.cursor - 1) + current.value.slice(current.cursor),
              cursor: current.cursor - 1
            }
      );
      return;
    }

    if (key.return) {
      const sent = lineRef.current.value;
      if (sent.trim().length > 0) setHistory(entries => [...entries, sent]);
      setHistoryIndex(null);
      setDraft('');
      setLine('', 0);
      return;
    }

    // A paste arrives as one chunk, so insert everything printable in it
    // rather than only single keystrokes.
    if (input && !key.meta) {
      const printable = [...input].filter(char => char >= ' ' && char !== '\u007f').join('');
      if (printable.length > 0) {
        edit(current => ({
          value: current.value.slice(0, current.cursor) + printable + current.value.slice(current.cursor),
          cursor: current.cursor + printable.length
        }));
      }
    }
  });

  return (
    <Box flexDirection="column">
      {bootComplete && diagnosticsComplete ? (
        <ConsoleShell
          size={size}
          composerValue={value}
          composerCursor={cursor}
          launcherOpen={launcherOpen}
          selectedIndex={selectedIndex}
        />
      ) : bootComplete ? (
        <EngineDiagnostics size={size} onComplete={() => setDiagnosticsComplete(true)} />
      ) : (
        <BootSequence size={size} onComplete={() => setBootComplete(true)} />
      )}
    </Box>
  );
}
