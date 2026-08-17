import React from "react";
import { Sparkles, CheckCircle2 } from "lucide-react";

export default function RewardCelebration({
  title = "Questionnaire terminé !",
  subtitle = "Votre cagnotte a été créditée.",
  rewardAmount = null,
  confettiList = [],
}) {
  return (
    <div className="qnDoneOverlay" aria-live="polite">
      <div className="qnDoneConfetti" aria-hidden="true">
        {(confettiList || []).map((p, i) => (
          <span
            key={i}
            style={{
              "--x": `${p.x}px`,
              "--y": `${p.y}px`,
              "--rot": `${p.rot}deg`,
              "--delay": `${p.delay}ms`,
              "--dur": `${p.dur}ms`,
              "--scale": p.scale,
            }}
          />
        ))}
      </div>
      <div className="qnDoneInner glassCard cyberHudPanel">
        <div className="qnDoneIconWrap">
          <Sparkles size={36} className="qnDoneIconGlow" />
        </div>
        <div className="qnDoneStatusBadge">
          <CheckCircle2 size={14} /> MISSION ACCOMPLIE
        </div>
        <div className="qnDoneText">{title}</div>
        {rewardAmount !== null && Number(rewardAmount) > 0 ? (
          <div className="qnDoneRewardBadge">+$ {Number(rewardAmount).toFixed(2)}</div>
        ) : null}
        <div className="qnDoneSub">{subtitle}</div>
      </div>
    </div>
  );
}
