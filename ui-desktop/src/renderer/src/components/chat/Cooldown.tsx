import { useEffect, useState } from 'react';
import { getTimeRemaining } from './utils.js';

const ZERO = { hours: 0, minutes: 0, seconds: 0 };

// Clamp at zero: once endDate is in the past, getTimeRemaining returns negative
// parts (rendered as "-1:-3:-11"). A finished countdown should read 00:00:00.
const remainingAt = (endDate: number) => {
  if (!endDate || endDate * 1000 - Date.now() <= 0) {
    return ZERO;
  }
  return getTimeRemaining(new Date(endDate * 1000));
};

const Cooldown = ({ endDate }) => {
  const [time, setTime] = useState<any>(() => remainingAt(endDate));
  const { hours, minutes, seconds } = time;
  useEffect(() => {
    setTime(remainingAt(endDate));
    const interval = setInterval(() => setTime(remainingAt(endDate)), 1000);
    return () => {
      clearInterval(interval);
    };
  }, [endDate]);

  return (
    <span style={{ fontSize: '12px' }}>
      {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:
      {String(seconds).padStart(2, '0')}
    </span>
  );
};

export { Cooldown };
