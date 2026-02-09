export function readCliArg(argv: string[], key: string): string | undefined {
  const aliases = [...new Set([key, key.replace(/_/g, "-"), key.replace(/-/g, "_")])];

  for (const alias of aliases) {
    const inline = argv.find((arg) => arg.startsWith(`--${alias}=`));
    if (inline) return inline.split("=")[1];

    const index = argv.indexOf(`--${alias}`);
    if (index >= 0 && index + 1 < argv.length) return argv[index + 1];
  }

  const npmArgvRaw = process.env.npm_config_argv;
  if (npmArgvRaw) {
    try {
      const parsed = JSON.parse(npmArgvRaw) as { original?: string[]; cooked?: string[] };
      const pools = [parsed.original ?? [], parsed.cooked ?? []];
      for (const pool of pools) {
        for (const alias of aliases) {
          const inline = pool.find((arg) => arg.startsWith(`--${alias}=`));
          if (inline) return inline.split("=")[1];
          const index = pool.indexOf(`--${alias}`);
          if (index >= 0 && index + 1 < pool.length) return pool[index + 1];
        }
      }
    } catch {
      // ignore malformed npm_config_argv
    }
  }

  for (const alias of aliases) {
    const npmConfigKey = `npm_config_${alias.replace(/-/g, "_")}`;
    if (process.env[npmConfigKey]) return process.env[npmConfigKey];
  }

  return undefined;
}

export function parseBooleanArg(value: string | undefined, fallback: boolean): boolean {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "n", "off"].includes(normalized)) return false;
  return fallback;
}
