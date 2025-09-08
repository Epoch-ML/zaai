// Test chunk loading system against the actual implementation
use crate::world::world::{World, WorldConfig};
use crate::world::chunk::{Chunk, ChunkCoord, ChunkManager, CHUNK_SIZE};
use crate::world::terrain::TerrainGenerator;
use crate::utils::math::Vec3;
use std::time::{Duration, Instant};
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn test_chunk_loading() -> Result<(), String> {
    println!("=== Chunk Loading Tests ===\n");
    
    let mut all_passed = true;
    
    // Test 1: Initial chunk loading
    println!("Testing initial chunk loading...");
    match test_initial_loading().await {
        Ok(_) => println!("✅ Initial loading - PASSED"),
        Err(e) => {
            println!("❌ Initial loading - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 2: Circular loading pattern
    println!("\nTesting circular loading pattern...");
    match test_circular_pattern().await {
        Ok(_) => println!("✅ Circular pattern - PASSED"),
        Err(e) => {
            println!("❌ Circular pattern - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 3: Chunk unloading
    println!("\nTesting chunk unloading...");
    match test_chunk_unloading().await {
        Ok(_) => println!("✅ Chunk unloading - PASSED"),
        Err(e) => {
            println!("❌ Chunk unloading - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 4: Memory management
    println!("\nTesting memory management...");
    match test_memory_management().await {
        Ok(_) => println!("✅ Memory management - PASSED"),
        Err(e) => {
            println!("❌ Memory management - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 5: Concurrent loading
    println!("\nTesting concurrent chunk loading...");
    match test_concurrent_loading().await {
        Ok(_) => println!("✅ Concurrent loading - PASSED"),
        Err(e) => {
            println!("❌ Concurrent loading - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 6: Loading priority
    println!("\nTesting chunk loading priority...");
    match test_loading_priority().await {
        Ok(_) => println!("✅ Loading priority - PASSED"),
        Err(e) => {
            println!("❌ Loading priority - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    if !all_passed {
        return Err("Some chunk loading tests failed".to_string());
    }
    
    println!("\n✅ All chunk loading tests passed!");
    Ok(())
}

async fn test_initial_loading() -> Result<(), String> {
    let config = WorldConfig {
        render_distance: 8,
        chunk_load_distance: 10,
        seed: 12345,
    };
    
    let mut world = World::new(config);
    
    // Set player position at origin
    world.update_player_position(Vec3::new(0.0, 64.0, 0.0)).await?;
    
    // Allow initial chunks to load
    tokio::time::sleep(Duration::from_millis(100)).await;
    world.process_loading_queue().await?;
    
    let loaded_count = world.get_loaded_chunk_count();
    if loaded_count == 0 {
        return Err("No chunks loaded initially".to_string());
    }
    
    // Check center chunk is loaded
    let center_chunk = world.get_chunk(ChunkCoord::new(0, 0)).await;
    if center_chunk.is_none() {
        return Err("Center chunk not loaded".to_string());
    }
    
    println!("  Initial chunks loaded: {}", loaded_count);
    Ok(())
}

async fn test_circular_pattern() -> Result<(), String> {
    let config = WorldConfig {
        render_distance: 4,
        chunk_load_distance: 5,
        seed: 54321,
    };
    
    let mut world = World::new(config);
    world.update_player_position(Vec3::new(0.0, 64.0, 0.0)).await?;
    
    // Process all loading
    for _ in 0..10 {
        world.process_loading_queue().await?;
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    
    // Check that all chunks within render distance are loaded
    let center = ChunkCoord::new(0, 0);
    let mut missing = Vec::new();
    
    for x in -config.render_distance..=config.render_distance {
        for z in -config.render_distance..=config.render_distance {
            let coord = ChunkCoord::new(x, z);
            let distance = ((x * x + z * z) as f32).sqrt();
            
            if distance <= config.render_distance as f32 {
                let chunk = world.get_chunk(coord).await;
                if chunk.is_none() {
                    missing.push(coord);
                }
            }
        }
    }
    
    if !missing.is_empty() {
        return Err(format!("Missing chunks within render distance: {:?}", missing));
    }
    
    println!("  All chunks within render distance loaded in circular pattern");
    Ok(())
}

async fn test_chunk_unloading() -> Result<(), String> {
    let config = WorldConfig {
        render_distance: 4,
        chunk_load_distance: 6,
        seed: 11111,
    };
    
    let mut world = World::new(config);
    
    // Load chunks at origin
    world.update_player_position(Vec3::new(0.0, 64.0, 0.0)).await?;
    for _ in 0..5 {
        world.process_loading_queue().await?;
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    
    let initial_count = world.get_loaded_chunk_count();
    
    // Move player far away
    let far_distance = (config.chunk_load_distance + 5) * CHUNK_SIZE;
    world.update_player_position(Vec3::new(far_distance as f32, 64.0, far_distance as f32)).await?;
    
    // Process unloading
    world.unload_distant_chunks().await?;
    
    // Check that origin chunk is unloaded
    let origin_chunk = world.get_chunk(ChunkCoord::new(0, 0)).await;
    if origin_chunk.is_some() {
        return Err("Origin chunk should be unloaded".to_string());
    }
    
    let remaining = world.get_loaded_chunk_count();
    if remaining >= initial_count {
        return Err(format!("Chunks not unloaded: {} -> {}", initial_count, remaining));
    }
    
    println!("  Chunks unload when player moves away");
    println!("  Unloaded {} chunks", initial_count - remaining);
    Ok(())
}

async fn test_memory_management() -> Result<(), String> {
    let config = WorldConfig {
        render_distance: 3,
        chunk_load_distance: 4,
        seed: 77777,
    };
    
    let mut world = World::new(config);
    
    // Track memory usage
    let initial_memory = world.get_memory_usage_mb();
    
    // Load chunks
    world.update_player_position(Vec3::new(0.0, 64.0, 0.0)).await?;
    for _ in 0..5 {
        world.process_loading_queue().await?;
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    
    let loaded_memory = world.get_memory_usage_mb();
    let chunks_loaded = world.get_loaded_chunk_count();
    
    if loaded_memory <= initial_memory {
        return Err("Memory not allocated for chunks".to_string());
    }
    
    let memory_per_chunk = (loaded_memory - initial_memory) / chunks_loaded as f32;
    println!("  Memory per chunk: {:.2} MB", memory_per_chunk);
    
    // Expected memory per chunk (rough estimate)
    let expected_per_chunk = (CHUNK_SIZE * 256 * CHUNK_SIZE * std::mem::size_of::<u16>()) as f32 / (1024.0 * 1024.0);
    
    if memory_per_chunk > expected_per_chunk * 3.0 {
        return Err(format!("Memory usage too high: {:.2} MB per chunk", memory_per_chunk));
    }
    
    // Move and unload
    world.update_player_position(Vec3::new(1000.0, 64.0, 1000.0)).await?;
    world.unload_distant_chunks().await?;
    
    // Load new chunks
    for _ in 0..5 {
        world.process_loading_queue().await?;
        tokio::time::sleep(Duration::from_millis(10)).await;
    }
    
    let new_memory = world.get_memory_usage_mb();
    
    // Memory should be similar (not leaking)
    if new_memory > loaded_memory * 1.2 {
        return Err(format!("Possible memory leak: {:.1} MB -> {:.1} MB", 
                          loaded_memory, new_memory));
    }
    
    println!("  Memory properly managed, no significant leaks");
    Ok(())
}

async fn test_concurrent_loading() -> Result<(), String> {
    let config = WorldConfig {
        render_distance: 4,
        chunk_load_distance: 5,
        seed: 99999,
    };
    
    let world = Arc::new(RwLock::new(World::new(config)));
    
    // Spawn loading task
    let world_clone = Arc::clone(&world);
    let loader_task = tokio::spawn(async move {
        for _ in 0..10 {
            let mut world = world_clone.write().await;
            world.process_loading_queue().await.unwrap();
            drop(world); // Release lock
            tokio::time::sleep(Duration::from_millis(20)).await;
        }
    });
    
    // Move player around while loading
    for i in 0..5 {
        let pos = Vec3::new((i * 16) as f32, 64.0, (i * 16) as f32);
        let mut world = world.write().await;
        world.update_player_position(pos).await?;
        drop(world); // Release lock
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    
    loader_task.await.map_err(|e| format!("Loader task failed: {:?}", e))?;
    
    let world = world.read().await;
    let loaded = world.get_loaded_chunk_count();
    
    if loaded == 0 {
        return Err("No chunks loaded during concurrent operation".to_string());
    }
    
    println!("  Concurrent loading works: {} chunks loaded", loaded);
    Ok(())
}

async fn test_loading_priority() -> Result<(), String> {
    let config = WorldConfig {
        render_distance: 6,
        chunk_load_distance: 8,
        seed: 33333,
    };
    
    let mut world = World::new(config);
    world.update_player_position(Vec3::new(0.0, 64.0, 0.0)).await?;
    
    // Track loading order
    let mut load_order = Vec::new();
    let start_time = Instant::now();
    
    for _ in 0..10 {
        let before_count = world.get_loaded_chunk_count();
        world.process_loading_queue().await?;
        let after_count = world.get_loaded_chunk_count();
        
        if after_count > before_count {
            // Get the most recently loaded chunk
            let chunks = world.get_loaded_chunks().await;
            if let Some(newest) = chunks.last() {
                load_order.push(*newest);
            }
        }
        
        if start_time.elapsed() > Duration::from_secs(1) {
            break;
        }
    }
    
    // Verify chunks are loaded by distance priority
    let center = ChunkCoord::new(0, 0);
    for i in 1..load_order.len() {
        let prev_dist = load_order[i-1].distance_to(&center);
        let curr_dist = load_order[i].distance_to(&center);
        
        // Allow small tolerance for chunks at same distance
        if curr_dist < prev_dist - 0.1 {
            return Err(format!(
                "Loading priority incorrect: chunk at distance {:.1} loaded after {:.1}",
                curr_dist, prev_dist
            ));
        }
    }
    
    println!("  Chunks load in distance priority order");
    Ok(())
}