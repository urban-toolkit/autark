import { getSharedGpuDevice } from './device-manager';

export type TypedArray =
  | Float32Array
  | Float64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint8ClampedArray
  | Uint16Array
  | Uint32Array
  | BigInt64Array
  | BigUint64Array;

export type TypedArrayConstructor =
  | Float32ArrayConstructor
  | Float64ArrayConstructor
  | Int8ArrayConstructor
  | Int16ArrayConstructor
  | Int32ArrayConstructor
  | Uint8ArrayConstructor
  | Uint8ClampedArrayConstructor
  | Uint16ArrayConstructor
  | Uint32ArrayConstructor
  | BigInt64ArrayConstructor
  | BigUint64ArrayConstructor;

export interface ComputeConfig {
  shader: string;
  entryPoint?: string; // default 'main'
  dispatchSize: [number, number?, number?];
  inputs: {
    [name: string]: {
      type: "storage" | "uniform";
      data: TypedArray;
      binding: number;
      group?: number;
    };
  };
  outputs: {
    [name: string]: {
      size: number; // in bytes
      binding: number;
      group?: number;
      arrayType?: TypedArrayConstructor;
    };
  };
}

function alignTo(value: number, multiple: number): number {
  const remainder = value % multiple;
  return remainder === 0 ? value : value + (multiple - remainder);
}

export abstract class GpuPipeline {
    protected async getDevice(): Promise<GPUDevice> {
        return getSharedGpuDevice();
    }

    protected async runCompute(config: ComputeConfig): Promise<{ [outputName: string]: TypedArray }> {
        const device = await this.getDevice();
        const { shader, entryPoint = "main", dispatchSize, inputs, outputs } = config;
        
        const shaderModule = device.createShaderModule({ code: shader });
        const pipeline = device.createComputePipeline({
            layout: "auto",
            compute: { module: shaderModule, entryPoint },
        });

        const createdInputBuffers = new Map<string, GPUBuffer>();
        const createdOutputBuffersByOutputKey = new Map<string, GPUBuffer>();
        const outputSizesByOutputKey = new Map<string, number>();
        const groupEntries = new Map<number, GPUBindGroupEntry[]>();

        for (const [name, input] of Object.entries(inputs)) {
            const group = input.group ?? 0;
            const usage = input.type === "uniform" ? GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST : GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
            const srcArray = input.data;
            const buffer = device.createBuffer({ size: alignTo(srcArray.byteLength, 4), usage });
            device.queue.writeBuffer(buffer, 0, srcArray.buffer, srcArray.byteOffset, srcArray.byteLength);
            createdInputBuffers.set(name, buffer);
            const entries = groupEntries.get(group) ?? [];
            entries.push({ binding: input.binding, resource: { buffer } });
            groupEntries.set(group, entries);
        }

        for (const [name, output] of Object.entries(outputs)) {
            const group = output.group ?? 0;
            const aligned = alignTo(output.size, 4);
            const buffer = device.createBuffer({ size: aligned, usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC });
            createdOutputBuffersByOutputKey.set(name, buffer);
            outputSizesByOutputKey.set(name, aligned);
            const entries = groupEntries.get(group) ?? [];
            entries.push({ binding: output.binding, resource: { buffer } });
            groupEntries.set(group, entries);
        }

        const groups = Array.from(groupEntries.keys()).sort((a, b) => a - b);
        const bindGroups = new Map<number, GPUBindGroup>();
        for (const g of groups) {
            bindGroups.set(g, device.createBindGroup({ layout: pipeline.getBindGroupLayout(g), entries: groupEntries.get(g)! }));
        }

        const commandEncoder = device.createCommandEncoder();
        const pass = commandEncoder.beginComputePass();
        pass.setPipeline(pipeline);
        for (const g of groups) pass.setBindGroup(g, bindGroups.get(g)!);
        pass.dispatchWorkgroups(dispatchSize[0] ?? 1, dispatchSize[1] ?? 1, dispatchSize[2] ?? 1);
        pass.end();

        const stagingByOutputKey = new Map<string, GPUBuffer>();
        for (const [key, buffer] of createdOutputBuffersByOutputKey.entries()) {
            const size = outputSizesByOutputKey.get(key)!;
            const staging = device.createBuffer({ size, usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ });
            stagingByOutputKey.set(key, staging);
            commandEncoder.copyBufferToBuffer(buffer, 0, staging, 0, size);
        }

        device.queue.submit([commandEncoder.finish()]);

        const result: { [outputName: string]: TypedArray } = {};
        const mapPromises: Promise<void>[] = [];

        for (const [key, staging] of stagingByOutputKey.entries()) {
            mapPromises.push((async () => {
                await staging.mapAsync(GPUMapMode.READ);
                const mapped = staging.getMappedRange();
                const cfg = outputs[key];
                const ctor = cfg.arrayType || Uint8Array;
                const copied = new Uint8Array(mapped.slice(0));
                staging.unmap();
                result[key] = new ctor(copied.buffer, 0, copied.byteLength / ctor.BYTES_PER_ELEMENT);
            })());
        }

        await Promise.all(mapPromises);

        for (const buf of createdInputBuffers.values()) buf.destroy();
        for (const buf of createdOutputBuffersByOutputKey.values()) buf.destroy();
        for (const buf of stagingByOutputKey.values()) buf.destroy();

        return result;
    }
}
