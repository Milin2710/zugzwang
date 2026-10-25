// Rebuilds the derived data from the stored games: explorer position stats and per-user W/D/L counters.
// Ratings are NOT touched (they are the source of truth in the users collection).
// Usage: npm run stats:rebuild
import { connectMongo, disconnectMongo } from "../src/db/mongo.js";
import Game from "../src/models/Game.js";
import User from "../src/models/User.js";
import PositionStat from "../src/models/PositionStat.js";
import { explorerOps } from "../src/services/explorer.js";

await connectMongo();
await PositionStat.deleteMany({});

const counters = new Map(); // username -> { gamesPlayed, wins, draws, losses }
const bump = (name, key) => {
  const c = counters.get(name) ?? { gamesPlayed: 0, wins: 0, draws: 0, losses: 0 };
  c.gamesPlayed++;
  c[key]++;
  counters.set(name, c);
};

let games = 0;
let batch = [];
const flush = async () => {
  if (batch.length) await PositionStat.bulkWrite(batch, { ordered: false });
  batch = [];
};

for await (const g of Game.find({ version: 2, ratingApplied: true }).select("white black result moves").lean().cursor()) {
  games++;
  const [w, b] = g.result === "1-0" ? ["wins", "losses"] : g.result === "0-1" ? ["losses", "wins"] : ["draws", "draws"];
  bump(g.white, w);
  bump(g.black, b);
  batch.push(...explorerOps(g.moves, g.result));
  if (batch.length > 2000) await flush();
}
await flush();

await User.updateMany({}, { $set: { gamesPlayed: 0, wins: 0, draws: 0, losses: 0 } });
const ops = [...counters].map(([username, $set]) => ({
  updateOne: { filter: { usernameLower: username.toLowerCase() }, update: { $set } },
}));
if (ops.length) await User.bulkWrite(ops, { ordered: false });

console.log(`rebuilt from ${games} games: ${await PositionStat.countDocuments()} positions, ${counters.size} players`);
await disconnectMongo();
