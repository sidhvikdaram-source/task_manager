declare module "vite" {
  export function defineConfig<T>(config: T): T;
}

declare module "@vitejs/plugin-react" {
  const plugin: any;
  export default plugin;
}

declare module "@tailwindcss/vite" {
  const plugin: any;
  export default plugin;
}

declare module "@replit/vite-plugin-runtime-error-modal" {
  const plugin: any;
  export default plugin;
}

declare module "@replit/vite-plugin-cartographer" {
  const plugin: any;
  export function cartographer(options: any): any;
}

declare module "@replit/vite-plugin-dev-banner" {
  const plugin: any;
  export function devBanner(): any;
}
