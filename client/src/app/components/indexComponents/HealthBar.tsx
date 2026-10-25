import React from "react";

interface HealthBarProps {
  win: number;
  loss: number;
  draw: number;
}

/** Win / draw / loss split (percentages). The label sits inside a segment only when it fits. */
const HealthBar: React.FC<HealthBarProps> = ({ win, loss, draw }) => {
  const seg = (value: number, cls: string, letter: string) => (
    <div className={`num flex items-center justify-center text-[11px] text-white ${cls}`} style={{ width: `${value}%` }}>
      {value >= 12 && `${value}% ${letter}`}
    </div>
  );
  return (
    <div
      className="flex h-6 w-full overflow-hidden rounded-md bg-muted"
      role="img"
      aria-label={`${win}% wins, ${draw}% draws, ${loss}% losses`}
    >
      {seg(win, "bg-win", "W")}
      {seg(draw, "bg-draw", "D")}
      {seg(loss, "bg-loss", "L")}
    </div>
  );
};

export default HealthBar;
