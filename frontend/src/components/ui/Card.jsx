import React from 'react';

const Card = ({ title, icon, children, className = '' }) => {
  return (
    <div className={`ds-card ${className}`}>
      {title && (
        <h2 className="ds-card-title">
          {icon ? <span>{icon}</span> : null}
          <span>{title}</span>
        </h2>
      )}
      {children}
    </div>
  );
};

export default Card;
