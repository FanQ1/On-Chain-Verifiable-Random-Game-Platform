import { useEffect } from 'react';

export const useAutoDismiss = (message, setMessage, clearValue = '') => {
  useEffect(() => {
    if (message === null || message === undefined || message === '') return undefined;

    const clearOnAnyButtonClick = (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest('button')) {
        setMessage(clearValue);
      }
    };

    document.addEventListener('click', clearOnAnyButtonClick);
    return () => document.removeEventListener('click', clearOnAnyButtonClick);
  }, [message, setMessage, clearValue]);
};

