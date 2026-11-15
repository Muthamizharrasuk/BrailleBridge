import React from 'react';
import useHardwareStatus from '../hardware/useHardwareStatus.js';

export default function HardwareStatusSection() {
  const { status, check } = useHardwareStatus();
  const heading = status.state === 'connected' ? 'Hardware connected'
    : status.state === 'simulation' ? 'Simulation mode'
      : status.state === 'checking' ? 'Checking hardware' : 'Hardware disconnected';
  return <aside className="hardware-status" aria-labelledby="hardware-heading">
    <div><p className="eyebrow">HARDWARE STATUS</p><h2 id="hardware-heading">{heading}</h2></div>
    <div>
      <p role="status" aria-live="polite"><span className={`status-indicator ${status.state}`} aria-hidden="true" />{status.message}</p>
      <button type="button" className="secondary-button compact-button" onClick={check}>Check connection</button>
    </div>
  </aside>;
}
