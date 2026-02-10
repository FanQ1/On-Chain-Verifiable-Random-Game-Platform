import React from 'react';

const stageTextMap = {
  idle: 'Start by approving token allowance.',
  approving: 'Approve transaction sent. Confirm in wallet.',
  ready: 'Allowance ready. You can submit the game transaction.',
  submitting: 'Transaction created. Waiting for wallet confirmation.',
  confirming: 'Transaction submitted. Waiting for on-chain confirmation.',
  done: 'Completed successfully.',
  error: 'Transaction failed. Check error message and try again.'
};

const TransactionStepper = ({
  stage = 'idle',
  actionLabel = 'Play',
  approvalRequired = true,
  compact = false,
  hideHint = false
}) => {
  const approveDone = !approvalRequired || ['ready', 'submitting', 'confirming', 'done'].includes(stage);
  const approveActive = approvalRequired && stage === 'approving';

  const actionDone = ['confirming', 'done'].includes(stage);
  const actionActive = ['ready', 'submitting'].includes(stage) || (!approvalRequired && stage === 'idle');

  const confirmDone = stage === 'done';
  const confirmActive = stage === 'confirming';
  const doneActive = stage === 'done';

  const steps = [
    { key: 'approve', label: 'Approve', done: approveDone, active: approveActive },
    { key: 'action', label: actionLabel, done: actionDone, active: actionActive },
    { key: 'confirm', label: 'Confirm', done: confirmDone, active: confirmActive },
    { key: 'done', label: 'Done', done: doneActive, active: doneActive }
  ];

  return (
    <div className={`tx-stepper ${compact ? 'tx-stepper-compact' : ''} ${stage === 'error' ? 'tx-stepper-error' : ''}`}>
      <div className="tx-stepper-track">
        {steps.map((step) => (
          <div
            key={step.key}
            className={`tx-step ${step.done ? 'tx-step-done' : ''} ${step.active ? 'tx-step-active' : ''}`}
          >
            <span className="tx-step-dot" />
            <span className="tx-step-label">{step.label}</span>
          </div>
        ))}
      </div>
      {!hideHint && <p className="tx-stepper-hint">{stageTextMap[stage] || stageTextMap.idle}</p>}
    </div>
  );
};

export default TransactionStepper;
