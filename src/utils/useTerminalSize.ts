import {useEffect, useState} from 'react';

export type TerminalSize = {
  width: number;
  height: number;
};

// Report what the terminal actually is. Clamping this UP was a quiet lie: on a
// window narrower than the floor, every screen drew wider than the terminal,
// each line wrapped, the frame grew past the viewport, and the whole thing
// juddered. A screen that wants a minimum must handle not getting it.
const getSize = (): TerminalSize => ({
  width: process.stdout.columns || 96,
  height: process.stdout.rows || 32
});

export function useTerminalSize() {
  const [size, setSize] = useState(getSize);

  useEffect(() => {
    const onResize = () => setSize(getSize());
    process.stdout.on('resize', onResize);
    return () => {
      process.stdout.off('resize', onResize);
    };
  }, []);

  return size;
}
