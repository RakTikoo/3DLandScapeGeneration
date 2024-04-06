export const renderShader = /* wgsl */`
// Your shader code will go here

struct SquareData {
  tl : f32,
  tr : f32,
  bl : f32, 
  br : f32,
};


struct VertexInput {
    @location(0) pos: vec2f,
    @builtin(instance_index) instance: u32,
  };
  struct VertexOutput {
    @builtin(position) pos: vec4f, // @builtin not interstage buffers. Different in vertex and fragment shaders
    @location(0) cell: vec2f, // Interstage buffer b/w vert and frag are connects using locations
    @location(1) state: f32,
  };
  struct FragInput {
    @location(0) cell: vec2f,
    @location(1) state: f32,
  };

  fn shift_ori(pos : vec2f, grid : vec2f) -> vec2f {
    let new_pos = vec2f(pos.x - grid.x/2, pos.y - grid.y/2);
    return new_pos;
  }

  fn z_set(tl : f32, tr : f32, bl : f32, br : f32, pos:vec2f) -> f32 { 
    if(pos.x == -1 && pos.y == -1) {
      return bl;
    }
    else if(pos.x == 1 && pos.y == 1) {
      return tr;
    }
    else if(pos.x == 1 && pos.y == -1) {
      return br;
    }
    else if(pos.x == -1 && pos.y == 1) {
      return tl;
    }
    else{
      return (tl*8 +tr*4 + bl*2 + br*1)/16;
    }

  } 

  @group(0) @binding(0) var<uniform> matrix: mat4x4f;

  // At the top of the code string in the createShaderModule() call
  @group(0) @binding(1) var<uniform> grid: vec2f; // group is the bind group
  @group(0) @binding(2) var<storage> cellState: array<SquareData>;
  
  //@group(0) @binding(3) var<storage> cellCornerState: array<SquareData>;

  @vertex
  fn vertexMain(input: VertexInput) -> VertexOutput {
      let i = f32(input.instance); // Save the instance_index as a float
      var curr_state = cellState[input.instance];
      // tl*8 + tr*4 + br*2 + bl*1;
      //var state = curr_state.tl*8 + curr_state.tr*4 + curr_state.bl*2 + curr_state.br*1;
      

      // Compute the cell coordinate from the instance_index
      let cell = vec2f(i % grid.x, floor(i / grid.x));

      //let new_cell = shift_ori(cell, grid);
      //let d : f32 = new_cell.x*new_cell.x  + new_cell.y*new_cell.y;
      //let r : f32 = grid.x/3;
      //if (d > r*r) {
      //  state  = state*(r*r/d);
      //}
  
      let cellOffset = cell / grid * 2; // Compute the offset to cell
      var z_val = z_set(curr_state.tl, curr_state.tr, curr_state.bl, curr_state.br, input.pos);
      //if (z_val < 0.35) {
      //  z_val = 0.35;
      //}
      let fullPos = vec4f(input.pos, z_val, 1);
      

      // Add 1 to the position before dividing by the grid size.
      // Subtract 1 after dividing by the grid size.
      //var newPos = matrix*input.pos;
      //var newPos = vec4f(input.pos, state/16, 1);    
      //var bigGrid = vec4f(grid, grid.x, 1);  
      var gridPos = (fullPos.xy+1) / grid - 1 + cellOffset;
      var updatePos = vec4f(gridPos, fullPos.zw);
      updatePos = matrix*updatePos;
      var output: VertexOutput;
      output.pos = updatePos;
      //output.pos = newPos;
      output.cell = cell;
      output.state = z_val;
      return output;
  }
  
  @fragment
  fn fragmentMain(input: FragInput) -> @location(0) vec4f { // Location 0 is where our canvas is bound to
      // Random Shader logic to create landscape ish pattern    
      var c = vec3f(0.0, 0.0, 0.0);
      let sea_level : f32 = 0.4;
      let sand_level : f32 = 0.5;
      let mountain_level1   : f32 = 0.6;
      let mountain_level2   : f32 = 0.7;
      let curr_level = input.state;
      if(curr_level <= sea_level) {
        c.x = 0.13;
        c.y = 0.4;
        c.z = 1.0;
      }  
      if(curr_level < sand_level && curr_level > sea_level) {
        c.x = 1.0;
        c.y = 0.9;
        c.z = 0.0;
      }  
      if(curr_level < mountain_level1 && curr_level > sand_level) {
        c.x = 0.0;
        c.y = 0.6;
        c.z = 0.2;
      }  
      if(curr_level < mountain_level2 && curr_level > mountain_level1) {
        c.x = 0.5;
        c.y = 0.5;
        c.z = 0.5;
      } 
      if(curr_level >= mountain_level2) {
        c.x = 1.0;
        c.y = 1.0;
        c.z = 1.0;
      }   

      return vec4f(c, 1.0); // (Red, Green, Blue, Alpha)
  }
`

