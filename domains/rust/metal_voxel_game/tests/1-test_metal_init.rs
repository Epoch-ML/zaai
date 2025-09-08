// Test Metal initialization against the actual renderer implementation
use crate::core::renderer::{Renderer, RenderConfig};
use crate::core::app::Application;
use crate::render::shader::ShaderManager;
use crate::render::pipeline::PipelineState;
use crate::render::texture::TextureManager;
use metal::*;

pub async fn test_metal_init() -> Result<(), String> {
    println!("=== Metal Initialization Tests ===\n");
    
    let mut all_passed = true;
    
    // Test 1: Renderer creation and device initialization
    println!("Testing renderer creation...");
    match test_renderer_creation().await {
        Ok(_) => println!("✅ Renderer creation - PASSED"),
        Err(e) => {
            println!("❌ Renderer creation - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 2: Shader compilation through ShaderManager
    println!("\nTesting shader compilation...");
    match test_shader_compilation().await {
        Ok(_) => println!("✅ Shader compilation - PASSED"),
        Err(e) => {
            println!("❌ Shader compilation - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 3: Pipeline state creation
    println!("\nTesting pipeline state creation...");
    match test_pipeline_state().await {
        Ok(_) => println!("✅ Pipeline state - PASSED"),
        Err(e) => {
            println!("❌ Pipeline state - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 4: Texture manager initialization
    println!("\nTesting texture manager...");
    match test_texture_manager().await {
        Ok(_) => println!("✅ Texture manager - PASSED"),
        Err(e) => {
            println!("❌ Texture manager - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 5: Buffer allocation
    println!("\nTesting buffer allocation...");
    match test_buffer_allocation().await {
        Ok(_) => println!("✅ Buffer allocation - PASSED"),
        Err(e) => {
            println!("❌ Buffer allocation - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    if !all_passed {
        return Err("Some Metal initialization tests failed".to_string());
    }
    
    println!("\n✅ All Metal initialization tests passed!");
    Ok(())
}

async fn test_renderer_creation() -> Result<(), String> {
    let config = RenderConfig {
        width: 1280,
        height: 720,
        vsync: true,
        msaa_samples: 4,
    };
    
    let renderer = Renderer::new(config)
        .map_err(|e| format!("Failed to create renderer: {:?}", e))?;
    
    // Verify device was created
    let device = renderer.get_device();
    if device.name().is_empty() {
        return Err("Device has no name".to_string());
    }
    
    println!("  Metal device: {}", device.name());
    
    // Check feature support
    if !device.supports_feature_set(MTLFeatureSet::macOS_GPUFamily2_v1) {
        return Err("Device doesn't support required Metal feature set".to_string());
    }
    
    // Verify command queue
    let command_queue = renderer.get_command_queue();
    if command_queue.as_ptr().is_null() {
        return Err("Command queue is null".to_string());
    }
    
    Ok(())
}

async fn test_shader_compilation() -> Result<(), String> {
    let renderer = Renderer::new(RenderConfig::default())
        .map_err(|e| format!("Failed to create renderer: {:?}", e))?;
    
    let mut shader_manager = ShaderManager::new(renderer.get_device());
    
    // Load voxel shaders
    shader_manager.load_shader("voxel", include_str!("../shaders/voxel.vert.metal"), include_str!("../shaders/voxel.frag.metal"))
        .map_err(|e| format!("Failed to compile voxel shaders: {:?}", e))?;
    
    // Verify functions exist
    let vertex_fn = shader_manager.get_vertex_function("voxel")
        .ok_or("Failed to get vertex function")?;
    
    let fragment_fn = shader_manager.get_fragment_function("voxel")
        .ok_or("Failed to get fragment function")?;
    
    println!("  Vertex function: {}", vertex_fn.name());
    println!("  Fragment function: {}", fragment_fn.name());
    
    Ok(())
}

async fn test_pipeline_state() -> Result<(), String> {
    let renderer = Renderer::new(RenderConfig::default())
        .map_err(|e| format!("Failed to create renderer: {:?}", e))?;
    
    let mut shader_manager = ShaderManager::new(renderer.get_device());
    shader_manager.load_shader("voxel", include_str!("../shaders/voxel.vert.metal"), include_str!("../shaders/voxel.frag.metal"))
        .map_err(|e| format!("Failed to load shaders: {:?}", e))?;
    
    // Create pipeline state
    let pipeline = PipelineState::new(
        renderer.get_device(),
        &shader_manager,
        "voxel",
        MTLPixelFormat::BGRA8Unorm,
        MTLPixelFormat::Depth32Float,
    ).map_err(|e| format!("Failed to create pipeline state: {:?}", e))?;
    
    // Verify pipeline is valid
    if pipeline.get_metal_pipeline_state().as_ptr().is_null() {
        return Err("Pipeline state is null".to_string());
    }
    
    Ok(())
}

async fn test_texture_manager() -> Result<(), String> {
    let renderer = Renderer::new(RenderConfig::default())
        .map_err(|e| format!("Failed to create renderer: {:?}", e))?;
    
    let mut texture_manager = TextureManager::new(renderer.get_device());
    
    // Load block texture atlas
    let atlas_path = "assets/blocks.png";
    texture_manager.load_texture_atlas(atlas_path)
        .map_err(|e| format!("Failed to load texture atlas: {:?}", e))?;
    
    // Verify texture was created
    let texture = texture_manager.get_atlas_texture()
        .ok_or("Atlas texture not found")?;
    
    if texture.width() == 0 || texture.height() == 0 {
        return Err("Texture has invalid dimensions".to_string());
    }
    
    println!("  Atlas texture: {}x{}", texture.width(), texture.height());
    
    Ok(())
}

async fn test_buffer_allocation() -> Result<(), String> {
    let renderer = Renderer::new(RenderConfig::default())
        .map_err(|e| format!("Failed to create renderer: {:?}", e))?;
    
    let device = renderer.get_device();
    
    // Test various buffer sizes
    let test_sizes = vec![1024, 1024 * 1024, 16 * 1024 * 1024];
    
    for size in test_sizes {
        let buffer = device.new_buffer(size, MTLResourceOptions::StorageModeShared);
        
        if buffer.length() != size {
            return Err(format!("Buffer size mismatch: expected {}, got {}", size, buffer.length()));
        }
        
        println!("  Created buffer: {} bytes", size);
    }
    
    // Test vertex buffer creation for chunk mesh
    let vertex_count = 24 * 16 * 16 * 16; // Max vertices for a chunk
    let vertex_size = std::mem::size_of::<f32>() * 8; // position + normal + texcoord
    let buffer_size = vertex_count * vertex_size;
    
    let vertex_buffer = device.new_buffer(buffer_size, MTLResourceOptions::StorageModeShared);
    if vertex_buffer.length() != buffer_size {
        return Err("Failed to create vertex buffer".to_string());
    }
    
    println!("  Created vertex buffer for chunk: {} bytes", buffer_size);
    
    Ok(())
}