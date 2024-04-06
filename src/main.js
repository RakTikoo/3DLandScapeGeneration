import { GRID_SIZE } from "./constants.js";
import { vertices } from "./constants.js";
import { PI } from "./constants.js";
import { mat4 } from "./mat_lib.js";
import { renderShader } from "../shaders/render.wgsl.js";
import GUI from 'https://webgpufundamentals.org/3rdparty/muigui-0.x.module.js';

// Value creation Logic - Currently using Perlin Noise, but can use anything
function genValGrid() {
    let ValGrid = [];
    noise.seed(Math.random());
    for(var i = 0; i < GRID_SIZE + 1; i+=1) {
        var Row = []
        for(var j = 0; j < GRID_SIZE + 1; j+=1) {
            Row[j] = ((noise.simplex2(i /300, j / 300) + 1.0)/2.0 + (noise.simplex2(i / 25, j / 25) + 1.0)/2.0 + (noise.simplex2(i / 75, j / 75) + 1.0)/2.0)/3.0;
        }
        ValGrid[i] = Row;
        Row = [];
    }

    return ValGrid;
}


// Function to convert corner values per grid into grid state passed to the shader
function genGridState() {
    let ValGrid = genValGrid();
    //let finalGrid = new Float32Array(GRID_SIZE * GRID_SIZE);
    let finalGrid = new Float32Array(GRID_SIZE * GRID_SIZE * 4);
    let cnt = 0;
    for(var i = 0; i < GRID_SIZE; i+=1) {
        //var Row = []
        for(var j = 0; j < GRID_SIZE ; j+=1) {
            let bl = ValGrid[i+1][j];
            let br = ValGrid[i+1][j+1];
            let tr = ValGrid[i][j+1];
            let tl = ValGrid[i][j];

            // Float to int conversion
            //tl = tl > 0.5 ? 1 : 0;
            //bl = bl > 0.5 ? 1 : 0;
            //tr = tr > 0.5 ? 1 : 0;
            //br = br > 0.5 ? 1 : 0;

            //finalGrid[i*GRID_SIZE + j] = tl*8 + tr*4 + br*2 + bl*1;
            finalGrid[cnt + 0] = tl;
            finalGrid[cnt + 1] = tr;
            finalGrid[cnt + 2] = bl;
            finalGrid[cnt + 3] = br;
            cnt += 4;

        }

    }
    console.log(cnt);

    return finalGrid;
}



