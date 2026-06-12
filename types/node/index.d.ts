declare namespace NodeJS {
  interface ProcessEnv {
    [key: string]: string | undefined;
  }
  interface Process {
    env: ProcessEnv;
    cwd(): string;
    nextTick(callback: () => void): void;
  }
}

declare var process: NodeJS.Process;

declare module "path" {
  const path: any;
  export default path;
}

declare module "url" {
  export function fileURLToPath(url: string): string;
}
