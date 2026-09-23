// @vitest-environment jsdom
//
// Behavior tests for the Processes page (managed prod/UAT process control +
// env vars). This surface is HIGH TRUST — whoever reaches it can stop or
// redeploy production services — so the pins cover exactly which client
// calls each button fires.
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProcessesPage } from "./processes_page";

function make_stub_gateway() {
  const processes = [
    {
      id: "gateway",
      label: "Run Gateway",
      kind: "service",
      status: "running",
      pid: 1234,
      url: "http://localhost:8080",
      actions: ["stop", "restart", "redeploy", "logs"],
    },
    {
      id: "abstractobserver",
      label: "Observer",
      kind: "service",
      status: "stopped",
      exit_code: 0,
      actions: ["start", "logs"],
    },
    {
      id: "gateway_uat",
      label: "Run Gateway (UAT)",
      kind: "service",
      status: "running",
      actions: ["stop", "logs"],
    },
  ];

  const env_vars = [
    { key: "SMTP_PASSWORD", label: "SMTP password", description: "Mail sending", secret: true, is_set: true, source: "override" },
    { key: "NOTIFY_URL", label: "Notification URL", description: "Webhook", secret: false, is_set: false, source: "unset" },
  ];

  const gateway: any = {
    list_processes: vi.fn(async () => ({ ok: true, enabled: true, processes })),
    list_process_env_vars: vi.fn(async () => ({ ok: true, enabled: true, vars: env_vars })),
    update_process_env_vars: vi.fn(async () => ({ ok: true, enabled: true, vars: env_vars })),
    start_process: vi.fn(async (id: string) => ({ ok: true, process_id: id, state: {} })),
    stop_process: vi.fn(async (id: string) => ({ ok: true, process_id: id, state: {} })),
    restart_process: vi.fn(async (id: string) => ({ ok: true, process_id: id, state: {} })),
    redeploy_process: vi.fn(async (id: string) => ({ ok: true, process_id: id, state: {} })),
    process_log_tail: vi.fn(async (id: string) => ({ ok: true, process_id: id, bytes: 5, truncated: false, log_relpath: "logs/x.log", content: "hello" })),
  };
  return gateway;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ProcessesPage", () => {
  it("lists prod processes on mount (UAT excluded) with status chips", async () => {
    const gw = make_stub_gateway();
    render(<ProcessesPage gateway={gw} gateway_connected={true} />);

    expect(await screen.findByText("Run Gateway")).toBeTruthy();
    expect(screen.getByText("Observer")).toBeTruthy();
    // The UAT twin only shows on the UAT tab.
    expect(screen.queryByText("Run Gateway (UAT)")).toBeNull();
    expect(gw.list_processes).toHaveBeenCalled();
    expect(screen.getByText("running")).toBeTruthy();
    expect(screen.getByText("stopped")).toBeTruthy();
  });

  it("shows UAT processes on the UAT tab", async () => {
    const gw = make_stub_gateway();
    render(<ProcessesPage gateway={gw} gateway_connected={true} />);
    await screen.findByText("Run Gateway");

    fireEvent.click(screen.getByRole("button", { name: "UAT" }));
    expect(await screen.findByText("Run Gateway (UAT)")).toBeTruthy();
    expect(screen.queryByText("Observer")).toBeNull();
  });

  it("fires the exact client call for each process action", async () => {
    const gw = make_stub_gateway();
    render(<ProcessesPage gateway={gw} gateway_connected={true} />);
    await screen.findByText("Run Gateway");

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(gw.stop_process).toHaveBeenCalledWith("gateway"));

    fireEvent.click(screen.getByRole("button", { name: "Restart" }));
    await waitFor(() => expect(gw.restart_process).toHaveBeenCalledWith("gateway"));

    fireEvent.click(screen.getByRole("button", { name: "Redeploy" }));
    await waitFor(() => expect(gw.redeploy_process).toHaveBeenCalledWith("gateway"));

    fireEvent.click(screen.getByRole("button", { name: "Start" }));
    await waitFor(() => expect(gw.start_process).toHaveBeenCalledWith("abstractobserver"));
  });

  it("opens the log modal and tails process logs", async () => {
    const gw = make_stub_gateway();
    render(<ProcessesPage gateway={gw} gateway_connected={true} />);
    await screen.findByText("Run Gateway");

    fireEvent.click(screen.getAllByRole("button", { name: "Logs" })[0]);
    await waitFor(() => expect(gw.process_log_tail).toHaveBeenCalledWith("gateway", { max_bytes: 160000 }));
    expect(await screen.findByText("hello")).toBeTruthy();
  });

  it("lists env vars on the ENV tab and sets/unsets values", async () => {
    const gw = make_stub_gateway();
    render(<ProcessesPage gateway={gw} gateway_connected={true} />);
    await screen.findByText("Run Gateway");

    fireEvent.click(screen.getByRole("button", { name: "ENV" }));
    expect(await screen.findByText("SMTP password")).toBeTruthy();
    expect(gw.list_process_env_vars).toHaveBeenCalled();
    // Write-only contract is stated to the operator.
    expect(screen.getByText(/never return env var values/)).toBeTruthy();

    const inputs = screen.getAllByPlaceholderText("••••••••");
    fireEvent.change(inputs[0], { target: { value: "s3cret" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Set" })[0]);
    await waitFor(() => expect(gw.update_process_env_vars).toHaveBeenCalledWith({ set: { SMTP_PASSWORD: "s3cret" } }));

    fireEvent.click(screen.getAllByRole("button", { name: "Unset" })[1]);
    await waitFor(() => expect(gw.update_process_env_vars).toHaveBeenCalledWith({ unset: ["NOTIFY_URL"] }));
  });

  it("shows the enablement hint when the process manager is disabled", async () => {
    const gw = make_stub_gateway();
    gw.list_processes = vi.fn(async () => ({ ok: true, enabled: false, processes: [] }));
    render(<ProcessesPage gateway={gw} gateway_connected={true} />);
    expect(await screen.findByText(/ABSTRACTGATEWAY_ENABLE_PROCESS_MANAGER=1/)).toBeTruthy();
  });

  it("does not call the gateway when disconnected", async () => {
    const gw = make_stub_gateway();
    render(<ProcessesPage gateway={gw} gateway_connected={false} />);
    expect(await screen.findByText(/Not connected/)).toBeTruthy();
    expect(gw.list_processes).not.toHaveBeenCalled();
  });
});
