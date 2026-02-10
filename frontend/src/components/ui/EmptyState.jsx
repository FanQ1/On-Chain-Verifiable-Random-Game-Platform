import React from 'react';

const EmptyState = ({ title = 'No data', description = 'Nothing to display yet.' }) => {
  return (
    <div className="empty-state">
      <p className="empty-state-title">{title}</p>
      <p className="empty-state-description">{description}</p>
    </div>
  );
};

export default EmptyState;
