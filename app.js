/*
 * Constant
 */

const GRID_SIZE=32;

/* 
 * Basic enviroment settings
 */
const canvas = document.querySelector('canvas');

if (!navigator.gpu) {
    // console.log('WebGPU not supported');
    throw new Error("WebGPU not supported on this browser.");
} else {
    console.log("WebGPU enabled")
}

const adapter = await navigator.gpu.requestAdapter();

if(!adapter) {
    throw new Error("No adapter found");
}

const device = await adapter.requestDevice();
// console.log(device)
const context = canvas.getContext('webgpu');

const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
console.log(canvasFormat)
context.configure(
    {
        device: device,
        format: canvasFormat
    }
)


/*
 * Create a uniform buffer that describes the grid
 */ 
const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
const uniformBuffer = device.createBuffer({
    label: "Uniform Buffer",
    size: uniformArray.byteLength,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
});

device.queue.writeBuffer(uniformBuffer, 0, uniformArray);



/*
 * Define the cell vertices 
 */

const vertices = new Float32Array([
    -0.8, -0.8, // Triangle 1 (Blue)
    0.8, -0.8,
    0.8,  0.8,
 
   -0.8, -0.8, // Triangle 2 (Red)
    0.8,  0.8,
   -0.8,  0.8,
]);
   
const vertexBuffer = device.createBuffer({
    label: "Cell vertices",
    size: vertices.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
})

// write vertices to vertex buffer
device.queue.writeBuffer(vertexBuffer,/* bufferOffset= */ 0, vertices)

// we need to specify how the vertices arranged in buffer
const vertexBufferLayout = {
    arrayStride: 8, 
    attributes: [{
            format: "float32x2", 
            offset: 0,
            shaderLocation: 0,
    }]
}

/* 
 * Shaders
 */ 

const cellShaderModule = device.createShaderModule({
    label: 'Cell shader',
    code: `
      @group(0) @binding(0) var<uniform> grid: vec2f;

      @vertex
      fn vertexMain(@location(0) pos: vec2f,
                    @builtin(instance_index) instance: u32) ->
        @builtin(position) vec4f {
        let i = f32(instance); 
        let cell = vec2(i%grid.x, floor(i/grid.x));
        let cellOffset = cell / grid * 2;

        let gridPos = (pos+1)/grid - 1 + cellOffset;
        return vec4f(gridPos, 0, 1);
      }
  
      @fragment
      fn fragmentMain() -> @location(0) vec4f {
        return vec4f(1, 0, 0, 1);
      }
    `
  });


const cellPipeline = device.createRenderPipeline({
    label: "Cell pipeline",
    layout: "auto",
    vertex: {
        module: cellShaderModule,
        entryPoint: "vertexMain",
        buffers: [vertexBufferLayout]
    },
    fragment: {
        module: cellShaderModule,
        entryPoint: "fragmentMain",
        targets:[{
            format: canvasFormat
        }]
    },
})

const bindGroup = device.createBindGroup({
    label: "Cell renderer bind group",
    layout: cellPipeline.getBindGroupLayout(0), 
    entries: [{
        binding: 0, 
        resource: {buffer : uniformBuffer}
    }]
})

/* Drawing calls */
const encoder = device.createCommandEncoder();
const pass = encoder.beginRenderPass({
    colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: "clear",
        clearValue: { r:0 , g:0 , b: 0.4, a: 1},
        storeOp: "store"
    }]
});

pass.setPipeline(cellPipeline);
pass.setVertexBuffer(0, vertexBuffer);
pass.setBindGroup(0, bindGroup); 
pass.draw(vertices.length / 2, GRID_SIZE*GRID_SIZE); // 6 vertices

pass.end();

device.queue.submit([encoder.finish()]);
