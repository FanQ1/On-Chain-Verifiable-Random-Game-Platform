import React from 'react';

const StatItem = ({ label, value }) => {
  return (
    <p className="ds-stat-item">
      <strong>{label}:</strong> {value}
    </p>
  );
};

export default StatItem;
