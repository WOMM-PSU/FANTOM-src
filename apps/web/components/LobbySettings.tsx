"use client";

import {
  DURATION_OPTIONS_SECONDS,
  GAME_MODE_DESCRIPTIONS,
  GAME_MODE_LABELS,
  GAME_MODES,
  isModePlayable,
  type MatchConfig,
} from "@fantom/shared";

type Props = {
  config: MatchConfig;
  disabled: boolean;
  onChange: (config: MatchConfig) => void;
};

export function LobbySettings({ config, disabled, onChange }: Props) {
  return (
    <details className="card settings-card">
      <summary className="settings-summary">
        <span className="section-title">Match config</span>
        <span className="settings-toggle" aria-hidden="true">
          HOST ACCESS <b>+</b>
        </span>
      </summary>

      <div className="settings-body">
        <div className="settings-grid">
          <label className="field">
            <span className="field-label">Game mode</span>
            <select
              className="input select"
              value={config.mode}
              disabled={disabled}
              onChange={(event) => {
                const mode = event.target.value as MatchConfig["mode"];
                if (mode !== config.mode) {
                  onChange({ ...config, mode });
                }
              }}
            >
              {GAME_MODES.map((mode) => (
                <option
                  key={mode}
                  value={mode}
                  disabled={!isModePlayable(mode)}
                >
                  {GAME_MODE_LABELS[mode]}
                  {isModePlayable(mode) ? "" : " — next phase"}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span className="field-label">Match length</span>
            <select
              className="input select"
              value={config.durationSeconds}
              disabled={disabled}
              onChange={(event) => {
                const durationSeconds = Number(event.target.value);
                if (
                  Number.isFinite(durationSeconds) &&
                  durationSeconds !== config.durationSeconds
                ) {
                  onChange({ ...config, durationSeconds });
                }
              }}
            >
              {DURATION_OPTIONS_SECONDS.map((seconds) => (
                <option key={seconds} value={seconds}>
                  {seconds / 60} minutes
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="checkbox-field">
          <input
            type="checkbox"
            checked={config.allowManualTargeting}
            disabled={disabled}
            onChange={(event) =>
              onChange({
                ...config,
                allowManualTargeting: event.target.checked,
              })
            }
          />
          <span>
            <strong>Allow practice targeting.</strong> Lets players fire from a
            target list when camera aiming is unavailable. This is a development
            fallback and is never presented as camera-assisted aiming.
          </span>
        </label>

        <p className="setting-description">
          {GAME_MODE_DESCRIPTIONS[config.mode]}
        </p>
        <p className="setting-warning">
          Changing a setting resets everyone&apos;s ready state.
        </p>
      </div>
    </details>
  );
}
