type SettingsStatusKind = "success" | "error";

type SettingsStatusProps = {
  kind: SettingsStatusKind;
  message: string;
};

export default function SettingsStatus({ kind, message }: SettingsStatusProps) {
  const isError = kind === "error";

  return (
    <div className={`settings-status${isError ? " settings-status-error" : ""}`} role={isError ? "alert" : "status"}>
      <span className="settings-status-icon" aria-hidden="true">
        <i className={`fa-solid ${isError ? "fa-circle-exclamation" : "fa-circle-check"}`} />
      </span>
      <span className="settings-status-text">{message}</span>
    </div>
  );
}
