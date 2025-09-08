// Test input handling against the actual implementation
use crate::core::input::{InputManager, InputEvent, Key, MouseButton, InputAction};
use crate::core::camera::Camera;
use crate::core::app::Application;
use std::collections::HashSet;

pub async fn test_input_handling() -> Result<(), String> {
    println!("=== Input Handling Tests ===\n");
    
    let mut all_passed = true;
    
    // Test 1: WASD movement keys
    println!("Testing WASD movement keys...");
    match test_wasd_movement().await {
        Ok(_) => println!("✅ WASD movement - PASSED"),
        Err(e) => {
            println!("❌ WASD movement - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 2: Mouse capture and release
    println!("\nTesting mouse capture/release...");
    match test_mouse_capture().await {
        Ok(_) => println!("✅ Mouse capture - PASSED"),
        Err(e) => {
            println!("❌ Mouse capture - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 3: Mouse movement for camera
    println!("\nTesting mouse movement...");
    match test_mouse_movement().await {
        Ok(_) => println!("✅ Mouse movement - PASSED"),
        Err(e) => {
            println!("❌ Mouse movement - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 4: Key repeat prevention
    println!("\nTesting key repeat prevention...");
    match test_key_repeat().await {
        Ok(_) => println!("✅ Key repeat - PASSED"),
        Err(e) => {
            println!("❌ Key repeat - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 5: Special keys
    println!("\nTesting special key actions...");
    match test_special_keys().await {
        Ok(_) => println!("✅ Special keys - PASSED"),
        Err(e) => {
            println!("❌ Special keys - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 6: Input buffer
    println!("\nTesting input buffering...");
    match test_input_buffer().await {
        Ok(_) => println!("✅ Input buffer - PASSED"),
        Err(e) => {
            println!("❌ Input buffer - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    if !all_passed {
        return Err("Some input handling tests failed".to_string());
    }
    
    println!("\n✅ All input handling tests passed!");
    Ok(())
}

async fn test_wasd_movement() -> Result<(), String> {
    let mut input_manager = InputManager::new();
    
    // Test W key (forward)
    input_manager.handle_event(InputEvent::KeyPressed(Key::W));
    let movement = input_manager.get_movement_vector();
    
    if movement.z <= 0.0 {
        return Err(format!("W key should move forward (z+), got: {:?}", movement));
    }
    
    // Add A key (strafe left)
    input_manager.handle_event(InputEvent::KeyPressed(Key::A));
    let movement = input_manager.get_movement_vector();
    
    if movement.x >= 0.0 || movement.z <= 0.0 {
        return Err(format!("W+A should move forward-left, got: {:?}", movement));
    }
    
    // Release W, only A pressed
    input_manager.handle_event(InputEvent::KeyReleased(Key::W));
    let movement = input_manager.get_movement_vector();
    
    if movement.x >= 0.0 || movement.z != 0.0 {
        return Err(format!("A only should strafe left, got: {:?}", movement));
    }
    
    // Test opposite keys cancel
    input_manager.handle_event(InputEvent::KeyPressed(Key::D));
    let movement = input_manager.get_movement_vector();
    
    if movement.x != 0.0 {
        return Err(format!("A+D should cancel horizontal movement, got: {:?}", movement));
    }
    
    // Test S key (backward)
    input_manager.clear();
    input_manager.handle_event(InputEvent::KeyPressed(Key::S));
    let movement = input_manager.get_movement_vector();
    
    if movement.z >= 0.0 {
        return Err(format!("S key should move backward (z-), got: {:?}", movement));
    }
    
    // Test Space and Shift (vertical)
    input_manager.clear();
    input_manager.handle_event(InputEvent::KeyPressed(Key::Space));
    let movement = input_manager.get_movement_vector();
    
    if movement.y <= 0.0 {
        return Err(format!("Space should move up (y+), got: {:?}", movement));
    }
    
    input_manager.handle_event(InputEvent::KeyPressed(Key::Shift));
    let movement = input_manager.get_movement_vector();
    
    if movement.y != 0.0 {
        return Err(format!("Space+Shift should cancel vertical movement, got: {:?}", movement));
    }
    
    println!("  All movement keys register correctly");
    Ok(())
}

async fn test_mouse_capture() -> Result<(), String> {
    let mut input_manager = InputManager::new();
    
    // Initially mouse should not be captured
    if input_manager.is_mouse_captured() {
        return Err("Mouse should not be captured initially".to_string());
    }
    
    // Left click to capture mouse
    let action = input_manager.handle_event(InputEvent::MouseButtonPressed(MouseButton::Left));
    
    if !matches!(action, Some(InputAction::CaptureMouse)) {
        return Err(format!("Left click should capture mouse, got: {:?}", action));
    }
    
    if !input_manager.is_mouse_captured() {
        return Err("Mouse should be captured after left click".to_string());
    }
    
    // Escape to release
    let action = input_manager.handle_event(InputEvent::KeyPressed(Key::Escape));
    
    if !matches!(action, Some(InputAction::ReleaseMouse)) {
        return Err(format!("Escape should release mouse, got: {:?}", action));
    }
    
    if input_manager.is_mouse_captured() {
        return Err("Mouse should be released after Escape".to_string());
    }
    
    // Test that mouse movement doesn't affect camera when not captured
    let action = input_manager.handle_event(InputEvent::MouseMotion { 
        delta_x: 10.0, 
        delta_y: 5.0 
    });
    
    if matches!(action, Some(InputAction::RotateCamera { .. })) {
        return Err("Mouse movement should not rotate camera when not captured".to_string());
    }
    
    println!("  Mouse capture/release works correctly");
    Ok(())
}

async fn test_mouse_movement() -> Result<(), String> {
    let mut input_manager = InputManager::new();
    
    // Capture mouse first
    input_manager.handle_event(InputEvent::MouseButtonPressed(MouseButton::Left));
    
    // Test mouse movement generates camera rotation
    let action = input_manager.handle_event(InputEvent::MouseMotion {
        delta_x: 10.0,
        delta_y: 5.0,
    });
    
    match action {
        Some(InputAction::RotateCamera { yaw_delta, pitch_delta }) => {
            // Check sensitivity is applied
            let expected_yaw = 10.0 * input_manager.get_mouse_sensitivity();
            let expected_pitch = 5.0 * input_manager.get_mouse_sensitivity();
            
            if (yaw_delta - expected_yaw).abs() > 0.001 {
                return Err(format!("Incorrect yaw delta: {} vs expected {}", 
                                 yaw_delta, expected_yaw));
            }
            
            if (pitch_delta - expected_pitch).abs() > 0.001 {
                return Err(format!("Incorrect pitch delta: {} vs expected {}", 
                                 pitch_delta, expected_pitch));
            }
        }
        _ => return Err(format!("Mouse motion should rotate camera, got: {:?}", action)),
    }
    
    // Test large mouse movement (should still be smooth)
    let action = input_manager.handle_event(InputEvent::MouseMotion {
        delta_x: 100.0,
        delta_y: 50.0,
    });
    
    if !matches!(action, Some(InputAction::RotateCamera { .. })) {
        return Err("Large mouse movement should still rotate camera".to_string());
    }
    
    println!("  Mouse movement generates correct camera rotation");
    Ok(())
}

async fn test_key_repeat() -> Result<(), String> {
    let mut input_manager = InputManager::new();
    
    // First F3 press should toggle debug
    let action1 = input_manager.handle_event(InputEvent::KeyPressed(Key::F3));
    
    if !matches!(action1, Some(InputAction::ToggleDebug)) {
        return Err("First F3 press should toggle debug".to_string());
    }
    
    // Repeated F3 without release should be ignored
    let action2 = input_manager.handle_event(InputEvent::KeyPressed(Key::F3));
    
    if action2.is_some() {
        return Err("Repeated F3 press should be ignored".to_string());
    }
    
    // Release and press again should work
    input_manager.handle_event(InputEvent::KeyReleased(Key::F3));
    let action3 = input_manager.handle_event(InputEvent::KeyPressed(Key::F3));
    
    if !matches!(action3, Some(InputAction::ToggleDebug)) {
        return Err("F3 after release should work".to_string());
    }
    
    println!("  Key repeat prevention works correctly");
    Ok(())
}

async fn test_special_keys() -> Result<(), String> {
    let mut input_manager = InputManager::new();
    
    // F3 for debug overlay
    let action = input_manager.handle_event(InputEvent::KeyPressed(Key::F3));
    if !matches!(action, Some(InputAction::ToggleDebug)) {
        return Err(format!("F3 should toggle debug, got: {:?}", action));
    }
    
    input_manager.handle_event(InputEvent::KeyReleased(Key::F3));
    
    // Cmd+F (or Ctrl+F) for fullscreen
    input_manager.handle_event(InputEvent::KeyPressed(Key::Cmd));
    let action = input_manager.handle_event(InputEvent::KeyPressed(Key::F));
    
    if !matches!(action, Some(InputAction::ToggleFullscreen)) {
        return Err(format!("Cmd+F should toggle fullscreen, got: {:?}", action));
    }
    
    input_manager.handle_event(InputEvent::KeyReleased(Key::F));
    input_manager.handle_event(InputEvent::KeyReleased(Key::Cmd));
    
    // Tab for inventory (if implemented)
    let action = input_manager.handle_event(InputEvent::KeyPressed(Key::Tab));
    if let Some(action) = action {
        if !matches!(action, InputAction::ToggleInventory) {
            return Err(format!("Tab should toggle inventory if implemented, got: {:?}", action));
        }
    }
    
    println!("  Special keys trigger correct actions");
    Ok(())
}

async fn test_input_buffer() -> Result<(), String> {
    let mut input_manager = InputManager::new();
    
    // Simulate rapid key presses
    let keys = vec![Key::W, Key::A, Key::Space, Key::Shift, Key::D];
    
    for key in &keys {
        input_manager.handle_event(InputEvent::KeyPressed(*key));
    }
    
    // Check all keys are tracked
    let pressed_keys = input_manager.get_pressed_keys();
    
    if pressed_keys.len() != keys.len() {
        return Err(format!("Not all keys tracked: pressed {} vs sent {}", 
                          pressed_keys.len(), keys.len()));
    }
    
    for key in &keys {
        if !pressed_keys.contains(key) {
            return Err(format!("Key {:?} not tracked", key));
        }
    }
    
    // Release all keys
    for key in &keys {
        input_manager.handle_event(InputEvent::KeyReleased(*key));
    }
    
    // Verify all released
    let pressed_keys = input_manager.get_pressed_keys();
    if !pressed_keys.is_empty() {
        return Err(format!("Keys still pressed after release: {:?}", pressed_keys));
    }
    
    println!("  Input buffer handles multiple simultaneous keys");
    Ok(())
}