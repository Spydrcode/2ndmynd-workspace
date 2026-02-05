// Minimal type shim for minimist to satisfy TS build.
declare module "minimist" {
  export interface ParsedArgs {
    _: string[];
    [key: string]: unknown;
  }

  function minimist(args: readonly string[] | string[], opts?: Record<string, unknown>): ParsedArgs;

  namespace minimist {
    export type ParsedArgs = import("minimist").ParsedArgs;
  }

  export default minimist;
}
