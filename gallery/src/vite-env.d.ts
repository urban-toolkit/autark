/// <reference types="vite/client" />

declare module '*.wgsl' {
    const src: string;
    export default src;
}
