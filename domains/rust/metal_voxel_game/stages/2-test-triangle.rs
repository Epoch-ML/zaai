

// To run this test:
// 1. Create a new Rust project: cargo new test-triangle
// 2. Replace src/main.rs with this file
// 3. Update Cargo.toml with the dependencies above
// 4. Run: cargo run

use metal::*;
use winit::{
    event::{Event, WindowEvent},
    event_loop::{ControlFlow, EventLoop},
    window::WindowBuilder,
    platform::macos::WindowExtMacOS,
};
use cocoa::{appkit::NSView, base::id as cocoa_id};
use objc::runtime::YES;
use std::time::{Instant, Duration};
use std::mem;
use raw_window_handle::{HasRawWindowHandle, RawWindowHandle};

const VERTEX_SHADER: &str = r#"
#include <metal_stdlib>
using namespace metal;

struct VertexOut {
    float4 position [[position]];
    float4 color;
};

vertex VertexOut vertex_main(
    uint vertex_id [[vertex_id]]
) {
    const float2 positions[3] = {
        float2( 0.0,  0.5),
        float2(-0.5, -0.5),
        float2( 0.5, -0.5)
    };
    
    const float4 colors[3] = {
        float4(1.0, 0.0, 0.0, 1.0),  // Red
        float4(0.0, 1.0, 0.0, 1.0),  // Green
        float4(0.0, 0.0, 1.0, 1.0)   // Blue
    };
    
    VertexOut out;
    out.position = float4(positions[vertex_id], 0.0, 1.0);
    out.color = colors[vertex_id];
    return out;
}

fragment float4 fragment_main(VertexOut in [[stage_in]]) {
    return in.color;
}
"#;

fn main() {
    let start_time = Instant::now();
    let timeout = Duration::from_secs(100);
    
    println!("Starting Metal triangle test...");
    println!("Window will close automatically after 100 seconds or when you close it.");
    
    // Create event loop and window
    let event_loop = EventLoop::new();
    let window = WindowBuilder::new()
        .with_title("Metal Triangle Test")
        .with_inner_size(winit::dpi::LogicalSize::new(800, 600))
        .build(&event_loop)
        .expect("Failed to create window");
    
    // Get the native window handle
    let raw_handle = window.raw_window_handle();
    let ns_view = match raw_handle {
        RawWindowHandle::AppKit(handle) => handle.ns_view as cocoa_id,
        _ => panic!("Unexpected window handle type"),
    };
    
    // Create Metal device
    let device = Device::system_default().expect("No Metal device found");
    println!("Metal device: {}", device.name());
    
    // Create Metal layer
    let layer = MetalLayer::new();
    layer.set_device(&device);
    layer.set_pixel_format(MTLPixelFormat::BGRA8Unorm);
    layer.set_presents_with_transaction(false);
    
    unsafe {
        let view = ns_view as *mut objc::runtime::Object;
        view.setWantsLayer(YES);
        view.setLayer(mem::transmute(layer.as_ref()));
    }
    
    let draw_size = window.inner_size();
    layer.set_drawable_size(CGSize::new(draw_size.width as f64, draw_size.height as f64));
    
    // Compile shaders
    let library = device
        .new_library_with_source(VERTEX_SHADER, &CompileOptions::new())
        .expect("Failed to compile shaders");
    
    let vertex_function = library.get_function("vertex_main", None)
        .expect("Failed to get vertex function");
    let fragment_function = library.get_function("fragment_main", None)
        .expect("Failed to get fragment function");
    
    // Create pipeline state
    let pipeline_state_descriptor = RenderPipelineDescriptor::new();
    pipeline_state_descriptor.set_vertex_function(Some(&vertex_function));
    pipeline_state_descriptor.set_fragment_function(Some(&fragment_function));
    
    let attachment = pipeline_state_descriptor
        .color_attachments()
        .object_at(0)
        .unwrap();
    attachment.set_pixel_format(MTLPixelFormat::BGRA8Unorm);
    attachment.set_blending_enabled(false);
    
    let pipeline_state = device
        .new_render_pipeline_state(&pipeline_state_descriptor)
        .expect("Failed to create pipeline state");
    
    // Create command queue
    let command_queue = device.new_command_queue();
    
    let mut frame_count = 0u64;
    let mut last_fps_time = Instant::now();
    let mut fps_counter = 0;
    
    // Run event loop
    event_loop.run(move |event, _, control_flow| {
        *control_flow = ControlFlow::Poll;
        
        // Check timeout
        if start_time.elapsed() > timeout {
            println!("Test timeout reached (100 seconds)");
            *control_flow = ControlFlow::Exit;
            return;
        }
        
        match event {
            Event::WindowEvent { event, .. } => match event {
                WindowEvent::CloseRequested => {
                    println!("Window close requested");
                    *control_flow = ControlFlow::Exit;
                }
                WindowEvent::Resized(size) => {
                    layer.set_drawable_size(CGSize::new(size.width as f64, size.height as f64));
                }
                _ => {}
            },
            Event::MainEventsCleared => {
                window.request_redraw();
            }
            Event::RedrawRequested(_) => {
                // Get next drawable
                if let Some(drawable) = layer.next_drawable() {
                    // Create render pass descriptor
                    let render_pass_descriptor = RenderPassDescriptor::new();
                    let color_attachment = render_pass_descriptor
                        .color_attachments()
                        .object_at(0)
                        .unwrap();
                    
                    color_attachment.set_texture(Some(drawable.texture()));
                    color_attachment.set_load_action(MTLLoadAction::Clear);
                    color_attachment.set_clear_color(MTLClearColor::new(0.1, 0.1, 0.1, 1.0));
                    color_attachment.set_store_action(MTLStoreAction::Store);
                    
                    // Create command buffer and encoder
                    let command_buffer = command_queue.new_command_buffer();
                    let render_encoder = command_buffer
                        .new_render_command_encoder(&render_pass_descriptor);
                    
                    // Draw triangle
                    render_encoder.set_render_pipeline_state(&pipeline_state);
                    render_encoder.draw_primitives(MTLPrimitiveType::Triangle, 0, 3);
                    render_encoder.end_encoding();
                    
                    // Present drawable
                    command_buffer.present_drawable(&drawable);
                    command_buffer.commit();
                    
                    frame_count += 1;
                    fps_counter += 1;
                    
                    // Calculate and print FPS every second
                    let now = Instant::now();
                    if now.duration_since(last_fps_time) >= Duration::from_secs(1) {
                        println!("FPS: {}, Total frames: {}, Elapsed: {:?}", 
                                fps_counter, frame_count, start_time.elapsed());
                        fps_counter = 0;
                        last_fps_time = now;
                    }
                }
            }
            _ => {}
        }
    });
}

