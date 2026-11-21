/**
 * Read `SPURVIK_${name}`, then `AEGIS_${name}`.
 * The old name still works and warns once per process.
 */
export declare function readSpurvikEnv(name: string): string | undefined;
