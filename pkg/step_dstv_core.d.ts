/* tslint:disable */
/* eslint-disable */

export class BrowserConversion {
    free(): void;
    [Symbol.dispose](): void;
    analyze(): string;
    static detected(step: string): BrowserConversion;
    static detected_with_verification(step: string, verification_json: string): BrowserConversion;
    export_nc1(options_json: string): string;
    constructor(step: string, orientation_json: string);
    preview(): string;
    reorient_tube(reverse_length: boolean, reverse_up: boolean): void;
    static with_verification(step: string, orientation_json: string, verification_json: string): BrowserConversion;
}

export class BrowserPlate {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    analyze(): string;
    static dxf(text: string, options_json: string): BrowserPlate;
    export_nc1(options_json: string): string;
    preview(): string;
    static step(text: string, orientation_json: string): BrowserPlate;
}

export class BrowserPlateBatch {
    private constructor();
    free(): void;
    [Symbol.dispose](): void;
    analyze_part(index: number): string;
    static dxf(text: string, options_json: string): BrowserPlateBatch;
    export_part(index: number, options_json: string): string;
    parts(): string;
    preview_part(index: number): string;
}

export function browser_plate_sample(kind: string, dxf: boolean): string;

export function browser_profile_sample(family: string, with_holes: boolean): string;

export function browser_sample(with_holes: boolean): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_browserconversion_free: (a: number, b: number) => void;
    readonly __wbg_browserplate_free: (a: number, b: number) => void;
    readonly __wbg_browserplatebatch_free: (a: number, b: number) => void;
    readonly browser_plate_sample: (a: number, b: number, c: number) => [number, number, number, number];
    readonly browser_profile_sample: (a: number, b: number, c: number) => [number, number, number, number];
    readonly browser_sample: (a: number) => [number, number, number, number];
    readonly browserconversion_analyze: (a: number) => [number, number, number, number];
    readonly browserconversion_detected: (a: number, b: number) => [number, number, number];
    readonly browserconversion_detected_with_verification: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly browserconversion_export_nc1: (a: number, b: number, c: number) => [number, number, number, number];
    readonly browserconversion_new: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly browserconversion_preview: (a: number) => [number, number, number, number];
    readonly browserconversion_reorient_tube: (a: number, b: number, c: number) => [number, number];
    readonly browserconversion_with_verification: (a: number, b: number, c: number, d: number, e: number, f: number) => [number, number, number];
    readonly browserplate_analyze: (a: number) => [number, number, number, number];
    readonly browserplate_dxf: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly browserplate_export_nc1: (a: number, b: number, c: number) => [number, number, number, number];
    readonly browserplate_preview: (a: number) => [number, number, number, number];
    readonly browserplate_step: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly browserplatebatch_analyze_part: (a: number, b: number) => [number, number, number, number];
    readonly browserplatebatch_dxf: (a: number, b: number, c: number, d: number) => [number, number, number];
    readonly browserplatebatch_export_part: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly browserplatebatch_parts: (a: number) => [number, number, number, number];
    readonly browserplatebatch_preview_part: (a: number, b: number) => [number, number, number, number];
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
