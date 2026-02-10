import React from 'react';

const Skeleton = ({ lines = 4 }) => {
  return (
    <div className="skeleton-card" aria-busy="true" aria-live="polite">
      {Array.from({ length: lines }).map((_, idx) => (
        <div key={idx} className="skeleton-line" />
      ))}
    </div>
  );
};

export default Skeleton;
