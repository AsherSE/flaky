/** Public invite link for a plan. Opening it lets anyone join the plan. */
export function inviteUrl(planId: string): string {
  return `https://flaky.me/m/${planId}`;
}
