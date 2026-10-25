/** Strength presets. `skill` is Stockfish's "Skill Level" (0-20) and is what gets saved with the game. */
export interface BotLevel {
  skill: number;
  name: string;
  blurb: string;
  /** search limit per move: a fixed depth keeps the weakest levels weak, time keeps the strong ones honest */
  depth?: number;
  movetime?: number;
}

export const BOT_LEVELS: BotLevel[] = [
  { skill: 0, name: "Beginner", blurb: "Looks one move ahead and blunders a lot", depth: 1 },
  { skill: 4, name: "Casual", blurb: "Spots simple tactics", depth: 4 },
  { skill: 9, name: "Club player", blurb: "Solid, but beatable", movetime: 250 },
  { skill: 15, name: "Strong", blurb: "Rarely drops material", movetime: 600 },
  { skill: 20, name: "Maximum", blurb: "Full-strength lite engine", movetime: 1200 },
];

export const levelName = (skill: number) =>
  BOT_LEVELS.find((l) => l.skill === skill)?.name ?? `Level ${skill}`;
