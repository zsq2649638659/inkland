type SettingsStatusKind = "success" | "warning" | "error";

type SettingsStatusProps = {
  kind: SettingsStatusKind;
  message: string;
};

export default function SettingsStatus({ kind, message }: SettingsStatusProps) {
  const iconClass = kind === "success"
    ? "fa-circle-check"
    : kind === "warning"
      ? "fa-triangle-exclamation"
      : "fa-circle-xmark";
  const statusClass = kind === "success" ? "" : ` settings-status-${kind}`;

  return (
    <div className={`settings-status${statusClass}`} role={kind === "success" ? "status" : "alert"}>
      <span className="settings-status-icon" aria-hidden="true">
        <i className={`fa-solid ${iconClass}`} />
      </span>
      <span className="settings-status-text">{message}</span>
    </div>
  );
}
