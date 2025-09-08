// Test terrain generation against the actual implementation
use crate::world::terrain::{TerrainGenerator, TerrainConfig, BiomeType};
use crate::world::chunk::{Chunk, ChunkCoord, CHUNK_SIZE, CHUNK_HEIGHT};
use crate::world::block::{Block, BlockType};
use crate::utils::noise::{NoiseGenerator, NoiseConfig};
use crate::utils::math::Vec3;

pub async fn test_terrain_generation() -> Result<(), String> {
    println!("=== Terrain Generation Tests ===\n");
    
    let mut all_passed = true;
    
    // Test 1: Height range validation
    println!("Testing terrain height range...");
    match test_height_range().await {
        Ok(_) => println!("✅ Height range - PASSED"),
        Err(e) => {
            println!("❌ Height range - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 2: Chunk border alignment
    println!("\nTesting chunk border alignment...");
    match test_chunk_borders().await {
        Ok(_) => println!("✅ Chunk borders - PASSED"),
        Err(e) => {
            println!("❌ Chunk borders - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 3: Cave generation
    println!("\nTesting cave generation...");
    match test_cave_generation().await {
        Ok(_) => println!("✅ Cave generation - PASSED"),
        Err(e) => {
            println!("❌ Cave generation - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 4: Biome transitions
    println!("\nTesting biome transitions...");
    match test_biome_transitions().await {
        Ok(_) => println!("✅ Biome transitions - PASSED"),
        Err(e) => {
            println!("❌ Biome transitions - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 5: Deterministic generation
    println!("\nTesting deterministic generation...");
    match test_deterministic().await {
        Ok(_) => println!("✅ Deterministic - PASSED"),
        Err(e) => {
            println!("❌ Deterministic - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 6: Terrain variety
    println!("\nTesting terrain variety...");
    match test_variety().await {
        Ok(_) => println!("✅ Terrain variety - PASSED"),
        Err(e) => {
            println!("❌ Terrain variety - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    if !all_passed {
        return Err("Some terrain generation tests failed".to_string());
    }
    
    println!("\n✅ All terrain generation tests passed!");
    Ok(())
}

async fn test_height_range() -> Result<(), String> {
    let config = TerrainConfig::default();
    let generator = TerrainGenerator::new(config, 12345);
    
    let mut min_height = CHUNK_HEIGHT;
    let mut max_height = 0;
    
    // Sample terrain heights across a large area
    for x in -100..100 {
        for z in -100..100 {
            let height = generator.get_height(x, z);
            
            if height == 0 || height > config.max_height {
                return Err(format!("Invalid height {} at ({}, {})", height, x, z));
            }
            
            min_height = min_height.min(height);
            max_height = max_height.max(height);
        }
    }
    
    println!("  Height range: {} to {} (max: {})", min_height, max_height, config.max_height);
    
    // Ensure we have reasonable terrain variation
    let variation = max_height - min_height;
    if variation < 20 {
        return Err(format!("Terrain too flat, variation only {} blocks", variation));
    }
    
    Ok(())
}

async fn test_chunk_borders() -> Result<(), String> {
    let config = TerrainConfig::default();
    let generator = TerrainGenerator::new(config, 54321);
    
    // Test borders between adjacent chunks
    for chunk_x in 0..3 {
        for chunk_z in 0..3 {
            let coord1 = ChunkCoord::new(chunk_x, chunk_z);
            let coord2 = ChunkCoord::new(chunk_x + 1, chunk_z);
            
            // Generate both chunks
            let mut chunk1 = Chunk::new(coord1);
            let mut chunk2 = Chunk::new(coord2);
            
            generator.generate_chunk(&mut chunk1)?;
            generator.generate_chunk(&mut chunk2)?;
            
            // Check that the right edge of chunk1 matches left edge of chunk2
            for z in 0..CHUNK_SIZE {
                for y in 0..CHUNK_HEIGHT {
                    let block1 = chunk1.get_block(CHUNK_SIZE - 1, y, z);
                    let block2 = chunk2.get_block(0, y, z);
                    
                    // At the border, terrain should be continuous
                    // Check that if one side has solid terrain, the transition is smooth
                    if y < generator.get_height(
                        chunk_x * CHUNK_SIZE as i32 + CHUNK_SIZE as i32 - 1,
                        chunk_z * CHUNK_SIZE as i32 + z as i32
                    ) {
                        // Both should have terrain at this height
                        if block1.is_air() != block2.is_air() {
                            // Allow for cave differences, but not major terrain differences
                            if !generator.is_cave_at(
                                chunk_x * CHUNK_SIZE as i32 + CHUNK_SIZE as i32,
                                y as i32,
                                chunk_z * CHUNK_SIZE as i32 + z as i32
                            ) {
                                return Err(format!(
                                    "Chunk border mismatch at y={}, z={} between chunks ({},{}) and ({},{})",
                                    y, z, chunk_x, chunk_z, chunk_x + 1, chunk_z
                                ));
                            }
                        }
                    }
                }
            }
        }
    }
    
    println!("  Adjacent chunks align at borders");
    Ok(())
}

async fn test_cave_generation() -> Result<(), String> {
    let config = TerrainConfig::default();
    let generator = TerrainGenerator::new(config, 11111);
    
    let mut total_blocks = 0;
    let mut cave_blocks = 0;
    let mut surface_caves = 0;
    
    // Generate a chunk and analyze cave distribution
    let coord = ChunkCoord::new(0, 0);
    let mut chunk = Chunk::new(coord);
    generator.generate_chunk(&mut chunk)?;
    
    for x in 0..CHUNK_SIZE {
        for z in 0..CHUNK_SIZE {
            let height = generator.get_height(x as i32, z as i32);
            
            for y in 1..height.min(CHUNK_HEIGHT) {
                total_blocks += 1;
                
                if chunk.get_block(x, y, z).is_air() {
                    cave_blocks += 1;
                    
                    if y >= height - 2 {
                        surface_caves += 1;
                    }
                }
            }
        }
    }
    
    if total_blocks == 0 {
        return Err("No blocks to analyze for caves".to_string());
    }
    
    let cave_percentage = (cave_blocks as f32 / total_blocks as f32) * 100.0;
    println!("  Cave percentage: {:.1}%", cave_percentage);
    println!("  Surface cave openings: {}", surface_caves);
    
    if cave_percentage < 1.0 {
        return Err("Too few caves generated".to_string());
    }
    
    if cave_percentage > 30.0 {
        return Err("Too many caves generated".to_string());
    }
    
    Ok(())
}

async fn test_biome_transitions() -> Result<(), String> {
    let config = TerrainConfig::default();
    let generator = TerrainGenerator::new(config, 77777);
    
    // Check biome transitions are smooth
    let mut biome_changes = 0;
    let mut last_biome = generator.get_biome_at(0, 0);
    
    for x in 0..100 {
        let biome = generator.get_biome_at(x, 0);
        if biome != last_biome {
            biome_changes += 1;
            last_biome = biome;
            
            // Check that terrain height changes gradually at biome boundaries
            let height_before = generator.get_height(x - 1, 0);
            let height_at = generator.get_height(x, 0);
            let height_after = generator.get_height(x + 1, 0);
            
            let diff1 = (height_at as i32 - height_before as i32).abs();
            let diff2 = (height_after as i32 - height_at as i32).abs();
            
            if diff1 > 10 || diff2 > 10 {
                return Err(format!(
                    "Abrupt height change at biome transition: {} -> {} -> {}",
                    height_before, height_at, height_after
                ));
            }
        }
    }
    
    println!("  Found {} biome transitions over 100 blocks", biome_changes);
    
    if biome_changes == 0 {
        return Err("No biome variation found".to_string());
    }
    
    if biome_changes > 20 {
        return Err("Too many biome changes, transitions not smooth".to_string());
    }
    
    Ok(())
}

async fn test_deterministic() -> Result<(), String> {
    let config = TerrainConfig::default();
    
    // Create two generators with same seed
    let generator1 = TerrainGenerator::new(config.clone(), 42);
    let generator2 = TerrainGenerator::new(config, 42);
    
    // Generate same chunk with both
    let coord = ChunkCoord::new(5, 5);
    let mut chunk1 = Chunk::new(coord);
    let mut chunk2 = Chunk::new(coord);
    
    generator1.generate_chunk(&mut chunk1)?;
    generator2.generate_chunk(&mut chunk2)?;
    
    // Compare every block
    for x in 0..CHUNK_SIZE {
        for y in 0..CHUNK_HEIGHT {
            for z in 0..CHUNK_SIZE {
                let block1 = chunk1.get_block(x, y, z);
                let block2 = chunk2.get_block(x, y, z);
                
                if block1.block_type != block2.block_type {
                    return Err(format!(
                        "Non-deterministic generation at ({}, {}, {}): {:?} vs {:?}",
                        x, y, z, block1.block_type, block2.block_type
                    ));
                }
            }
        }
    }
    
    println!("  Same seed produces identical terrain");
    Ok(())
}

async fn test_variety() -> Result<(), String> {
    let config = TerrainConfig::default();
    let generator = TerrainGenerator::new(config, 99999);
    
    // Count different block types at surface level
    let mut block_counts = std::collections::HashMap::new();
    let mut height_histogram = vec![0; 10];
    
    for x in -50..50 {
        for z in -50..50 {
            let height = generator.get_height(x, z);
            
            // Track height distribution
            let bucket = ((height.saturating_sub(1)) * 10 / config.max_height).min(9);
            height_histogram[bucket] += 1;
            
            // Sample surface block type
            let coord = ChunkCoord::from_world_pos(x, z);
            let mut chunk = Chunk::new(coord);
            generator.generate_chunk(&mut chunk)?;
            
            let local_x = x.rem_euclid(CHUNK_SIZE as i32) as usize;
            let local_z = z.rem_euclid(CHUNK_SIZE as i32) as usize;
            
            if height > 0 && height < CHUNK_HEIGHT {
                let block = chunk.get_block(local_x, height - 1, local_z);
                *block_counts.entry(block.block_type).or_insert(0) += 1;
            }
        }
    }
    
    // Check height variety
    let total_samples = height_histogram.iter().sum::<i32>();
    let max_bucket_count = *height_histogram.iter().max().unwrap();
    
    if max_bucket_count > total_samples / 2 {
        return Err("Terrain lacks height variety".to_string());
    }
    
    // Check block type variety
    if block_counts.len() < 3 {
        return Err(format!("Only {} block types at surface, need more variety", block_counts.len()));
    }
    
    println!("  Found {} different surface block types", block_counts.len());
    println!("  Height distribution is varied across {} buckets", 
             height_histogram.iter().filter(|&&c| c > 0).count());
    
    Ok(())
}