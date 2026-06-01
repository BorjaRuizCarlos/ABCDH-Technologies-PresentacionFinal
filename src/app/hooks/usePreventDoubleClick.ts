import { useRef, useCallback } from 'react';

export function usePreventDoubleClick(callback: () => void | Promise<void>, delay: number = 1000) {
  const lastClickRef = useRef<number>(0);

  return useCallback(async () => {
    const now = Date.now();
    if (now - lastClickRef.current < delay) {
      return;
    }
    lastClickRef.current = now;
    await callback();
  }, [callback, delay]);
}
