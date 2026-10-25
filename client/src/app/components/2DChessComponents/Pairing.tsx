import { Button } from "@components/ui/button";

interface PairingProps {
  connected: boolean;
  error: string | null;
  onCancel: () => void;
}

export default function PairingOverlay({ connected, error, onCancel }: PairingProps) {
  return (
    <div className="w-full max-w-sm rounded-lg border bg-card p-5 lg:w-72" role="status">
      <div className="mb-3 flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/pairing.gif" alt="" className="h-12 w-12" />
        <h2 className="text-lg font-semibold">{connected ? "Finding an opponent" : "Connecting"}</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        {error ?? (connected ? "The search widens the longer you wait, starting near your rating." : "Reaching the game server.")}
      </p>
      <Button variant="outline" className="mt-4 w-full" onClick={onCancel}>
        Cancel search
      </Button>
    </div>
  );
}
