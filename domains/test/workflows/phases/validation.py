"""
DataValidation Phase

Validates fetched records against schema and configuration rules.
Separates valid and invalid records for downstream processing.
"""

def forward(self, *inputs):
    """
    Validate each record against configured rules.
    
    Expected input:
        - records: List of data records
        - context: Pipeline context with config
    
    Output:
        - valid_records: Records that passed validation
        - invalid_records: Records that failed validation
        - valid_count / invalid_count: Counts
        - validation_errors: List of specific validation failures
    """
    input_data = inputs[0].data if inputs else {}
    context = input_data.get('context', {})
    config = context.get('config', {}).get('validation', {})
    
    records = input_data.get('records', [])
    
    # Configuration
    required_fields = config.get('required_fields', ['id', 'value'])
    max_null_ratio = config.get('max_null_ratio', 0.1)
    type_coercion = config.get('type_coercion', True)
    
    valid_records = []
    invalid_records = []
    validation_errors = []
    
    for i, record in enumerate(records):
        errors = []
        
        # Check required fields
        for field in required_fields:
            if field not in record:
                errors.append(f"Missing required field: {field}")
            elif record[field] is None:
                errors.append(f"Null value in required field: {field}")
        
        # Type validation with optional coercion
        if 'value' in record and record['value'] is not None:
            if not isinstance(record['value'], (int, float)):
                if type_coercion:
                    try:
                        record['value'] = float(record['value'])
                    except (ValueError, TypeError):
                        errors.append(f"Cannot coerce value to number: {record['value']}")
                else:
                    errors.append(f"Invalid value type: {type(record['value'])}")
        
        # Check is_valid flag if present
        if not record.get('is_valid', True):
            errors.append("Record marked as invalid")
        
        # Categorize record
        if errors:
            record['_validation_errors'] = errors
            invalid_records.append(record)
            validation_errors.extend([
                {'record_index': i, 'record_id': record.get('id'), 'error': e}
                for e in errors
            ])
        else:
            valid_records.append(record)
    
    # Check overall null ratio
    total = len(records)
    invalid_count = len(invalid_records)
    null_ratio = invalid_count / max(total, 1)
    
    warnings = input_data.get('warnings', [])
    if null_ratio > max_null_ratio:
        warnings.append({
            'type': 'high_null_ratio',
            'message': f'Null ratio {null_ratio:.1%} exceeds threshold {max_null_ratio:.1%}',
            'severity': 'warning',
        })
    
    # Update context
    context['stage'] = 'validated'
    context['metrics']['phases_completed'] = context['metrics'].get('phases_completed', 0) + 1
    
    L.info(f"Validation complete: {len(valid_records)} valid, {len(invalid_records)} invalid")
    
    return ExecutionTensor(
        data={
            **input_data,
            'valid_records': valid_records,
            'invalid_records': invalid_records,
            'valid_count': len(valid_records),
            'invalid_count': invalid_count,
            'validation_errors': validation_errors,
            'warnings': warnings,
            'context': context,
        },
        status=PhaseStatus.COMPLETED
    )


def on_error(self, error, input_tensor, attempt):
    """Handle validation errors - retry on transient issues, fail on data errors."""
    error_str = str(error).lower()
    
    # Retry on memory or resource issues
    if 'memory' in error_str or 'resource' in error_str:
        return ErrorHandlerResult(
            action=ErrorAction.RETRY,
            retry_delay=attempt * 2,
            should_log=True,
            error_message=f"Resource issue during validation, attempt {attempt}"
        )
    
    # Fail on actual data/logic errors
    return ErrorHandlerResult(
        action=ErrorAction.FAIL,
        error_message=f"Validation failed: {error}",
        should_log=True
    )


def reset(self):
    """Reset any cached state before retry."""
    # No cached state in this phase
    pass