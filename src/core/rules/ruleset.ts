export interface RuleSet {
  /** Landing exactly on the last cell is required to win. */
  exactRollToWin: boolean;
  /** With exactRollToWin: overshoot bounces back (at 98, roll 5 → land 97). Off: token stays put. */
  bounceOnOvershoot: boolean;
  /** Rolling a 6 grants another roll... */
  rollSixAgain: boolean;
  /** ...capped: the Nth consecutive six forfeits the move (classic N=3). */
  maxConsecutiveSixes: number;
  /** Landing on an opponent sends them back to start (cell 0). Default OFF. */
  captureEnabled: boolean;
  /** A token must roll a 1 or a 6 to leave the off-board start. */
  requireEntryRoll: boolean;
}

export const CLASSIC_RULES: RuleSet = {
  exactRollToWin: true,
  bounceOnOvershoot: true,
  rollSixAgain: true,
  maxConsecutiveSixes: 3,
  captureEnabled: false,
  requireEntryRoll: false,
};
