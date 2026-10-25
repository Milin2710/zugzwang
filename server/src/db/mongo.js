import mongoose from "mongoose";
import { config } from "../config/index.js";
import { logger } from "../utils/logger.js";

export async function connectMongo() {
  mongoose.connection.on("error", (err) => logger.error("mongo error", { err }));
  mongoose.connection.on("disconnected", () => logger.warn("mongo disconnected"));
  await mongoose.connect(config.mongoUri);
  logger.info("mongo connected");
}

export const disconnectMongo = () => mongoose.disconnect();
