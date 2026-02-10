import React from 'react';

const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  loading = false,
  disabled = false,
  className = '',
  ...props
}) => {
  const classes = [
    'ds-button',
    `ds-button-${variant}`,
    `ds-button-${size}`,
    fullWidth ? 'ds-button-full' : '',
    className
  ].filter(Boolean).join(' ');

  return (
    <button className={classes} disabled={disabled || loading} {...props}>
      {loading ? <span className="loading" /> : children}
    </button>
  );
};

export default Button;
