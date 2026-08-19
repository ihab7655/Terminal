import {useState} from 'react';
import {useInterval} from './useInterval.js';

// `until` stops the interval once the sequence has played out, so a finished
// animation costs nothing instead of re-rendering the tree forever.
export function useTicker(delay = 90, until?: number) {
  const [tick, setTick] = useState(0);
  const running = until === undefined || tick < until;
  useInterval(() => setTick(value => value + 1), running ? delay : null);
  return tick;
}
