export type ForecastWeather = "sunny" | "stormy" | "foggy" | "windy" | "rainbow";

export type ForecastReward = {
  weather: ForecastWeather | null;
  triggered: boolean;
  bonusNp: number;
  bonusBp: number;
  hidden?: boolean;
};

type QueuedForecastReward = ForecastReward & {
  eventId: string;
  queuedAt: number;
};

const EVENT_NAME = "nimbus:forecast-reward";
const STORAGE_KEY = "nimbus:pending-forecast-rewards";
const MAX_PENDING_REWARDS = 5;

function readQueue(): QueuedForecastReward[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(rewards: QueuedForecastReward[]) {
  try {
    if (rewards.length === 0) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rewards.slice(-MAX_PENDING_REWARDS)));
  } catch {
    // The live event still works when storage is unavailable.
  }
}

function removeQueuedReward(eventId: string) {
  writeQueue(readQueue().filter((reward) => reward.eventId !== eventId));
}

function isDisplayableReward(reward: ForecastReward | null | undefined): reward is ForecastReward {
  return Boolean(reward?.triggered && reward.weather);
}

export function publishForecastReward(reward: ForecastReward) {
  if (!isDisplayableReward(reward)) return;

  const queuedReward: QueuedForecastReward = {
    ...reward,
    eventId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    queuedAt: Date.now(),
  };

  writeQueue([...readQueue(), queuedReward]);
  window.dispatchEvent(new CustomEvent<QueuedForecastReward>(EVENT_NAME, {
    detail: queuedReward,
  }));
}

export function subscribeToForecastRewards(onReward: (reward: ForecastReward) => void) {
  const deliver = (reward: QueuedForecastReward) => {
    if (!isDisplayableReward(reward)) return;
    removeQueuedReward(reward.eventId);
    onReward(reward);
  };

  const handleReward = (event: Event) => {
    deliver((event as CustomEvent<QueuedForecastReward>).detail);
  };

  window.addEventListener(EVENT_NAME, handleReward);

  // Listening first and draining second closes the route/remount timing gap.
  readQueue().forEach(deliver);

  return () => window.removeEventListener(EVENT_NAME, handleReward);
}
