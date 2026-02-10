import React from 'react';

const TYPE_CLASS = {
  error: 'inline-status-error',
  success: 'inline-status-success',
  info: 'inline-status-info'
};

const InlineStatus = ({ type = 'info', message }) => {
  if (!message) {
    return null;
  }

  return (
    <div className={`inline-status ${TYPE_CLASS[type] || TYPE_CLASS.info}`} role="status">
      {message}
    </div>
  );
};

export const InlineError = ({ message }) => <InlineStatus type="error" message={message} />;
export const InlineSuccess = ({ message }) => <InlineStatus type="success" message={message} />;

export default InlineStatus;
