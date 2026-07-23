const userAgent = process.env.npm_config_user_agent ?? "";

if (!userAgent.startsWith("pnpm/")) {
  console.error(
    "Velocity uses pnpm. Run `corepack pnpm install` instead of npm or yarn.",
  );
  process.exit(1);
}
