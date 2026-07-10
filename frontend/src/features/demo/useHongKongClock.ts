import { useEffect, useState } from "react";


export function useHongKongClock(serverTime?: string) {
  const [currentTime, setCurrentTime] = useState<Date | null>(
    serverTime ? new Date(serverTime) : null,
  );

  useEffect(() => {
    if (!serverTime) {
      setCurrentTime(null);
      return;
    }
    const serverTimestamp = new Date(serverTime).getTime();
    const synchronizedAt = Date.now();
    const update = () => {
      setCurrentTime(new Date(serverTimestamp + Date.now() - synchronizedAt));
    };
    update();
    const interval = window.setInterval(update, 1_000);
    return () => window.clearInterval(interval);
  }, [serverTime]);

  return currentTime;
}
