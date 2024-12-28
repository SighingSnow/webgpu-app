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
 * Storage Buffer: stores the states of buffer
 */ 
// Create an array representing the active state of each cell.
const cellStateArray = new Uint32Array(GRID_SIZE * GRID_SIZE);

// Create a storage buffer to hold the cell state.
// Create two storage buffers to hold the cell state.
const cellStateStorage = [
    device.createBuffer({
      label: "Cell State A",
      size: cellStateArray.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    }),
    device.createBuffer({
      label: "Cell State B",
       size: cellStateArray.byteLength,
       usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    })
  ];

// Mark every third cell of the first grid as active.
for (let i = 0; i < cellStateArray.length; i+=3) {
    cellStateArray[i] = 1;
  }
  device.queue.writeBuffer(cellStateStorage[0], 0, cellStateArray);
  
  // Mark every other cell of the second grid as active.
  for (let i = 0; i < cellStateArray.length; i++) {
    cellStateArray[i] = i % 2;
  }
  device.queue.writeBuffer(cellStateStorage[1], 0, cellStateArray);
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
      struct VertexInput {
        @location(0) pos: vec2f,
        @builtin(instance_index) instance: u32,
      };

      struct VertexOutput {
        @builtin(position) pos: vec4f,
        @location(0) cell: vec2f,
      };
      
      @group(0) @binding(0) var<uniform> grid: vec2f;
      @group(0) @binding(1) var<storage> cellState: array<u32>; 
      @vertex
      fn vertexMain(input: VertexInput) -> VertexOutput {
        let i = f32(input.instance); 
        let cell = vec2(i%grid.x, floor(i/grid.x));
        let cellOffset = cell / grid * 2;
        let state = f32(cellState[input.instance]);

        let gridPos = (input.pos*state+1)/grid - 1 + cellOffset;
        
        var output: VertexOutput;
        output.pos = vec4f(gridPos, 0, 1);
        output.cell = cell;
        return output;
      }
  
      @fragment
      fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
        let c = input.cell/grid;
        return vec4f(c, 1-c.x, 1);
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

const bindGroups = [
    device.createBindGroup({
      label: "Cell renderer bind group A",
      layout: cellPipeline.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: { buffer: uniformBuffer }
      }, {
        binding: 1,
        resource: { buffer: cellStateStorage[0] }
      }],
    }),
     device.createBindGroup({
      label: "Cell renderer bind group B",
      layout: cellPipeline.getBindGroupLayout(0),
      entries: [{
        binding: 0,
        resource: { buffer: uniformBuffer }
      }, {
        binding: 1,
        resource: { buffer: cellStateStorage[1] }
      }],
    })
  ];

const UPDATE_INTERVAL = 200; // Update every 200ms (5 times/sec)
let step = 0; // Track how many simulation steps have been run
/* Drawing calls */
function updateGrid() {
    step++; // Increment the step count
    
    // Start a render pass 
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: "clear",
        clearValue: { r: 0, g: 0, b: 0.4, a: 1.0 },
        storeOp: "store",
      }]
    });
  
    // Draw the grid.
    pass.setPipeline(cellPipeline);
    pass.setBindGroup(0, bindGroups[step % 2]); // Updated!
    pass.setVertexBuffer(0, vertexBuffer);
    pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE);
  
    // End the render pass and submit the command buffer
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

setInterval(updateGrid, UPDATE_INTERVAL);
