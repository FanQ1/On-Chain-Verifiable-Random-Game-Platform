import React from 'react';

const Card = ({ title, icon, headerActions = null, children, className = '' }) => {
  return (
    <div className={`ds-card ${className}`}>
      {title && (
        <div className="ds-card-header">
          <h2 className="ds-card-title">
            {icon ? <span>{icon}</span> : null}
            <span>{title}</span>
          </h2>
          {headerActions ? <div className="ds-card-actions">{headerActions}</div> : null}
        </div>
      )}
      {children}
    </div>
  );
};

export default Card;