async function main() {
    const canvas_size = document.getElementById("canvas"); // Not used    
    //=========================================
    //Create canvas and configure to GPU device
    //=========================================
    const canvas = document.querySelector("canvas");

    // Your WebGPU code will begin here!
    if (!navigator.gpu) {
        throw new Error("WebGPU not supported on this browser.");
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
        throw new Error("No appropriate GPUAdapter found.");
    }
    
    const device = await adapter.requestDevice();
    const context = canvas.getContext("webgpu");
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();

    context.configure({
        device: device,
        format: canvasFormat,
    });
    

    //======================================
    // Vertex and Fragment Stuff
    // =====================================
    
    const vertexBuffer = device.createBuffer({
        label: "grid vertices",
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST, // buffer to be used for vertex data and want to be able to copy data into it 
      });

    // Create a uniform buffer that describes the grid.
    const uniformArray = new Float32Array([GRID_SIZE, GRID_SIZE]);
    const uniformBuffer = device.createBuffer({
      label: "Grid Uniforms",
      size: uniformArray.byteLength,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(uniformBuffer, 0, uniformArray);
    device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/0, vertices); // Write the vertex data into the GPU buffer
    const vertexBufferLayout = {
      arrayStride: 8, // 4 x 2 bytes
      attributes: [{
        format: "float32x2", // GPUVertexFormat type
        offset: 0,
        shaderLocation: 0, // Position, see vertex shader
      }],
    };

    
    
    // Create an array representing the active state of each grid.
    const gridStateArray = genGridState();
    // Only 1 needed as no on fly change in buffers. 
    const gridStateBuffer = device.createBuffer({
        label: "Grid Init State",
        size: gridStateArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });

    device.queue.writeBuffer(gridStateBuffer, 0, gridStateArray); // Write randomly initialized grid state into the buffer


    // matrix
    const degToRad = d => d * Math.PI / 180;
    const radToDegOptions = { min: -360, max: 360, step: 1, converters: GUI.converters.radToDeg };

    const gui = new GUI();
    gui.onChange(updateGrid);
    const settings = {
      //fieldOfView: degToRad(0),
      translation: [0, 0, 0],
      rotation: [degToRad(-8), degToRad(0), degToRad(0)],
      scale: [1, 1, 1],
    };
    //gui.add(settings, 'fieldOfView', {min: 1, max: 179, converters: GUI.converters.radToDeg});
    gui.add(settings.translation, '0', -10, 10).name('translation.x');
    gui.add(settings.translation, '1', -10, 10).name('translation.y');
    gui.add(settings.translation, '2', -10, 10).name('translation.z');
    gui.add(settings.rotation, '0', radToDegOptions).name('rotation.x');
    gui.add(settings.rotation, '1', radToDegOptions).name('rotation.y');
    gui.add(settings.rotation, '2', radToDegOptions).name('rotation.z');

    
    const matrixBufferSize = (16) * 4;
    const matrixBuffer = device.createBuffer({
      label: 'uniforms',
      size: matrixBufferSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const gridShaderModule = device.createShaderModule({
        label: "Grid shader",
        code: renderShader,
    });

    // Create the bind group layout and pipeline layout.
    const bindGroupLayout = device.createBindGroupLayout({ // Going to group 0
        label: "Grid Bind Group Layout",
        entries: [{
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
          buffer: {} // Matrix Buffer buffer
        }, {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT,
          buffer: {} // Grid uniform buffer
        }, {
          binding: 2,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.COMPUTE | GPUShaderStage.FRAGMENT, // Fragment needs access for coloring
          buffer: { type: "read-only-storage"} // grid state input buffer
        }]
    });

    // Bind Group - A bind group is a collection of resources that you want to make accessible to your shader at the same time
    // Create a bind group to pass the grid uniforms into the pipeline
    const bindGroup = device.createBindGroup({
        label: "grid renderer bind group",
        layout: bindGroupLayout, // Updated Line
        entries: [{
          binding: 0,
          resource: { buffer: matrixBuffer }
        }, {
          binding: 1,
          resource: { buffer: uniformBuffer }
        }, {
          binding: 2,
          resource: { buffer: gridStateBuffer }
        }]
    })

    const pipelineLayout = device.createPipelineLayout({
        label: "grid Pipeline Layout",
        bindGroupLayouts: [ bindGroupLayout ],
    });
    // Create rendering pipeline with the shaders
    const gridPipeline = device.createRenderPipeline({
        label: "grid pipeline",
        layout: pipelineLayout,
        vertex: {
          module: gridShaderModule,
          entryPoint: "vertexMain",
          buffers: [vertexBufferLayout]
        },
        fragment: {
          module: gridShaderModule,
          entryPoint: "fragmentMain",
          targets: [{
            format: canvasFormat
          }]
        }
        
    });
    
    //======================================
    // Call Rendering
    // =====================================

    // Move all of our rendering code into a function
    function updateGrid() {
      let matrixValue = new Float32Array(16);
      mat4.identity(matrixValue);
      mat4.translate(matrixValue, settings.translation, matrixValue);
      mat4.rotateX(matrixValue, settings.rotation[0], matrixValue);
      mat4.rotateY(matrixValue, settings.rotation[1], matrixValue);
      mat4.rotateZ(matrixValue, settings.rotation[2], matrixValue);
      mat4.scale(matrixValue, settings.scale, matrixValue);
      //mat4.perspective(PI/4, 1, 0, 100, matrix_data);
      //console.log(matrixValue);
      device.queue.writeBuffer(matrixBuffer, 0, matrixValue);

        const encoder = device.createCommandEncoder();
        const pass = encoder.beginRenderPass({
          colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            loadOp: "clear",
            clearValue: { r: 0, g: 0, b: 0, a: 1.0 },
            storeOp: "store",
          }]
        });
        // Draw the grid.
        pass.setPipeline(gridPipeline);
        pass.setBindGroup(0, bindGroup); // 0 is the group 0
        pass.setVertexBuffer(0, vertexBuffer); // 0 represents the buffers index from render pipeline
        pass.draw(vertices.length / 2, GRID_SIZE * GRID_SIZE); // 6 vertices, Grid x Grid instances - Dispatch Graphics Shader
        // End the render pass and submit the command buffer
        pass.end();
        device.queue.submit([encoder.finish()]);
    }

    updateGrid();

}

main();