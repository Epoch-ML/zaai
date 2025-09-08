// Test camera mathematics against the actual implementation
use crate::core::camera::{Camera, CameraConfig};
use crate::utils::math::{Vec3, Mat4, Quaternion};
use std::f32::consts::PI;

pub async fn test_camera_math() -> Result<(), String> {
    println!("=== Camera Math Tests ===\n");
    
    let mut all_passed = true;
    
    // Test 1: Forward vector calculation
    println!("Testing forward vector calculation...");
    match test_forward_vector().await {
        Ok(_) => println!("✅ Forward vector - PASSED"),
        Err(e) => {
            println!("❌ Forward vector - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 2: Orthogonal basis vectors
    println!("\nTesting orthogonal basis vectors...");
    match test_orthogonal_vectors().await {
        Ok(_) => println!("✅ Orthogonal vectors - PASSED"),
        Err(e) => {
            println!("❌ Orthogonal vectors - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 3: Pitch limits
    println!("\nTesting pitch limits...");
    match test_pitch_limits().await {
        Ok(_) => println!("✅ Pitch limits - PASSED"),
        Err(e) => {
            println!("❌ Pitch limits - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 4: View matrix
    println!("\nTesting view matrix generation...");
    match test_view_matrix().await {
        Ok(_) => println!("✅ View matrix - PASSED"),
        Err(e) => {
            println!("❌ View matrix - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 5: Projection matrix
    println!("\nTesting projection matrix...");
    match test_projection_matrix().await {
        Ok(_) => println!("✅ Projection matrix - PASSED"),
        Err(e) => {
            println!("❌ Projection matrix - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 6: Camera movement
    println!("\nTesting camera movement...");
    match test_camera_movement().await {
        Ok(_) => println!("✅ Camera movement - PASSED"),
        Err(e) => {
            println!("❌ Camera movement - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    if !all_passed {
        return Err("Some camera math tests failed".to_string());
    }
    
    println!("\n✅ All camera math tests passed!");
    Ok(())
}

async fn test_forward_vector() -> Result<(), String> {
    let config = CameraConfig {
        position: Vec3::new(0.0, 0.0, 0.0),
        fov: 70.0,
        near: 0.1,
        far: 1000.0,
        sensitivity: 0.003,
    };
    
    let mut camera = Camera::new(config);
    
    // Test looking forward (yaw=0, pitch=0)
    camera.set_rotation(0.0, 0.0);
    let forward = camera.get_forward();
    
    // Should be looking along +Z in our coordinate system
    if (forward.x).abs() > 0.01 || (forward.y).abs() > 0.01 || (forward.z - 1.0).abs() > 0.01 {
        return Err(format!("Forward vector incorrect when looking straight: {:?}", forward));
    }
    
    // Test looking right (yaw=PI/2)
    camera.set_rotation(PI / 2.0, 0.0);
    let forward = camera.get_forward();
    
    if (forward.x - 1.0).abs() > 0.01 || (forward.y).abs() > 0.01 || (forward.z).abs() > 0.01 {
        return Err(format!("Forward vector incorrect when looking right: {:?}", forward));
    }
    
    // Test looking up (pitch=PI/2, clamped to max)
    camera.set_rotation(0.0, PI / 2.0);
    let forward = camera.get_forward();
    
    // Should be clamped to max pitch, nearly looking up
    if forward.y < 0.9 {
        return Err(format!("Forward vector incorrect when looking up: {:?}", forward));
    }
    
    println!("  Forward vectors calculated correctly for all orientations");
    Ok(())
}

async fn test_orthogonal_vectors() -> Result<(), String> {
    let config = CameraConfig::default();
    let mut camera = Camera::new(config);
    
    let test_angles = [
        (0.0, 0.0),
        (PI/4.0, 0.0),
        (PI/2.0, PI/6.0),
        (-PI/3.0, -PI/8.0),
    ];
    
    for (yaw, pitch) in test_angles {
        camera.set_rotation(yaw, pitch);
        
        let forward = camera.get_forward();
        let right = camera.get_right();
        let up = camera.get_up();
        
        // Check orthogonality
        let dot_fr = forward.dot(&right);
        let dot_fu = forward.dot(&up);
        let dot_ru = right.dot(&up);
        
        if dot_fr.abs() > 0.01 {
            return Err(format!("Forward and right not orthogonal at ({}, {}): dot={}", 
                             yaw, pitch, dot_fr));
        }
        
        if dot_fu.abs() > 0.01 {
            return Err(format!("Forward and up not orthogonal at ({}, {}): dot={}", 
                             yaw, pitch, dot_fu));
        }
        
        if dot_ru.abs() > 0.01 {
            return Err(format!("Right and up not orthogonal at ({}, {}): dot={}", 
                             yaw, pitch, dot_ru));
        }
        
        // Check unit vectors
        if (forward.length() - 1.0).abs() > 0.01 {
            return Err(format!("Forward not unit length: {}", forward.length()));
        }
        
        if (right.length() - 1.0).abs() > 0.01 {
            return Err(format!("Right not unit length: {}", right.length()));
        }
        
        if (up.length() - 1.0).abs() > 0.01 {
            return Err(format!("Up not unit length: {}", up.length()));
        }
    }
    
    println!("  Basis vectors are orthonormal for all orientations");
    Ok(())
}

async fn test_pitch_limits() -> Result<(), String> {
    let config = CameraConfig::default();
    let mut camera = Camera::new(config);
    
    // Try to rotate beyond limits
    camera.rotate(0.0, PI); // Try to look too far up
    let pitch = camera.get_pitch();
    
    if pitch >= PI / 2.0 || pitch <= -PI / 2.0 {
        return Err(format!("Pitch not clamped properly: {}", pitch));
    }
    
    camera.rotate(0.0, -PI); // Try to look too far down
    let pitch = camera.get_pitch();
    
    if pitch >= PI / 2.0 || pitch <= -PI / 2.0 {
        return Err(format!("Pitch not clamped properly: {}", pitch));
    }
    
    // Test that camera doesn't flip at extremes
    camera.set_rotation(0.0, camera.get_max_pitch() - 0.01);
    let up1 = camera.get_up();
    
    camera.rotate(0.0, 0.001);
    let up2 = camera.get_up();
    
    if up1.dot(&up2) < 0.9 {
        return Err("Camera flipped at pitch extreme".to_string());
    }
    
    println!("  Pitch properly limited to prevent flipping");
    Ok(())
}

async fn test_view_matrix() -> Result<(), String> {
    let config = CameraConfig {
        position: Vec3::new(5.0, 3.0, -2.0),
        ..Default::default()
    };
    
    let mut camera = Camera::new(config);
    camera.set_rotation(PI / 4.0, PI / 8.0);
    
    let view_matrix = camera.get_view_matrix();
    
    // Test that view matrix is valid
    // View matrix should transform world to camera space
    let world_origin = Vec3::new(0.0, 0.0, 0.0);
    let camera_space_origin = view_matrix.transform_point(&world_origin);
    
    // Origin should be behind and below camera
    let expected_distance = config.position.length();
    let actual_distance = camera_space_origin.length();
    
    if (actual_distance - expected_distance).abs() > 0.1 {
        return Err(format!("View matrix translation incorrect: expected distance {}, got {}", 
                          expected_distance, actual_distance));
    }
    
    // Check that view matrix upper-left 3x3 is orthonormal (rotation part)
    for i in 0..3 {
        let row = Vec3::new(
            view_matrix.get(i, 0),
            view_matrix.get(i, 1),
            view_matrix.get(i, 2)
        );
        
        let length = row.length();
        if (length - 1.0).abs() > 0.01 {
            return Err(format!("View matrix row {} not unit length: {}", i, length));
        }
    }
    
    println!("  View matrix generated correctly");
    Ok(())
}

async fn test_projection_matrix() -> Result<(), String> {
    let config = CameraConfig {
        fov: 90.0,
        near: 0.1,
        far: 100.0,
        ..Default::default()
    };
    
    let camera = Camera::new(config);
    let proj_matrix = camera.get_projection_matrix(16.0 / 9.0); // 16:9 aspect ratio
    
    // Test near plane mapping
    let near_point = Vec3::new(0.0, 0.0, -config.near);
    let projected = proj_matrix.transform_point(&near_point);
    
    // Near plane should map to z=-1 in NDC
    if (projected.z + 1.0).abs() > 0.1 {
        return Err(format!("Near plane mapping incorrect: z={}", projected.z));
    }
    
    // Test far plane mapping
    let far_point = Vec3::new(0.0, 0.0, -config.far);
    let projected = proj_matrix.transform_point(&far_point);
    
    // Far plane should map to z=1 in NDC
    if (projected.z - 1.0).abs() > 0.1 {
        return Err(format!("Far plane mapping incorrect: z={}", projected.z));
    }
    
    // Test FOV
    // At z=-1, the horizontal extent should match the FOV
    let fov_rad = config.fov.to_radians();
    let expected_x = (fov_rad / 2.0).tan();
    let test_point = Vec3::new(expected_x, 0.0, -1.0);
    let projected = proj_matrix.transform_point(&test_point);
    
    // Should be at edge of NDC
    if (projected.x.abs() - 1.0).abs() > 0.1 {
        return Err(format!("FOV incorrect: projected x={} for FOV={}", projected.x, config.fov));
    }
    
    println!("  Projection matrix correct for FOV={}, near={}, far={}", 
             config.fov, config.near, config.far);
    Ok(())
}

async fn test_camera_movement() -> Result<(), String> {
    let config = CameraConfig {
        position: Vec3::new(0.0, 0.0, 0.0),
        ..Default::default()
    };
    
    let mut camera = Camera::new(config);
    
    // Test forward movement
    camera.set_rotation(0.0, 0.0); // Looking along +Z
    camera.move_forward(5.0);
    
    let pos = camera.get_position();
    if (pos.z - 5.0).abs() > 0.01 {
        return Err(format!("Forward movement incorrect: position={:?}", pos));
    }
    
    // Reset and test strafe
    camera.set_position(Vec3::new(0.0, 0.0, 0.0));
    camera.move_right(3.0);
    
    let pos = camera.get_position();
    if (pos.x - 3.0).abs() > 0.01 {
        return Err(format!("Right movement incorrect: position={:?}", pos));
    }
    
    // Test movement at angle
    camera.set_position(Vec3::new(0.0, 0.0, 0.0));
    camera.set_rotation(PI / 4.0, 0.0); // 45 degrees right
    camera.move_forward(2.0_f32.sqrt());
    
    let pos = camera.get_position();
    if (pos.x - 1.0).abs() > 0.1 || (pos.z - 1.0).abs() > 0.1 {
        return Err(format!("Diagonal movement incorrect: position={:?}", pos));
    }
    
    // Test vertical movement
    camera.set_position(Vec3::new(0.0, 0.0, 0.0));
    camera.move_up(2.5);
    
    let pos = camera.get_position();
    if (pos.y - 2.5).abs() > 0.01 {
        return Err(format!("Vertical movement incorrect: position={:?}", pos));
    }
    
    println!("  Camera movement works correctly in all directions");
    Ok(())
}