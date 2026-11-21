const warned = new Set();
function envValue(name) {
    const proc = globalThis.process;
    const value = proc?.env?.[name];
    return value ? value : undefined;
}
/**
 * Read `SPURVIK_${name}`, then `AEGIS_${name}`.
 * The old name still works and warns once per process.
 */
export function readSpurvikEnv(name) {
    const current = envValue(`SPURVIK_${name}`);
    if (current)
        return current;
    const legacy = envValue(`AEGIS_${name}`);
    if (!legacy)
        return undefined;
    if (!warned.has(name)) {
        warned.add(name);
        console.warn(`AEGIS_${name} is deprecated. Set SPURVIK_${name}. The old name is still read.`);
    }
    return legacy;
}
