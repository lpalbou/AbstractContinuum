// First-class rendering for the ONE gateway posture that blanks the whole
// development lane: backlog browsing not configured (the gateway answers
// 404 "Backlog browsing not configured on this gateway" on the entire
// backlog family when ABSTRACTGATEWAY_TRIAGE_REPO_ROOT is absent —
// operator incident 2026-07-13: scattered red error strings read as "the
// app is broken" when the fix is one env var on the gateway host).
import React from "react";

/** True when an error (string or Error) is the backlog-unconfigured class. */
export function is_backlog_unconfigured(err: unknown): boolean {
  const msg = String((err as any)?.message ?? err ?? "");
  return /backlog browsing not configured/i.test(msg);
}

export function BacklogUnconfiguredCallout(props: { surface: string }): React.ReactElement {
  return (
    <div className="pane setup_callout">
      <div className="pane_header">
        <span className="pane_title">Backlog browsing is not configured on this gateway</span>
        <span className="chip mono warn">setup required</span>
      </div>
      <div className="pane_body">
        <div style={{ fontSize: "var(--font-size-md)" }}>
          The gateway is reachable and you are signed in — but it is serving without a backlog root, so {props.surface} has no data source.
          On the <span className="mono">gateway host</span>, set:
        </div>
        <pre className="mono setup_callout_pre">
          {"ABSTRACTGATEWAY_TRIAGE_REPO_ROOT=/path/to/AbstractFramework   # checkout root holding docs/backlog\nABSTRACTGATEWAY_BACKLOG_EXEC_RUNNER=1                          # optional: enables the exec worker"}
        </pre>
        <div className="mono muted" style={{ fontSize: "var(--font-size-sm)" }}>
          …then restart the gateway. If it worked earlier today, the last gateway restart most likely dropped the env (launchers must export
          it). Details: docs/getting-started.md.
        </div>
      </div>
    </div>
  );
}
