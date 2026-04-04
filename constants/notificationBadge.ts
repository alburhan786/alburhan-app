export const NOTIFS_VIEWED_AT_KEY = (userId: number | string) =>
  `notificationsViewedAt:${userId}`;

export const NOTIFS_VIEWED_QUERY_KEY = (userId: number | string) =>
  ["notificationsViewedAt", userId] as const;
