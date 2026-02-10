const extractErrorText = (error) => {
  if (!error) return '';
  return String(
    error.shortMessage ||
      error.reason ||
      error.message ||
      error?.info?.error?.message ||
      error?.data?.message ||
      ''
  ).toLowerCase();
};

const extractErrorCode = (error) => {
  if (!error) return '';
  return error.code || error?.info?.error?.code || '';
};

export const getFriendlyError = (error, fallback = 'Operation failed. Please try again.') => {
  const message = extractErrorText(error);
  const code = extractErrorCode(error);

  if (
    code === 4001 ||
    code === 'ACTION_REJECTED' ||
    message.includes('user denied') ||
    message.includes('user rejected') ||
    message.includes('rejected the request')
  ) {
    return 'You cancelled the wallet confirmation.';
  }

  if (message.includes('insufficient funds')) {
    return 'Insufficient balance. Please top up and try again.';
  }

  if (
    message.includes('network') ||
    message.includes('chain') ||
    message.includes('disconnected') ||
    message.includes('timeout')
  ) {
    return 'Network or chain issue detected. Please check your wallet network and try again.';
  }

  if (message.includes('bet amount too high') || message.includes('max_bet')) {
    return 'Bet amount exceeds the limit. Please adjust and try again.';
  }

  if (message.includes('invalid argument') || message.includes('invalid bigint')) {
    return 'Invalid input format. Please check and try again.';
  }

  return fallback;
};

