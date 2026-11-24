// @ts-nocheck test stand-in for the engine bundle; tests can set globalThis.__analyze
export const analyze = (...a) => (globalThis.__analyze ? globalThis.__analyze(...a) : { best: null, setups: [] });
export const makeTip = (..._a) => ({ headline: "", steps: [] });
