/**
 * Thin wrapper around the Stockfish WebAssembly build running in a Web Worker.
 * Stockfish speaks UCI over postMessage: we send plain-text commands and read plain-text lines back.
 */
import type { BotLevel } from "./bot";

const ENGINE_URL = "/stockfish/stockfish-19-lite-single.js";

type Listener = (line: string) => void;

export class StockfishEngine {
  private worker: Worker | null = null;
  private listeners = new Set<Listener>();
  private ready: Promise<void> | null = null;
  /** Searches run one at a time, so a late "bestmove" line can never answer the wrong question. */
  private queue: Promise<unknown> = Promise.resolve();

  /** Starts the worker and waits for the engine to say it is ready. Safe to call repeatedly. */
  init(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise<void>((resolve, reject) => {
      let worker: Worker;
      try {
        worker = new Worker(ENGINE_URL);
      } catch (e) {
        return reject(e);
      }
      this.worker = worker;
      worker.onmessage = (ev: MessageEvent) => {
        const line = typeof ev.data === "string" ? ev.data : String(ev.data);
        this.listeners.forEach((l) => l(line));
      };
      worker.onerror = () => reject(new Error("The chess engine could not be loaded"));
      const timer = setTimeout(() => reject(new Error("The chess engine took too long to start")), 20_000);
      this.once((l) => l === "uciok", () => {
        this.send("isready");
        this.once((l2) => l2 === "readyok", () => {
          clearTimeout(timer);
          resolve();
        });
      });
      this.send("uci");
    });
    return this.ready;
  }

  private send(cmd: string) {
    this.worker?.postMessage(cmd);
  }

  private once(match: (line: string) => boolean, fn: (line: string) => void) {
    const l: Listener = (line) => {
      if (!match(line)) return;
      this.listeners.delete(l);
      fn(line);
    };
    this.listeners.add(l);
  }

  /** Best move for the position reached by `moves` (UCI strings like "e2e4") from the start, e.g. "e7e5" or "e7e8q". */
  bestMove(moves: string[], level: BotLevel): Promise<string> {
    const run = async () => {
      await this.init();
      return new Promise<string>((resolve) => {
        this.once(
          (l) => l.startsWith("bestmove"),
          (line) => resolve(line.split(" ")[1])
        );
        this.send(`setoption name Skill Level value ${level.skill}`);
        this.send(`position startpos${moves.length ? ` moves ${moves.join(" ")}` : ""}`);
        this.send(level.depth ? `go depth ${level.depth}` : `go movetime ${level.movetime ?? 500}`);
      });
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** Cut the current search short; its (now meaningless) bestmove still resolves and callers ignore it. */
  stop() {
    this.send("stop");
  }

  newGame() {
    this.send("ucinewgame");
  }

  terminate() {
    this.worker?.terminate();
    this.worker = null;
    this.listeners.clear();
    this.ready = null;
  }
}
