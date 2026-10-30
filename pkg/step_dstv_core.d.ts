/* tslint:disable */
/* eslint-disable */

export class BrowserConversion {
    free(): void;
    [Symbol.dispose](): void;
    analyze(): string;
    static detected(step: string): BrowserConversion;
    export_nc1(options_json: string): string;
    constructor(step: string, orientation_json: string);
    preview(): string;
}

export function browser_profile_sample(family: string, with_holes: boolean): string;

export function browser_sample(with_holes: boolean): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_browserconversion_free: (a: number, b: number) => void;
    readonly browser_profile_sample: (a: number, b: number, c: number) => [number, number, number, number];
    readonly browser_sample: (a: number) => [number, number, number, number];
    readonly browserconversion_analyze: (a: number) => [number, number, number, number];
    readonly browserconversion_detected: (a: number, b: number) => [number, number, number];
    readonly browserconversion_export_nc1: (a: number, b: number, c: number) => [number, number, number, number];
    readonly browserconversion_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly browserconversion_preview: (a: number) => [number, number, number, number];
    readonly __externref_table_alloc: () => number;
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
