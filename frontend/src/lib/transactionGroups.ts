/** Keep the API's order within each day; the caller enables this only for date sorting. */
export function groupTransactionsByDate<T extends { date: string }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(item.date);
    if (group) group.push(item);
    else groups.set(item.date, [item]);
  }
  return Array.from(groups, ([date, items]) => ({ date, items }));
}
