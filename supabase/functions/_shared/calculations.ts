export type GoalLike = {
  id: string;
  name: string;
  target_amount: number;
  currency: string;
} | null;

export function goalPercent(amount: number, goal: GoalLike): number | null {
  if (!goal || !goal.target_amount || goal.target_amount <= 0) return null;
  return Number(((amount / goal.target_amount) * 100).toFixed(4));
}

export function asNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return 0;
}

export function money(value: unknown): number {
  const number = asNumber(value);
  if (!Number.isFinite(number)) return 0;
  return Number(number.toFixed(2));
}
