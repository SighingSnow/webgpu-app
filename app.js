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

const encoder = device.createCommandEncoder();

const pass = encoder.beginRenderPass({
    colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        loadOp: "clear",
        clearValue: { r:0 , g:0 , b: 0.4, a: 1},
        storeOp: "store"
    }]
});

pass.end();

device.queue.submit([encoder.finish()]);