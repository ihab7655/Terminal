import {useState} from 'react';
import {useInterval} from './useInterval.js';

export function useTicker(delay = 90) {
  const [tick, setTick] = useState(0);
  useInterval(() => setTick(value => value + 1), delay);
  return tick;
}
