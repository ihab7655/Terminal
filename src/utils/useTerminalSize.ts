import {useEffect, useState} from 'react';
import {clamp} from './clamp.js';

export type TerminalSize = {
  width: number;
  height: number;
};

const getSize = (): TerminalSize => ({
  width: clamp(process.stdout.columns || 96, 68, 160),
  height: clamp(process.stdout.rows || 32, 24, 60)
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
