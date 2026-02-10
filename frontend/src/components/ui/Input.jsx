import React from 'react';

const Input = ({ label, id, className = '', ...props }) => {
  return (
    <div className="input-group">
      {label ? <label htmlFor={id}>{label}</label> : null}
      <input id={id} className={`ds-input ${className}`} {...props} />
    </div>
  );
};

export default Input;
