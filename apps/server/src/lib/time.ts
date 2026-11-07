export function startOfMonthLocal(now: number) {
  const date = new Date(now);
  return new Date(date.getFullYear(), date.getMonth(), 1).getTime();
}

export function startOfDayLocal(now: number) {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function endOfDayLocal(now: number) {
  return startOfDayLocal(now) + 86_400_000 - 1;
}
