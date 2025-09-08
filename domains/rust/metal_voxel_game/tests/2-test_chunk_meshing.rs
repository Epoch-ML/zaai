// Test chunk mesh generation against the actual implementation
use crate::world::chunk::{Chunk, ChunkCoord, CHUNK_SIZE, CHUNK_HEIGHT};
use crate::world::block::{Block, BlockType};
use crate::render::mesh::{MeshBuilder, GreedyMesher, Vertex};
use crate::utils::math::Vec3;

pub async fn test_chunk_meshing() -> Result<(), String> {
    println!("=== Chunk Meshing Tests ===\n");
    
    let mut all_passed = true;
    
    // Test 1: Empty chunk mesh
    println!("Testing empty chunk mesh generation...");
    match test_empty_chunk().await {
        Ok(_) => println!("✅ Empty chunk - PASSED"),
        Err(e) => {
            println!("❌ Empty chunk - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 2: Single block mesh
    println!("\nTesting single block mesh...");
    match test_single_block().await {
        Ok(_) => println!("✅ Single block - PASSED"),
        Err(e) => {
            println!("❌ Single block - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 3: Greedy meshing efficiency
    println!("\nTesting greedy meshing efficiency...");
    match test_greedy_meshing().await {
        Ok(_) => println!("✅ Greedy meshing - PASSED"),
        Err(e) => {
            println!("❌ Greedy meshing - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 4: Random chunk mesh validity
    println!("\nTesting random chunk mesh generation...");
    match test_random_chunk().await {
        Ok(_) => println!("✅ Random chunk - PASSED"),
        Err(e) => {
            println!("❌ Random chunk - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 5: Mesh normals
    println!("\nTesting mesh normals...");
    match test_mesh_normals().await {
        Ok(_) => println!("✅ Mesh normals - PASSED"),
        Err(e) => {
            println!("❌ Mesh normals - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    // Test 6: Chunk boundaries
    println!("\nTesting chunk boundary handling...");
    match test_chunk_boundaries().await {
        Ok(_) => println!("✅ Chunk boundaries - PASSED"),
        Err(e) => {
            println!("❌ Chunk boundaries - FAILED: {}", e);
            all_passed = false;
        }
    }
    
    if !all_passed {
        return Err("Some chunk meshing tests failed".to_string());
    }
    
    println!("\n✅ All chunk meshing tests passed!");
    Ok(())
}

async fn test_empty_chunk() -> Result<(), String> {
    let coord = ChunkCoord::new(0, 0);
    let chunk = Chunk::new(coord);
    
    let mesh_builder = MeshBuilder::new();
    let mesh = mesh_builder.build_chunk_mesh(&chunk)?;
    
    if !mesh.vertices.is_empty() || !mesh.indices.is_empty() {
        return Err(format!(
            "Empty chunk generated {} vertices and {} indices, expected 0",
            mesh.vertices.len(),
            mesh.indices.len()
        ));
    }
    
    println!("  Empty chunk generates empty mesh");
    Ok(())
}

async fn test_single_block() -> Result<(), String> {
    let coord = ChunkCoord::new(0, 0);
    let mut chunk = Chunk::new(coord);
    
    // Place a single stone block
    chunk.set_block(8, 8, 8, Block::new(BlockType::Stone));
    
    let mesh_builder = MeshBuilder::new();
    let mesh = mesh_builder.build_chunk_mesh(&chunk)?;
    
    // Single isolated block should have 6 faces
    // Each face has 4 vertices, so 24 vertices total
    // Each face has 2 triangles, so 12 triangles = 36 indices
    if mesh.vertices.len() != 24 {
        return Err(format!(
            "Single block generated {} vertices, expected 24",
            mesh.vertices.len()
        ));
    }
    
    if mesh.indices.len() != 36 {
        return Err(format!(
            "Single block generated {} indices, expected 36",
            mesh.indices.len()
        ));
    }
    
    println!("  Single block generates 6 faces (12 triangles)");
    Ok(())
}

async fn test_greedy_meshing() -> Result<(), String> {
    let coord = ChunkCoord::new(0, 0);
    let mut chunk = Chunk::new(coord);
    
    // Create a flat floor at y=0
    for x in 0..CHUNK_SIZE {
        for z in 0..CHUNK_SIZE {
            chunk.set_block(x, 0, z, Block::new(BlockType::Stone));
        }
    }
    
    // Build mesh without greedy meshing
    let naive_builder = MeshBuilder::new_naive();
    let naive_mesh = naive_builder.build_chunk_mesh(&chunk)?;
    
    // Build mesh with greedy meshing
    let greedy_mesher = GreedyMesher::new();
    let greedy_mesh = greedy_mesher.build_chunk_mesh(&chunk)?;
    
    let naive_triangles = naive_mesh.indices.len() / 3;
    let greedy_triangles = greedy_mesh.indices.len() / 3;
    
    println!("  Naive mesh: {} triangles", naive_triangles);
    println!("  Greedy mesh: {} triangles", greedy_triangles);
    
    let reduction = ((naive_triangles - greedy_triangles) as f32 / naive_triangles as f32) * 100.0;
    println!("  Reduction: {:.1}%", reduction);
    
    if reduction < 50.0 {
        return Err(format!(
            "Greedy meshing only reduced triangles by {:.1}%, expected >50%",
            reduction
        ));
    }
    
    Ok(())
}

async fn test_random_chunk() -> Result<(), String> {
    let coord = ChunkCoord::new(0, 0);
    let mut chunk = Chunk::new(coord);
    
    // Fill with random blocks (30% density)
    chunk.fill_random(0.3, 42); // seed for reproducibility
    
    let mesh_builder = MeshBuilder::new();
    let mesh = mesh_builder.build_chunk_mesh(&chunk)?;
    
    if mesh.vertices.is_empty() {
        return Err("Random chunk generated no vertices".to_string());
    }
    
    if mesh.indices.len() % 3 != 0 {
        return Err(format!(
            "Invalid index count: {} (not divisible by 3)",
            mesh.indices.len()
        ));
    }
    
    // Verify all indices are valid
    let max_index = *mesh.indices.iter().max().unwrap_or(&0) as usize;
    if max_index >= mesh.vertices.len() {
        return Err(format!(
            "Invalid index {} for {} vertices",
            max_index,
            mesh.vertices.len()
        ));
    }
    
    println!("  Generated {} vertices, {} triangles",
             mesh.vertices.len(),
             mesh.indices.len() / 3);
    
    Ok(())
}

async fn test_mesh_normals() -> Result<(), String> {
    let coord = ChunkCoord::new(0, 0);
    let mut chunk = Chunk::new(coord);
    
    // Place a block at origin
    chunk.set_block(0, 0, 0, Block::new(BlockType::Stone));
    
    let mesh_builder = MeshBuilder::new();
    let mesh = mesh_builder.build_chunk_mesh(&chunk)?;
    
    for vertex in &mesh.vertices {
        let normal = vertex.normal;
        let length = (normal[0] * normal[0] + 
                     normal[1] * normal[1] + 
                     normal[2] * normal[2]).sqrt();
        
        if (length - 1.0).abs() > 0.001 {
            return Err(format!("Invalid normal length: {}", length));
        }
        
        // Check that normals point in cardinal directions
        let cardinal_count = [normal[0].abs(), normal[1].abs(), normal[2].abs()]
            .iter()
            .filter(|&&v| v > 0.99)
            .count();
        
        if cardinal_count != 1 {
            return Err(format!(
                "Normal not pointing in cardinal direction: {:?}",
                normal
            ));
        }
    }
    
    println!("  All normals are unit vectors in cardinal directions");
    Ok(())
}

async fn test_chunk_boundaries() -> Result<(), String> {
    let coord = ChunkCoord::new(0, 0);
    let mut chunk = Chunk::new(coord);
    
    // Place blocks at chunk boundaries
    for i in 0..CHUNK_SIZE {
        // Left edge
        chunk.set_block(0, 0, i, Block::new(BlockType::Stone));
        // Right edge
        chunk.set_block(CHUNK_SIZE - 1, 0, i, Block::new(BlockType::Stone));
        // Front edge
        chunk.set_block(i, 0, 0, Block::new(BlockType::Stone));
        // Back edge
        chunk.set_block(i, 0, CHUNK_SIZE - 1, Block::new(BlockType::Stone));
    }
    
    let mesh_builder = MeshBuilder::new();
    let mesh = mesh_builder.build_chunk_mesh(&chunk)?;
    
    // Verify mesh was generated
    if mesh.vertices.is_empty() {
        return Err("No mesh generated for boundary blocks".to_string());
    }
    
    // Check that vertices are within chunk bounds
    for vertex in &mesh.vertices {
        let pos = vertex.position;
        
        if pos[0] < 0.0 || pos[0] > CHUNK_SIZE as f32 {
            return Err(format!("Vertex X position {} out of bounds", pos[0]));
        }
        
        if pos[1] < 0.0 || pos[1] > CHUNK_HEIGHT as f32 {
            return Err(format!("Vertex Y position {} out of bounds", pos[1]));
        }
        
        if pos[2] < 0.0 || pos[2] > CHUNK_SIZE as f32 {
            return Err(format!("Vertex Z position {} out of bounds", pos[2]));
        }
    }
    
    println!("  Chunk boundary blocks handled correctly");
    Ok(())
}