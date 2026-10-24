"use client";

import { GAME_MODE_LABELS, type MatchSnapshot } from "@fantom/shared";
import { useNow } from "@/hooks/useNow";
import { countdownNumber } from "@/lib/format";

type Props = {
  match: MatchSnapshot;
  clockOffset: number;
};

export function CountdownPanel({ match, clockOffset }: Props) {
  const now = useNow(250);
  const serverNow = now + clockOffset;
  const remaining = Math.max(
    0,
    (match.countdownEndsAt ?? serverNow) - serverNow,
  );

  return (
    <div className="center-stage">
      <p className="eyebrow">
        {GAME_MODE_LABELS[match.config.mode]} · {match.players.length} players
      </p>
      <div
        className="countdown-number"
        aria-live="assertive"
        aria-label={`Match starts in ${countdownNumber(remaining)} seconds`}
      >
        {countdownNumber(remaining)}
      </div>
      <h1 className="panel-title">Get to a safe spot</h1>
      <p className="lede center-copy">
        The match starts automatically. Keep your head up, stand clear of
        roads and stairs, and do not walk while looking at your screen.
      </p>
      <p className="fine-print">
        Camera aiming and movement come online in the next milestone.
      </p>
    </div>
  );
}
