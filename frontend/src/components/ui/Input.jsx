import React from 'react';

const Input = ({ label, id, className = '', ...props }) => {
  const {
    type,
    value,
    onChange,
    min,
    max,
    step = '1',
    disabled
  } = props;
  const isNumberInput = type === 'number';

  const handleStep = (direction) => {
    if (!isNumberInput || !onChange || disabled) return;

    const currentValue = Number(value ?? 0);
    const stepValue = Number(step) || 1;
    const minValue = min !== undefined ? Number(min) : undefined;
    const maxValue = max !== undefined ? Number(max) : undefined;

    if (Number.isNaN(currentValue)) return;

    let nextValue = currentValue + direction * stepValue;
    if (minValue !== undefined && !Number.isNaN(minValue)) {
      nextValue = Math.max(nextValue, minValue);
    }
    if (maxValue !== undefined && !Number.isNaN(maxValue)) {
      nextValue = Math.min(nextValue, maxValue);
    }

    const stepString = String(step);
    const precision = stepString.includes('.') ? stepString.split('.')[1].length : 0;
    const formattedValue = precision > 0 ? nextValue.toFixed(precision) : String(Math.round(nextValue));

    onChange({ target: { value: formattedValue } });
  };

  const inputNode = (
    <input id={id} className={`ds-input ${className}`} {...props} />
  );

  return (
    <div className="input-group">
      {label ? <label htmlFor={id}>{label}</label> : null}
      {isNumberInput ? (
        <div className="ds-number-wrap">
          {inputNode}
          <div className="ds-number-spinner" aria-hidden="true">
            <button
              type="button"
              className="ds-number-arrow"
              onClick={() => handleStep(1)}
              disabled={disabled}
              tabIndex={-1}
            >
              ▲
            </button>
            <button
              type="button"
              className="ds-number-arrow"
              onClick={() => handleStep(-1)}
              disabled={disabled}
              tabIndex={-1}
            >
              ▼
            </button>
          </div>
        </div>
      ) : (
        inputNode
      )}
    </div>
  );
};

export default Input;
