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

async function getDevice(): Promise<GPUDevice> {
  if (!("gpu" in navigator)) {
    throw new Error("WebGPU not supported in this browser.");
  }
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("Failed to get GPU adapter.");
  const device = await adapter.requestDevice();
  return device;
}

class WebGPUCompute {
  private devicePromise: Promise<GPUDevice> | null = null;

  private async getOrCreateDevice(): Promise<GPUDevice> {
    if (!this.devicePromise) {
      this.devicePromise = getDevice();
    }
    return this.devicePromise;
  }

  public async run(
    config: ComputeConfig
  ): Promise<{ [outputName: string]: TypedArray }> {
    const device = await this.getOrCreateDevice();

    const {
      shader,
      entryPoint = "main",
      dispatchSize,
      inputs,
      outputs,
    } = config;
    if (!dispatchSize || dispatchSize[0] == null) {
      throw new Error("dispatchSize must be provided, e.g., [x] or [x,y,z].");
    }

    // Create shader module and pipeline
    const shaderModule = device.createShaderModule({ code: shader });
    const pipeline = device.createComputePipeline({
      layout: "auto",
      compute: { module: shaderModule, entryPoint },
    });

    // Prepare buffers and entries per bind group
    const createdInputBuffers = new Map<string, GPUBuffer>();
    const createdOutputBuffersByOutputKey = new Map<string, GPUBuffer>();
    const outputSizesByOutputKey = new Map<string, number>();
    const groupEntries = new Map<number, GPUBindGroupEntry[]>();

    // Inputs
    for (const [name, input] of Object.entries(inputs)) {
      const group = input.group ?? 0;
      const usage =
        input.type === "uniform"
          ? GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
          : GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST;
      const srcArray = input.data;
      const buffer = device.createBuffer({
        size: alignTo(srcArray.byteLength, 4),
        usage,
      });
      device.queue.writeBuffer(
        buffer,
        0,
        srcArray.buffer,
        srcArray.byteOffset,
        srcArray.byteLength
      );
      createdInputBuffers.set(name, buffer);
      const entries = groupEntries.get(group) ?? [];
      entries.push({ binding: input.binding, resource: { buffer } });
      groupEntries.set(group, entries);
    }

    // Outputs
    for (const [name, output] of Object.entries(outputs)) {
      const group = output.group ?? 0;
      const aligned = alignTo(output.size, 4);
      const buffer = device.createBuffer({
        size: aligned,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
      });
      createdOutputBuffersByOutputKey.set(name, buffer);
      outputSizesByOutputKey.set(name, aligned);
      const entries = groupEntries.get(group) ?? [];
      entries.push({ binding: output.binding, resource: { buffer } });
      groupEntries.set(group, entries);
    }

    // Create bind groups for each used group index
    const groups = Array.from(groupEntries.keys()).sort((a, b) => a - b);
    const bindGroups = new Map<number, GPUBindGroup>();
    for (const g of groups) {
      const entries = groupEntries.get(g)!;
      const layout = pipeline.getBindGroupLayout(g);
      const bg = device.createBindGroup({ layout, entries });
      bindGroups.set(g, bg);
    }

    // Encode compute pass and copies to staging buffers
    const commandEncoder = device.createCommandEncoder();
    const pass = commandEncoder.beginComputePass();
    pass.setPipeline(pipeline);
    for (const g of groups) {
      const bg = bindGroups.get(g)!;
      pass.setBindGroup(g, bg);
    }
    const [x, y, z] = [
      dispatchSize[0] ?? 1,
      dispatchSize[1] ?? 1,
      dispatchSize[2] ?? 1,
    ];
    pass.dispatchWorkgroups(x, y, z);
    pass.end();

    // Prepare staging buffers for each output and copy results
    const stagingByOutputKey = new Map<string, GPUBuffer>();
    for (const [
      outputKey,
      outputBuffer,
    ] of createdOutputBuffersByOutputKey.entries()) {
      const size = outputSizesByOutputKey.get(outputKey);
      if (!size)
        throw new Error(`Internal error: missing size for output ${outputKey}`);
      const staging = device.createBuffer({
        size,
        usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
      });
      stagingByOutputKey.set(outputKey, staging);

      commandEncoder.copyBufferToBuffer(outputBuffer, 0, staging, 0, size);
    }

    device.queue.submit([commandEncoder.finish()]);

    // Map and read back results
    const result: { [outputName: string]: TypedArray } = {};
    const mapPromises: Promise<void>[] = [];

    for (const [outputKey, staging] of stagingByOutputKey.entries()) {
      mapPromises.push(
        (async () => {
          await staging.mapAsync(GPUMapMode.READ);
          const mapped = staging.getMappedRange();

          // Use configured array type (fallback to Uint8Array)
          const cfg = outputs[outputKey];
          const ctor = cfg.arrayType || Uint8Array;

          // Create a copy to detach from mapped range before unmapping
          const copied = new Uint8Array(mapped.slice(0));
          staging.unmap();

          // Reinterpret the ArrayBuffer copy using the chosen TypedArray constructor
          const outArray = new ctor(
            copied.buffer,
            0,
            copied.byteLength / ctor.BYTES_PER_ELEMENT
          );
          result[outputKey] = outArray;
        })()
      );
    }

    await Promise.all(mapPromises);

    // Cleanup created buffers
    for (const buf of createdInputBuffers.values()) buf.destroy();
    for (const buf of createdOutputBuffersByOutputKey.values()) buf.destroy();
    for (const buf of stagingByOutputKey.values()) buf.destroy();

    return result;
  }
}

function alignTo(value: number, multiple: number): number {
  const remainder = value % multiple;
  return remainder === 0 ? value : value + (multiple - remainder);
}

export const compute = new WebGPUCompute();
