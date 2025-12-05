"""
DataAnalysis Phase

Performs statistical analysis and aggregations on transformed data.
Groups data and computes configured metrics.
"""

def forward(self, *inputs):
    """
    Analyze transformed records and compute aggregations.
    
    Expected input:
        - transformed_records: List of transformed records
        - context: Pipeline context with config
    
    Output:
        - analysis: Analysis results with aggregations
        - grouped_data: Data grouped by configured dimensions
    """
    input_data = inputs[0].data if inputs else {}
    context = input_data.get('context', {})
    config = context.get('config', {}).get('analysis', {})
    
    records = input_data.get('transformed_records', [])
    
    if not records:
        L.warning("No records to analyze")
        return ExecutionTensor(
            data={
                **input_data,
                'analysis': {'skipped': True, 'reason': 'no_records'},
                'grouped_data': {},
            },
            status=PhaseStatus.COMPLETED
        )
    
    # Configuration
    aggregations = config.get('aggregations', ['sum', 'mean', 'min', 'max'])
    group_by = config.get('group_by', ['category'])
    
    # Helper functions
    def compute_aggregations(values):
        """Compute all configured aggregations for a list of values."""
        if not values:
            return {agg: None for agg in aggregations}
        
        results = {}
        n = len(values)
        
        if 'sum' in aggregations:
            results['sum'] = sum(values)
        if 'mean' in aggregations:
            results['mean'] = sum(values) / n
        if 'min' in aggregations:
            results['min'] = min(values)
        if 'max' in aggregations:
            results['max'] = max(values)
        if 'count' in aggregations:
            results['count'] = n
        if 'std' in aggregations:
            mean = sum(values) / n
            variance = sum((v - mean) ** 2 for v in values) / n
            results['std'] = variance ** 0.5
        
        return results
    
    # Overall aggregations
    all_values = [r.get('value', 0) for r in records if r.get('value') is not None]
    overall_stats = compute_aggregations(all_values)
    overall_stats['total_records'] = len(records)
    
    # Grouped aggregations
    grouped_data = {}
    
    for group_field in group_by:
        grouped_data[group_field] = {}
        
        # Group records by field value
        groups = {}
        for record in records:
            key = record.get(group_field, 'unknown')
            if key not in groups:
                groups[key] = []
            if record.get('value') is not None:
                groups[key].append(record['value'])
        
        # Compute aggregations per group
        for key, values in groups.items():
            grouped_data[group_field][key] = {
                **compute_aggregations(values),
                'count': len(values),
            }
    
    # Cross-tabulation for multiple group-by fields
    if len(group_by) >= 2:
        crosstab_key = f"{group_by[0]}_x_{group_by[1]}"
        grouped_data[crosstab_key] = {}
        
        # Group by combination of first two fields
        groups = {}
        for record in records:
            key1 = record.get(group_by[0], 'unknown')
            key2 = record.get(group_by[1], 'unknown')
            combo_key = f"{key1}|{key2}"
            
            if combo_key not in groups:
                groups[combo_key] = []
            if record.get('value') is not None:
                groups[combo_key].append(record['value'])
        
        for key, values in groups.items():
            grouped_data[crosstab_key][key] = {
                **compute_aggregations(values),
                'count': len(values),
            }
    
    # Distribution analysis
    if all_values:
        sorted_values = sorted(all_values)
        n = len(sorted_values)
        
        distribution = {
            'p25': sorted_values[int(n * 0.25)] if n > 4 else sorted_values[0],
            'p50': sorted_values[int(n * 0.50)] if n > 2 else sorted_values[n // 2],
            'p75': sorted_values[int(n * 0.75)] if n > 4 else sorted_values[-1],
            'p90': sorted_values[int(n * 0.90)] if n > 10 else sorted_values[-1],
            'p99': sorted_values[int(n * 0.99)] if n > 100 else sorted_values[-1],
        }
    else:
        distribution = {}
    
    # Build analysis result
    analysis = {
        'aggregations': overall_stats,
        'distribution': distribution,
        'group_summaries': {
            field: {
                'unique_values': len(grouped_data.get(field, {})),
                'groups': list(grouped_data.get(field, {}).keys()),
            }
            for field in group_by
        },
        'config_used': {
            'aggregations': aggregations,
            'group_by': group_by,
        },
    }
    
    # Update context
    context['stage'] = 'analyzed'
    context['metrics']['phases_completed'] = context['metrics'].get('phases_completed', 0) + 1
    
    L.info(f"Analysis complete: {len(all_values)} values analyzed across {len(group_by)} dimensions")
    
    return ExecutionTensor(
        data={
            **input_data,
            'analysis': analysis,
            'grouped_data': grouped_data,
            'context': context,
        },
        status=PhaseStatus.COMPLETED
    )


def on_error(self, error, input_tensor, attempt):
    """Handle analysis errors - provide partial results on failure."""
    L.error(f"Analysis failed on attempt {attempt}: {error}")
    
    if attempt < self.max_retries:
        return ErrorHandlerResult(
            action=ErrorAction.RETRY,
            retry_delay=1.0,
            should_log=True,
        )
    
    # Return partial analysis on final failure
    input_data = input_tensor.data if input_tensor else {}
    records = input_data.get('transformed_records', [])
    
    # Minimal analysis
    values = [r.get('value', 0) for r in records if r.get('value') is not None]
    partial_analysis = {
        'partial': True,
        'error': str(error),
        'aggregations': {
            'count': len(values),
            'sum': sum(values) if values else 0,
            'mean': sum(values) / len(values) if values else 0,
        },
    }
    
    return ErrorHandlerResult(
        action=ErrorAction.CONTINUE,
        data={
            **input_data,
            'analysis': partial_analysis,
            'grouped_data': {},
        },
        should_log=True,
        error_message="Analysis completed with partial results"
    )


def reset(self):
    """Reset any cached state."""
    pass