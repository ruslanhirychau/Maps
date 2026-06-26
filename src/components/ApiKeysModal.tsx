import { useState } from "react";
import { Key } from "lucide-react";
import {
  API_KEY_DEFS,
  loadApiKeys,
  saveApiKeys,
  type ApiKeyMap,
} from "../apiKeys";

// First-run popup (and the manual "API keys" editor). Keys are stored per-browser
// in localStorage; saving reloads so the map re-initializes with the new token.
export function ApiKeysModal({
  required,
  onClose,
}: {
  // First run: required key missing → blocking (no dismiss, no map without it).
  required: boolean;
  onClose: () => void;
}) {
  const [values, setValues] = useState<ApiKeyMap>(() => loadApiKeys());

  const set = (id: string, value: string) =>
    setValues((prev) => ({ ...prev, [id]: value }));

  // Per-field validation; required fields must be non-empty.
  const errors: Record<string, string> = {};
  for (const def of API_KEY_DEFS) {
    const v = (values[def.id] ?? "").trim();
    if (!v) {
      if (def.required) errors[def.id] = "Required";
      continue;
    }
    const msg = def.validate?.(v);
    if (msg) errors[def.id] = msg;
  }
  const valid = Object.keys(errors).length === 0;

  const save = () => {
    if (!valid) return;
    saveApiKeys(values);
    // Token is consumed once at map init, so reload to apply cleanly.
    window.location.reload();
  };

  return (
    <div className="keys-backdrop" onMouseDown={() => !required && onClose()}>
      <div className="keys-modal" onMouseDown={(e) => e.stopPropagation()}>
        <header className="keys-head">
          <span className="keys-icon">
            <Key size={16} />
          </span>
          <span className="keys-title">API keys</span>
          {!required && (
            <button className="editor-done" onClick={onClose}>
              Close
            </button>
          )}
        </header>

        <div className="keys-body">
          <p className="hint keys-intro">
            Keys are stored only in this browser (localStorage) and never leave
            your device or get committed to the repo.
          </p>

          {API_KEY_DEFS.map((def) => (
            <label className="field" key={def.id}>
              <span>
                {def.label}
                {def.required ? "" : " (optional)"}
              </span>
              <input
                className="text-input"
                type="text"
                spellCheck={false}
                autoComplete="off"
                placeholder={def.placeholder}
                value={values[def.id] ?? ""}
                onChange={(e) => set(def.id, e.target.value)}
              />
              <span className="keys-desc">
                {def.description}{" "}
                <a href={def.docUrl} target="_blank" rel="noreferrer">
                  Get one →
                </a>
              </span>
              {errors[def.id] && values[def.id] && (
                <span className="keys-error">{errors[def.id]}</span>
              )}
            </label>
          ))}
        </div>

        <footer className="keys-foot">
          <button className="btn primary" disabled={!valid} onClick={save}>
            Save &amp; reload
          </button>
        </footer>
      </div>
    </div>
  );
}
