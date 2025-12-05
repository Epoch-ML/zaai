"""
DataTransform Phase

Transforms and normalizes validated data for analysis.
Applies configured transformations like normalization, null filling, and outlier handling.
"""

def forward(self, *inputs):
    """
    Transform and normalize valid records.
    
    Expected input:
        - valid_records: List of validated records
        - context: Pipeline context with config
    
    Output:
        - transformed_records: Processed records ready for analysis
        - transform_stats: Statistics about transformations applied
    """
    input_data = inputs[0].data if inputs else {}
    context = input_data.get('context', {})
    config = context.get('config', {}).get('transformation', {})
    
    records = input_data.get('valid_records', [])
    
    if not records:
        L.warning("No records to transform")
        return ExecutionTensor(
            data={
                **input_data,
                'transformed_records': [],
                'transform_stats': {'skipped': True, 'reason': 'no_records'},
            },
            status=PhaseStatus.COMPLETED
        )
    
    # Configuration
    normalize = config.get('normalize', True)
    fill_nulls = config.get('fill_nulls', 'mean')
    outlier_method = config.get('outlier_method', 'zscore')
    outlier_threshold = config.get('outlier_threshold', 3.0)
    
    # Extract values for statistical calculations
    values = [r['value'] for r in records if r.get('value') is not None]
    
    if not values:
        L.warning("No valid values for transformation")
        return ExecutionTensor(
            data={
                **input_data,
                'transformed_records': records,
                'transform_stats': {'skipped': True, 'reason': 'no_values'},
            },
            status=PhaseStatus.COMPLETED
        )
    
    # Calculate statistics
    mean_val = sum(values) / len(values)
    variance = sum((v - mean_val) ** 2 for v in values) / len(values)
    std_val = variance ** 0.5 if variance > 0 else 1.0
    min_val = min(values)
    max_val = max(values)
    range_val = max_val - min_val if max_val != min_val else 1.0
    
    stats = {
        'original_mean': mean_val,
        'original_std': std_val,
        'original_min': min_val,
        'original_max': max_val,
        'record_count': len(records),
        'transformations_applied': [],
    }
    
    transformed = []
    outliers_removed = 0
    nulls_filled = 0
    
    for record in records:
        new_record = record.copy()
        value = new_record.get('value')
        
        # Handle nulls
        if value is None:
            if fill_nulls == 'mean':
                new_record['value'] = mean_val
                new_record['_null_filled'] = True
                nulls_filled += 1
            elif fill_nulls == 'zero':
                new_record['value'] = 0
                new_record['_null_filled'] = True
                nulls_filled += 1
            elif fill_nulls == 'skip':
                continue  # Skip this record
            value = new_record['value']
        
        # Outlier detection
        if outlier_method == 'zscore' and std_val > 0:
            zscore = abs(value - mean_val) / std_val
            if zscore > outlier_threshold:
                new_record['_is_outlier'] = True
                new_record['_zscore'] = zscore
                outliers_removed += 1
                # Optionally clip to threshold
                if value > mean_val:
                    new_record['value'] = mean_val + (outlier_threshold * std_val)
                else:
                    new_record['value'] = mean_val - (outlier_threshold * std_val)
        
        # Normalization
        if normalize:
            # Min-max normalization to [0, 1]
            new_record['value_normalized'] = (new_record['value'] - min_val) / range_val
            # Z-score normalization
            new_record['value_zscore'] = (new_record['value'] - mean_val) / std_val
        
        transformed.append(new_record)
    
    # Update stats
    stats['nulls_filled'] = nulls_filled
    stats['outliers_handled'] = outliers_removed
    stats['final_count'] = len(transformed)
    
    if nulls_filled > 0:
        stats['transformations_applied'].append(f'null_fill_{fill_nulls}')
    if outliers_removed > 0:
        stats['transformations_applied'].append(f'outlier_{outlier_method}')
    if normalize:
        stats['transformations_applied'].append('normalization')
    
    # Update context
    context['stage'] = 'transformed'
    context['metrics']['phases_completed'] = context['metrics'].get('phases_completed', 0) + 1
    
    L.info(f"Transform complete: {len(transformed)} records, {nulls_filled} nulls filled, {outliers_removed} outliers handled")
    
    return ExecutionTensor(
        data={
            **input_data,
            'transformed_records': transformed,
            'transform_stats': stats,
            'context': context,
        },
        status=PhaseStatus.COMPLETED
    )


def on_error(self, error, input_tensor, attempt):
    """Handle transform errors - skip on persistent failures."""
    error_str = str(error).lower()
    
    if attempt < 2 and ('memory' in error_str or 'overflow' in error_str):
        return ErrorHandlerResult(
            action=ErrorAction.RETRY,
            retry_delay=1.0,
            should_log=True,
            error_message=f"Transform resource issue, retrying"
        )
    
    # After retries, continue with untransformed data
    L.error(f"Transform failed after {attempt} attempts, continuing with raw data")
    
    input_data = input_tensor.data if input_tensor else {}
    return ErrorHandlerResult(
        action=ErrorAction.CONTINUE,
        data={
            **input_data,
            'transformed_records': input_data.get('valid_records', []),
            'transform_stats': {'skipped': True, 'reason': 'error', 'error': str(error)},
        },
        should_log=True,
        error_message=f"Transform skipped due to error: {error}"
    )


def reset(self):
    """Reset state before retry."""
    pass