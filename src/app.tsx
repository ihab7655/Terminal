import React, {useState} from 'react';
import {Box, useApp, useInput} from 'ink';
import {BootSequence} from './boot/BootSequence.js';
import {ConsoleShell} from './console/ConsoleShell.js';
import {launcherItems} from './data/fakeConversation.js';
import {useTerminalSize} from './utils/useTerminalSize.js';

export function App() {
  const size = useTerminalSize();
  const {exit} = useApp();
  const [bootComplete, setBootComplete] = useState(false);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [composerValue, setComposerValue] = useState('');

  useInput((input, key) => {
    if (input.toLowerCase() === 'q') {
      exit();
      return;
    }

    if (!bootComplete) return;

    if (key.ctrl && input.toLowerCase() === 'k') {
      setLauncherOpen(value => !value);
      return;
    }

    if (key.escape) {
      setLauncherOpen(false);
      return;
    }

    if (launcherOpen) {
      if (key.upArrow) setSelectedIndex(value => Math.max(0, value - 1));
      if (key.downArrow) setSelectedIndex(value => Math.min(launcherItems.length - 1, value + 1));
      const asNumber = Number(input);
      if (Number.isInteger(asNumber) && asNumber >= 1 && asNumber <= launcherItems.length) {
        setSelectedIndex(asNumber - 1);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setComposerValue(value => value.slice(0, -1));
      return;
    }

    if (key.return) {
      setComposerValue('');
      return;
    }

    if (input && !key.ctrl && !key.meta && input.length === 1) {
      setComposerValue(value => `${value}${input}`.slice(0, 120));
    }
  });

  return (
    <Box flexDirection="column">
      {bootComplete ? (
        <ConsoleShell
          size={size}
          composerValue={composerValue}
          launcherOpen={launcherOpen}
          selectedIndex={selectedIndex}
        />
      ) : (
        <BootSequence size={size} onComplete={() => setBootComplete(true)} />
      )}
    </Box>
  );
}
