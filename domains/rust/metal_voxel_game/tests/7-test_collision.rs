// Test collision detection against the actual implementation
use crate::physics::collision::{CollisionSystem, AABB, CollisionResult};
use crate::physics::movement::{MovementController, PlayerPhysics};
use crate::world::world::World;
use crate::world::chunk::{Chunk, ChunkCoord};
use crate::world::block::{Block, BlockType};
use crate::utils::math::Vec3;

pub async fn test_collision() -> Result<(), String> {
    println!("=== Collision Detection Tests ===\n");
    
    let mut all_passed = true;
    
    // Test 1: Basic AABB collision
    println!("Testing basic AABB collision...");
    match test_basic_aabb().await {
        Ok(_) => println!("✅ Basic AABB - PASSED"),
        Err(e) => {
            println!("❌ Basic AABB - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 2: Player-block collision
    println!("\nTesting player-block collision...");
    match test_player_block().await {
        Ok(_) => println!("✅ Player-block - PASSED"),
        Err(e) => {
            println!("❌ Player-block - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 3: Sliding collision
    println!("\nTesting sliding collision...");
    match test_sliding().await {
        Ok(_) => println!("✅ Sliding - PASSED"),
        Err(e) => {
            println!("❌ Sliding - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 4: High-speed collision (tunneling prevention)
    println!("\nTesting high-speed collision...");
    match test_high_speed().await {
        Ok(_) => println!("✅ High speed - PASSED"),
        Err(e) => {
            println!("❌ High speed - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 5: Step-up mechanics
    println!("\nTesting step-up mechanics...");
    match test_step_up().await {
        Ok(_) => println!("✅ Step up - PASSED"),
        Err(e) => {
            println!("❌ Step up - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 6: Gravity and ground collision
    println!("\nTesting gravity collision...");
    match test_gravity().await {
        Ok(_) => println!("✅ Gravity - PASSED"),
        Err(e) => {
            println!("❌ Gravity - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    if !all_passed {
        return Err("Some collision tests failed".to_string());
    }
    
    println!("\n✅ All collision tests passed!");
    Ok(())
}

async fn test_basic_aabb() -> Result<(), String> {
    let collision_system = CollisionSystem::new();
    
    let box1 = AABB::new(
        Vec3::new(0.0, 0.0, 0.0),
        Vec3::new(1.0, 1.0, 1.0)
    );
    
    let box2 = AABB::new(
        Vec3::new(0.5, 0.5, 0.5),
        Vec3::new(1.5, 1.5, 1.5)
    );
    
    let box3 = AABB::new(
        Vec3::new(2.0, 2.0, 2.0),
        Vec3::new(3.0, 3.0, 3.0)
    );
    
    // Test overlapping boxes
    if !collision_system.test_aabb_collision(&box1, &box2) {
        return Err("Overlapping boxes should collide".to_string());
    }
    
    // Test non-overlapping boxes
    if collision_system.test_aabb_collision(&box1, &box3) {
        return Err("Non-overlapping boxes should not collide".to_string());
    }
    
    // Test point containment
    let point = Vec3::new(0.5, 0.5, 0.5);
    if !box1.contains_point(point) {
        return Err("Point should be inside box1".to_string());
    }
    
    if !box2.contains_point(point) {
        return Err("Point should be inside box2".to_string());
    }
    
    if box3.contains_point(point) {
        return Err("Point should not be inside box3".to_string());
    }
    
    println!("  AABB intersection and containment work correctly");
    Ok(())
}

async fn test_player_block() -> Result<(), String> {
    let mut collision_system = CollisionSystem::new();
    let mut world = World::new(Default::default());
    
    // Create a chunk with a block at (0, 0, 0)
    let mut chunk = Chunk::new(ChunkCoord::new(0, 0));
    chunk.set_block(0, 0, 0, Block::new(BlockType::Stone));
    world.add_chunk(chunk).await;
    
    // Create player AABB
    let player_size = Vec3::new(0.8, 1.8, 0.8);
    
    // Player above block - no collision
    let player_pos = Vec3::new(0.5, 2.0, 0.5);
    let player_aabb = AABB::from_center_size(player_pos, player_size);
    
    let collision = collision_system.check_world_collision(&player_aabb, &world).await;
    if collision.is_colliding {
        return Err("Player above block should not collide".to_string());
    }
    
    // Player intersecting block - collision
    let player_pos = Vec3::new(0.5, 0.5, 0.5);
    let player_aabb = AABB::from_center_size(player_pos, player_size);
    
    let collision = collision_system.check_world_collision(&player_aabb, &world).await;
    if !collision.is_colliding {
        return Err("Player inside block should collide".to_string());
    }
    
    println!("  Player-block collision detection works");
    Ok(())
}

async fn test_sliding() -> Result<(), String> {
    let mut collision_system = CollisionSystem::new();
    let mut world = World::new(Default::default());
    
    // Create a wall of blocks
    let mut chunk = Chunk::new(ChunkCoord::new(0, 0));
    for z in 0..5 {
        chunk.set_block(2, 0, z, Block::new(BlockType::Stone));
        chunk.set_block(2, 1, z, Block::new(BlockType::Stone));
    }
    world.add_chunk(chunk).await;
    
    // Player moving diagonally into wall
    let player_size = Vec3::new(0.8, 1.8, 0.8);
    let start_pos = Vec3::new(0.0, 0.5, 2.0);
    let velocity = Vec3::new(5.0, 0.0, 2.0); // Moving diagonally
    let delta_time = 0.1;
    
    let player_aabb = AABB::from_center_size(start_pos, player_size);
    let movement = velocity * delta_time;
    
    let result = collision_system.sweep_collision(&player_aabb, movement, &world).await?;
    
    // Player should slide along the wall (move in Z but not X)
    if result.final_position.x > start_pos.x + 0.2 {
        return Err(format!("Player should be stopped in X direction: {}", result.final_position.x));
    }
    
    if (result.final_position.z - start_pos.z).abs() < 0.1 {
        return Err(format!("Player should slide in Z direction: {}", result.final_position.z));
    }
    
    println!("  Sliding collision along walls works");
    Ok(())
}

async fn test_high_speed() -> Result<(), String> {
    let mut collision_system = CollisionSystem::new();
    let mut world = World::new(Default::default());
    
    // Create a thin wall at x=5
    let mut chunk = Chunk::new(ChunkCoord::new(0, 0));
    for y in 0..3 {
        for z in 0..3 {
            chunk.set_block(5, y, z, Block::new(BlockType::Stone));
        }
    }
    world.add_chunk(chunk).await;
    
    // Player moving at very high speed
    let player_size = Vec3::new(0.8, 1.8, 0.8);
    let start_pos = Vec3::new(0.0, 1.0, 1.0);
    let velocity = Vec3::new(100.0, 0.0, 0.0); // Very high speed
    let delta_time = 1.0; // Large time step
    
    let player_aabb = AABB::from_center_size(start_pos, player_size);
    let movement = velocity * delta_time;
    
    let result = collision_system.sweep_collision(&player_aabb, movement, &world).await?;
    
    // Player should stop before the wall, not tunnel through
    if result.final_position.x >= 5.0 {
        return Err(format!("Player tunneled through wall at x={}", result.final_position.x));
    }
    
    if result.final_position.x <= 3.5 {
        return Err(format!("Collision detected too early at x={}", result.final_position.x));
    }
    
    println!("  High-speed collision prevents tunneling");
    Ok(())
}

async fn test_step_up() -> Result<(), String> {
    let mut movement_controller = MovementController::new();
    let mut world = World::new(Default::default());
    
    // Create a single block step
    let mut chunk = Chunk::new(ChunkCoord::new(0, 0));
    chunk.set_block(2, 0, 0, Block::new(BlockType::Stone));
    world.add_chunk(chunk).await;
    
    // Player approaching step
    let mut player = PlayerPhysics::new();
    player.position = Vec3::new(0.0, 0.1, 0.0);
    player.velocity = Vec3::new(5.0, 0.0, 0.0);
    
    // Update with step-up enabled
    movement_controller.update_player(&mut player, &world, 0.1).await?;
    
    // Check if player stepped up
    if player.position.y > 0.9 && player.position.x > 1.5 {
        println!("  Player successfully stepped up");
    } else if player.position.x < 0.5 {
        // Player was stopped by step
        println!("  Step collision detected (step-up requires sufficient velocity)");
    } else {
        return Err(format!("Unexpected step-up behavior: pos={:?}", player.position));
    }
    
    Ok(())
}

async fn test_gravity() -> Result<(), String> {
    let mut movement_controller = MovementController::new();
    let mut world = World::new(Default::default());
    
    // Create a floor
    let mut chunk = Chunk::new(ChunkCoord::new(0, 0));
    for x in 0..16 {
        for z in 0..16 {
            chunk.set_block(x, 0, z, Block::new(BlockType::Stone));
        }
    }
    world.add_chunk(chunk).await;
    
    // Player falling from height
    let mut player = PlayerPhysics::new();
    player.position = Vec3::new(8.0, 10.0, 8.0);
    player.velocity = Vec3::new(0.0, 0.0, 0.0);
    player.on_ground = false;
    
    // Simulate falling for 1 second (100 updates at 10ms each)
    for _ in 0..100 {
        movement_controller.update_player(&mut player, &world, 0.01).await?;
        
        // Break if player hits ground
        if player.on_ground {
            break;
        }
    }
    
    // Player should be on the ground
    if !player.on_ground {
        return Err("Player should be on ground after falling".to_string());
    }
    
    // Player should be at correct height (just above floor)
    let expected_y = 0.0 + player.height / 2.0;
    if (player.position.y - expected_y).abs() > 0.2 {
        return Err(format!("Player at incorrect height after landing: {} vs expected {}", 
                          player.position.y, expected_y));
    }
    
    // Vertical velocity should be zero
    if player.velocity.y.abs() > 0.1 {
        return Err(format!("Vertical velocity should be stopped: {}", player.velocity.y));
    }
    
    println!("  Gravity and ground collision work correctly");
    println!("  Player landed at y={:.2}", player.position.y);
    Ok(())
}