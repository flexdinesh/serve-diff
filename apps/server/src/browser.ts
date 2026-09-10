import { spawn } from "node:child_process";

export type BrowserLauncher = (command: string, url: string) => Promise<void>;

export function browserCommand(platform: NodeJS.Platform) {
  if (platform === "darwin") return "open";
  if (platform === "linux") return "xdg-open";
  return null;
}

export function isSshSession(environment: NodeJS.ProcessEnv) {
  return Boolean(environment.SSH_CONNECTION || environment.SSH_TTY);
}

function launch(command: string, url: string) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, [url], { detached: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

export async function openBrowser(
  url: string,
  {
    platform = process.platform,
    environment = process.env,
    launcher = launch,
  }: {
    platform?: NodeJS.Platform;
    environment?: NodeJS.ProcessEnv;
    launcher?: BrowserLauncher;
  } = {},
) {
  if (isSshSession(environment)) return null;
  const command = browserCommand(platform);
  if (!command) return null;
  try {
    await launcher(command, url);
    return null;
  } catch (error) {
    return `Unable to open browser with ${command}: ${error instanceof Error ? error.message : String(error)}`;
  }
}
