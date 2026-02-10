import React from 'react';

const TYPE_CLASS = {
  active: 'ds-status-active',
  ended: 'ds-status-ended',
  info: 'ds-status-info'
};

const StatusTag = ({ children, type = 'info' }) => {
  return (
    <span className={`ds-status-tag ${TYPE_CLASS[type] || TYPE_CLASS.info}`}>
      {children}
    </span>
  );
};

export default StatusTag;
